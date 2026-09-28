// agent/src/rag/errors.js - RAG 业务错误（错误码 + 参数）
// 约定：manager/loader 等纯逻辑模块抛 RagError（语言无关），
// routes.js 在响应层用 t(`rag.err_${code}`) 翻译为当前请求语言。

export class RagError extends Error {
  /**
   * @param {string} code - 错误码（对应 locale 键 rag.err_{code}）
   * @param {object} [params] - 翻译插值参数
   */
  constructor(code, params = {}) {
    super(`RAG error: ${code}`);
    this.name = 'RagError';
    this.code = code;
    this.params = params;
  }
}

/**
 * 将任意错误转为可翻译的响应文本
 * @param {Error} err
 * @param {Function} t - 请求级翻译函数
 * @returns {{error: string, code: string|null}}
 */
export function translateRagError(err, t) {
  if (err instanceof RagError) {
    return { error: t(`rag.err_${err.code}`, err.params), code: err.code };
  }
  return { error: err.message, code: null };
}
