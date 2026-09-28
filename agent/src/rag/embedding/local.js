// agent/src/rag/embedding/local.js - 本地 embedding（transformers.js）
// 默认模型 Xenova/bge-small-zh-v1.5（中文优化，512 维，q8 量化约 95MB）
// 关键约束（实测）：
//   1. 模型下载端点须走 hf-mirror 镜像（huggingface.co 国内直连超时）
//   2. 缓存目录指向 ~/.ai-helper-agent/rag/models（默认在 node_modules 内，重装即丢）

import { MODELS_DIR } from '../config.js';

// pipeline 单例（模型加载昂贵，进程内复用；按模型名缓存）
let _pipeline = null;
let _pipelineModel = null;
// 加载锁：并发首次调用时避免重复加载同一模型
let _loadingPromise = null;

/**
 * 本地 embedding 后端（transformers.js feature-extraction pipeline）
 */
export class LocalEmbedding {
  /**
   * @param {object} config - embedding 配置
   * @param {string} config.modelName - 模型名（如 Xenova/bge-small-zh-v1.5）
   * @param {string} [config.remoteHost] - 模型下载端点（默认 hf-mirror）
   */
  constructor(config = {}) {
    this.modelName = config.modelName || 'Xenova/bge-small-zh-v1.5';
    this.remoteHost = config.remoteHost || 'https://hf-mirror.com/';
  }

  /**
   * 批量生成向量
   * @param {string[]} texts - 文本数组
   * @returns {Promise<number[][]>} 每个文本一个向量
   */
  async embed(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const extractor = await this._getPipeline();

    // 单次批量推理：pipeline 支持数组输入，输出为 [batch, seq, dim] 张量
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    // tolist() 转为嵌套数组；v4 中 Tensor 直接可迭代，但 tolist 语义更明确
    return output.tolist();
  }

  /**
   * 获取（或加载）pipeline 单例
   */
  async _getPipeline() {
    if (_pipeline && _pipelineModel === this.modelName) return _pipeline;

    // 加载中：等待现有加载完成（换模型时串行等待后重新加载）
    if (_loadingPromise) {
      await _loadingPromise.catch(() => {});
      if (_pipeline && _pipelineModel === this.modelName) return _pipeline;
    }

    _loadingPromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');

      // 端点与缓存目录必须在模型加载前设置
      env.remoteHost = this.remoteHost;
      env.cacheDir = MODELS_DIR;

      console.log(`[RAG] loading embedding model: ${this.modelName} (cache: ${MODELS_DIR})`);
      const extractor = await pipeline('feature-extraction', this.modelName, {
        dtype: 'q8', // v3+ 用 dtype 指定量化精度（替代已废弃的 quantized: true）
      });
      _pipeline = extractor;
      _pipelineModel = this.modelName;
      console.log(`[RAG] embedding model ready: ${this.modelName}`);
    })();

    try {
      await _loadingPromise;
    } finally {
      _loadingPromise = null;
    }
    return _pipeline;
  }
}
