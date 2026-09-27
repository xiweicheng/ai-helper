# AI Helper 知识检索（RAG）能力集成方案

> 版本：1.3
> 日期：2026-09-27
> 状态：方案设计
> 变更：v1.3 基于本地实测补充平台兼容性约束：Intel Mac（darwin-x64）需 overrides 固定 onnxruntime-node ~1.23.0（≥1.24 无此平台二进制）；模型下载须走 hf-mirror 镜像且缓存目录独立于 node_modules；v1.2 修正 Node 版本要求（RAG 需 Node 22+，核心不受影响）、BGE 查询前缀（非对称检索）、transformers.js v4、中文分块上限、安装接口安全约束、score 语义；Vectra 适配器代码对照 v0.15.0 真实 API 重写；v1.1 新增"可选依赖与能力检测"章节，RAG 作为高级功能按需启用，不强依赖

## 一、目标

在 AI Helper 插件中集成知识检索（RAG）能力，支持：

1. **内置轻量 RAG**：用户导入文档到本地知识库，对话时自动检索相关知识
2. **外接 RAG 服务**：对接 Qdrant / Pinecone / Dify 等外部向量数据库和 RAG 平台
3. **MCP 模式**：通过现有 MCP 机制接入任意 RAG MCP 服务器（零开发）
4. **输入框触发**：用户在输入窗口通过 `@知识库` 引用知识库，或由 LLM 主动调用检索工具

## 二、现有基础设施

项目已具备集成 RAG 的良好基础：

| 已有能力 | 位置 | 复用点 |
|---|---|---|
| 本地 agent 服务（Node.js） | `agent/src/server.js` | 在其中内置向量库，无需额外服务 |
| MCP 集成机制 | `agent/src/mcp/` + `tool-executor.js` | 外接 RAG 走 MCP，零额外开发 |
| 工具系统 | `src/background/tools/` | 注册 `knowledge_*` 工具供 LLM 调用 |
| @ 选择器 | `file-at-selector.js`、`agent-at-selector.js` | 复用作 `@知识库` 选择器 |
| 文件上传 | `agent/src/server.js` | 文档导入复用上传链路 |
| IndexedDB 存储 | `src/storage/db.js` | 浏览器端缓存检索结果 |
| **全局开关机制** | `.global-toggle` 组件 + `chrome.storage.local` | RAG 总开关复用此模式（现位于「知识库」标签页面板头部） |
| **可选能力检测先例** | `search.js` 的 `fd`/`rg` 检测 | RAG 依赖检测复用此模式 |
| **Agent 状态接口** | `/api/status` + `/api/status/detail` | 返回 `ragAvailable` 字段 |

## 三、可选依赖与能力检测（核心设计）

### 3.1 设计原则

RAG 作为**高级功能**，不强制安装、不强制启用。全链路按需：

```
npm 安装时不装 RAG 依赖（optionalDependencies）
     ↓
Agent 启动时检测：Node 22+ 版本检查 → RAG 依赖是否可用
     ↓
/api/status 返回 ragAvailable: true/false
     ↓
前端读取状态，决定是否显示 RAG 功能入口
     ↓
用户通过总开关启用/禁用 RAG
     ↓
启用时按需安装 RAG 依赖（动态 import）
```

### 3.2 依赖管理：optionalDependencies

```json
// agent/package.json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "archiver": "^8.0.0",
    "ws": "^8.18.0",
    "xlsx": "^0.18.5",
    "zod": "^4.4.3"
  },
  "optionalDependencies": {
    "vectra": "^0.15.0",
    "@huggingface/transformers": "^4.0.0",
    "pdf-parse": "^1.1.1",
    "mammoth": "^1.8.0",
    "officeparser": "^8.0.0",
    "cheerio": "^1.0.0"
  }
}
```

- `optionalDependencies` 中的包安装失败不会导致 `npm install` 失败
- 用户通过 `npm install --omit=optional` 可以跳过所有可选依赖
- 核心功能（文件操作、MCP、命令执行）不受影响

**Node 版本要求（RAG 前置条件）**：

- RAG 依赖链要求 **Node.js 22+**：`vectra` 0.15 声明 `engines: node >=22`，`officeparser` 8 要求 `>=22.13.0`，`@huggingface/transformers` v4 以 Node 22 LTS 为目标
- `agent/package.json` 的 `engines` 维持 `>=18` 不变：核心功能（文件操作、MCP、命令执行）仍完整支持 Node 18/20 用户，只有 RAG 能力受 Node 版本约束
- RAG 可用性由 `detect.js` 在动态 import 之前判定（见 3.3），Node < 22 时直接返回不可用并给出明确提示，不做降级安装

**体积提示**：transformers v4 依赖 `onnxruntime-node` 原生二进制，RAG 依赖包合计约 **200-300MB**（视平台而定），另加模型文件约 95MB。

**平台兼容性：Intel Mac 需固定 onnxruntime-node 版本（v1.3 实测补充）**：

`@huggingface/transformers` v4 全系列（4.0.0~4.3.0）精确依赖 `onnxruntime-node` ≥1.24.3，而 onnxruntime-node 自 **1.24.0 起不再发布 darwin/x64（Intel Mac）原生二进制**（1.23.2 为最后支持版本，其 tarball 的 darwin 目录同时含 arm64/x64）。不处理时 Intel Mac 上加载 transformers 报错 `Cannot find module .../darwin/x64/onnxruntime_binding.node`。修复：package.json `overrides` 固定版本：

```json
// agent/package.json
"overrides": {
  "onnxruntime-node": "~1.23.0"
}
```

- 实测（Intel Mac x64）：transformers 4.3.0 + onnxruntime-node 1.23.2 的 embedding 推理正常（输出 [1,384] 向量），数值与 4.0.1 + 1.23.0 组合完全一致
- 平台矩阵：win32 x64/arm64、linux x64/arm64、darwin arm64 原生支持；darwin x64 依赖上述 overrides（统一固定到 1.23.x 不影响其他平台的核心推理功能）
- **生效边界**：npm `overrides` 仅在"根项目"安装时生效——在 agent 目录直接 `npm install`（开发场景与一键安装 install.js 场景）有效；`npm install -g` 全局安装时包内 overrides 不生效，发布侧需另行处理（安装脚本或文档指引）

> 说明：`officeparser` 覆盖 .docx/.pptx/.xlsx/.pdf/.rtf/.odt 等 Office 与 PDF 格式，作为完整解析能力引入；实施时按 5.6 的"格式覆盖矩阵"确定最终保留的解析器与依赖（xlsx 也可直接复用 agent 现有的核心依赖 `xlsx`，见 5.6）。

### 3.3 Agent 端：运行时能力检测

复用 `search.js` 中检测 `fd`/`rg` 的模式，新增 `agent/src/rag/detect.js`：

```js
// agent/src/rag/detect.js
// RAG 可选依赖检测（仿 search.js 的 fd/rg 检测模式）

let _ragAvailable = null; // 缓存检测结果

/**
 * 检测 RAG 依赖是否可用
 * 缓存结果避免重复检测
 */
export async function detectRagAvailable() {
  if (_ragAvailable !== null) return _ragAvailable;

  // 前置检查：Vectra 0.15+ 要求 Node 22+（engines: node>=22），
  // 必须放在动态 import 之前，否则低版本 Node 会抛引擎/语法层错误，提示不友好
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (nodeMajor < 22) {
    _ragAvailable = false;
    console.log(`[RAG] 需要 Node.js 22+（当前 ${process.versions.node}），RAG 功能不可用`);
    return _ragAvailable;
  }

  const checks = await Promise.allSettled([
    import('vectra'),
    import('@huggingface/transformers'),
  ]);

  const vectraOk = checks[0].status === 'fulfilled';
  const transformersOk = checks[1].status === 'fulfilled';

  _ragAvailable = vectraOk && transformersOk;

  if (!_ragAvailable) {
    console.log('[RAG] 依赖未安装，RAG 功能不可用。安装方法: npm install vectra @huggingface/transformers');
  } else {
    console.log('[RAG] 依赖检测通过，RAG 功能可用');
  }

  return _ragAvailable;
}

/**
 * 同步获取缓存的检测结果（检测必须在启动时完成）
 */
export function isRagAvailable() {
  return _ragAvailable === true;
}

/**
 * 重置检测结果（用于手动安装依赖后重新检测）
 */
export function resetRagDetection() {
  _ragAvailable = null;
}
```

### 3.4 Agent 启动时检测 + 状态接口

```js
// agent/src/server.js（启动时检测）
import { detectRagAvailable, isRagAvailable } from './rag/detect.js';

// 启动时检测 RAG 依赖
await detectRagAvailable();

// /api/status 接口增加 ragAvailable 字段
if (req.method === 'GET' && pathname === '/api/status') {
  return jsonResponse(res, 200, {
    success: true,
    version: AGENT_VERSION,
    running: true,
    platform: PLATFORM_INFO.platform,
    platformName: PLATFORM_INFO.platformName,
    arch: PLATFORM_INFO.arch,
    nodeVersion: PLATFORM_INFO.nodeVersion,
    searchTools: getSearchToolsAvailable(),
    ragAvailable: isRagAvailable(),        // ← 新增
  });
}

// /api/status/detail 同理增加 ragAvailable
// ...
```

### 3.5 Agent 端：RAG 路由按需加载

```js
// agent/src/server.js（RAG 路由按需加载，非强依赖）
if (pathname.startsWith('/api/rag/')) {
  if (!isRagAvailable()) {
    return jsonResponse(res, 503, {
      success: false,
      error: 'RAG 功能未启用。请在代理端安装依赖: npm install vectra @huggingface/transformers',
    });
  }
  // 动态 import，只在请求时加载
  const { ragRouter } = await import('./rag/routes.js');
  return ragRouter(req, res, pathname);
}
```

### 3.6 前端：能力探测 + 总开关

#### Agent 连通性检测时读取 ragAvailable

```js
// src/background/local-agent-client.js 或 side_panel/agent-manager.js
async checkAgentCapabilities() {
  const res = await this.callApi('GET', '/api/status');
  return {
    connected: res.success,
    ragAvailable: res.ragAvailable || false,   // ← 新增
    searchTools: res.searchTools,
    version: res.version,
  };
}
```

#### 总开关（位于「知识库」标签页面板头部，复用 MCP 总开关模式）

```js
// chrome.storage.local 存储
// ragEnabled: true/false  （默认 false）

// src/options/knowledge-panel.js —— 开关与面板门控一体化（原在扩展 tab，后续迁移至知识库面板）
chrome.storage.local.get('ragEnabled', (result) => {
  const enabled = result.ragEnabled === true;
  const ragToggle = document.getElementById('ragGlobalToggle');
  if (ragToggle) ragToggle.checked = enabled;
});

// 总开关切换：写入 storage 后刷新面板门控（就绪则显示知识库列表）
// 工具注册/注销由 background 监听 storage.onChanged 自动处理
document.getElementById('ragGlobalToggle').addEventListener('change', () => {
  chrome.storage.local.set({ ragEnabled: ragToggle.checked });
  refreshKnowledgePanel();
});
```

#### RAG 功能入口的显示条件

总开关（`ragEnabled`）是全部知识库入口的统一门控，各入口落点如下（组合条件已在各入口分别实现）：

| 入口 | 总开关关闭 | 代理端不支持（`ragAvailable=false`） |
|------|-----------|--------------------------------------|
| 设置页「知识库」面板 | 显示「立即启用」门控 | 就地显示依赖安装引导 |
| 侧边栏 @ 选择器「知识库」Tab | 隐藏（聚合搜索同步排除知识库） | 隐藏 |
| 引用检索（发送前 `RAG_SEARCH`） | 跳过检索 | 请求失败静默跳过 |
| LLM 工具动态注册（background） | 不注册 | 不注册 |

```js
// src/side_panel/agent-at-selector.js —— @ 选择器每次展开实时读取总开关（不走列表缓存）
const { ragEnabled } = await chrome.storage.local.get('ragEnabled');
if (ragEnabled !== true) return { ok: false, disabled: true, collections: [] };
```

### 3.7 依赖安装引导

实现位置：「知识库」标签页门控区——总开关开启且 `ragAvailable=false` 时就地展示安装引导（不再跳转其他标签页）；安装成功/重新检测通过后自动切回知识库列表。

当用户尝试启用 RAG 但代理端依赖未安装时：

```
┌──────────────────────────────────────────────────────────┐
│  启用知识库检索（RAG）                                     │
├──────────────────────────────────────────────────────────┤
│  RAG 功能需要在代理端安装额外依赖包。                      │
│                                                          │
│  需要安装的包：                                           │
│  • vectra（本地向量存储）                                  │
│  • @huggingface/transformers（本地向量模型）               │
│  • pdf-parse、mammoth、cheerio（文档解析）                 │
│                                                          │
│  运行环境要求：Node.js 22+（当前版本以检测结果为准）         │
│  预计下载大小：约 200-300MB（含 onnxruntime 原生库，        │
│  视平台而定）                                             │
│  首次使用时还需下载 AI 模型：约 95MB                       │
│                                                          │
│  在代理端工作目录执行：                                    │
│  ┌────────────────────────────────────────────────────┐   │
│  │ npm install vectra @huggingface/transformers \     │   │
│  │   pdf-parse mammoth cheerio                        │   │
│  └────────────────────────────────────────────────────┘   │
│  [复制命令]                                               │
│                                                          │
│  或使用一键安装：                                          │
│  [一键安装 RAG 依赖]                                      │
│                                                          │
│  安装完成后点击 [重新检测]                                 │
│                                                          │
│           [取消]  [重新检测]                              │
└──────────────────────────────────────────────────────────┘
```

#### 一键安装（通过 Agent API 触发，含安全约束）

本地管理接口存在"智能 IP 判断免认证"的先例，但安装接口**执行的是 npm install**，属于高权限操作，必须与普通管理接口区别对待：

```js
// Agent 新增安装接口
// POST /api/rag/install
//   - 不接受调用方传入的包名（防止任意包注入），安装清单为服务端常量白名单
//   - 强制 Bearer 认证：不走"本机来源免认证"豁免，避免本机任意进程/网页触发安装
//   - spawn('npm', args, { shell: false }) 执行，参数不含用户输入，杜绝命令注入
//   - 异步任务 + 安装锁（并发请求直接返回进行中），立即返回 { started: true }
//   - 同一时刻仅允许一个安装任务，超时上限 10 分钟

// GET /api/rag/install/status
//   → { running, done, success, phase, logTail }

// CLI（等价能力，推荐优先使用）
// aha rag install  → 安装 RAG 依赖
// aha rag status   → 检测 RAG 状态
```

```js
// agent/src/rag/install.js —— 白名单与 3.2 节 optionalDependencies 保持一致
const RAG_INSTALL_PACKAGES = [
  'vectra', '@huggingface/transformers',
  'pdf-parse', 'mammoth', 'officeparser', 'cheerio',
];
```

### 3.8 能力检测状态流转

```
                    ┌─────────────┐
                    │  用户启用    │
    ┌───────────────│  RAG 总开关  │
    │                └──────┬──────┘
    │                       │
    ▼                       ▼
┌─────────────┐     ┌──────────────┐
│ 开关关闭      │     │ 检测代理端    │
│ 隐藏所有 RAG  │     │ ragAvailable  │
│ 功能入口      │     └──────┬───────┘
└─────────────┘            │
                   ┌───────┴───────┐
                   │               │
                   ▼               ▼
           ┌─────────────┐ ┌─────────────┐
           │ 依赖已安装    │ │ 依赖未安装    │
           │ 显示 RAG     │ │ 显示安装引导  │
           │ 功能入口     │ │ 禁用功能入口  │
           └─────────────┘ └─────────────┘
```

### 3.9 配置导入导出

`ragEnabled` 加入配置导入导出白名单（同 `mcpEnabled`）：

```js
// src/options/config-io.js
const CONFIG_KEYS = [
  // ... existing keys
  'mcpEnabled', 'skillsEnabled', 'ragEnabled',  // ← 新增
];
```

## 四、整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    用户输入框 (side_panel)                    │
│   [文本] @知识库 ▼  [发送]                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ 引用知识 / LLM 主动调用工具
┌──────────────────────▼──────────────────────────────────────┐
│                 统一 RAG 抽象层 (RAGProvider)                │
│  listCollections / ingestDocument / search / delete          │
│  ← 仅在 ragEnabled=true && agentRagAvailable=true 时激活      │
└──────┬──────────────────────┬───────────────────┬────────────┘
       │                      │                   │
┌──────▼──────┐        ┌──────▼──────┐     ┌──────▼──────────┐
│  内置轻量RAG │        │ 标准适配器   │     │   MCP 模式      │
│  (Vectra)   │        │ (Qdrant/    │     │ (复用现有MCP)   │
│             │        │  Pinecone/  │     │                 │
│  本地向量库  │        │  Dify/...)  │     │  任意RAG MCP    │
│  BGE embedding│       │  统一转换层  │     │  服务器          │
│  可选依赖     │        └─────────────┘     └─────────────────┘
└─────────────┘
     ↑ optionalDependencies，不装不影响核心功能
```

核心设计：
1. 定义统一 `RAGProvider` 接口，内置和外接都实现它，上层只依赖接口
2. RAG 全链路受**三重门控**：前端总开关 → 代理端能力检测 → 按需动态加载

## 五、模式一：内置轻量 RAG

### 5.1 技术选型

| 组件 | 选型 | 理由 |
|---|---|---|
| 向量存储 | [Vectra](https://stevenic.github.io/vectra/) | 本地文件持久化、Node.js/浏览器双端、MIT 协议；v0.15.0 支持 min-heap top-K、Protobuf 存储（可选 codec）、内置 BM25 混合检索（存在硬性约束，见 5.8）；**要求 Node.js 22+** |
| Embedding（默认） | `Xenova/bge-small-zh-v1.5` | **中文优化**、512 维、95MB、BGE 系列中文检索公认优秀；512 token 输入上限约束分块策略（见 5.6）；需配合查询前缀（见 5.3） |
| Embedding（可选） | OpenAI 兼容端点 | 用户可配置 `text-embedding-3-small` 等远端模型 |

> transformers.js v4 官方主推 `onnx-community` 组织的模型（如 `onnx-community/bge-small-zh-v1.5-ONNX`）；`Xenova/*` 旧模型仍兼容。两者皆可，选定后写入知识库配置（切换模型需重新索引，见 5.3）。

> **为何不用 all-MiniLM-L6-v2**：该模型是英文模型，在多语言基准 MMTEB 上排名 12/40（平均 31.8 分），中文检索质量差。BGE 系列在中文检索任务上通常能达到 60-75%+。

### 5.2 向量存储：Vectra

#### 存储机制

Vectra 是轻量级本地文件向量库（非独立数据库服务），每个知识库是一个文件夹：

```
~/.ai-helper-agent/rag/
├── collections.json              # 知识库元数据注册表
├── {collection-id}/              # 每个知识库一个目录
│   ├── index.json                # Vectra 索引文件（codec 默认 JSON；选用 Protobuf codec 时为 index.protobuf）
│   ├── {uuid}.json               # 外部元数据文件（仅当 metadata_config.indexed 配置了部分索引字段时生成）
│   └── documents/                # 原始文档备份（BM25 的 docReader 依赖它，见 5.8）
└── models/                       # transformers.js 模型缓存
```

#### 容量与性能

| 规模 | 分块数 | 磁盘占用 | 内存占用 | 查询延迟 |
|---|---|---|---|---|
| 小型 | 1,000 | ~3MB | ~5MB | <1ms |
| 中型 | 10,000 | ~30MB | ~50MB | 1-5ms |
| 大型 | 100,000 | ~300MB | ~500MB | 5-50ms |
| 超大 | 1,000,000 | ~3GB | ~5GB | 50-500ms |

- **无硬性存储上限**，受磁盘和内存约束
- **检索质量不随数据量下降**（向量维度固定，相似度精度不变）
- **检索速度线性变慢**（暴力余弦相似度扫描，非 ANN）
- v0.15.0 优化：min-heap top-K 查询 O(N log K)、不再深拷贝向量、并行 metadata 读取
- **超过 10 万分块建议迁移外接方案**（Qdrant 有 HNSW 索引）

#### 存储格式

- JSON（默认，人类可读）
- Protocol Buffers（可选，文件小 40-50%）

### 5.3 向量生成：Embedding

#### 默认：本地模型（零依赖）

```js
// bge-small-zh-v1.5
// 模型大小: 95MB（量化后）
// 向量维度: 512
// 最大输入: 512 token（中文约 1 字 ≈ 1 token，扣掉 [CLS]/[SEP] 2 个 token；
//          分块上限由此推导，见 5.6，切勿用 800 字符默认值）
// 首次运行自动下载（国内须走镜像，见下）；缓存位置必须显式指定（见 env.cacheDir）
// 无需 API key，无需网络（首次下载除外），数据完全不出本机

const { env, pipeline } = await import('@huggingface/transformers');

// 模型下载端点：huggingface.co 国内直连超时（实测 10s ConnectTimeout），
// 默认走 hf-mirror 镜像，开放为配置项（rag.embedding.remoteHost）
env.remoteHost = 'https://hf-mirror.com/';

// 模型缓存目录：transformers v4 默认落在 node_modules/@huggingface/transformers/.cache（实测），
// npm 重装即丢失；显式指向用户数据目录（如 ~/.ai-helper-agent/models）
env.cacheDir = modelCacheDir;

const extractor = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
  dtype: 'q8',  // v3+ 用 dtype 指定量化精度（替代已废弃的 quantized: true）
});
const output = await extractor(texts, { pooling: 'mean', normalize: true });
// → 512 维向量
```

#### 关键约束：BGE 查询前缀（非对称检索）

BGE v1.5 中文系列是**非对称检索模型**：查询侧必须加官方指令前缀，文档侧不加前缀。漏掉前缀会显著拉低检索召回率，这是 BGE 最经典的踩坑点：

```js
// 查询侧前缀（官方推荐，中文模型）
const QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';

// 查询：带前缀
const [queryVec] = await extractor([QUERY_PREFIX + query], { pooling: 'mean', normalize: true });
// 文档：不带前缀
const docVecs = await extractor(chunks, { pooling: 'mean', normalize: true });
```

- 前缀写入知识库配置（`embedding.queryPrefix`）随库持久化
- 英文模型（bge-*-en-v1.5）与 OpenAI 兼容端点**不需要**前缀，配置项置空即可
- 修改前缀只影响检索侧，**无需重新索引**；修改模型才需要重新索引（见下文"链路一致性"）

#### 可选：远端模型

```json
{
  "rag": {
    "embedding": {
      "mode": "openai-compat",
      "endpoint": "https://api.openai.com/v1",
      "apiKey": "sk-xxx",
      "modelName": "text-embedding-3-small"
    }
  }
}
```

> 约定：`endpoint` 为 Base URL，**须包含版本段**（如 `/v1`）；代码只在其后拼接 `/embeddings`，避免出现 `/v1/v1/embeddings` 双重版本段。

#### 关键约束：链路一致性

**导入文档和检索必须用同一个 embedding 模型**。中途换模型需要重新索引整个知识库。

- 配置中记录 embedding 模型名称与查询前缀
- 检测到模型变更时提示用户"需要重新索引"，实现上即清空重导（`deleteDocument` 后重新 ingest）
- 查询前缀变更只影响检索侧，无需重新索引

#### EmbeddingProvider 实现

```js
// agent/src/rag/embedding/index.js
export class EmbeddingProvider {
  constructor(config) {
    this.config = config;
    this.dimensions = config.dimensions || 512;
    this.modelName = config.modelName || 'Xenova/bge-small-zh-v1.5';
    // BGE 中文模型默认查询前缀；非 BGE 模型 / 远端端点置空
    this.queryPrefix = config.queryPrefix ?? '为这个句子生成表示以用于检索相关文章：';
    // 显式记录状态，避免静默降级
    this.mode = config.apiKey ? 'openai-compat' : 'local';
    console.log(`[RAG] embedding mode: ${this.mode}, model: ${this.modelName}`);
  }

  /** 查询侧：带前缀（非对称检索，漏加会显著降低召回） */
  async embedQuery(query) {
    const [vec] = await this.embed([this.queryPrefix + query]);
    return vec;
  }

  /** 文档侧：不带前缀 */
  async embedDocuments(texts) {
    return this.embed(texts);
  }

  async embed(texts) {
    if (this.mode === 'local') return this._embedLocal(texts);
    return this._embedOpenAI(texts);
  }

  async _embedLocal(texts) {
    const { pipeline } = await import('@huggingface/transformers');
    if (!this._pipeline) {
      this._pipeline = await pipeline('feature-extraction', this.modelName, {
        dtype: 'q8',
      });
    }
    const output = await this._pipeline(texts, { pooling: 'mean', normalize: true });
    return Array.from(output).map(v => Array.from(v));
  }

  async _embedOpenAI(texts) {
    // endpoint 为 Base URL（含 /v1），仅拼接 /embeddings
    const res = await fetch(`${this.config.endpoint}/embeddings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.modelName, input: texts }),
    });
    const data = await res.json();
    return data.data.map(d => d.embedding);
  }
}
```

### 5.4 性能与硬件要求

| 资源 | 最低要求 | 推荐 |
|---|---|---|
| CPU | 任何现代 CPU | 多核更快 |
| 内存 | 模型大小 × 2 ≈ 200MB | 512MB+ 空闲 |
| GPU | 不需要 | 有 WebGPU/WASM 更快（3-5 倍） |
| 磁盘 | 依赖包 200-300MB + 模型缓存 95MB + 索引数据 | 1GB 余量 |
| Node.js | **22+（Vectra 0.15 / officeparser 8 硬性要求）** | 22.x LTS |

> 核心 agent 仍支持 Node 18+：RAG 为可选能力，Node < 22 时 `detect.js` 直接判定不可用并提示升级（见 3.3），不影响核心功能。
>
> 平台：Intel Mac（darwin-x64）需 `overrides` 固定 `onnxruntime-node ~1.23.0`（≥1.24 起无该平台二进制），其余平台原生支持，详见 3.2。

CPU 推理速度估算：

| 模型 | 单条文本 | 100 条批量 |
|---|---|---|
| bge-small-zh-v1.5 | ~50-100ms | ~3-5s |
| bge-base-zh-v1.5 | ~150-300ms | ~10-20s |
| all-MiniLM-L6-v2 | ~30-50ms | ~2-3s |

一般电脑（8GB+ 内存）完全能跑，不需要 GPU。

### 5.5 模块结构

```
agent/src/rag/
├── index.js                 # 模块入口：初始化 RagManager、注册路由
├── manager.js               # RagManager：知识库生命周期管理（增删改查）
├── config.js                # RAG 配置：embedding 模型、分块参数、存储路径
├── embedding/
│   ├── index.js             # EmbeddingProvider 工厂 + 统一接口
│   ├── local.js             # transformers.js 本地 embedding（默认）
│   └── openai-compat.js     # OpenAI 兼容端点 embedding（可选）
├── store/
│   ├── index.js             # VectorStore 统一接口
│   └── vectra.js            # Vectra 适配器
├── document/
│   ├── loader.js            # 文档加载器：按扩展名路由到对应解析器
│   ├── parsers/
│   │   ├── text.js          # .txt/.md/.json/.csv
│   │   ├── html.js          # .html/.htm 去标签
│   │   ├── pdf.js           # .pdf 文本提取
│   │   └── office.js        # .docx/.pptx/.xlsx
│   └── chunker.js           # 分块策略：固定大小+重叠 / 按段落
├── searcher.js              # 检索器：向量检索 + 结果归一化 + 阈值兜底
├── install.js               # 可选依赖安装（固定白名单 + 认证 + 安装锁）
└── routes.js                # HTTP 路由注册（挂载到 server.js）
```

### 5.6 知识库导入流程

```
用户上传文件/粘贴文本/输入URL
        │
        ▼
  DocumentLoader.load(source)        ← 按格式解析为纯文本
        │
        ▼
  Chunker.split(text, { chunkSize, overlap })   ← 切分为 chunk 数组
        │
        ▼
  EmbeddingProvider.embed(chunks)   ← 批量生成向量（本地 BGE）
        │
        ▼
  VectraStore.upsert(collectionId, chunks, embeddings, metadata)  ← 写入 Vectra
        │
        ▼
  返回 { documentId, chunkCount, status }
```

#### 文档解析（多格式支持）

> **实施第一步：先验证 Vectra 内置加载能力（减少自建代码）。**
> Vectra 0.15 自带 FileLoader 系列（文本 / HTML / Markdown 等）与内置分块工具（其依赖含 `cheerio`、`turndown`、`gpt-tokenizer`）。动手写 parser 前先跑一个"格式覆盖矩阵"验证：被内置 loader 覆盖的格式直接复用，仅对未覆盖的格式保留自建 parser 与专用依赖。
> 根据 Vectra 0.15.0 的依赖清单判断，**PDF 与 Office 文档不在其内置覆盖范围内**，需按下表自建解析器。

```js
// agent/src/rag/document/loader.js
const PARSERS = {
  '.txt':  () => import('./parsers/text.js'),
  '.md':   () => import('./parsers/text.js'),
  '.json': () => import('./parsers/text.js'),
  '.csv':  () => import('./parsers/text.js'),
  '.html': () => import('./parsers/html.js'),
  '.htm':  () => import('./parsers/html.js'),
  '.pdf':  () => import('./parsers/pdf.js'),
  '.docx': () => import('./parsers/office.js'),
  '.pptx': () => import('./parsers/office.js'),
  '.xlsx': () => import('./parsers/office.js'),
};
```

各 parser 统一输出纯文本，解析器与依赖映射如下：

| 格式 | parser | 依赖 | 说明 |
|---|---|---|---|
| .txt/.md/.json/.csv | text.js | 无 | `readFileSync(path, 'utf-8')` |
| .html/.htm | html.js | cheerio | 或正则去 `<script>/<style>` 后提取 text |
| .pdf | pdf.js | pdf-parse | 轻量；若解析质量不佳可切换 officeparser（内置 pdfjs-dist 6） |
| .docx | office.js | mammoth | |
| .pptx / .odt 等 | office.js | officeparser | |
| .xlsx | office.js | **复用 agent 核心依赖 `xlsx`** | 零新增：`XLSX.readFile` + `sheet_to_json` 逐表转文本 |

> officeparser 8 还覆盖 .rtf/.odt/.odp/.ods 等格式，按需启用；注意其 `engines: node>=22.13.0`（与 3.2 的 Node 要求一致）。

#### 分块策略

```js
// agent/src/rag/document/chunker.js
export function chunkText(text, options = {}) {
  // 默认 400 字符 / 80 重叠，为中文保留安全边界：
  // bge-small-zh-v1.5 最大输入 512 token，中文约 1 字 ≈ 1 token，
  // [CLS]/[SEP] 再占 2 token。chunkSize=800 会被静默截断（内容丢失且无报错）
  const { chunkSize = 400, overlap = 80, separator = '\n\n' } = options;
  // 先按段落切，再合并到接近 chunkSize
  // 单段超长时强制按字符切；硬上限 500 字符（超出时告警）
  // 用户自定义 chunkSize 超过模型上限时必须告警或自动钳制（英文约 4 字符/token，可放宽）
  // 返回 chunks[]：{ text, startPos, endPos }（区间为原文偏移，为 BM25 混合检索预留）
}
```

### 5.7 检索流程

```
用户提问 / LLM 调用 knowledge_search 工具
        │
        ▼
  EmbeddingProvider.embedQuery(query)  ← 自动附加 BGE 查询前缀，与导入侧同一模型
        │
        ▼
  VectraStore.search(queryVector, queryText, { topK, filter })
        │
        ▼
  结果归一化：{ content, metadata, score }（score 为余弦相似度，不截断）
        │
        ▼
  阈值过滤（默认 0.3，可调）+ 旁路探测
        │
        ▼
  返回 SearchResult[]
        │
        ├─ 工具调用路径：返回给 LLM 作为上下文
        └─ UI 展示路径：渲染为引用卡片
```

#### 检索器实现

```js
// agent/src/rag/searcher.js
export class Searcher {
  constructor(store, embeddingProvider, config = {}) {
    this.store = store;
    this.embedding = embeddingProvider;
    this.threshold = config.threshold ?? 0.3;
    this.topK = config.topK ?? 5;
  }

  async search(query, options = {}) {
    const topK = options.topK || this.topK;
    const threshold = options.threshold ?? this.threshold;

    const queryVec = await this.embedding.embedQuery(query);   // 带查询前缀
    let results = await this.store.search(queryVec, query, { topK: topK * 2 });
    // score 为原始余弦相似度（[-1, 1]，不截断）；归一化模型下低于正阈值即无关，
    // 负分表示方向相反会被自然过滤，无需 clamp 到 0
    results = results.filter(r => r.score >= threshold);

    // 旁路探测：过滤后为空时放宽阈值，区分"无数据"与"被过滤"
    if (results.length === 0) {
      const fallback = await this.store.search(queryVec, query, { topK: 3 });
      results = fallback.filter(r => r.score >= threshold - 0.2);
    }

    return {
      query,
      total: results.length,
      hasContext: results.length > 0,
      results: results.slice(0, topK),
    };
  }
}
```

### 5.8 VectraStore 适配器

```js
// agent/src/rag/store/vectra.js
// 对照 vectra@0.15.0 LocalIndex 真实 API：位置参数签名、无批量 upsert、无按元数据删除
import { LocalIndex } from 'vectra';
import { join } from 'path';
import { homedir } from 'os';

const RAG_ROOT = join(homedir(), '.ai-helper-agent', 'rag');

export class VectraStore {
  constructor(collectionId) {
    this.folderPath = join(RAG_ROOT, collectionId);
    this.index = new LocalIndex(this.folderPath);
  }

  async ensureCreated() {
    // createIndex 对已存在索引会抛错（除非 deleteIfExists: true），必须先判断
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex({ version: 1, deleteIfExists: false });
    }
  }

  async upsertChunks(documentId, chunks, embeddings, metadata) {
    // 无批量 upsert API：用 beginUpdate/endUpdate 事务包裹逐条 upsertItem，
    // 避免每条一次落盘；失败时 cancelUpdate 丢弃半成品，防止部分写入
    await this.index.beginUpdate();
    try {
      for (let i = 0; i < chunks.length; i++) {
        await this.index.upsertItem({
          id: `${documentId}_chunk_${i}`,
          vector: embeddings[i],
          metadata: {
            documentId,
            chunkIndex: i,
            totalChunks: chunks.length,
            text: chunks[i].text,
            startPos: chunks[i].startPos,   // 为 BM25 混合检索预留（见下方约束说明）
            endPos: chunks[i].endPos,
            ...metadata,
          },
        });
      }
      await this.index.endUpdate();
    } catch (err) {
      this.index.cancelUpdate();
      throw err;
    }
  }

  async search(queryVector, queryText, { topK = 5, filter, isBm25 = false } = {}) {
    // v0.15 真实签名（位置参数）：queryItems(vector, query, topK, filter?, isBm25?)
    const results = await this.index.queryItems(queryVector, queryText, topK, filter, isBm25);
    // 统一返回结构 + 空值兜底；score 为归一化余弦相似度（[-1,1]），不做截断
    return (results || []).map(r => ({
      id: r.item?.id,
      content: r.item?.metadata?.text || '',
      metadata: r.item?.metadata || {},
      score: r.score ?? 0,
    }));
  }

  async deleteDocument(documentId) {
    // 无 deleteItemsByMetadataFilter：先按元数据查询，再批量删除（O(N) 单次遍历）
    const items = await this.index.listItemsByMetadata({ documentId });
    await this.index.deleteItems(items.map(i => i.id));
  }

  async stats() {
    const items = await this.index.listItems();
    const docIds = new Set(items.map(i => i.metadata?.documentId).filter(Boolean));
    return { totalChunks: items.length, totalDocuments: docIds.size };
  }
}
```

> **实现要点（已对照 vectra@0.15.0 源码验证）**：
> - `queryItems` 为位置参数签名 `queryItems(vector, query, topK, filter?, isBm25?)`；`query` 字符串仅在 `isBm25=true` 时使用，向量检索路径传空串也可
> - `upsertItem` 在无事务时逐条自动 begin/end（每条一次落盘），批量导入必须用 `beginUpdate()/endUpdate()` 事务包裹，否则性能极差
> - 无 `deleteItemsByMetadataFilter` API：按元数据删除需 `listItemsByMetadata` + `deleteItems(ids)` 两步
> - `createIndex()` 对已存在索引会抛错，因此 `ensureCreated()` 先判 `isIndexCreated()`
> - `score` 为归一化余弦相似度（item 存储了 `norm`），范围 [-1, 1]，直接作为相关性分数使用，不做 clamp

> **BM25 混合检索的硬性约束（数据布局先定，功能后做）**：Vectra 0.15 的 `isBm25=true` 要求每个 item 的 metadata 含 `documentId/startPos/endPos`，且 index 需提供 `docReader(docId)` 能读取原始文档全文——即**原始文档必须落盘一份，chunk 记录在文档中的字符区间**。这与 5.2 计划的"documents/ 原始文档备份"一致：`upsertChunks` 同时写入 `text`（向量路径用）与 `startPos/endPos`（BM25 路径用），即可避免日后重构索引。另需注意其 BM25 分词器为 `wink-eng-lite-web-model`（英文模型），**中文分词效果有限**，中文混合检索需验证，必要时自建（见 Phase 3）。

> **混合检索最终实现（实测后定案，未采用 isBm25，改为自建关键词通道）**：实测 Vectra 内置 BM25 在本项目场景不可用——① 分词器为 wink 英文模型，中英混排文本仅提取英文词（实测 `"…Redis 集群 + RocketMQ…"` → `["spring","cloud","netti","redi","rocketmq"]`，中文 token 全丢）；② BM25 原始分与余弦分数（[-1,1]）尺度不兼容，且结果 append 在向量结果之后，会被 Searcher 的 top-K 截断丢弃；③ 仅对"非向量 top 结果"建索引且在**每次查询**重建全量 BM25 文档。故自建轻量关键词通道（`searcher.js`）：`extractKeywords` 查询切段（以非字母数字汉字为界，≥ 2 字符，小写去重）→ 全量 chunk 子串命中检测（中英文通用）→ 命中者按 `min(0.99, max(向量分, 0.5) + 0.1 × min(命中词数, 3))` 重排，并将未入选向量候选的命中 chunk 一并纳入；高频词按 `df > max(2, 总数 × 50%)` 剔除（保留低频豁免，避免小库误伤），扫描上限 2 万 chunk。实测：查询 "RocketMQ" 相关 chunk 修复前排名 23/92、修复后 top1-3（本地小模型对短英文专有名词的语义区分度不足是根因）。

## 六、模式二：外接 RAG 服务

### 6.1 子模式 A：MCP 模式（零开发）

项目已完整支持 MCP，外接 RAG 最简单的方式是配置一个 RAG MCP 服务器。

可用生态：
- **Qdrant MCP Server**：暴露向量检索工具
- **Dify**：可通过 MCP 暴露知识库检索
- **karaage0703/mcp-rag-server**：基于 pgvector 的 RAG MCP
- **Azure Foundry Local**：`search_vector` / `search_text` / `search_hybrid`

典型 MCP RAG 工具命名：
- `search_vector(query, collection, top_k)` — 纯向量检索
- `search_text(query, collection, top_k)` — 全文检索（BM25）
- `search_hybrid(query, collection, top_k)` — 混合检索
- `get_available_collections()` — 列出可用知识库

用户在"工具箱 → MCP 服务器"界面添加 RAG MCP 服务器即可，检索工具自动出现在工具列表中。

### 6.2 子模式 B：标准适配器模式

为不熟悉 MCP 的用户提供更友好的配置界面，内置主流后端适配器。

#### 统一适配器接口

```js
// agent/src/rag/adapters/base.js
class RAGAdapter {
  async listCollections() {}
  async createCollection(name, config) {}
  async deleteCollection(id) {}
  async ingestDocuments(collectionId, docs) {}
  async search(collectionId, query, { topK, filter }) {}
}
```

#### 首批适配器

| 适配器 | 类型 | 关键 API | 适用场景 |
|---|---|---|---|
| Qdrant | 向量数据库 | `PUT /collections/{name}/points`、`POST /collections/{name}/points/query` | 自托管、开源、性能好 |
| Pinecone | 向量数据库 | `POST /vectors/upsert`、`POST /query` | 云端托管、免运维 |
| Chroma | 向量数据库 | `POST /api/v1/collections/{id}/add`、`/query` | 本地轻量、Python 生态 |
| pgvector | 数据库扩展 | SQL `INSERT` + `ORDER BY embedding <=> $1` | 已有 Postgres 的用户 |
| Dify | RAG 服务 | `POST /v1/datasets/{id}/retrieve` | 一站式 RAG 平台 |
| FastGPT | RAG 服务 | `/api/v1/dataset/{id}/search` | 国内常用 RAG 平台 |

每个适配器约 100-200 行代码，把统一接口翻译成后端原生 API。

#### 配置示例（Qdrant）

```json
{
  "type": "qdrant",
  "url": "http://localhost:6333",
  "apiKey": "xxx",
  "collection": "my_knowledge",
  "embeddingModel": "Xenova/bge-small-zh-v1.5"
}
```

## 七、HTTP API 设计

挂载到现有 `agent/src/server.js`，复用 Bearer 认证：

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/rag/collections` | 列出所有知识库 |
| `POST` | `/api/rag/collections` | 创建知识库 `{ name, description, embeddingConfig }` |
| `PUT` | `/api/rag/collections/{id}` | 更新知识库名称/描述 `{ name, description }` |
| `DELETE` | `/api/rag/collections/{id}` | 删除知识库 |
| `GET` | `/api/rag/collections/{id}/stats` | 文档数/分块数统计 |
| `POST` | `/api/rag/collections/{id}/ingest` | 导入文档 `{ type, content/path/url, metadata }` |
| `GET` | `/api/rag/collections/{id}/ingest/status` | 导入进度快照（供导入弹窗轮询） |
| `GET` | `/api/rag/collections/{id}/documents` | 文档列表 |
| `DELETE` | `/api/rag/collections/{id}/documents/{docId}` | 删除文档 |
| `POST` | `/api/rag/collections/{id}/search` | 检索 `{ query, topK, threshold }` |
| `POST` | `/api/rag/search` | 跨知识库检索 `{ collectionIds, query, topK, threshold }` |
| `GET` | `/api/rag/status` | embedding 模型加载状态 |
| `POST` | `/api/rag/install` | 安装 RAG 可选依赖（固定白名单、强制 Bearer 认证、异步返回 `started`） |
| `GET` | `/api/rag/install/status` | 安装进度轮询 `{ running, done, success, phase, logTail }` |
| `POST` | `/api/rag/detect` | 重新检测 RAG 依赖可用性 |

## 八、工具层集成

### 8.1 工具定义

`src/background/tools/rag-tools.js`：

```js
export const RAG_TOOLS = [
  {
    id: 'knowledge_search',
    category: 'knowledge',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'knowledge_search',
      description: 'Search knowledge bases for relevant information. Use when you need factual grounding or the user asks about specific topics.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          collectionId: { type: 'string', description: 'Knowledge base ID; omit to search all' },
          topK: { type: 'integer', default: 5 },
        },
        required: ['query'],
      },
    },
  },
  {
    id: 'knowledge_ingest',
    category: 'knowledge',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'knowledge_ingest',
      description: 'Ingest a document or text into a knowledge base for future retrieval',
      parameters: {
        type: 'object',
        properties: {
          collectionId: { type: 'string' },
          type: { type: 'string', enum: ['text', 'file', 'url'] },
          content: { type: 'string' },
          metadata: { type: 'object' },
        },
        required: ['collectionId', 'type', 'content'],
      },
    },
  },
  {
    id: 'knowledge_list',
    category: 'knowledge',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'knowledge_list',
      description: 'List available knowledge bases and their document counts',
    },
  },
];
```

### 8.2 执行链路

工具调用 → `tool-executor.js` → `AgentClient.callRagApi()` → `agent/src/rag/routes.js`

与 `agent_file`、`agent_search` 走相同链路。

### 8.3 工具注册时的门控

```js
// src/background/tool-executor.js
// RAG 工具仅在 ragEnabled=true && agentRagAvailable=true 时注册
async getAvailableTools() {
  const tools = [...baseTools];

  // RAG 门控
  const { ragEnabled } = await chrome.storage.local.get('ragEnabled');
  const agentRagAvailable = this.agentCapabilities?.ragAvailable === true;
  if (ragEnabled && agentRagAvailable) {
    tools.push(...RAG_TOOLS);
  }

  // ... MCP 工具等
  return tools;
}
```

### 8.4 sendMessage 中的知识库引用处理

在 `chat-manager.js` 的 `sendMessage()` 中，如果消息携带 `knowledgeRefs`：
- 先调用 `/api/rag/collections/{id}/search` 检索
- 将结果拼接到用户消息前（作为上下文引用）
- 或标记给 LLM，让它决定是否调用 `knowledge_search` 工具

## 九、UI 设计

### 9.1 知识库管理面板（options.html 新增标签页）

```
┌─────────────────────────────────────────────────────────┐
│  知识库 (3)                                        [+ 新建] │
├─────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ 📚 产品文档集  │  │ 📚 技术规范   │  │ 📚 FAQ 库    │   │
│  │ 12 文档 · 340 块│  │ 5 文档 · 88 块│  │ 23 文档 · 156块│   │
│  │ bge-small-zh │  │ bge-small-zh │  │ text-embed-3 │   │
│  │               │  │              │  │              │   │
│  │ [导入] [检索测试] [删除]          │                  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 9.2 导入文档弹窗

```
┌──────────────────────────────────────┐
│  导入文档到「产品文档集」              │
├──────────────────────────────────────┤
│  [拖拽文件到此处 或 点击选择]          │
│  支持: txt, md, pdf, docx, html, ... │
│                                      │
│  或粘贴文本:                          │
│  ┌──────────────────────────────┐    │
│  │                              │    │
│  └──────────────────────────────┘    │
│                                      │
│  或输入 URL:                          │
│  ┌──────────────────────────────┐    │
│  │ https://...                   │    │
│  └──────────────────────────────┘    │
│                                      │
│  分块设置:                            │
│  块大小: [400] 字符  重叠: [80] 字符  │
│                                      │
│       [取消]  [开始导入]              │
└──────────────────────────────────────┘
```

导入进度：`解析中 → 分块中(42块) → 向量化中(12/42) → 存储中 → 完成`

### 9.3 检索测试面板

```
┌──────────────────────────────────────────┐
│  检索测试                                 │
│  查询: [如何导出数据?        ] [检索]      │
├──────────────────────────────────────────┤
│  命中 3 条 (阈值 0.3)                      │
│  ┌────────────────────────────────────┐  │
│  │ 1. score: 0.89                     │  │
│  │    第三章 数据导出功能...            │  │
│  │    [展开全部]                        │  │
│  └────────────────────────────────────┘  │
│  ┌────────────────────────────────────┐  │
│  │ 2. score: 0.76                     │  │
│  │    FAQ: 导出格式说明...             │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

### 9.4 输入框 @知识库 选择器

复用现有 `@` 选择器机制，新增 `knowledge-at-selector.js`：

用户输入 `@` → 弹出下拉 → 列出知识库（带文档数）→ 选中后插入标签

```
输入框: 帮我查一下 [📚 产品文档集 ×] 的导出功能怎么用 [发送]
```

### 9.5 对话中的引用卡片

```
用户: 帮我查一下产品文档集的导出功能怎么用

🤖 正在检索知识库「产品文档集」...

┌─────────────────────────────────────────┐
│ 📚 产品文档集 · 命中 3 条                  │
│ ┌─────────────────────────────────────┐ │
│ │ ▼ 0.89 第三章 数据导出功能            │ │
│ │   导出支持 CSV、Excel、PDF 三种格式，   │ │
│ │   在设置 → 数据管理 中操作...          │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ ▶ 0.76 FAQ: 导出失败怎么办             │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘

🤖 根据知识库内容，导出功能支持 CSV、Excel、PDF 三种格式...
```

### 9.6 三种触发方式

| 方式 | 说明 | 适用场景 |
|---|---|---|
| `@知识库` 显式引用 | 用户主动引用，最可控 | 推荐，默认 |
| LLM 主动调用工具 | LLM 自行决定是否检索 | 自动模式 |
| 全局自动检索 | 每条消息发送前自动检索 | 知识库问答专属场景 |

## 十、关键设计决策

| 决策 | 做法 | 理由 |
|---|---|---|
| **依赖管理** | optionalDependencies + 运行时检测 | 不影响核心功能安装；用户按需安装 RAG 依赖 |
| **Node 版本要求** | RAG 需 Node 22+（Vectra/officeparser 硬性要求），核心 agent 维持 `>=18` | 检测前置、明确提示；不影响未启用 RAG 的用户 |
| **总开关** | `ragEnabled` 存储在 `chrome.storage.local` | 复用 MCP 总开关模式，默认关闭 |
| **能力检测** | Agent 启动时检测（Node 版本 + 依赖），`/api/status` 返回 `ragAvailable` | 复用 `fd`/`rg` 检测模式，前端据此控制功能入口 |
| **安装接口安全** | 固定包白名单 + 强制 Bearer 认证 + `shell: false` + 安装锁 | 防止任意包注入与本机进程触发安装 |
| 内置 vs 外接优先 | 先做内置 | 零外部依赖、开箱即用；外接通过 MCP 已可零开发支持 |
| 默认 Embedding 模型 | `Xenova/bge-small-zh-v1.5`（本地）+ 查询前缀 | 中文优化、512 维、95MB、无需 API key；非对称检索必须加前缀 |
| 向量库 | Vectra 0.15 | 文件持久化、Node/浏览器双端；无批量 upsert（需事务包裹）、无按元数据删除（需先查后删） |
| 分块默认参数 | 400 字符 / 80 重叠 | 中文 512 token 上限内的安全边界，避免静默截断 |
| Embedding 模式 | 应用侧生成，Vectra 只存检索 | 链路一致，避免混用导致向量空间不一致 |
| 外接适配器首批 | Qdrant + Dify | Qdrant 开源自托管最通用；Dify 国内用户多 |
| 触发方式默认 | `@知识库` 显式引用 | 最可控、不污染上下文、用户意图明确 |
| 存储位置 | `~/.ai-helper-agent/rag/` | 与现有 agent 配置同目录，便于备份迁移 |
| 存储格式 | JSON（默认） | 人类可读；大数据量可选 Protobuf codec（小 40-50%） |
| **Intel Mac 兼容** | `overrides` 固定 `onnxruntime-node ~1.23.0` | transformers v4 依赖的 onnxruntime-node ≥1.24 无 darwin/x64 二进制；1.23.x 为最后支持 Intel Mac 的版本（实测推理正常） |
| **模型下载与缓存** | 默认 hf-mirror 镜像（可配置）+ `env.cacheDir` 指向用户目录 | huggingface.co 国内直连超时；默认缓存在 node_modules 内，npm 重装即丢（均实测确认） |
| 阈值策略 | 默认 0.3 + 旁路探测；score 保留原始余弦相似度不截断 | 区分"无数据"与"被过滤"；避免截断后语义失真 |
| 回答约束 | hasContext=false 时拒答 | 避免 LLM 超出知识库泛化 |

## 十一、经验教训（来自同类实现）

| 问题 | 应对 |
|---|---|
| embedding 配置读错导致静默降级到简单向量化 | 配置只从一个出口读，构造函数显式记录 mode 并打日志 |
| BGE 查询侧漏加前缀导致检索召回下降 | `embedQuery`/`embedDocuments` 分离，前缀随库配置持久化（改前缀无需重索引） |
| Node 版本不足导致 RAG 依赖安装/加载失败 | `detect.js` 在动态 import 前检查 Node 22+，明确提示升级 |
| 依赖 Vectra 推测 API 导致实现返工 | 适配器对照 v0.15.0 源码/类型定义编写（位置参数、无批量 upsert、无按元数据删除均已核实） |
| 中文分块超模型上限被静默截断 | 默认 400 字符分块 + 硬上限告警（中文 1 字 ≈ 1 token） |
| 检索为 0 无法区分"无数据"vs"被过滤" | 阈值旁路探测（放宽 0.2 返回最多 3 条） |
| PDF/DOCX 当文本读导致乱码 | 按扩展名路由到专用 parser，统一输出纯文本再 chunk |
| 临时文件用硬编码 `/tmp` 在 Windows 不可用 | 用 `os.tmpdir()` 或内存处理 |
| 检索结果类型不统一 | 统一 `{ content, metadata, score }` + 空值兜底 + 保留原始 score（[-1,1]）不截断 |
| 安装接口接受任意包名/本机免认证触发 | 固定白名单 + 强制 Bearer 认证 + `shell: false` + 安装锁 |
| onnxruntime-node ≥1.24 无 darwin/x64 导致 Intel Mac 加载 transformers 失败 | package.json `overrides` 固定 `~1.23.0`（实测 transformers 4.3.0 + onnxruntime-node 1.23.2 推理正常） |
| huggingface.co 直连超时 + 默认模型缓存在 node_modules 内重装即丢 | 镜像 `env.remoteHost = 'https://hf-mirror.com/'`（可配置）+ `env.cacheDir` 指向用户目录 |
| 中文混合检索分词不可用 | Vectra 内置 BM25 分词器为英文模型（实测中文 token 全丢），已自建轻量关键词通道（`searcher.js` 子串命中 + 加分重排），不再依赖 Vectra isBm25 |
| 本地小模型对短英文专有名词（如 RocketMQ）区分度不足，相关 chunk 被无关内容挤占 top-K | 关键词命中增强（混合检索）：精确子串命中抬分并纳入结果，长中文问句天然不受影响（整段不会命中） |
| 检索未命中时 LLM 乱编 | hasContext=false 时提示"知识库未包含该问题答案"，不泛化 |
| 链路不可观测 | stats 接口返回文档数/分块数；检索返回 hasContext 字段 |

## 十二、实施路线

### Phase 0：可选依赖 + 能力检测 + 总开关（优先）

1. `agent/package.json` 加 `optionalDependencies`（transformers v4、含 officeparser；核心 `engines` 维持 `>=18`，RAG 运行时要求 Node 22+）+ `overrides` 固定 `onnxruntime-node ~1.23.0`（Intel Mac 兼容，见 3.2）
2. `agent/src/rag/detect.js`：运行时能力检测（Node 22+ 版本检查 + 仿 `search.js` 的 `fd`/`rg` 模式）
3. `agent/src/server.js`：启动时检测，`/api/status` 增加 `ragAvailable` 字段
4. `agent/src/server.js`：RAG 路由按需加载（`dynamic import`），未安装时返回 503
5. 前端：`ragEnabled` 总开关（位于「知识库」标签页面板头部，复用 MCP 总开关模式）
6. 前端：能力探测 + 功能入口显示条件
7. 前端：依赖安装引导弹窗 + 一键安装接口（固定白名单 + 强制认证 + 异步安装/状态轮询）
8. 配置导入导出白名单加 `ragEnabled`

### Phase 1：内置轻量 RAG MVP（1-2 周）

1. **前置验证**：Vectra 内置 loader / embedder / BM25 能力覆盖矩阵，确定复用与自建边界（见 5.6）
2. `agent/src/rag/` 模块：embedding（含 `embedQuery` 查询前缀）+ store（事务批量写入）+ document + searcher + manager + routes
3. background 工具：`rag-tools.js` + `AgentClient` 封装（工具注册带门控）
4. UI：知识库管理面板 + 导入弹窗 + 检索测试
5. @选择器 + 引用卡片：输入框触发 + 对话展示

### Phase 2：外接适配器（2 周）

1. `RAGAdapter` 抽象接口
2. Qdrant 适配器（开源、自托管，首选）
3. Pinecone 适配器（云端托管）
4. Dify 适配器（一站式 RAG）
5. 配置 UI（统一的适配器配置表单）

### Phase 3：MCP 模式增强 + 高级功能（1-2 周）

1. MCP RAG 工具自动识别（检测到 `search_vector` 等工具时标注为 RAG 工具）
2. 混合检索（向量 + 关键词命中）：**已实现**（`searcher.js` 自建关键词通道；实测 Vectra 内置 `isBm25` 的中文分词、分数尺度、索引重建与文档布局均不满足，详见 5.8 节说明）
3. 文档增量更新（只重索引变更部分）
4. 检索质量评估（recall@k 测试）

## 十三、风险与应对

| 风险 | 应对 |
|---|---|
| **运行环境 Node < 22** | RAG 依赖链硬性要求 Node 22+；`detect.js` 前置检测并明确提示升级；核心 agent 功能不受影响 |
| **RAG 依赖包下载失败/下载慢** | optionalDependencies 不影响核心安装；提供一键安装接口和手动命令；支持代理/镜像源；依赖含 onnxruntime 原生库（200-300MB），引导弹窗如实告知体积 |
| transformers.js 模型首次下载较慢（95MB） | 显示下载进度条；支持用户配置 OpenAI embedding 端点跳过本地模型 |
| 大文档索引耗时 | 异步索引 + 进度回调 + 后台处理，不阻塞 UI |
| 外接适配器 API 碎片化 | 统一 `RAGAdapter` 接口，每个适配器独立文件 |
| 检索质量不佳 | 提供 top-K、相似度阈值可调；确保 BGE 查询前缀生效；支持混合检索；支持用户测试检索效果 |
| 隐私（本地 embedding vs 云端） | 内置模式数据完全本地；外接模式明确标注数据发送到对应服务 |
| 数据量超 Vectra 承载能力 | 10 万分块为分水岭，超过后引导用户迁移外接方案 |
| 中途换 embedding 模型 | 检测模型变更，提示重新索引（清空重导）；改查询前缀无需重新索引 |
| **安装接口被滥用（任意包安装/本机触发）** | 固定包白名单、强制 Bearer 认证、`shell: false`、异步安装 + 安装锁 |
| **用户启用 RAG 但代理端未安装依赖** | 前端检测 `ragAvailable=false` 时在知识库面板门控区就地显示安装引导，禁用功能入口 |
| **Intel Mac（darwin-x64）无 onnxruntime 原生二进制** | `overrides` 固定 onnxruntime-node `~1.23.0`（实测推理正常）；全局安装场景 overrides 不生效，需安装脚本/文档指引 |
| **模型下载端点不可达（huggingface.co 国内直连超时）** | 默认走 hf-mirror 镜像且开放配置；缓存目录独立于 node_modules（`env.cacheDir`） |
