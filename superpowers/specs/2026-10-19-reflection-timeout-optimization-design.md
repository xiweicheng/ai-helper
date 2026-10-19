# 反思机制超时优化（评估/修订解耦）设计

- 日期：2026-10-19
- 状态：已实施（含单测与构建验证）
- 涉及文件：`src/background/react-reflection.js`、`src/background/constants.js`、`src/side_panel/chat-panels.js`、`test/unit/react-reflection-flow.unit.test.js`

## 1. 背景与根因

用户反馈两个问题（附执行日志截图）：

1. **反思（质量评估）超时失败**：`请求超时 (30000ms)`。
2. **执行日志面板头部评分显示 `undefined/10`**。

根因定位：

| # | 现象 | 根因 |
|---|---|---|
| 1 | 反思超时 | 超时硬编码 30s（`fetchWithRetry(..., 30000, 1, 1000)`）、非流式；且评估 prompt 强制要求模型在 `refinedAnswer` 字段输出**完整修订答案**，长答案场景下生成耗时远超 30s |
| 2 | `undefined/10` | 反思失败时日志条目不含 `overallScore` 字段，而 `chat-panels.js` 面板头部对 `reflectionType==='post'` 条目无条件渲染 `${overallScore}/10` |

## 2. 方案决策

- **评估/修订解耦（治本）**：评估调用只输出小而快的评分 JSON（不再携带 `refinedAnswer`）；仅当分数低于质量阈值时才发起独立修订调用生成完整答案。修订调用失败**降级**为"保留原答案 + 需改进"，不判整条反思失败。
- **超时/重试仅代码配置（用户明确要求不开放 UI）**：`DEFAULT_REFLECTION_CONFIG.postReflection` 新增 `timeoutMs: 90000`、`reviseTimeoutMs: 150000`、`maxRetries: 2`；模块导出 `REFLECTION_FETCH_DEFAULTS` 供残缺旧配置回落。超时类错误本就可被 `fetchWithRetry` 重试，重试次数由 1 提到 2。
- **空分数守卫**：失败条目显式 `overallScore: null`；面板头部判空显示"—"。
- **解析兼容**：`parseReflectionResult` 兼容模型把分数输出成字符串（`"8"`）。

## 3. 行为契约

```
reflectOnResult 每轮：
  评估调用（timeoutMs, maxRetries）
  ├─ score >= qualityThreshold → passed（1 次调用）
  └─ score <  qualityThreshold → 修订调用（reviseTimeoutMs）
       ├─ 成功且有 refinedAnswer → revised（低分时 issues 标注）
       └─ 失败/拒答 → needs_improvement，保留原答案
  评估调用本身失败 → 整条 reflection_failed（条目 overallScore: null）
```

修订调用以独立子节点记入执行日志（`reflectionType: 'revise'`，成功/失败均记录），时间序在对应评估条目之前。

## 4. 验证

- 新增 `test/unit/react-reflection-flow.unit.test.js`（11 用例，TDD 先红后绿）：调用次数与降级、超时常量回落、重试参数、failed 条目判空、字符串分数兼容、面板渲染守卫。
- 全量单测通过；`npm run build:silent` 成功。
