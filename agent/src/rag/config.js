// agent/src/rag/config.js - RAG 配置与路径约定
// 存储布局（见设计文档 5.2）：
//   ~/.ai-helper-agent/rag/
//   ├── collections.json      # 知识库元数据注册表
//   ├── kb_xxx/               # 每个知识库一个目录（Vectra 索引 + documents/ 原始文档备份）
//   ├── originals/kb_xxx/     # 导入原件（见设计文档「原件留存」）
//   └── models/               # transformers.js 模型缓存（独立于 node_modules，重装不丢失）
//
// 原件目录刻意与 kb_xxx/ 分离：索引重建是整目录原子换入（rename），
// 原件若放在 kb_xxx/ 内会被换入动作连带替换，且重建时必须拷贝大文件

import { join } from 'path';
import { homedir } from 'os';

// RAG 数据根目录（环境变量 AI_HELPER_RAG_ROOT 可覆盖：测试隔离 / 自定义数据目录）
export const RAG_ROOT = process.env.AI_HELPER_RAG_ROOT || join(homedir(), '.ai-helper-agent', 'rag');

// 知识库注册表文件
export const COLLECTIONS_REGISTRY = join(RAG_ROOT, 'collections.json');

// transformers.js 模型缓存目录
export const MODELS_DIR = join(RAG_ROOT, 'models');

// 原件根目录：RAG_ROOT/originals/<collectionId>/<documentId>.<ext>
export const ORIGINALS_ROOT = join(RAG_ROOT, 'originals');

// 原件留存默认策略（ragOriginals 配置缺省值，agent/src/config.js 同源）
// 超配额不阻断导入：只跳过原件留存并记 originalSkipped
const DEFAULT_ORIGINALS_CONFIG = {
  enabled: true,
  maxBytesPerCollection: 2 * 1024 * 1024 * 1024,
};
export { DEFAULT_ORIGINALS_CONFIG };

// 原文查看接口单次返回的字符上限：全文可能数 MB（URL 抓取 10MB 正文），
// 一次性塞进 JSON 会卡住设置页弹窗；超出截断并提示下载全文
export const DOC_TEXT_VIEW_MAX_CHARS = 200000;

// 知识库目录前缀（避免与 models 等保留目录冲突）
export const COLLECTION_ID_PREFIX = 'kb_';

// 默认 embedding 配置（本地 BGE 中文模型）
export const DEFAULT_EMBEDDING_CONFIG = {
  mode: 'local',
  modelName: 'Xenova/bge-small-zh-v1.5',
  dimensions: 512,
  // BGE 中文系列为"非对称检索"模型：查询侧必须加前缀，文档侧不加（见设计文档 5.3）
  queryPrefix: '为这个句子生成表示以用于检索相关文章：',
  // 模型下载端点：默认走 hf-mirror 镜像（huggingface.co 国内直连超时）
  remoteHost: 'https://hf-mirror.com/',
  // OpenAI 兼容模式字段（mode=openai-compat 时使用）
  endpoint: '',
  apiKey: '',
};

// 默认分块参数（中文 512 token 上限内的安全边界，见设计文档 5.6）
export const DEFAULT_CHUNK_CONFIG = {
  chunkSize: 400,
  overlap: 80,
};

// 分块硬上限：超过此值告警（bge-small-zh-v1.5 最大输入 512 token，中文 1 字 ≈ 1 token）
export const CHUNK_SIZE_WARN_LIMIT = 500;

// 默认检索参数
export const DEFAULT_SEARCH_CONFIG = {
  topK: 5,
  threshold: 0.3,
};

// 单次 embedding 批大小（控制内存与进度回调粒度）
// 固定 10：兼容阿里云百炼等单次批量上限为 10 条的平台（text-embedding-v3/v4）
export const EMBED_BATCH_SIZE = 10;

// 解析器扩展名路由表（见设计文档 5.6）
export const PARSER_ROUTES = {
  '.txt': 'text',
  '.md': 'text',
  '.json': 'text',
  '.csv': 'text',
  '.html': 'html',
  '.htm': 'html',
  '.pdf': 'pdf',
  '.docx': 'office',
  '.pptx': 'office',
  '.xlsx': 'office',
  '.xls': 'office',
};
