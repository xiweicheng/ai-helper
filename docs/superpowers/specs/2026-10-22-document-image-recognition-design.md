# 文档图片识别（Word/PDF 内嵌图片 → AI）设计

- 日期：2026-10-22
- 状态：已确认（用户逐节批准）
- 范围：侧边栏附件链路（docx/pdf）+ Agent 文件服务 + 内置工具

## 1. 问题与目标

用户上传 Word/PDF 让 AI 处理时，现有链路只提取纯文本，文档内的图片被完全丢弃。需要打通"文档 → 图片 → 视觉 AI"链路，且必须兼容两种运行形态：

- **Agent（代理端）已连接**：文档上传到 Agent 工作目录，图片由 Agent 端抽取落盘，插件端按需拉取后交给视觉模型；
- **无 Agent**：图片在浏览器端从 File 对象中直接抠出，存内存使用。

核心约束（已与用户确认的决策）：

| 决策点 | 结论 |
|---|---|
| AI 调度位置 | 始终在插件端；Agent 只当文件服务，不接触任何模型调用 |
| 主模型要求 | 不要求多模态。图片信息一律经视觉模型转述为文本后进入对话 |
| 视觉通道 | 复用现有 `imageApiBase / imageApiKey / imageModelName`（留空回落基础模型配置） |
| 功能开关 | 复用现有总开关 `enableImageInput`，不新增配置项；关闭时整条链路不启用、行为与现状逐字节一致 |
| 转述时机 | 上传/附件处理时预转述前 2 张（阈值内全转），其余仅入清单；细节靠工具按需深读 |
| 阈值（硬编码） | 预转述 2 张；单图压缩后 ≤200KB；单文档抠图上限 20 张（超出只记数量，`truncated` 标注）；转述 max_tokens=800、≤300 字 |
| PDF 抽取 | 主线：pdf.js `getOperatorList()` 抓 `paintImageXObject` 位图；兜底：文本层字符数低于阈值的非空白页整页渲染（覆盖扫描件），清单 `kind` 区分 |
| docx 抽取 | 解 ZIP 读 `word/media/*`，按文档顺序编号（两端同法） |
| 工具执行位置 | `read_document_image` 在 background 执行（与其它内置工具一致）；浏览器模式图片在发送时随 session 级中转存储传给 background |

## 2. 总体数据流

```
用户附加 docx/pdf（enableImageInput 开启）
        │
        ├─ Agent 已连接
        │   ① 上传（现有 POST /api/files/upload，不变）
        │   ② POST /api/documents/extract-images { path } → 图片落盘 _attachments/ + 返回清单
        │   ③ 插件端对前 2 张经 GET /api/fs/download 拉原图 → compressImageForVision → 视觉模型转述
        │
        └─ 无 Agent
            ① 浏览器端文本提取（现有降级链路，不变）
            ② doc-images.js 抠图 → dataUrl 存 fileEntry.images（内存）
            ③ 对前 2 张直接调视觉通道转述

发送消息：文档文本 + [文档图片] 块（转述内联 + 未转述清单 + 工具用法提示）
         浏览器模式同时把图片快照写入 session 级中转存储
主模型需要细节 → 调 read_document_image（background 执行）
         → 按清单取图（Agent: /api/fs/download；浏览器: 中转存储）
         → 压缩(1024/65) → 视觉模型带 question 深读 → 文本作为 tool result 回注
```

降级总原则：**图片链路任何一环失败都不阻塞文档主链路**，退化为现状（纯文本）。

## 3. Agent 端设计

### 3.1 新端点 `POST /api/documents/extract-images`

- 位置：`agent/src/server.js` 路由层；body `{ path: string, maxImages?: number = 20 }`
- 安全：复用 `checkPath`（仅允许工作目录内），沿用 `logFs` / `logSecurity` 审计口径；请求体大小限制沿用现有 JSON body 上限
- 输入格式：仅 `.docx` / `.pdf`（`.doc`、`.xlsx` 等返回结构化 400 `unsupportedFormat`）
- 处理：调用新模块抽取，图片落盘到 `<workspace>/_attachments/<文件名词干>/img-{N}.{ext}`，同目录写 `manifest.json`；**幂等**：同 path 重复调用先清空旧目录再抽取
- 成功响应：
  ```json
  { "success": true,
    "dir": "_attachments/报告",
    "images": [
      { "index": 1, "path": "<workspace>/_attachments/报告/img-1.png",
        "page": 3, "mimeType": "image/png", "bytes": 45210,
        "width": 800, "height": 600, "kind": "embedded" }
    ],
    "truncated": 0 }
  ```
- 失败响应：`{ success: false, error: "unsupportedFormat" | "fileTooLarge" | "parseFailed" | ... }`（HTTP 400/413）；插件端收到失败即跳过图片链路

### 3.2 新模块 `agent/src/documents/image-extractor.js`

- `extractDocxImages(buffer, opts)`：用 JSZip（mammoth 既有依赖）读 `word/media/*`，按 `document.xml` 中 `r:embed` 出现顺序编号（保证"图片N"与文档位置顺序一致）；记录字节数与像素尺寸（PNG/JPEG 头解析）
- `extractPdfImages(filePath, opts)`：用 **pdfjs-dist legacy build（新增 agent 依赖）**：
  - 逐页 `getOperatorList()` 收集 `paintImageXObject` 位图 → 转 PNG（pdf.js 已解码为 ImageData/BitmapImage）
  - 扫描兜底：当页 `getTextContent()` 字符数 < 50 且渲染非空白（canvas 像素方差阈值）→ 整页 2x 渲染为 JPEG，`kind: 'scanned-page'`
  - `page` 字段记录所在页码；总数超过 `maxImages` 截断并返回 `truncated` 计数
- 单图原始字节 > 5MB 跳过该图（清单仍记录，`bytes` 标注，插件端拉取时报错处理）
- 单元测试放 `agent/test/documents/`，命令遵循 agent 端 `node --test` 收口规范

## 4. 扩展端设计（插件端）

### 4.1 `src/side_panel/file-extract.js` 改动

- `fileEntry` 新增字段：`images: []`（清单，统一 schema）、`imageDescriptions: {1: '…', 2: '…'}`、`imageStatus: 'none'|'extracted'|'described'|'error'`
- `processFile`：
  - Agent 分支：`uploadFileToAgent` 成功后，若 `enableImageInput` 且类别为 pdf/docx → 调 `/api/documents/extract-images` → 存清单 → 对前 `min(2, N)` 张走 `/api/fs/download` 拉图 → 压缩 → 转述
  - 浏览器分支：文本提取后，若 `enableImageInput` 且类别为 pdf/docx → 调 `doc-images.js` 抠图（≤20 张，单图压缩后 ≤200KB）→ 存内存 → 转述前 2 张
  - 任一步失败：catch 后置 `imageStatus:'error'`，文本链路结果保留，继续 `renderFilePreviews()`
- `renderFilePreviews`：附件条目上显示 `📷 已描述 2/9`、`📷 共 4 图（超限未抽取 5）`等状态；`enableImageInput` 关闭且文档含图时提示"图片不会被识别（可在设置中开启图片识别）"
- 移除文件 / 清空附件时同步清理清单与内存 dataUrl；中转存储快照按 session 覆盖，不做长期持久化（防 storage 配额膨胀）

### 4.2 新模块 `src/side_panel/doc-images.js`

- `extractDocxImages(file)`：JSZip（mammoth 传递依赖，扩展端 import 可用性需在实现计划中验证；不可用则内联轻量 zip 读取）解 `word/media/*` → dataUrl 数组
- `extractPdfImages(file)`：pdfjs-dist（复用现有动态 import）`getOperatorList()` 抓位图 + 扫描页渲染兜底，逻辑与 Agent 端对齐；OffscreenCanvas 转 dataUrl
- `compressForVision(dataUrl)`：复用/移植 background `compressImageForVision` 同等参数（maxDim 1024、quality 0.65），目标 ≤200KB
- `describeImages(images, count)`：直接 fetch `${apiBase}/chat/completions`（端点/Key/模型取 `imageApiBase/imageApiKey/imageModelName`，留空回落 base 配置——与 chat-manager 现有选模回落逻辑一致）；prompt：*"客观描述图片内容并转录其中全部可读文字（OCR），不超过 300 字"*；`max_tokens: 800`；单图 60s AbortController；失败该图置空描述
- `buildImageBlock(fileEntry)`：生成拼装文本块（见 §5）

### 4.3 新内置工具 `read_document_image`

- 注册：按现有工具定义模式（`id / category / execution:'background' / parallelizable:false / requiresConfirmation:false`）加入 `src/background/tools/` 中 `content_extraction` 类别组；分类显式注册并通过现有提示注入守卫测试
- Schema：
  ```json
  { "file":   "string  // 附件原始文件名，如 报告.docx",
    "image":  "integer // 清单中的图片序号",
    "question": "string? // 希望从图中确认的具体问题，可省略（省略时做完整深读描述）" }
  ```
- 执行（`src/background/tool-executor.js`）：
  1. 从 `_docImageSnapshot` 中转存储的**结构化清单**中定位 `{file, image}`（清单由发送消息时写入，见 §4.4；不解析消息文本）→ 得到 `path`（Agent 模式）或 dataUrl key（浏览器模式）
  2. Agent 模式：`GET /api/fs/download?path=…`（复用 agentPlatform 现有请求通道与鉴权）取字节；浏览器模式：读 `_docImageSnapshot` 中转存储
  3. `compressImageForVision` → 视觉模型（prompt = question 或"详细完整描述图片内容并转录全部文字"）→ 返回文本
  4. 错误文案（工具结果文本，主模型可据此重试/告知用户）：`file 不在当前会话附件中` / `序号越界（该文档共 N 张）` / `图片缓存已失效，请重新附加该文件`（浏览器模式跨会话）/ `Agent 不在线` / `视觉 API 未配置或调用失败`
- 清单文本中向主模型披露工具用法（见 §5），保证纯文本主模型知道可深读

### 4.4 中转存储 `_docImageSnapshot`（方案 a）

- 发送消息时（chat-manager 组装用户消息处）将本次附件的图片信息写入 `chrome.storage.local._docImageSnapshot`，结构：`{ [sessionId]: { files: [ { name, source: 'agent'|'browser', images: [ { index, page, path?, dataUrl?, described } ] } ], updatedAt } }`（模式对齐现有 `_lastVisionScreenshot` 中转）：
  - **Agent 模式只写清单**（path/页码，不写 dataUrl，体积可忽略），background 执行工具时按 path 现拉
  - **浏览器模式写清单 + 压缩后 dataUrl**
- 总量控制：浏览器模式 dataUrl 合计 ≤ 4MB，超出按 updatedAt 从旧到新淘汰整个 session 的快照
- session 删除与附件移除时同步清理对应条目；中转存储不做跨重启长期保留（重启后浏览器模式快照视为失效，工具返回"请重新附加"）

## 5. 消息拼装

在现有附件标记文本之后追加图片块（两种模式统一格式；Agent 模式清单行附 path 供追溯）：

```
[文档图片: 共 4 张，已描述 2 张]
〔图片1｜第3页〕一张季度营收柱状图：Q1 120万，Q2 150万，Q3 180万，Q4 210万。
〔图片2｜第5页〕系统架构图，含三个微服务与消息队列组件。
〔图片3｜第7页〕未描述，可调用 read_document_image(file="报告.docx", image=3) 查看。
〔图片4｜第9页〕未描述，可调用 read_document_image(file="报告.docx", image=4) 查看。
```

- 转述文本追加在文档文本末尾（提取层无图文位置锚点，第一期不做正文内嵌定位）
- 抠图数为 0：不产生任何块，消息与现状逐字节一致
- `truncated > 0` 时末行追加 `[另有 N 张图未抽取，超出单文档 20 张上限]`
- 持久化：转述与清单为普通文本随消息入会话历史（`stripImagesFromContent` 无需改动）；图片原始数据不进会话历史

## 6. 安全与降级

### 6.1 降级矩阵

| 失败点 | 行为 | 用户感知 |
|---|---|---|
| `enableImageInput` 关 | 链路不启用 | 预览提示"图片不会被识别" |
| 文档无图 | 零附加动作 | 无感知 |
| Agent extract-images 失败/超时 | 跳过图片链路，维持现有路径标记 | 预览"图片抽取失败" |
| 浏览器抠图失败（损坏/加密） | 文本照常，图片为空 | 预览"图片抽取失败" |
| 视觉转述失败/超时 | 该图标记未描述，仍在清单 | 预览"已描述 1/4" |
| 压缩后仍 >200KB | 放弃该图实体，清单保留元信息 | 无 |
| 工具：越界/缓存失效/Agent 离线/视觉未配置 | tool result 返回明确错误文案 | 对话内可见 |

### 6.2 安全

- Agent 取图路径经 `checkPath`，仅命中工作目录内 `_attachments/` 抽取产物；extract-images 只读上传文档、只写 `_attachments/` 子树
- `_attachments/` 抽取产物生命周期跟随 Agent 工作目录整体清理策略，不单独做 session 级回收（磁盘文件，用户可自行删除；重复上传同名文档由幂等覆盖保证不膨胀）
- 转述文本源自外部文档经视觉模型转录，属不可信内容：拼接沿用现有文件附件来源标记（`untrusted-content.js` 口径），不引入额外指令格式
- 视觉 API 调用参数与超时（60s）复用截图分析现有模式

## 7. 测试与验收

**Agent 端**（`node --test`，agent/test/）：
- image-extractor：最小 docx zip fixture（含 word/media 两图）；pdf fixture 覆盖 embedded 位图与空白文本层页渲染两条路径；顺序编号、截断、幂等覆盖
- extract-images 端点：格式拒绝、路径安全拦截、fileTooLarge、manifest schema

**扩展端**（vitest，test/unit/）：
- doc-images：operatorList 解析（mock pdfjs）、清单/块渲染、阈值与截断、转述失败降级
- read_document_image 执行器：mock download 与视觉 fetch，断言压缩参数、question 拼接、各类错误文案
- 中转存储：快照写入/上限淘汰/session 清理

**回归基线**：`enableImageInput` 关闭、文档零图片两种情况下，附件处理与消息拼装输出与改动前逐字节一致（快照断言）。

**视觉验证**：Playwright 扩展页面探针验证附件预览状态行（"📷 已描述 2/4"、降级提示、开关关闭提示），沿用现有 chrome profile 探针模式。

## 8. 明确不做（第一期）

- 图片在正文中的锚点级位置嵌入
- `.doc`（旧格式）、`.xlsx` 内嵌图、PPT
- 新配置项（阈值、独立开关均不加）
- Agent 端调用任何模型
- 多文档间图片去重
