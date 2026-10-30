# 语音输入：句级即时精修（消除草稿与定稿的体验断层）设计文档

日期：2026-10-30
状态：待 review（brainstorming 三节已与用户逐节确认）

## 背景与目标

当前语音输入是**两段式**：说话时用 `Streaming Zipformer 中英双语（int8）` 出逐字草稿，松手后整段交给 `SenseVoice 中英韩日粤（int8）` 重转。用户反馈：

> 开始流式输出后，实时输出的草稿内容不准；我停顿以后，又突然用另一个模型去识别。从模型到最终定版的转文字，中间差别太大，导致体验很差。用户在说话过程中看到的草稿，牛头不对马嘴。

目标（用户已明确选择「必须保留边说边出字，但要准」）：

1. 说话过程中看到的文字要**准**，不能是"牛头不对马嘴"的草稿；
2. 松手后的修正**可以保留**（用户认可其他语音输入法"结束后整体修正"的做法），但不能是"整段突然被推翻"；
3. 不降低最终文本的质量上限。

## 现状链路

```
PCM 帧 ──┬─→ zipformer stream ─→ pumpPartial() 每 150ms ─→ {type:'partial'}
         │                    └─→ isEndpoint() ─→ handleEndpoint() ─→ {type:'endpoint'}
         └─→ session.chunks.push()（整段累积，供 stop 用）

stop ─→ finalize() ─→ transcribe(整段 PCM) ─→ {type:'final'}
```

前端 `voice-input.js`：`partial` / `endpoint` 都走 `applyDraft(text)`，**整段替换**草稿区间 `[start, start+len)`；`final` 走 `finalizeText()`，再做一次整段替换。

### 根因拆解（两个独立问题）

**问题 A：草稿质量差 —— 是两个不同模型的产物差异**

| | 流式草稿 | 定稿 |
|---|---|---|
| 模型 | Streaming Zipformer bilingual zh-en（2023-02，int8） | SenseVoice zh/en/ja/ko/yue（int8） |
| 架构 | transducer，词级增量 | 非自回归整段 |
| 标点 | 无 | 有 |
| 数字规整（ITN） | 无 | 有 |

差的是三件事叠加：错字率 + 标点 + 数字/单位规整。且 zipformer 是 2023 年初的双语小模型，中英混说基本会崩。

**问题 B：落差一次性爆发 —— 定稿整段覆盖**

`finalize()` 把整段 WAV 交给 SenseVoice，回来的 `final` 由 `finalizeText()` → `applyDraft(finalText)` **一次性重写整个草稿区间**。于是"全段 × 三种差异"同时发生。

## 关键事实核查（决定方案走向）

**问：松手后的"整段重转"是不是准确率更高？**

核查 `agent/src/asr/transcribe.js`，结论是：**它不是整段推理**。

```js
const segments = splitByVad(vad, src, TARGET_SAMPLE_RATE);
const texts = [];
for (const seg of segments) {
  const text = decodeSegment(recognizer, seg, TARGET_SAMPLE_RATE);
  if (text) texts.push(text);
}
return { text: tidyJoin(texts), segments: segments.length, peak };
```

`decodeSegment` 对**每一段都新建 stream**：

```js
function decodeSegment(recognizer, samples, sampleRate) {
  const stream = recognizer.createStream();   // 每段全新，不继承任何状态
  stream.acceptWaveform({ sampleRate, samples });
  recognizer.decode(stream);
```

VAD 参数（`agent/src/asr/engine.js`）：`threshold: 0.5`、`minSilenceDuration: 0.5`、`maxSpeechDuration: 8`。

**因此："整段重转" = 按 0.5s 静音切成若干段（每段 ≤ 8s）→ 每段独立解码 → 字符串拼接，段间无任何上下文共享。**

它相对流式草稿的质量优势来自三件与"整段"无关的事：

1. **换成 SenseVoice**（标点、ITN、更低错字率）← 约 90% 的差距来源
2. **用 silero VAD 0.5s 静音重新切句**（比 zipformer 的 `isEndpoint()` 可靠）
3. 每段 ≤ 8s（SenseVoice 的舒适区）

**推论（本设计的地基）**：若句级精修使用**同一模型 + 同一 VAD 参数（0.5s / 8s）**断句，则其结果与松手整段重转**在绝大多数情况下逐字相同**。因此逐句精修**不损失任何准确率上限**。

整段重转唯一真实且不可替代的价值是：**修正流式期间的音频边界误差**（对话式切句有反应延迟，可能切掉某句首字；拿到完整 PCM 重新切分，边界更干净）。因此**保留松手后的整段重转**作为权威校正。

## 方案取舍

| 方案 | 结论 | 理由 |
|---|---|---|
| **1. 句级即时精修 + 松手整段校正 + 逐句 diff**（采纳） | ✅ | 唯一同时解决"不准"与"突然变"，且不损失质量上限 |
| 2. 换流式模型让草稿与定稿同源 | ❌ | SenseVoice 无真正流式实现；sherpa-onnx 高质量流式模型可选面窄；换完仍可能不达标 |
| 3. 只做定稿 diff 对齐 + 视觉分档 | ❌ | 纯前端成本低，但完全不解决"说话中看到的是错的" |
| 4. 诚实模式（不出逐字草稿） | ⚠️ 降级档保留 | 零落差，但丢掉核心卖点；作为「精确」档与低配降级落点 |
| 5. 松手不再整段重转（早前提案） | ❌ 已撤回 | 用户明确认可"结束后整体修正"，且整段重转有边界误差修正的真实价值 |

**关键决策**：三条路径全保留 —— 说话中逐句精修、松手整段校正、两者 diff 后只改动有差异的句子。用户既要即时感，也要最终质量，且要求"修正"存在但不粗暴。

## 设计总览

```
PCM 帧 ──┬─→ zipformer ─→ partial（150ms 节流）
         ├─→ silero VAD（0.5s 静音 / 8s 上限）─┐
         ├─→ isEndpoint() ───────────────────┤ 三信号任一命中 → 切句
         └─→ ≥8s 强制 ────────────────────────┘
                                              ↓
                            segChunks 打包 → runOfflineTask（低优先级、可中止）
                                              ↓
                                    {type:'sentence', id, refined}

stop ─→ 中止所有待精修 → transcribe(整段) ─→ {type:'final', segments:[...]}
                                              ↓
                                    前端逐句 diff → 只替换有差异的句子
```

## agent 侧设计

### 1. 切句信号（三取一）

| 信号 | 说明 |
|---|---|
| `isEndpoint()` | 沿用 zipformer，零成本 |
| silero VAD 静音 ≥ 0.5s | **必须与定稿同参**（`minSilenceDuration: 0.5`），否则两个粒度结果不一致，diff 不空，等于没解决 |
| 单句累计 ≥ 8s | 与 `maxSpeechDuration: 8` 对齐，防长句永不结束 |

### 2. 句样本缓冲：不按偏移切片

`session.chunks` 是 `Float32Array[]`，按帧 push，**无样本偏移索引**。不要引入偏移计算，改为双写：

```js
session.chunks.push(samples);      // 整段，供 final
session.segChunks.push(samples);   // 当前句，切句后清空
```

切句时 `concatChunks(session.segChunks)` 即该句样本，随后 `session.segChunks = []`。

### 3. 精修任务的队列约束（关键）

`runOfflineTask` 是**全局串行 FIFO**（`queue = queue.then(...)`）。若精修直接入队，松手时那条整段定稿会排在所有待精修句子后面 —— **松手反而变慢**。

解法（不改队列结构）：

- 每个精修任务闭包捕获 `session`，执行体**第一行**检查 `session.refineAborted`，为真则立即 `return null`（毫秒级空转）；
- `stop` 时先置 `session.refineAborted = true`，再发 `final` 任务 → 排队中的精修瞬间空转完，final 立即开始；
- 精修结果回来时若 `session.released` 已为真，直接丢弃（不发帧）。

### 4. 背压与降级

| 条件 | 行为 |
|---|---|
| **待执行**（pending，尚未被 worker 取走）的精修任务 > 3 | 丢弃最旧的那条（该句保持草稿，不影响正确性） |
| RSS > `RSS_LIMIT_BYTES` | 关闭逐句精修，退回今天的行为 |
| 连续 3 次精修耗时 > 句长 × 1.5 | 判定机器跟不上，关闭逐句精修 |
| 句长 < 0.6s | 跳过精修（SenseVoice 对超短音频质量会掉） |

降级后前端收到 `{type:'refine', mode:'off'}` 一次，录音条提示一次，不反复骚扰。

### 5. final

**保留整段重转，但必须返回分段数组**（否则前端无法逐句 diff）：

`transcribe()` 现在只返回 `segments` 计数，改为同时返回 `texts`：

```js
return { text: tidyJoin(texts), segments: segments.length, texts, peak };
```

`final` 事件新增 `segments: string[]`。`text` 字段保持存在（向后兼容 + fallback 路径）。

## 协议变更

新增两处，其余不变：

| 事件 | 字段 | 说明 |
|---|---|---|
| `sentence`（新，S→C） | `id:number`、`draft:string`、`refined:string\|null` | 同一 id **发两次**：切句时发 `refined:null`（告知前端「这句已结束、id 已分配」），精修完成后发带 `refined` 的第二帧。`id` 从 1 起单调递增 |
| `refine`（新，S→C） | `enabled:boolean`、`reason?` | 会话开始时在 `ready` 帧里带一次；运行中降级时再发一次（`enabled:false`） |
| `final`（改） | 新增 `segments:string[]` | 权威分段文本 |

**为什么 `sentence` 要发两次**：精修是异步的，前端必须先知道「哪段文本对应哪个 id」才能在结果回来时定位替换；只在完成时发一帧，前端就无从知道该句的边界。

`partial` / `endpoint` 保留不动（精修开启时前端只用它们驱动"开放句"，不用它们改写已精修句）。

## 前端设计

### 1. 草稿结构：单区间 → 句表

```js
st.draft = {
  start,                    // 整块草稿在输入框的起点
  items: [                  // 按序
    { id: 1, text: '第一句。', state: 'refined' },  // state: draft | refined | locked
    { id: 2, text: '第二句。', state: 'refined' },
    { id: null, text: '正在说的这', state: 'draft' },  // id=null = 开放句
  ],
}
```

写入输入框 = `items.map(i => i.text).join('')` 整体重写 `[start, start+len)`；`len` 由拼接结果算出，不再手工维护。

**开放句的 id 必须是 `null`，不能是 `0`** —— 服务端的 `id` 从 1 起单调递增，用 `0` 会与真实 id 撞车，导致精修结果错误地替换掉正在说的那句。同一时刻最多一个开放句：新句到达时，旧开放句转为正式 item。

### 2. 用户手改归位（`locateEdit` 纯函数）

1. 求「改动前草稿全文」与「改动后输入框」的公共前缀长 `p`、公共后缀长 `s`
2. 改动区间 = `[p, oldLen - s)`
3. 与改动区间有交集的 item → `state = 'locked'`

| 情况 | 处理 |
|---|---|
| 改在草稿块之前/之后（不碰草稿） | 不锁句；按长度差平移 `start`，草稿内容不动 |
| 大段粘贴/整段删除（跨多句） | 交集涉及的每一句都 lock（"只锁一句"在此无可执行语义） |
| 改的是开放句（正在说的那句） | 锁定它；后续 partial 退回 `appendOnlyDelta` 语义（原样复用，不重写历史教训） |

### 3. 精修 / 校正落地

- `sentence.refined` 到达：id 不存在（已取消）→ 丢弃；`state === 'locked'` → 丢弃；否则替换该句文本并重算 `len`。**句长变化不得影响 `start`**。
- `final.segments` 到达：与 `items.map(text)` 做同样的前缀/后缀 diff，**只替换有差异的区间**，把该区间涉及的多个 item 合并为一个（id 取最小）。差异为 0 时静默，不写输入框。
- 录音条提示：有校正时显示「已校正 N 处」一次。

### 4. 光标

句长变化导致整体重写。光标在草稿块**之前**或**内部** → 按相对偏移恢复；在块**之后** → 按长度差平移。否则每来一句精修光标就跳回草稿末尾，用户没法在输入框后半段打字。

### 5. 视觉分档

**不做句内高亮**。输入框是 `<textarea>`，无法给区间上色；句级替换发生在同一位置、通常只差几个字，加高亮反而更扰动视觉。分档信息只进录音条：`正在听…（已定稿 2 句）`、校正时 `正在校正…`。

## 配置

配置页「语音 → 识别节奏」三档，共用同一套基础设施：

| 档位 | 行为 |
|---|---|
| 即时（= 今天） | 只出流式草稿，松手整段定稿 |
| **均衡（默认）** | 句级精修 + 松手整段校正 + 逐句 diff |
| 精确 | 不出逐字草稿，每句结束才出一次准文本 |

这一层不是为增加配置项，**它是自动降级的落点** —— 没有它，"低配机器上怎么办"没有答案。

## i18n（中英各一份）

- `voice.refineListening`：`正在听…（已定稿 {n} 句）`
- `voice.refineCorrecting`：`正在校正…`
- `voice.refineCorrected`：`已校正 {n} 处`
- `voice.refineDegraded`：`本机性能有限，已关闭逐句精修（松手后仍会整体校正）`
- 配置项：`识别节奏` / `Recognition pacing`，三档标签 + 说明

## 测试计划

### agent 侧（`node --test agent/test/unit/*.test.js`）

- 三个切句信号各自命中即切句；VAD 与定稿同参（0.5s/8s）
- 切句后精修任务携带 `segChunks` 内容，且 `segChunks` 被清空
- 队列 > 3 时丢弃最旧**未开始**的，保留最新
- `stop` 置 `refineAborted` 后，待精修任务空转返回、final 立即执行（**断言执行顺序，不只断言结果**）
- RSS 超阈值 / 自适应降级：关闭精修，`final` 仍出结果
- 句长 < 0.6s 跳过精修
- worker 抛错 → 该句保持草稿、不影响邻句、不发 `sentence` 帧
- 断连 / 取消 → 精修任务不泄漏（`release` 后结果被丢弃）

### 前端（`npx vitest run`）

- `applySentence`：refined 替换 + 长度重算；`locked` 忽略
- `locateEdit`：块外编辑不锁句但平移 `start`；跨多句全部 lock；开放句被改 → lock
- 精修乱序回传（id 2 先于 id 1 到）
- 过期 id 丢弃
- 光标恢复：块前 / 块内 / 块后三种
- `final.segments` 与 items 的 diff：完全相同不写输入框；部分差异只改对应区间

### 真机探针（Playwright + 真实 agent）

两个必须防的假通过陷阱：

1. **只断言"输入框有文本"是无效的** —— 草稿态也满足。必须断言某句的**具体字符**等于 SenseVoice 定稿结果。
2. **若 VAD 未生效，整段会被当成一句**，逐句精修悄悄退化成整段。必须断言**句数等于预期值**（如 3 句）。

另做变异验证：把"用精修替换"改回"用草稿"，守卫测试必须变红；否则守卫是恒真的。

## 风险与明确不做

- **CPU 竞争**：SenseVoice int8 约 239MB，说话时跑可能抢 CPU 导致录音丢帧 —— 靠队列上限 + 自适应降级兜底，不追求零影响。
- **长句不停顿**：连续说 30s 会被切成 4 句逐句精修，延迟累积 → 队列满后丢精修、只留草稿（丢的是精修不是文本，可接受）。
- **跨句一致性**：逐句精修与整段重转同为分段解码，无跨段上下文，**不引入新的不一致风险**；松手后的整段校正仍会处理边界误差。
- **明确不做**：不更换流式模型；不引入真正流式的高质量模型；不对输入框做区间着色；不做句内 UI 标记。

## 验收标准

1. 说话过程中，每一句精修落地后，输入框中该句文本与 `SenseVoice` 对该段音频的定稿结果**逐字相同**。
2. 松手后，`final` 与已显示文本的差异句数在正常口述下 ≤ 20%（经验阈值，用于捕捉边界误差；超出说明切句参数未与定稿对齐），且**只替换差异句**，不做整段重写。
3. 用户在草稿块外编辑输入框，不影响任何句的精修；用户在某一句话内编辑，**只有那一句**停止精修。
4. 低配机器触发降级后，行为与今天完全一致（松手整段定稿），录音条提示一次。
5. 松手到出最终文本的耗时**不高于**今天（不允许因排队变慢）。验证方式：同一段音频在「即时」档与「均衡」档各跑一次，`stop` → `final` 的时间差不超过 15%。
6. 全量回归通过：`npx vitest run`、`node --test agent/test/unit/*.test.js`、`npx eslint src/ agent/`、`npm run build:silent`。
