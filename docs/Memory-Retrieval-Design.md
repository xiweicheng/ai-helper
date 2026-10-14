# 长期记忆检索：当前口径说明

> 这份文档只回答两件事：**现在是怎么判定的**、**为什么定成这样**。
> 实施过程与逐轮结论在 `docs/superpowers/plans/2026-10-13-memory-*.md`（已执行完毕，仅存档，**不要按那些计划实施**）。
> 面向使用者的功能介绍见 `agent/README.md` / `README.md`；知识库检索的同类文档是 `docs/RAG-Knowledge-Retrieval-Design.md`。
>
> 本文点到的仓内常数与文件名都可在源码里 grep 到。写歪时的两类例外已就地标明：已删除的符号标注它被删掉的提交，库实现内部的符号标注它只存在于依赖包里。改动任一常数时，请同时更新本文与它指向的用例。

## 1. 数据在哪：真源与派生缓存

| 文件 | 角色 |
| --- | --- |
| `~/.ai-helper-agent/memory/global-memory.json` | **唯一真源**（`MEMORY_DIR/global-memory.json`），`maxFacts: 50 / maxSummaries: 20` |
| `~/.ai-helper-agent/memory/memory-vectors.json` | **派生缓存**：可整删、可损坏、可整目录不存在 |

缓存异常一律当空处理并回落词面通道——**绝不把 recall 带崩或带抛**。缓存键 `memoryModelKey()` = `mode|modelName|dimensions`，任一变化即整体作废旧向量（跨模型向量不可比）。**读出时同样校验指纹**：`vectors.read()` 返回 `{modelKey, vectors}`，recall 必须比对缓存指纹与当前 `memoryModelKey()`，不符则整份视空、全部候选当缺失重补——旧实现只在写入路径关心指纹，读出后直接采信旧空间向量算余弦，换模型后的名次是纯噪声。

## 2. 档位判定：`agent/src/memory/tier.js`（纯函数单点）

| 档 | 触发条件 | 行为 |
| --- | --- | --- |
| `none`（默认） | `memoryEmbedding.enabled !== true` | 只走词面计分，**零新增依赖、零新增网络**，与向量功能实施前的行为逐字一致 |
| `remote` | `mode === 'openai-compat'` 且 `apiKey`/`modelName` trim 后非空 | 远端 embedding + 进程内 brute-force 余弦 |
| `local` | `mode === 'local'` 且 `isRagAvailable()` | 复用知识库的本地 transformers 模型；依赖缺失**静默降回 `none`** |

recall 是三阶段结构：锁内只读（真源 + 候选 + 缓存指纹 + 缺失集）→ **锁外**补齐（嵌入失败或超时 `MEMORY_EMBED_TIMEOUT_MS = 8000` 静默退回词面通道，HTTP 仍返 200；失败按 `modelKey` 冷却 `RECALL_BACKFILL_COOLDOWN_MS = 60000`，期内不再发起）→ 锁内融合与访问计数。为什么补齐必须移出：互斥锁是进程内 Promise 链、连超时都不解锁，补齐永驻锁内会堵死全部记忆操作；而 `upsertVectors` 自身有串行链（读-改-写不交叉），锁外写安全。访问计数在锁内须重读真源做读-改-写，否则覆盖锁外期间并发写入的条目。

## 3. 词面通道：`agent/src/memory/tokens.js`

计分单元与权重：`FIELD_WEIGHT = { content: 3, title: 2, tags: 2 }`，整句命中另加 `ORIGINAL_QUERY_CONTENT_BONUS = 5` / `ORIGINAL_QUERY_TITLE_BONUS = 3`（整句长度门槛 `ORIGINAL_QUERY_MIN_LENGTH = 2`）。单元来自**片段化匹配**，与知识库共用同一实现 `agent/src/rag/keyword-match.js`（消除碎 bigram 噪声）。

`keywordScore` 返回 `{ score, units, full, best }`，三根轴各有分工：

- **单元身份是「查询单元」**（拉丁按词、中文按连续段），不是命中片段。同一查询单元在正文/标题/标签多处命中时，`units` 取它达到的**最强值**而非累加——否则一个 2 字片段（如「配置」）在正文与标签各命中一次就凑出 `units=2`，把门槛旁路（2026-10-14 真实库实测：QQ 邮箱记忆靠此顶到第 1，而查询的三个概念词一次都没出现）。
- **`score` 跨字段累加、字段内封顶**：同一字段内的命中单元和先封顶 `KEYWORD_MAX_HITS (= 3)` 再乘该字段权重（2026-10-14 评审发现 `6e2a22f` 重构曾丢掉这层封顶、被按单元线性放大，已恢复——长文档碰多个碎块不得线性推分）；跨字段仍各自累加：一个词既在正文又在标签出现本就是更强的排序信号，只让**门槛**不再吃这份重复。
- **`best` 是单个查询单元自己达到的最强单元数**——区分「一次深命中」与「多次浅碎块」，`score` 只反映出现在几个字段，判名次时必须有这根深度轴。

命中判定（门槛）：`isKeywordHit = s.full || s.units >= KEYWORD_MIN_UNITS (= 2)`。

词面排序（两处共用 `byKeywordRank`，A 档单通道与融合档 `kwRanked` 口径逐字一致）：**深度命中优先，其后按分数**。深度命中 `isDeepKeywordHit = s.full || s.best >= KEYWORD_MIN_UNITS`——多个 2 字碎块凑起来的命中能过门槛但不算深度，必须排在一次长片段命中之后（单元制修了分值，名次上未修：浅碎块靠多字段重复照样顶到前面）。取向是**降权不是剔除**，浅碎块仍在结果里。

区分度剔除（IDF）：`buildDocFreqFilter` 用 `limit = max(KEYWORD_DF_EXEMPT (= 2), 候选数 × KEYWORD_MAX_DF_RATIO (= 0.5))`，保留 `d > 0 && d <= limit` 的单元。三条已定死的口径：

- **df 统计池是全候选**，不是标签子集。子集会让只出现在非标签条目里的词 `d` 为 `undefined` 被直接拒，等于把「想捞回的条目」只能靠共享词命中。
- **全塌兜底**：查询里**所有**单元都被判无区分度时忽略 df（`hasDiscriminative` 为 false → `dfFilter = () => true`）。依据：真实库 41 条里 `ai` 出现 30 次 > `limit` 20.5，按现行尺子必被剔，导致用户明确输入的词整条判死。
- 兜底**不放宽词面命中门槛**（全库无人碰该词时仍 0 条，并报 `memory.noMatch` 而不是谎称空库）；**只在整体塌陷时生效**（还有任一低频单元幸存就照旧剔高频词，否则高频词会挤满返回窗口）。

## 4. 语义通道：`agent/src/memory/fusion.js` 的采信三门

| 常数 | 值 | 含义 |
| --- | --- | --- |
| `SEMANTIC_QUERY_FLOOR` | 0.48 | 查询级：top1 低于此值则整条语义通道不采信 |
| `SEMANTIC_MARGIN` | 0.05 | 条目级：只采信距 top1 落差在此值以内的头部 |
| `SEMANTIC_MAX_TAKE` | 2 | 每次查询最多采信 2 条语义命中 |

`vectorMatched` = 被语义路采纳的条数（上限 2）。两路各取名次后按 `rrfFuse` 融合，`RRF_K = 60`（业界默认值，未重调）——**只消费名次，不混合分数尺度**。

> ⚠️ 0.48 不是通用常数，而是**在标注样本上量出的一段安全窗口的中点**：下界 = 无关查询（本库无答案）top1 的最大值、上界 = 相关查询 top1 的最小值。bge-m3 上窗口为 `(0.4506, 0.5163]`（下界取真实库天气控制查询，比合成语料的 0.4322 更严）。整段窗口随 embedding 模型平移，**换模型或改记忆文本拼接方式后必须重标定**。
>
> **如何重标定**（换模型后的固定动作）：在 `agent config.json` 的 `memoryEmbedding` 里配好目标模型，跑
> `cd agent && node test/eval/recalibrate-semantic-floor.mjs`。它联网取一次向量、调用纯函数
> `agent/test/eval/semantic-window.js` 的 `computeSemanticWindow` 量出新窗口，打印建议地板与「现值 0.48 是否仍在窗口内、余量多少」。按它给的数改 `SEMANTIC_QUERY_FLOOR`，再跑 `test/eval` 两套黄金评测确认。推荐值归整栅格后会校验仍落 `(下界, 上界]` 内——窗口窄于栅格时四舍五入会越出上界，此时退回未归整中点（窗口可用时中点必然在窗内），并在窗口过窄（宽 < 2×栅格）或推荐值未落栅格时输出告警；照越界的归整值设地板会拒掉最低分的相关查询。数学由 `memory-semantic-window.unit.test.js` 离线钉住（用已提交黄金向量，零联网）；脚本本身人工执行，绝不进测试链路。

## 5. 标签的角色：`agent/src/memory/tags.js`

| 场景 | 行为 | 理由 |
| --- | --- | --- |
| 有 `query` | **不剔除候选**，只在两条通道的最终序上按重叠比例上抬名次，上限 `TAG_RANK_LIFT = 2` | 标签曾是打分前的硬过滤，与词面门槛、语义地板构成三个硬门槛 AND 叠加——内容与语义都正确的记忆只因没打标签被整条抹掉 |
| 无 `query` | **保持硬筛选**（`filterByTags`） | 此时标签是唯一选择器，属枚举语义 |

重叠比例分母取**请求标签数**（请求三个中一个，弱于请求三个中三个）。`applyTagRankLift` 用 `key = index − lift`、同 key 优先被抬者，否则抬 1 位会与让开的那条并列、稳定序下等于没抬。上限取 2 位：1 位几乎抬不动，3 位以上就退化成「标签命中一律排前」，那正是要避开的形态。

## 6. 向量与记忆生命周期对齐

| 事件 | 向量侧动作 |
| --- | --- |
| `store(add)` 在向量档 | **懒补**：响应不等待嵌入，嵌入完成后落盘 |
| `recall` 发现缺失向量 | 锁外补齐（见 §2）；失败后同一 `modelKey` 在 60s 冷却期内不再发起 |
| `store(update)` 内容变化 | 同 id 重算覆盖，不新增条目；id 不存在时返回 `code: 'not_found'`（HTTP 400），压缩线据此降级为 `add` 重建锚点 |
| `store(delete)` | 同步 `dropVectors([id])`，不留孤儿向量 |
| `manage(compact)` 淘汰 | 同步摘除被淘汰记忆的向量 |
| 换模型 / 手动重建 | `POST /api/memory/reindex`（`backfillVectors`）整体重建 |

## 7. 配置面与端点

- 配置读写单点 `agent/src/memory/embedding-config.js`：`DEFAULT_MEMORY_EMBEDDING_CONFIG`（**默认关闭**）、`maskMemoryEmbeddingConfig`（key 脱敏后才出接口）、`resolveMemoryEmbeddingConfig`、`toEmbeddingProviderConfig`。
- **`baseUrl` → `endpoint` 的字段映射必须在 `toEmbeddingProviderConfig()` 里做**：配置面统一叫 `baseUrl`（与扩展端表单一致），而 `rag/embedding` 的 OpenAI 兼容后端读 `endpoint`。这个错位单测看不见（注入的是假工厂），只有走真实 provider 的冒烟会炸。交出空白 `queryPrefix` 时须删除该键。
- **provider 进程内缓存按完整配置作键**：`getProvider()` 的键 = `JSON.stringify(toEmbeddingProviderConfig(cfg))`（涵盖 `baseUrl`/`endpoint`/`apiKey`/`queryPrefix` 等全部输入）。曾只按 `mode|modelName|dimensions` 作键——改前缀/换 key/换地址后旧 provider 不重建，不重启不生效。
- 端点（`ROUTE_METHODS` + `handleEmbeddingEndpoints`）：POST 类 `store` / `recall` / `manage` / `inject` / `reindex`（后者实际映射到 `backfillVectors`）；配置与探活类 GET 合法：`embedding-config`、`test-embedding`、`vector-status`（只读状态：条数 + 指纹陈旧判定）。业务失败一律 HTTP 400 + 原样 body（含结构化 `code`，如 `update` 不存在 id 时的 `not_found`；扩展端 `agentRequest` 保留 `httpStatus`）；只有路径/方法不匹配才 404（扩展端据此探测旧版 agent 无记忆端点）。
- 扩展端界面：`src/options/memory-panel.js`（状态三态、陈旧标红、重建按钮）。**总开关走「切换即持久化」**，请求体只带 `enabled`；其余字段走「保存到代理」。开关文案由 `syncEnabledLabel()` 唯一渲染，`options.html` 里那个 span 不挂静态 i18n 键 —— 挂上后语言切换会把「已启用」硬盖成「已停用」。
- 远端档提交体是**所见即所存**：`baseUrl`/`modelName`/`queryPrefix`/`dimensions` 始终提交（含空值/0）——旧实现「只收非空」让清空操作静默无效（字段缺席 = agent 端「不传即不改」）。唯一例外 `apiKey`：明文永不回显、留空 = 不修改，清除走专用按钮（`hasApiKey` 为真时显示，确认后 POST `{ clearApiKey: true }`；agent 端 `clearApiKey === true` 优先于同传的 `apiKey`）。配置 GET 失败后表单停在默认空值，保存被 `configLoadFailed` 守卫拒绝——否则空表单会把代理真配置覆盖成空。
- **嵌入来源单选与知识库同名同义**：远端选项文案统一为「远端服务（OpenAI 兼容接口）」（此前记忆面写作「远端 API」，与知识库不一致）。**本地档模型固定内置** `Xenova/bge-small-zh-v1.5`，与知识库一致：选本地时 `applyModeVisibility` 连模型框一起隐藏，`collectPayload` 本地分支**显式清空三个会把远端残留带进本地档的字段**（保存层「不传即沿用旧值」）：`modelName:''`（残留被本地 provider `modelName || 内置默认` 拿去 transformers 下载）、`queryPrefix:''`（残留顶替 BGE 默认查询前缀——provider 的 `??` 只认 nullish，非空残留原样生效）、`dimensions:0`（不参与本地向量，但进 `memoryModelKey` 指纹，残留随远端历史漂移会让同一份本地配置冒报 stale 并白跑重建）；`baseUrl`/`apiKey` 在本地档完全惰性（不建远端后端），保持省略留给切回远端用。

## 8. 已知限制（不是 bug，别顺手「修掉」）

- **本地档 512 token 静默截断**：feature-extraction pipeline 内部带 `truncation: true`，`Xenova/bge-small-zh-v1.5` 的 `model_max_length = 512`，超窗尾部不进向量（当时实测真实库 41 条中 13 条超窗）。已转为**可见**：`backfillVectors` 按能力探测输出 `overWindow: {count, window, ids}` 并写日志；计数失败不得把索引报成失败。
- 知识库默认 `chunkSize: 400` 已在窗口内，不受此限。
- 本地档向量随分批组合漂移 cos 0.9940~0.9974，属 `dtype: 'q8'` 量化的数值噪声，**不是 mask 处理错误**（`mean_pooling` 正确传了 `attention_mask`）。后两个符号是 transformers.js 的实现内部，只在 `agent/node_modules` 里，不在本仓源码；当时是读依赖包源码定位的。

## 9. 已被实测否定过的方案（不得加回来）

| 曾设想的判据 | 否定依据 |
| --- | --- |
| 条目级绝对余弦阈值（`cos ≥ 0.3` / `0.45`） | 绝对 cos 在条目级不可用：`≥0.3` 放过 40/41 条、`≥0.45` 仍放过 20/41；只在**查询级 top1** 可分。`MEMORY_VECTOR_THRESHOLD` 与 `vectorHit` 旁路已删除（删除发生在提交 `47c31d7`，用 `git log -S` 可查） |
| 两路归一化后同尺度加权 | 词面是整数分、语义是余弦，尺度不可比；改为 RRF 只融合名次 |
| 分离度门（top1 − top2） | 无关查询的 gap（0.0361 / 0.0397）**高于**真实目标查询的 0.0214，在 gap 轴上分不开；且库越大越容易偶然变大。`memory-fusion.unit.test.js` 有专门用例防止加回 |
| df 只统计标签子集 | 见 §3 第一条 |
| 标签在打分前硬过滤 | 见 §5 |

## 10. 每条判据钉在哪

| 判据 | 用例 |
| --- | --- |
| 档位判定 | `agent/test/unit/memory-tier.unit.test.js` |
| 词面计分、df 池与全塌兜底 | `agent/test/unit/memory-tokens.unit.test.js`、`memory-service.unit.test.js`（describe「recall 标签口径：加分而非剔除」） |
| 单元跨字段去重不得旁路门槛（`units` 取最强、`best` 轴） | `agent/test/unit/memory-tokens.unit.test.js`（describe「单元累加按查询单元而非按字段」） |
| 深度命中优先排序（A 档与融合档两处同步、降权不剔除） | `agent/test/unit/memory-service.unit.test.js`（describe「词面门槛：同一碎块跨字段重复计数不得顶过门槛」「词面排序：深度命中优先于浅碎块」） |
| 语义三门与 RRF、分离度门不得加回 | `agent/test/unit/memory-fusion.unit.test.js` |
| 标签重叠比例与上抬 | `agent/test/unit/memory-tag-rank.unit.test.js` |
| 派生缓存与模型键 | `agent/test/unit/memory-vectors.unit.test.js` |
| 懒补/删除/淘汰的向量同步 | `agent/test/unit/memory-service.unit.test.js`（describe「向量生命周期同步」） |
| recall 状态机（读出指纹校验 / 锁外补齐 / 失败冷却 / 锁内重读真源） | `agent/test/unit/memory-service.unit.test.js` |
| 锚点失效（`code: not_found`）降级 add（压缩线） | `test/unit/compaction-memory-persist.unit.test.js` |
| 面板所见即所存 / 清除 API Key / 未加载守卫 | `test/unit/memory-panel.unit.test.js`、`test/unit/memory-panel-structure.unit.test.js` |
| 配置字段映射与脱敏（含 `clearApiKey`） | `agent/test/unit/memory-embedding-config.unit.test.js` |
| 入参校验的渲染文案 | `agent/test/unit/memory-validation-messages.unit.test.js` |
| 检索**效果**基线（离线、零网络） | `agent/test/unit/memory-recall-eval.unit.test.js`、`memory-recall-eval-b.unit.test.js` |
| 测试不得写真实目录 | `agent/test/unit/memory-test-isolation.unit.test.js` |
| 真实链路（含 `baseUrl→endpoint`） | `agent/test/smoke/memory-pushdown.smoke.mjs` |

**效果类改动必须先跑两份黄金评测**：只测机制的用例对规则变化可能完全不敏感（曾被证明是假敏感）。

## 11. 文件归属：记忆线 vs 上下文压缩线

两条线同期落在同一分支上，看改动时别混：

- **记忆线**：`agent/src/memory/*`、`agent/src/rag/keyword-match.js`、`agent/test/unit/memory-*`、`agent/test/smoke/memory-*.mjs`、`src/options/memory-panel.js`、`src/background/tools/memory-tools.js`、`src/background/tool-memory.js`（扩展端转发层，只做参数映射与 HTTP 转发）
- **上下文压缩线**（会话上下文压缩 → 摘要沉淀，与记忆库的 `compact` 清理是两回事）：`src/side_panel/auto-compaction.js`、`src/side_panel/context-indicator.js`、`src/shared/context-usage.js`、`src/shared/compaction-prompt.js`、`src/background/compaction-memory.js`、`src/background/context-compactor.js`、`src/background/context-summarizer.js`（ReAct 超窗口的增量轮次摘要），测试在 `test/unit` 下的 `auto-compaction` / `batch-compaction` / `compaction-*` / `context-usage` 各文件，计划文档 `2026-10-13-context-compaction-effectiveness.md`

## 12. 收口命令

```bash
cd agent && node --test test/unit/*.unit.test.js        # 记忆线在 agent/test/unit/memory-*
cd agent && node --test test/integration/rag-*.integration.test.js
cd agent && node test/smoke/memory-pushdown.smoke.mjs
npx vitest run && npm run lint && npm run build:silent
```

`agent/test/integration/api.integration.test.js` 需要本机凭据且会打正在运行的 agent，不在常规收口里。
