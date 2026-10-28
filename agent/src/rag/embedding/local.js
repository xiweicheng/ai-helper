// agent/src/rag/embedding/local.js - 本地 embedding（transformers.js，跑在独立子进程里）
// 默认模型 Xenova/bge-small-zh-v1.5（中文优化，512 维，q8 量化约 95MB）
// 关键约束（实测）：
//   1. 模型下载端点须走 hf-mirror 镜像（huggingface.co 国内直连超时）
//   2. 缓存目录指向 ~/.ai-helper-agent/rag/models（默认在 node_modules 内，重装即丢）
//   3. 推理必须在 embed-worker 子进程里做：主进程一旦 import transformers，就会和语音输入
//      的 sherpa-onnx 抢同一份 onnxruntime.dll（Windows 报 "cannot run %1"），详见
//      embed-worker.mjs 文件头的根因说明。本文件因此不出现任何 transformers 引用。
//
// 对外接口保持不变：embed(texts) / countTokens(texts)，调用方（RAG 检索、长期记忆）无感。

import { getEmbedWorker } from './worker-client.js';
import { toEmbeddingError } from '../errors.js';

/**
 * 本地 embedding 后端（子进程内的 transformers.js feature-extraction pipeline）
 */
export class LocalEmbedding {
  /**
   * @param {object} config - embedding 配置
   * @param {string} config.modelName - 模型名（如 Xenova/bge-small-zh-v1.5）
   * @param {string} [config.remoteHost] - 模型下载端点（默认 hf-mirror）
   * @param {object} [deps] - 仅测试注入：{ worker }
   */
  constructor(config = {}, deps = {}) {
    this.modelName = config.modelName || 'Xenova/bge-small-zh-v1.5';
    this.remoteHost = config.remoteHost || 'https://hf-mirror.com/';
    this.worker = deps.worker || null;
  }

  /**
   * 批量生成向量
   * @param {string[]} texts - 文本数组
   * @returns {Promise<number[][]>} 每个文本一个向量
   */
  async embed(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    try {
      const vectors = await this._getWorker().embed(texts, this._workerParams());
      return Array.isArray(vectors) ? vectors : [];
    } catch (err) {
      throw toEmbeddingError(err);
    }
  }

  /**
   * 统计文本的真实 token 长度与模型上下文窗口（供调用方发现「会被截多」）。
   *
   * 子进程侧必须 truncation: false：feature-extraction pipeline 内部用的是 truncation: true，
   * 实测在 model_max_length（本模型 512）处静默砍尾——跟着它的口径数只会永远数到窗口值，
   * 看不见损失了多少。也不走 embed() 的反推：只给向量，给不出长度。
   * 纯 tokenization 不跑推理，成本远低于嵌入本身。
   * @param {string[]} texts
   * @returns {Promise<{counts: number[], window: number}>} counts 与入参同序
   */
  async countTokens(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return { counts: [], window: 0 };
    try {
      const result = await this._getWorker().countTokens(texts, this._workerParams());
      return {
        counts: Array.isArray(result?.counts) ? result.counts : [],
        window: Number(result?.window) || 0,
      };
    } catch (err) {
      throw toEmbeddingError(err);
    }
  }

  /**
   * 子进程请求参数（模型名与下载端点是每次请求都带的：子进程按模型名缓存 pipeline）
   * @returns {{ modelName: string, remoteHost: string }}
   */
  _workerParams() {
    return { modelName: this.modelName, remoteHost: this.remoteHost };
  }

  /**
   * 取子进程客户端（进程级单例：RAG 与长期记忆共用，模型只加载一份）
   * @returns {import('./worker-client.js').EmbedWorkerClient}
   */
  _getWorker() {
    if (!this.worker) this.worker = getEmbedWorker();
    return this.worker;
  }
}
