# AI Helper 循环检测升级设计（多模式循环检测器）

> 状态：已批准（设计对话五轮确认：全模式 v1 / 无进展滚动静态判定 / 处理策略 A（软提醒→硬停，硬停可 checkpoint 恢复）/ 实现路径 A（独立模块 + 薄集成）/ 红线 R1-R5）
> 日期：2026-10-10
> 范围：新模块 `src/background/loop-detector.js` + react-loop 薄集成 + `scroll_to` 静态判定 + i18n 新增
> 参考：WebBrain `loop-detector.js`（GPL-3.0），仅借鉴设计思想、独立重新实现，不复制任何代码

---

## 1. 背景与目标

### 1.1 现状（事实基础，非推测）

| 事实 | 位置 |
|---|---|
| 唯一天花板：轮级"全部工具调用+返回"指纹对比，连续相同 → 计数 | `react-loop.js` L1879-1928 |
| 警告阈值 5（注入 role:'user' 的 `[System Notice]`，硬编码英文） | L466 top / L1915-1921 |
| 硬停阈值 8（`createErrorWithLog` throw） | L466-467 / L1908-1912 |
| 常量与变量声明（仅本文件使用，无外部引用） | L466-469 |
| **该逻辑无任何单测** | 全仓库核实 |
| 硬停可恢复：catch `saveCheckpointNow('error', force=true)` | L1981-1988 |
| 子任务递归 `reactLoop`（派生 sessionId `${sessionId}_subtask_${n}`）→ 自动获得独立检测实例 | L2129 / L2181 |
| 注入消息只进 `currentMessages`（模型上下文），无 STREAM 发送；会话归档用侧边栏 `state.messageHistory` → **用户界面/历史不可见** | `session-store.js` L487-508 |

问题：模型只要改一个参数、换一个相似操作、或换一种失败方式就能绕过"完全相同"条件。无法捕获：
ref 枚举走马灯、ABAB 振荡、失败重试、无进展滚动、导航乒乓。

### 1.2 目标

1. **六模式循环检测**（v1 全模式）：

   | 模式 | 一句话 |
   |---|---|
   | ① 重复（窗口制升级） | 同 key 3-in-6 提醒（今天=连续 5 才警告）；累计 8 硬停 |
   | ② ref 枚举 | query_elements 的重复读页/乱序跳页；顺序翻页豁免 |
   | ③ ABAB 振荡 | 两调用交替 A,B,A,B；连续交替 8 次硬停 |
   | ④ 失败作用域 | 变更类工具同目标失败 2 提醒 / 3 硬停；成功退休 |
   | ⑤ 导航处理 | 导航成功重置页面作用域计数；交替由 ABAB 覆盖 |
   | ⑥ 无进展滚动 | scroll_to 静态判定 moved:false；同向 2 提醒 / 3 硬停 |

2. **处理策略 A（两级）**：软提醒（注入模型可见提示，用户不可见）→ 多次后硬停（用户可见、经 checkpoint 可带指导恢复）。
3. **红线 R1-R5**（见 §4）作为验收条款。

### 1.3 非目标

- 不做坐标点击检测（`interact_element` 本无坐标点击能力，动作枚举仅 click/hover/type）
- 不做 carousel/验证码站点特化模式（WebBrain 站点适配层，不复刻）
- 不加 URL 到达历史遥测（需新增工具结果字段，违反 R3 最小侵入）
- 不做检测状态持久化（SW 重启后新实例重新武装；checkpoint 恢复不恢复检测计数）
- 不改反思器、确认门（`requestToolConfirmation`/`loopApprovedSessions`）、超时机制
- 不新增设置项、不新增 UI、不新增工具

---

## 2. 设计总览

```
┌─ 检测器模块（src/background/loop-detector.js，纯逻辑/browser-free）─┐
│  createLoopDetector()  ← 每个 reactLoop run 一个实例（含子任务递归） │
│  record(tabId, toolName, args, result)                              │
│    → { kind:'none' }                                                │
│    → { kind:'nudge', warning }          （模型可见，用户不可见）      │
│    → { kind:'stop', reason, params }    （用户可见，可恢复）          │
│  状态按 tabId 分桶；run 结束即弃；零 chrome API；Node 可直接单测       │
└──────────────────────────────────────────────────────────────────────┘
        ↑ 轮末按序喂入（结构化原始结果）           ↓ 硬停返回 reason+params
┌─ react-loop.js（仅两处新增 + 一处替换 + 一处删除）────────────────────┐
│  1) L466 一带：const loopDetector = createLoopDetector()            │
│     const loopRecords = []                                          │
│  2) 5 个 tool 消息入栈锚点：loopRecords.push({name,args,result})     │
│  3) 替换 L1879-1928：轮末喂记录 → 合并一条提醒注入 / stop 直接 throw  │
│  4) 删除 L466-469 旧常量变量                                        │
│  stop 文案： 本文件 t('reactLoop.loopStopped*') 映射（i18n 侧）       │
│  恢复链路： 复用既有 catch → saveCheckpointNow(force) → 用户带指导恢复│
└──────────────────────────────────────────────────────────────────────┘
        ↑ moved:false                       ↓ 轮末（两个出口都处理）
┌─ content/interaction-tools.js ─┐   ┌─ checkpoint（既有机制，零改动）─┐
│ scrollToPosition 静态边界判定    │   │ error catch force 保存（L1981）│
│ （仅未移动时返回 moved:false）   │   └────────────────────────────────┘
└────────────────────────────────┘
```

---

## 3. 模块架构与状态模型

### 3.1 实例与生命周期

- **每 run 一实例**：在 `reactLoop()` 主函数体内创建（L466 一带，替换旧常量位置）
- 子任务经 `executeSingleSubtask` 递归调用 `reactLoop`（L2129/L2181）→ 自动获得独立实例（与现有指纹逻辑的子任务行为一致，无新增行为差异）
- SW 重启 → 新实例重新武装（**明示**：不做持久化）
- 不做跨 run 共享、不做遥测

### 3.2 状态清单（按 tabId 分桶）

| 状态 | 结构 | 容量控制 | 导航重置清 |
|---|---|---|---|
| 调用环形窗口 | `[{ argsKey, fullKey, name }]`（最近 6 条） | 固定 6 | **否（ABAB 依赖）** |
| ABAB 交替尾迹 | `argsKey[]`（最近 8 条） | 固定 8 | **否** |
| 重复累计计数 | `Map<fullKey, count>` | 32 上限（丢最旧） | 是 |
| ref 枚举状态 | `{ lastScope, lastPage, lastHasMore, seenByScope:Map, suspicious, nonSeq, warned }` | 单状态（seenByScope ≤ 8 scope） | 是 |
| 失败作用域 | `Map<scope, count>` | 32 上限 | 是 |
| 无进展滚动 | `{ key, count, warned }` | 单键 | 是 |
| 提醒片段标记 | `Set<warnKey>`（repeat/abab/failure/scroll/refEnum 各自 key） | 有限 | 是 |
| 健康迟滞 | `healthyStreak`（连续健康调用数） | 单值 | 否 |
| 全局提醒预算 | `nudges`（累计，实例级不按 tab） | 单值 | 否 |

### 3.3 接口

```js
const detector = createLoopDetector();
const outcome = detector.record(tabId, toolName, args, result);
// outcome:
//   { kind: 'none' }                                  — 无检测（含"持续片段内静默"）
//   { kind: 'nudge', warning }                        — warning 为最终英文文案（模型面向）
//   { kind: 'stop', reason, params }                  — reason ∈ 六模式 + 'budget'
//                                                       react-loop 侧映射 t('reactLoop.loopStopped*') 生成用户文案
```

- `stop` 不携带最终文案 → 检测器保持纯逻辑、i18n 由 react-loop 侧完成（可测性关键）
- `record` 的判定顺序固定：**① 入窗+入尾迹 → ② 导航重置 → ③ 重复 → ④ ABAB → ⑤ ref 枚举 → ⑥ 失败作用域 → ⑦ 无进展滚动 → ⑧ 返回最高优先级结果（stop > nudge > none）**
- 记录值语义（由 react-loop 侧保证）：
  - 正常执行 → 结构化原始结果对象（未包装、未截断）
  - 确认被拒 → `{ success: false, declined: true }`（纳入失败作用域：反复请求被拒操作值得提醒）
  - plan_task 后跳过 → `{ skipped: true }`（入窗参与重复/ABAB，不参与失败/枚举/滚动）

### 3.4 健康调用与迟滞

- **健康调用** = 本次记录未命中任何模式，且不处于已提醒的持续片段中（持续片段内的调用："静默返回 none、不计健康、不重复提醒"）
- 导航成功计为健康调用
- `healthyStreak ≥ 2` → 重新武装：清空提醒片段标记（各模式可再次提醒），`healthyStreak` 归零
- 命中任何模式 → `healthyStreak` 归零
- **预算永久累计**：`nudges` 不因健康而清零（全局保险丝用）

---

## 4. 红线条款（验收逐条核对）

| 红线 | 条款 | 验证方式 |
|---|---|---|
| **R1 零影响** | 无循环行为的任务：消息流零注入、工具输出零变化；唯一例外 = `scroll_to` 在"已在边界"场景新增 `moved:false` 字段（用户已确认） | 接线测试"注入集合=∅"；scroll 双形态逐字节断言 |
| **R2 不误杀** | 硬停之前必经软提醒（绝不第一次检测就终止）；全部触发基于"明确模式+保守阈值+豁免规则"，无感觉型启发式 | 每模式测试：`nudge` 必先于 `stop` 出现 |
| **R3 隔离性** | 新逻辑全部在独立模块；i18n 只增不改；不新增设置项/UI；不动其他工具 schema | diff 审查 + 构建 |
| **R4 测试背书** | 每模式必须有"正例（该触发）+ 反例（合法模式不触发）+ 豁免"三类单测 | 测试矩阵全绿 |
| **R5 基线不漂移** | 全量单测（基线 1004 只增不减、其余不漂移）、`build:silent`、e2e 31 与改造前一致 | 数字比对 |

---

## 5. 六模式规则

### 5.1 ① 重复检测（窗口制升级）

| 项 | 规则 |
|---|---|
| key | `fullKey = 工具名 + 参数稳定哈希 + 结果稳定哈希`（结果进 key 是**刻意保留**：现注释明确"轮询场景（相同入参、返参变化）不得误报"） |
| 窗口 | 最近 6 个调用（环形，按 tab） |
| 软提醒 | 同 fullKey 窗口内 ≥3 次 → 提醒（同 key 片段内仅 1 条） |
| 硬停 | 同 fullKey **累计** ≥8 次（`repeatCounts` Map；插入其他调用不清零——修复旧逻辑"被打断即逃逸"的缺陷） |
| 豁免 | 轮询（结果变化 → fullKey 不同）天然不触发；导航重置清累计 |
| stop reason | `repeat`，params `{ count, toolName }` |

参数/结果哈希：稳定序列化（递归 key 排序）+ FNV-1a 32 位十六进制。约 24K 字符串哈希 <1ms，性能可忽略。

### 5.2 ② ref 枚举循环（query_elements 专用）

| 项 | 规则 |
|---|---|
| 作用域 key | 稳定哈希 `{maxResults, maxChars, filterByText, frames}`（不含 page） |
| 顺序推进 = 健康 | 同 scope 下 `page === lastPage + 1` 且上次结果 `hasMore === true` → 合法步进、不增可疑 |
| 重读 | 同 scope 该页已读过**且结果未变化** → `suspicious++`（结果有变化视为推进，不计——与①重复的轮询豁免同哲学） |
| 乱序新页 | 非同 scope 顺序推进、非重读、且非新 scope 首页 → `nonSeq++`（随机访问可能合法；新 scope 首页中性不计） |
| 非法页 | `page > totalPages` → `suspicious++` |
| 作用域切换 | 各 scope 独立记已读页（seenByScope：scope→页号→结果哈希）；累计计数**不清**（防"两个 scope 来回切"逃逸）；连续多搜索（不同 filter 各自首页）不产生可疑 |
| 非 query 调用（已执行） | 状态**整体清零**（WebBrain 同款：其他调用 = 进展证据；skipped 不计入） |
| 软提醒 | `suspicious ≥ 3` → 提醒（一次性，迟滞重新武装） |
| 硬停 | `suspicious ≥ 6` 或 `nonSeq ≥ 12`（顺序步进不计 nonSeq） |
| stop reason | `refEnum`，params `{ count }` |
| 失败读处理 | `success === false` 的读不更新枚举状态（交由①重复模式捕获相同报错） |

### 5.3 ③ ABAB 振荡

| 项 | 规则 |
|---|---|
| key | `argsKey = 工具名 + 参数稳定哈希`（**不含结果**——振荡看"动作交替"，不管结果） |
| 检测 | 最近 4 条尾迹呈 A,B,A,B（`t[-4]===t[-2] && t[-3]===t[-1] && t[-4]!==t[-3]`） |
| 软提醒 | 首次检出 → 提醒（尾迹内仅 1 条，迟滞重新武装） |
| 硬停 | 尾迹 8 条全交替（奇数位同 key、偶数位同 key、两组不同）→ 停 |
| 为什么不会误伤轮询 | 轮询是"单调用重复"（AAAA），不是"两调用交替"（ABAB） |
| stop reason | `oscillation`，params `{ keyA, keyB }`（名称化） |
| 导航价值 | back/forward 交替、click/back 交替均呈现 ABAB → 这就是"导航乒乓"的 v1 实现（无 URL 遥测的诚实替代） |

### 5.4 ④ 失败作用域

| 项 | 规则 |
|---|---|
| 适用工具（白名单） | `interact_element` / `fill_form` / `select_dropdown` / `keyboard_input` / `file_upload` / `drag_drop` |
| 失败判定 | `result.success === false` 或 `result.error` 非空或 `result.declined === true` |
| 作用域归一 | `interact_element`: `ref:<N>` \| `text:<归一文本>` \| `sel:<s>`；`fill_form`: 字段标识排序串；`select_dropdown`: ref/选择器；`keyboard_input`: 选择器；`file_upload`: ref/选择器；`drag_drop`: 源→目标 |
| 软提醒 | 同作用域失败 2 次 → 提醒（一次性，迟滞重新武装） |
| 硬停 | 同作用域失败 3 次 → 停 |
| 退休 | 同作用域一次成功 → 计数删除 |
| 容量 | Map 32 上限（丢最旧） |
| stop reason | `failureScope`，params `{ scope }` |

### 5.5 ⑤ 导航处理

| 项 | 规则 |
|---|---|
| 重置触发 | `manage_tab` 的 `back` / `forward` / `reload` 且成功；`wait_navigation` 成功 → 清该 tab 的**页面作用域状态**（重复累计/ref 枚举/失败作用域/滚动/提醒片段标记） |
| 窗口/尾迹不清 | ABAB 与重复的窗口保留（导航乒乓检测依赖） |
| `open` / `switch` | 不重置（per-tab 分桶语义天然隔离：切换回旧 tab 保留旧 tab 状态） |
| 健康认定 | 导航成功计健康调用（参与迟滞） |
| 失败导航 | 记录入窗即可（相同失败的 back 反复 → ①重复捕获） |
| v1 不做 | URL 到达历史（需遥测；若未来需要，作为独立任务评估） |

### 5.6 ⑥ 无进展滚动（依赖已确认的静态判定）

| 项 | 规则 |
|---|---|
| 触发源 | `scroll_to` 且结果含 `moved: false`（仅 top/bottom/coordinates 产生，见 §7） |
| 作用域 key | `top` \| `bottom` \| `coords:<x5>,<y5>`（坐标归整 5px 网格容差） |
| 软提醒 | 同 key 未移动 2 次 → 提醒（一次性，迟滞重新武装） |
| 硬停 | 同 key 未移动 3 次 → 停 |
| 清除 | 任意一次真实滚动（`moved` 缺失/true）→ 滚动状态整体清零；导航重置同清 |
| selector/text 目标 | v1 不产生 moved（无静态判定），失败由①重复/④失败作用域覆盖 |
| stop reason | `noProgressScroll`，params `{ key }` |

### 5.7 全局机制

| 机制 | 规则 |
|---|---|
| 硬停优先 | 轮末按调用顺序喂入，遇到 stop 立即抛（当轮提醒不再注入）；`throw createErrorWithLog(...)` 走既有链路 |
| 提醒合并 | 一轮多条 nudge 合并为**一条**消息注入（`role:'user'`，沿用 L1920 机制；用户界面/历史不可见——已核实） |
| 提醒文案 | 检测器输出英文短句（模型面向，沿用 L1920 先例），壳文沿用旧尾句：`Please switch to a different strategy immediately…` |
| 提醒节流 | 同一模式片段（warnKey）仅 1 条；`healthyStreak ≥ 2` 重新武装 |
| 全局保险丝 | 一个 run 内累计提醒 ≥8 次 → 停（防"多模式各差一点"的慢速绕圈） |
| stop reason | `budget`，params `{ nudges }` |
| 阈值集中 | 全部数值集中在 `loop-detector.js` 顶部 `LOOP_DETECTOR_CONFIG`（见 §8），单点可调 |

---

## 6. 集成点（react-loop.js，改动面精确清单）

### 6.1 新增

| 位置 | 内容 |
|---|---|
| L466 一带（现常量处） | `const loopDetector = createLoopDetector();`　`const loopRecords = [];` |
| 5 个 tool 消息入栈锚点 | `loopRecords.push({ name: toolName, args: toolArgs, result: <结构化> })`，`toolArgs` 为 L1252-1257 已解析对象 |

**5 个入栈锚点（全量枚举）**：

| 行 | 场景 | 记录值 |
|---|---|---|
| L1308 | 确认被拒 | `{ success: false, declined: true }` |
| L1511 | plan_task 先行响应 | 结构化原始结果 |
| L1551 | plan_task 后跳过 | `{ skipped: true }` |
| L1622 | 常规执行 | 结构化原始结果（**未包装、未截断的 `toolResult` 对象**） |
| L1685 | 错误路径 | 结构化原始结果（错误对象） |

### 6.2 替换与删除

| 动作 | 范围 |
|---|---|
| 替换 | L1879-1928 整个内联指纹块 → 轮末处理：按序 `loopDetector.record(tabId, rec.name, rec.args, rec.result)` → 聚合 nudge 合并注入一条 / stop 直接 throw |
| 删除 | L466-467 常量、L468-469 变量、L1879-1928 旧提取与判定逻辑 |
| 轮末两个出口都要处理 | ① 常规 for 循环完成后（L1868 附近，`processPendingReflections` 之前）；② `planTaskHandled` 提前 break 分支（L1864 附近）。处理完清空 `loopRecords` |

### 6.3 关键约束

- **删除与接线必须同一 commit**：否则双检测器并行会双注入。回退方式 = revert 该 commit（完整恢复旧逻辑）
- 记录锚点与消息入栈同一代码路径，保证"本轮每个工具调用都有记录"；遗漏由接线测试守护
- checkpoint 恢复链路零改动（复用 L1981-1988 catch → force 保存；恢复入口不变）

---

## 7. scroll_to 静态判定（content 侧）

`scrollToPosition(options)`（`interaction-tools.js` L252-276）增加**零延迟静态边界判定**，仅影响输出形态，不影响滚动行为：

| target | 判定（滚动前即时求值） | moved:false 条件 |
|---|---|---|
| `top` | `window.scrollY <= 0 && document.documentElement.scrollTop <= 0` | 已在顶部 |
| `bottom` | `window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1` | 已在底部 |
| `coordinates` | `Math.abs(window.scrollY - y) < 1 && Math.abs(window.scrollX - x) < 1` | 已在目标位置 |
| `selector` / `text` | 不判定 | 不产生该字段 |

- 输出形态：**已在边界** → `{ success: true, message: <不变>, moved: false }`；**正常滚动** → 与今天逐字节一致（无 `moved` 字段）
- 滚动行为本身零改动（仍 fire-and-forget + smooth）

---

## 8. 常量表（`LOOP_DETECTOR_CONFIG`，全部默认值集中）

```js
export const LOOP_DETECTOR_CONFIG = {
  windowSize: 6,            // 环形窗口
  ababTailSize: 8,          // ABAB 尾迹
  repeat:    { nudgeAt: 3, stopAt: 8, maxKeys: 32 },
  oscillation: { nudgeTail: 4, stopTail: 8 },
  refEnum:   { nudgeAt: 3, stopSuspicious: 6, stopNonSeq: 12 },
  failureScope: { nudgeAt: 2, stopAt: 3, maxScopes: 32 },
  noProgressScroll: { nudgeAt: 2, stopAt: 3, coordGrid: 5 },
  hysteresis: { healthyToRearm: 2 },
  budget:    { stopAtNudges: 8 },
};
```

---

## 9. i18n（只增不改）

新增 6 个 key（zh / en 各一条，硬停用户文案）：

| key | zh 参考文案 | en 参考文案 |
|---|---|---|
| `reactLoop.loopStoppedRepeat` | 检测到重复无效操作：工具「{toolName}」结果无变化地反复调用（累计 {count} 次），任务已暂停。可补充指导后恢复任务。 | Repeated no-progress operation detected: "{toolName}" was called {count} times with no change in results. Task paused; you can add guidance before resuming. |
| `reactLoop.loopStoppedRefEnum` | 检测到页面元素枚举循环（重复读取 {count} 次），任务已暂停。可补充指导后恢复任务。 | Page element enumeration loop detected ({count} repetitive reads). Task paused; you can add guidance before resuming. |
| `reactLoop.loopStoppedOscillation` | 检测到操作振荡循环（在「{keyA}」与「{keyB}」间反复交替），任务已暂停。可补充指导后恢复任务。 | Oscillation loop detected (alternating between "{keyA}" and "{keyB}"). Task paused; you can add guidance before resuming. |
| `reactLoop.loopStoppedFailureScope` | 检测到同一操作连续失败（{scope}），任务已暂停。可补充指导后恢复任务。 | The same operation failed repeatedly ({scope}). Task paused; you can add guidance before resuming. |
| `reactLoop.loopStoppedNoProgressScroll` | 检测到无进展滚动（{key} 方向已到边界仍反复滚动），任务已暂停。可补充指导后恢复任务。 | No-progress scrolling detected ({key}: already at boundary). Task paused; you can add guidance before resuming. |
| `reactLoop.loopStoppedBudget` | 检测到多轮无进展操作（累计提醒 {nudges} 次），任务已暂停。可补充指导后恢复任务。 | Multiple no-progress patterns detected ({nudges} warnings). Task paused; you can add guidance before resuming. |

- 旧 key `reactLoop.infiniteLoopDetected` **保留不动**（成为死键，零风险）
- 提醒（nudge）文案：检测器内硬编码英文（沿用 L1920 先例），不进 i18n

---

## 10. 测试矩阵（"不凭感觉"的证据清单）

### 10.1 检测器单测（`test/unit/loop-detector.unit.test.js`，纯模块）

| 类别 | 关键用例 | 断言 |
|---|---|---|
| ①正例 | 同 fullKey 3-in-6 → nudge；累计 8 → stop | 精确 outcome |
| ①反例 | **轮询：同参变果（结果不同）任意次 → 恒 none**；穿插其他调用断窗后累计仍致停 | 防误报铁证 |
| ②正例 | 重读同页 ×3 → nudge；×6 → stop；乱序新页 ×12 → stop；非法页计可疑 | |
| ②反例/豁免 | **合法顺序翻页 1→N（hasMore 链）任意长 → 恒 none**；非 query 调用清零；scope 切换不清累计 | 防误报铁证 |
| ②反例·多搜索/轮询 | **不同 filterByText 连续各自首页 ×4 → 恒 none**（新 scope 首页中性）；**同页重读但结果变化（轮询）→ 恒 none**；同页重读且结果未变（等待型）→ 计可疑 | 防误报铁证 |
| ③正例 | A,B,A,B → nudge；8 条全交替 → stop | |
| ③反例 | AAAA（单调用重复）不触发；ABAB 中插第三个调用中断后重新计数 | |
| ④正例 | 同 ref 失败 ×2 → nudge；×3 → stop；ref 与 text 打到同一目标不逃逸（按目标归一）；declined 计失败 | |
| ④反例/豁免 | 单次失败不触发；失败 1 次后成功 → 计数退休；不同目标各自独立 | |
| ⑤ | 导航成功后旧失败计数清零、窗口保留（back/forward 交替仍可 ABAB 命中） | |
| ⑥正例 | 同向 moved:false ×2 → nudge；×3 → stop | |
| ⑥反例 | 真实移动的滚动清零；selector 目标不含 moved 恒 none | |
| 全局 | nudge 节流（同片段仅 1 条）；2 健康调用重新武装；合并优先级 stop>nudge；预算 8 → stop('budget')；多 tab 桶隔离；两个实例互不影响（run/子任务隔离） | |

### 10.2 接线测试（react-loop 层，沿用现有 wiring 单测 mock 模式）

| 用例 | 断言 |
|---|---|
| **无循环多轮任务** | 注入消息集合 = ∅（R1 铁证）；`loopRecords` 每轮清空 |
| 触发 nudge | 恰好 1 条合并消息、格式正确（`[System Notice]` + 英文条目） |
| 触发 stop | `createErrorWithLog` 抛出；checkpoint force 保存被调用（可断言 persistCheckpoint） |
| 记录完整性 | 本轮所有工具调用（常规/plan_task/被拒/跳过）均有记录 |

### 10.3 scroll 单测（互动工具既有测试文件内新增，或新建）

| 用例 | 断言 |
|---|---|
| top/bottom/coordinates 已在边界 | `moved: false` 出现，其余字段不变 |
| 正常滚动 | 输出与改造前逐字节一致（无 `moved` 字段） |

### 10.4 回归与探针

| 项 | 标准 |
|---|---|
| 全量单测 | 基线 1004 只增不减、其余不漂移 |
| `npm run build:silent` | 通过 |
| e2e | 31 项与改造前一致 |
| 探针（`test-results-probes/_loop-detector-probe.mjs`，Node 侧真实模块） | 正常序列（含真实抓取的 query_elements 翻页/轮询/导航重置/单次失败恢复形状）零 nudge/stop；每模式构造序列精确触发 |
| 人工验收 | 用户真实使用一轮无循环任务（应无任何感知）+ 可选构造循环场景（看到提醒生效/到点硬停可恢复） |

---

## 11. 执行顺序（TDD，逐任务 commit，每步独立可回退）

| Task | 内容 | 验收 | 回退 |
|---|---|---|---|
| 1 | `loop-detector.js` + 完整单测（红→绿） | 新文件全绿；**不触碰任何现有文件** | 删除新文件 |
| 2 | react-loop 接线（2 新增 + 5 锚点 + 替换 + 删除，同一 commit）+ 接线测试 | 新老单测全绿；"注入=∅"与"记录完整性"通过 | revert 该 commit（完整恢复旧逻辑） |
| 3 | scroll_to 静态判定 + 单测 | 两种输出形态断言 | revert |
| 4 | i18n 6 key × zh/en + 断言 | 只增不改 diff | revert |
| 5 | 全量回归 + 探针 | §10.4 全表 | — |
| 6 | CHANGELOG + 计划执行记录 | — | — |

---

## 12. 风险与控制

| 风险 | 程度 | 控制 |
|---|---|---|
| ref 枚举误报（翻页直觉强） | 最高 | 顺序推进豁免 + 非 query 清零 + scope 切换不清累计（保守） |
| ABAB 误报 | 中 | 提醒型起步；8 次纯交替才停；轮询/表单场景已逐场景推演 |
| 结果含变化字段（时间戳等）导致①漏报 | 低 | 与现状一致（旧逻辑同样全串比较）；由②-⑥与预算兜底 |
| 提醒占 token | 低 | 同片段仅 1 条 + 迟滞重新武装 + 合并单条 |
| 新硬停在旧场景过早出现 | 低 | R2：提醒必先于停；阈值保守起步；常量单点可调；人工验收把关 |

**回退策略**：Task 2 为唯一行为性改动，revert 即回到旧检测；Task 1/3/4 独立无害。

---

## 13. 与 WebBrain 的差异与合规声明

- **仅借鉴思想，不复制代码**（WebBrain GPL-3.0 vs 本项目 MIT）
- 采纳：窗口制重复、ABAB、失败作用域、无进展滚动、健康迟滞、nudge 预算、顺序翻页豁免、导航重置
- 不采纳：坐标点击 bucket（我们无坐标点击）、AX 读循环的站点翻页语义（我们 ref 枚举自研）、carousel/验证码站点特化（站点适配层）、URL 到达历史（需遥测）
- 我们独有：**结果进重复 key**（保护"轮询不误报"的既有语义）；per-run 实例 + 子任务递归自动隔离；stop 返回 reason+params（i18n 在壳侧，模块纯净化）
