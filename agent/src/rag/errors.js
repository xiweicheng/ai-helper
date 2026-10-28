// agent/src/rag/errors.js - RAG 业务错误（错误码 + 参数）
// 约定：manager/loader/embedding 等纯逻辑模块抛 RagError（语言无关），
// routes.js 在响应层用 t(`rag.err_${code}`) 翻译为当前请求语言。

export class RagError extends Error {
  /**
   * @param {string} code - 错误码（对应 locale 键 rag.err_{code}）
   * @param {object} [params] - 翻译插值参数
   */
  constructor(code, params = {}) {
    // 附带底层原因：RagError 的 message 只用于日志（响应文案走 locale），
    // 丢掉了底层 message 就等于丢掉了唯一的排障线索
    const detail = params && typeof params.message === 'string' && params.message ? ` - ${params.message}` : '';
    super(`RAG error: ${code}${detail}`);
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

// onnxruntime 原生库「同进程两份 dll」冲突的特征串（Windows 实测，2026-10）：
//   - "The operating system cannot run %1." → Win32 193 / ERROR_BAD_EXE_FORMAT
//   - "API version [24] is not available"   → binding 要求 vs 已加载 dll 的 ORT_API_VERSION 不一致
//   - 直接点出 onnxruntime_binding.node 的加载失败
// 三种都是同一根因的不同表现，统一归到 rag.err_ortConflict。
const ORT_CONFLICT_PATTERNS = [
  /cannot run %1/i,
  /ERROR_BAD_EXE_FORMAT/i,
  /API version \[\d+\]/i,
  /onnxruntime_binding\.node/i,
];

/**
 * 是否属于 onnxruntime 原生库冲突（同进程加载了两份不同版本的 onnxruntime）
 * @param {Error|string|null|undefined} err
 * @returns {boolean}
 */
export function isOnnxRuntimeConflict(err) {
  if (!err) return false;
  const text = `${err.code ? `${err.code} ` : ''}${err.message ?? err}`;
  return ORT_CONFLICT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 把本地 embedding 子进程的错误转成可翻译的 RagError
 * @param {Error|string} err
 * @returns {RagError}
 */
export function toEmbeddingError(err) {
  if (err instanceof RagError) return err;
  if (isOnnxRuntimeConflict(err)) return new RagError('ortConflict');
  const message = err && err.message ? String(err.message) : String(err);
  return new RagError('embedWorkerFailed', { message });
}
