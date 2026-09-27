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
  }

  /**
   * 批量生成向量
   * @param {string[]} texts - 文本数组
   * @returns {Promise<number[][]>}
   */
  async embed(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const res = await fetch(`${this.endpoint}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.modelName, input: texts }),
    });

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
