# RAG 知识库原件留存与溯源设计

- 日期：2026-11-01
- 分支：`feat/rag-originals`
- 状态：已评审通过，进入实现

## 1. 背景与问题

当前导入链路只保留抽取后的纯文本：

- `loadDocument` 所有解析器（`text` / `html` / `pdf-parse` / `mammoth` / `xlsx→CSV` / `officeparser`）统一返回 `string`；
- 全文备份写入 `documents/<docId>.json`（`id/name/text/source/metadata/chunkCount/createdAt`）；
- 原始字节：UI 上传走 base64 → 临时文件 → 解析后 `unlink`；URL 抓取的字节只在内存（PDF 走临时文件后删除）；agent 本地路径导入直接解析原位置文件，不留副本。

后果：用户无法核对原始文件（PDF 版式、docx 表格、网页原貌），解析器升级后也无法重新解析，只能重新导入。

## 2. 目标

1. 有原始文件的导入（本地上传、agent 本地路径、URL 抓取）保留原始字节，支持下载后用本地应用查看。
2. 文本类导入（手输文本）不额外落文本文件，支持"查看文本"与"下载文本"。
3. 知识库设置页的文档列表可查看文本、下载原件。
4. 不引入重复文本存储，不做在线预览。

## 3. 非目标

- 不做 PDF/docx/HTML 在线预览（下载后本地查看）。
- 不做 contentHash 去重（同文件重复导入仍产生两份文档）。
- 不为存量文档提供补传原件入口。
- 不做孤儿原件定期 GC。

## 4. 存储布局

```
~/.ai-helper-agent/rag/
├── collections.json
├── kb_xxx/                          # 索引 + 文本真源（参与重建的整目录原子换入）
│   ├── index.json / vectors/
│   └── documents/<docId>.json       # 唯一文本真源 + 元数据
├── originals/kb_xxx/<docId>.<ext>   # 原件（不参与重建换入）
└── models/
```

**原件目录独立于知识库索引目录**：索引重建流程是 `rename(kb_xxx → .rebuild_xxx/index_backup)` 后 `rename(.rebuild_xxx/kb_xxx → kb_xxx)` 的整目录原子换入。若原件放在 `kb_xxx/` 内，重建时必须把原件拷进临时目录，否则换入会连带替换原件目录导致丢失。独立目录彻底绕开该风险。

## 5. 数据模型（备份 JSON 增量字段）

`documents/<docId>.json` 新增（旧文档缺省即"未保留原件"，无需迁移）：

```json
{
  "original": {
    "name": "季度报告.pdf",
    "ext": ".pdf",
    "size": 2048153,
    "mime": "application/pdf",
    "sha256": "…",
    "storedAt": "2026-11-01T05:12:00.000Z"
  },
  "originUrl": "https://example.com/report"
}
```

- `originalSkipped: 'quotaExceeded' | 'disabled' | 'empty'`：原件未留存的原因（仅在跳过时出现）。
- URL 文档：HTML 快照 `ext='.html'`，`mime` 保留远端 `Content-Type`（含 charset，下载后本地打开不乱码）；响应体本身是 PDF 时 `ext='.pdf'`。
- 文本类导入：无 `original`。

## 6. 导入链路

统一为：**读取字节 → 归档原件（可选）→ 解析字节 → `_ingestText`**。

- **file（base64 上传）**：解码为 Buffer，不再中转 tmpdir（原件目录就是解析源）。
- **file（agent 本地路径）**：沙箱校验后 `stat` 校验 `INGEST_MAX_FILE_BYTES`（原路径分支此前缺该校验），`readFile` 取字节。
- **url**：用 `fetchUrlGuarded` 返回的 `bytes` 归档；正文仍走 `htmlToText` / `pdf-parse` / `decodeBytes`。
- **text**：无原件。

解析仍通过临时文件交给 `loadDocument`（各解析器按扩展名路由，需要真实文件），解析完立即删除；归档与原解析共用同一份内存字节，因此"归档字节 == 被索引字节"。

失败回滚：`_ingestText` 内解析/分块/向量化/写索引任一步失败时，删除已归档的原件（此时备份 JSON 尚未写入）。

## 7. 生命周期

| 事件 | 原件处理 |
|---|---|
| 删除文档 | 按备份的 `original.ext` unlink 原件 → 删备份 → 删分块 → 回写计数 |
| 删除知识库 | `rm -rf kb_xxx` + `rm -rf originals/kb_xxx` |
| 索引重建 | 只读备份 JSON，原件不动（目录隔离，无需搬动） |
| 进程崩溃残留 | `.rebuild_*` 收敛逻辑不变；原件目录幂等（同 docId 覆盖写），不做 GC |

## 8. 磁盘策略

- 单文件上限沿用 `INGEST_MAX_FILE_BYTES`（50MB）。
- 每库原件总额上限默认 2GB，配置 `ragOriginals: { enabled: true, maxBytesPerCollection: 2147483648 }`（`agent/config.js`）。
- **超限不阻断导入**：仍写文本与向量，跳过原件，备份记 `originalSkipped: 'quotaExceeded'`，导入响应返回 warning，前端 toast 提示。理由：知识库可用性优先于归档。

## 9. HTTP 接口

均复用现有认证与 `handleWithT` 错误翻译。

### `GET /api/rag/collections/{id}/documents/{docId}`

返回 `{ document: { id, name, source, createdAt, chunkCount, original, originalSkipped, originUrl, text, truncated, totalChars, viewLimit } }`。

- `text` 超过 200000 字符截断（避免数 MB JSON 卡死弹窗），`truncated=true` 时前端提示"已截断，可下载全文"。
- 备份不存在 → `RagError('documentNotFound')`（400 + code）。

### `GET /api/rag/collections/{id}/documents/{docId}/download?kind=original|text`

- `kind=original`：流式返回原件；`Content-Type` 取备份记录的 mime；`Content-Disposition: attachment; filename="<ascii 回退>"; filename*=UTF-8''<encodeURIComponent(原名)>`；无原件 → `RagError('originalMissing')`。
- `kind=text`：现场生成 `text/plain; charset=utf-8` 附件（`<文档名>.txt`），不落盘。
- `kind` 非法 → `RagError('unsupportedDownloadKind')`。
- 安全：扩展名只取备份记录（正则 `^\.[a-z0-9]{1,8}$` 兜底），不接受客户端参数；`docId` 已过 `DOCUMENT_ID_RE`。

路由正则需扩展一个可选的 `download` 尾段。

## 10. 前端（options → 知识库 → 文档列表）

- 每行：名称 + 来源徽标（文件 / 网页 / 文本）+ `N 分块 · 大小 · 导入时间`；行尾动作：查看文本、下载原件（无原件禁用并说明原因）、删除。
- 查看文本弹窗：只读、可滚动、复制按钮；`truncated` 时顶部提示并给"下载全文"。
- 下载走 `fetch` + `Authorization` 头 + `Blob` + `<a download>`（保留中文文件名）。
- 存量老文档：显示灰字"原件未保留"。
- i18n 中英文成对补齐。

## 11. 测试计划

agent（`node --test`）：

1. 原件落盘 + sha256 + 备份字段（file/url 两条链路）
2. 配额超限跳过原件但导入成功（`originalSkipped`）
3. 失败回滚：向量化失败后原件与备份均不存在
4. 删除文档/删除知识库联动删原件
5. `getDocument` 截断与 `documentNotFound`
6. 下载：RFC 5987 文件名编码、无原件 `originalMissing`、非法 `kind`
7. 重建索引后原件仍在（集成）

扩展侧：i18n 键成对校验；浅/深色视觉 probe（文档列表 + 文本弹窗）。

收尾：`npm run build:silent`，agent 单测，扩展单测。

## 12. 存量兼容

不加 schema 版本、不写迁移脚本；旧备份无 `original` 字段即视为未保留原件。
