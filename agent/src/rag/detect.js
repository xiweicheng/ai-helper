// agent/src/rag/detect.js - RAG 可选依赖运行时检测（仿 search.js 的 fd/rg 检测模式）
// RAG 是高级功能：不强制安装、不强制启用；依赖缺失或 Node 版本不满足时整体返回不可用（不做降级）
import { t as translate } from '../i18n.js';

// 默认使用 en（独立调用场景）；server.js 调用时会传入请求语言
let currentLang = 'en';

/**
 * 设置 RAG 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setRagLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 翻译辅助：使用当前模块语言
 * @param {string} key - 翻译 key
 * @param {object} [params] - 插值参数
 * @returns {string}
 */
function tr(key, params) {
  return translate(currentLang, key, params);
}

// 缓存检测结果（null = 未检测；true / false = 检测结果）
let _ragAvailable = null;

/**
 * 检测 Node 版本是否满足 RAG 前置要求（Node 22+）
 * Vectra 0.15 声明 engines: node>=22，officeparser 8 要求 >=22.13.0
 * @returns {boolean}
 */
export function isNodeVersionSupported() {
  return Number(process.versions.node.split('.')[0]) >= 22;
}

/**
 * 检测 RAG 依赖是否可用（结果缓存，避免重复检测）
 * @returns {Promise<boolean>}
 */
export async function detectRagAvailable() {
  if (_ragAvailable !== null) return _ragAvailable;

  // 前置检查：必须放在动态 import 之前，
  // 否则低版本 Node 在 import vectra 时会抛引擎/语法层错误，提示不友好
  if (!isNodeVersionSupported()) {
    _ragAvailable = false;
    console.log(`[RAG] ${tr('rag.nodeVersionLow', { version: process.version })}`);
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
    console.log(`[RAG] ${tr('rag.depsMissing')}`);
  } else {
    console.log(`[RAG] ${tr('rag.depsReady')}`);
  }

  return _ragAvailable;
}

/**
 * 同步获取缓存的检测结果（完整检测在启动时异步完成）
 * @returns {boolean}
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
