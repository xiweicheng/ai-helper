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
// 这两类只会由「抢句柄」产生，是强特征。
const ORT_CONFLICT_STRONG = [
  /cannot run %1/i,
  /ERROR_BAD_EXE_FORMAT/i,
  /not a valid Win32 application/i,
  /API version \[\d+\] is not available/i,
];
// 弱特征：只出现 binding 文件名可能是「包没装全 / 装了错架构 / ABI 不符 / 是 Cannot find module」，
// 那些给用户「重启代理」是误诊。必须与「加载失败」类措辞共现才算抢句柄。
const ORT_BINDING_LOAD_FAILURE = /(?:dlopen|LoadLibrary|cannot open shared object|error while loading shared libraries|failed to load|DLL load failed)[\s\S]{0,300}onnxruntime/i;

/**
 * 是否属于 onnxruntime 原生库冲突（同进程加载了两份不同版本的 onnxruntime）
 * @param {Error|string|null|undefined} err
 * @returns {boolean}
 */
export function isOnnxRuntimeConflict(err) {
  if (!err) return false;
  const text = `${err.code ? `${err.code} ` : ''}${err.message ?? err}`;
  return ORT_CONFLICT_STRONG.some((pattern) => pattern.test(text)) || ORT_BINDING_LOAD_FAILURE.test(text);
}

// 底层错误进文案/日志前的截断长度（子进程原始 message 可能带绝对路径与超长堆栈首行）
const DETAIL_MAX = 300;

/**
 * 把底层错误压成一行可展示的细节（去换行 + 截断）
 * @param {Error|string} err
 * @returns {string}
 */
export function errorDetail(err) {
  const text = err && err.message ? String(err.message) : String(err ?? '');
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > DETAIL_MAX ? `${oneLine.slice(0, DETAIL_MAX)}…` : oneLine;
}

/**
 * 把本地 embedding 子进程的错误转成可翻译的 RagError
 * @param {Error|string} err
 * @returns {RagError}
 */
export function toEmbeddingError(err) {
  if (err instanceof RagError) return err;
  const message = errorDetail(err);
  if (isOnnxRuntimeConflict(err)) {
    // 带上底层原因：locale 不插值，只落在 RagError.message 里供日志排障
    // （冲突现场 Win32 193 / API version 最难复现，丢了就再也看不到）
    return new RagError('ortConflict', { message });
  }
  return new RagError('embedWorkerFailed', { message });
}
