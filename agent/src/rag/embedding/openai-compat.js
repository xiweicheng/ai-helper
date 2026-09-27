// agent/src/rag/embedding/openai-compat.js - OpenAI 兼容端点 embedding（可选模式）
// 约定：endpoint 为 Base URL 且须包含版本段（如 /v1），代码只拼接 /embeddings，
// 避免出现 /v1/v1/embeddings 双重版本段（见设计文档 5.3）
// 注意：OpenAI 系模型为对称检索模型，queryPrefix 须置空

/**
 * OpenAI 兼容 embedding 后端（text-embedding-3-small 等）
 */
export class OpenAICompatEmbedding {
  /**
   * @param {object} config - embedding 配置
   * @param {string} config.endpoint - Base URL（含版本段）
   * @param {string} config.apiKey - API Key
   * @param {string} config.modelName - 模型名
   */
  constructor(config = {}) {
    this.endpoint = (config.endpoint || '').replace(/\/+$/, '');
    this.apiKey = config.apiKey || '';
    this.modelName = config.modelName || 'text-embedding-3-small';
    // >0 时向服务端透传 dimensions（支持降维的模型按指定维度返回）；
    // 0/未指定 → 不带该参数，使用平台默认维度（兼容不支持 dimensions 的固定维度模型）
    this.dimensions = Number(config.dimensions) > 0 ? Number(config.dimensions) : 0;
  }

  /**
   * 批量生成向量
   * @param {string[]} texts - 文本数组
   * @returns {Promise<number[][]>}
   */
  async embed(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const send = (includeDimensions) => fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelName,
        input: texts,
        ...(includeDimensions && this.dimensions > 0 ? { dimensions: this.dimensions } : {}),
      }),
    });

    let res = await send(true);
    // 兼容不支持 dimensions 参数的固定维度模型（如硅基流动 BAAI/bge-m3 返回 400 参数无效）：
    // 自动降级重试一次不带该参数（使用平台默认维度，实际维度由调用方校验/探测）
    if (!res.ok && res.status === 400 && this.dimensions > 0) {
      res = await send(false);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`embedding endpoint ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    // 按 index 排序（部分服务返回顺序不稳定）
    const rows = (data.data || []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    return rows.map(d => d.embedding);
  }
}
