# 从厂商 API 一键获取模型列表 设计文档

日期：2026-09-20
状态：已确认（合并追加 + 主模型/视觉模型双覆盖 + 按钮与自动拉取双触发）

## 背景与目标

当前配置页添加模型需要用户手动 copy 模型名再粘贴，繁琐且易错。绝大多数厂商提供 OpenAI 兼容的 `GET /models` 列表接口。目标：在配置页选择厂商并填好 API Key 后，一键（或自动）拉取该厂商支持的模型列表，合并追加进现有模型下拉框，减少手动输入。对于不支持或格式特殊的厂商，静默兜底为「用户手动添加」。

## 厂商支持情况调研

事实标准为 OpenAI 的 `GET /v1/models`，统一返回：

```json
{ "object": "list", "data": [ { "id": "模型名", "object": "model" } ] }
```

现有 `PRESET_API_BASES`（`src/options/constants.js`）10 家支持情况：

| 厂商 | Base URL | `/models` | 备注 |
|---|---|---|---|
| DeepSeek | api.deepseek.com | ✅ | 标准 OpenAI 格式 |
| OpenAI | api.openai.com/v1 | ✅ | 标准源头 |
| Moonshot | api.moonshot.cn/v1 | ✅ | OpenAI 兼容 |
| 阿里 DashScope | dashscope.aliyuncs.com/compatible-mode/v1 | ✅ | 兼容模式支持 |
| 百川 Baichuan | api.baichuan-ai.com/v1 | ✅ | OpenAI 兼容 |
| 硅基流动 SiliconFlow | api.siliconflow.cn/v1 | ✅ | 文档明确支持 |
| 零一万物 01.AI | api.lingyiwanwu.com/v1 | ✅ | OpenAI 兼容 |
| 火山方舟 Ark | ark.cn-beijing.volces.com/api/v3 | ✅ | 支持列出模型/端点 |
| Anthropic | api.anthropic.com/v1 | ⚠️ | 需额外 `x-api-key` + `anthropic-version` 头，返回结构同为 `data[].id` |
| 智谱 bigmodel | open.bigmodel.cn/api/paas/v4 | ❓ | 无稳定公开列表接口，走兜底 |

腾讯混元等不在预设列表内，本期不新增厂商。

## 可行性

`manifest.json` 已声明 `<all_urls>` host 权限，选项页（extension page）可直接跨域 `fetch` 任意厂商接口，不受 CORS 限制，无需经过 background 代理。

## 架构与执行位置

- 在**选项页内直接 `fetch`**，不经过 background，改动集中、无新增消息通道。
- 新增独立模块 `src/options/model-fetcher.js`，单一职责：输入 `{apiBase, apiKey}` → 请求 → 容错解析 → 返回模型名字符串数组，或抛出带 HTTP 状态码的错误。
- `src/options/index.js` 只负责按钮/事件绑定、调用 fetcher、把结果写入现有下拉函数（`addCustomModelToDropdown` / `addCustomImageModelToDropdown`）与 toast 反馈。
- DOM 变更在 `options.html` 的模型区 `add-model-section` 内新增获取按钮。

### 模块接口

```
// model-fetcher.js
export async function fetchModelList({ apiBase, apiKey, timeoutMs = 15000 })
  -> Promise<string[]>            // 成功：去重后的模型名数组
  -> throw FetchModelsError       // 失败：{ message, status?, reason }
export function parseModelsPayload(json) -> string[]  // 纯函数，供单测
```

## 请求与 URL 拼接

- 请求地址：`${apiBase 去掉尾部斜杠}/models`，与现有 `${apiBase}/chat/completions` 拼法一致。
- 请求头：
  - 通用：`Authorization: Bearer ${apiKey}`
  - Anthropic（base URL 含 `anthropic.com`）：追加 `x-api-key: ${apiKey}` 与 `anthropic-version: 2023-06-01`
- 超时：`AbortController` 控制，默认 15s，超时抛错（reason=timeout）。
- 保留 HTTP 状态码用于区分错误类型（401 认证失败 vs 其它），与项目既有实践一致。

## 容错解析（parseModelsPayload）

依次尝试，取第一个非空结果；全部失败返回空数组（视为「未识别」→ 兜底）：

1. OpenAI 标准：`json.data[]` 为对象且含 `id` → 取 `id`。
2. 兼容变体：`json.data[]` 为字符串 → 直接取。
3. 其它常见形态：`json.models[]` 为字符串，或对象含 `id`/`name` → 取对应字段。

解析结果需去重、过滤空字符串。纯函数、无副作用，便于单测。

## 融合逻辑（合并追加）

- 遍历抓取到的模型名，逐个调用 `addCustomModelToDropdown(name, 0)`（contextWindow 传 0 = 留空，不显示 badge，用户后续可手动补）。
- 该函数内部已有「`data-value` 相同则跳过」的去重逻辑，天然满足「已存在跳过、保留原有预设/自定义」。
- 视觉模型区同理调用 `addCustomImageModelToDropdown(name, 0)`。
- 抓取后自动 `saveCustomModels()` / 对应的图片模型保存逻辑（由现有 add 函数内部触发，确认覆盖）。
- 统计：抓取总数 N、实际新增数 M，用于 toast 反馈。

## 触发方式（双触发）

### 1. 独立按钮
- 在主模型区与视觉模型区的 `add-model-section` 内，`+ 添加模型` 按钮旁各加一个 `⟳ 从 API 获取` 按钮（id：`fetchModelsBtn` / `fetchImageModelsBtn`）。
- 点击时读取当前输入：主模型区读 `#apiBase` + `#apiKey`；视觉区读 `#imageApiBase` + `#imageApiKey`。
- 点击流程：前置校验 → 按钮进入 loading（禁用 + 文案「获取中…」）→ 调 fetcher → 合并追加 → toast → 恢复按钮。

### 2. 自动拉取一次
- 当用户从 apiBase 下拉**选定厂商**且对应 apiKey 已填时，自动静默拉取一次。
- 防抖 + 去重：对每次「选定」动作只触发一次（记录 lastAutoFetchKey = apiBase+apiKey 的哈希，相同不重复触发），并加防抖（如 500ms）避免抖动。
- 自动拉取失败**静默**（不弹错误 toast），避免干扰；仅手动点按钮失败才提示。
- 自动拉取成功同样走合并追加，可用轻量 toast 告知新增数量（可静默，最终以实现计划确定，默认静默成功、静默失败）。

## 错误处理与状态

| 场景 | 行为 |
|---|---|
| apiBase 或 apiKey 为空（手动点击） | toast 提示先填写配置，不发请求 |
| 请求进行中 | 按钮禁用 + 文案「获取中…」，防重复点击 |
| 网络错误 / 超时 | 手动：toast `❌ 获取失败，请检查配置或手动添加模型`；自动：静默 |
| HTTP 401/403 | 手动：toast 认证失败提示；自动：静默 |
| 解析结果为空（格式不识别） | 手动：toast 提示未获取到模型、请手动添加；自动：静默 |
| 成功 | 手动：toast `✅ 已获取 N 个模型（新增 M 个）` |

失败一律不阻断用户手动添加（兜底路径始终可用）。

## i18n 文案

新增 key（中/英），写入 `src/shared/locales/zh.js` 与 `src/shared/locales/en.js` 的 `settings` 对象内（现有 `settings.*` 文案均在此，通过 `t()` 读取；`_locales/*/messages.json` 仅用于扩展 manifest 的 `__MSG_`，本功能不涉及）：

| key | 中文 | 英文 |
|---|---|---|
| `settings.fetchModels` | ⟳ 从 API 获取 | ⟳ Fetch from API |
| `settings.fetchModelsLoading` | 获取中… | Fetching… |
| `settings.fetchModelsNeedConfig` | 请先填写 API Base URL 和 API Key | Please fill in API Base URL and API Key first |
| `settings.fetchModelsSuccess` | ✅ 已获取 {total} 个模型（新增 {added} 个） | ✅ Fetched {total} models ({added} new) |
| `settings.fetchModelsEmpty` | 未获取到模型，请手动添加 | No models returned, please add manually |
| `settings.fetchModelsFailed` | ❌ 获取失败，请检查配置或手动添加模型 | ❌ Fetch failed, check config or add manually |
| `settings.fetchModelsAuthFailed` | ❌ 认证失败，请检查 API Key | ❌ Authentication failed, check API Key |

按钮 title 也需 i18n（`data-i18n-title`）。

## 测试计划

### 单元测试（`test/unit/`，vitest）
针对 `parseModelsPayload`：
- OpenAI 标准格式（`data[].id`）→ 正确提取
- `data[]` 字符串数组 → 正确提取
- `models[]` 字符串 / `models[].id` / `models[].name` → 正确提取
- Anthropic 格式（`data[].id`）→ 正确提取
- 含重复项、空字符串 → 去重与过滤
- 非法/空 JSON、缺字段 → 返回空数组

针对 URL 拼接与请求头（可对 fetcher 做 mock fetch）：
- apiBase 带/不带尾部斜杠 → 拼接为 `.../models`
- base 含 anthropic.com → 追加 anthropic 头
- 超时 → 抛 timeout 错误
- 401 → 错误含 status=401

### 手动验证
- DeepSeek、硅基流动：真机拉取成功并合并追加，重复项被跳过。
- 智谱（无接口）：走失败兜底 toast，不崩溃。
- 视觉模型区独立验证一次。
- 自动拉取：选定厂商且已填 key 时触发一次，重复选择同厂商不重复触发。

## 明确不做（YAGNI）

- 不做替换式导入、不做勾选弹窗（已选合并追加）。
- 不猜测/推断上下文窗口大小（contextWindow 一律留空）。
- 不新增厂商到预设列表（腾讯混元等以后再说）。
- 不做模型列表本地缓存与过期策略（本期每次实时拉取）。

## 交付物清单

```
src/options/model-fetcher.js   # 新增：请求 + 容错解析
src/options/index.js           # 改动：按钮事件、自动拉取防抖、toast
options.html                   # 改动：主模型/视觉模型区各加获取按钮
styles/styles.css              # 改动（如需）：获取按钮样式
src/shared/locales/zh.js       # 改动：settings 内新增中文文案
src/shared/locales/en.js       # 改动：settings 内新增英文文案
test/unit/model-fetcher.test.js # 新增：解析与请求单测
```
