// agent/src/auth.js - 配对认证模块
import crypto from 'crypto';
import { loadConfig, loadPairings, savePairing } from './config.js';
import { t as translate } from './i18n.js';

// 默认使用 zh 语言（独立调用场景）；server.js 调用时会传入 req 的 lang
let currentLang = 'zh';

/**
 * 设置 auth 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setAuthLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 翻译辅助：使用当前模块语言或传入的 t 函数
 * @param {string} key - 翻译 key
 * @param {object} [params] - 插值参数
 * @param {Function} [tFn] - 可选的 t 函数（优先使用）
 * @returns {string}
 */
function tr(key, params, tFn) {
  if (typeof tFn === 'function') return tFn(key, params);
  return translate(currentLang, key, params);
}

// 当前有效的配对码（定时刷新 + 一次性使用）
let currentPairCode = null;
let pairCodeTimer = null;

// 最后一次成功认证的时间戳（用于判断是否有活跃连接）
let lastAuthTime = 0;

// 判定"活跃"的时间窗口：此时间内有过认证则认为仍有扩展连接
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // 5 分钟

// 配对码字符表：排除易混淆字符（0/O、1/I/l）；6 位字母数字（≈21亿种，抗暴破）
const PAIR_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAIR_CODE_LEN = 6;

// 配对失败锁定：连续失败 PAIR_FAIL_LIMIT 次后锁定 PAIR_LOCK_DURATION_MS 毫秒
let pairFailCount = 0;
let pairLockUntil = 0;
const PAIR_FAIL_LIMIT = 5;
const PAIR_LOCK_DURATION_MS = 60 * 1000; // 60 秒

/**
 * 生成随机配对码（6位字母数字，使用密码学安全的随机数，排除易混淆字符）
 */
function generatePairCode() {
  const bytes = crypto.randomBytes(PAIR_CODE_LEN);
  let code = '';
  for (let i = 0; i < PAIR_CODE_LEN; i++) {
    code += PAIR_CODE_CHARS[bytes[i] % PAIR_CODE_CHARS.length];
  }
  return code;
}

/**
 * 获取当前配对码
 */
function getCurrentPairCode() {
  return currentPairCode;
}

/**
 * 启动配对码定时刷新（运行中持续重新评估）
 * - 每个 tick 检查：有配对记录且最近有活跃认证（5分钟内）→ 停止刷新配对码
 * - 否则（无配对 / 插件离线超时）→ 刷新配对码，允许新扩展配对
 * - 这样：插件在线时不刷新配对码；插件断开超时后自动恢复刷新
 */
function startPairCodeRotation() {
  const config = loadConfig();
  const ttl = (config.pairCodeTTL || 30) * 1000;

  // Generate a pairing code immediately on startup (for initial pairing; lastAuthTime=0 ensures refresh)
  currentPairCode = generatePairCode();
  console.log(`\n[Agent] Pairing code: ${currentPairCode}\n`);

  if (pairCodeTimer) clearInterval(pairCodeTimer);
  pairCodeTimer = setInterval(() => {
    const pairings = loadPairings();
    const hasPairings = Object.keys(pairings).length > 0;
    const isRecentlyActive = (Date.now() - lastAuthTime) < ACTIVE_WINDOW_MS;

    // Has pairings and recently active: stop rotating pairing code (extension is online, no new pairing needed)
    if (hasPairings && isRecentlyActive) {
      if (currentPairCode !== null) {
        currentPairCode = null;
        console.log('[Agent] Active connection detected, stopping pairing code rotation');
      }
      return;
    }

    // No pairing or extension offline timeout: rotate pairing code to allow new extension pairing
    currentPairCode = generatePairCode();
    console.log(`[Agent] Pairing code updated: ${currentPairCode}`);
  }, ttl);
}

/**
 * 停止配对码定时刷新
 */
function stopPairCodeRotation() {
  if (pairCodeTimer) {
    clearInterval(pairCodeTimer);
    pairCodeTimer = null;
  }
}

/**
 * 验证 token 是否有效
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const pairings = loadPairings();
  for (const [extId, pairing] of Object.entries(pairings)) {
    if (pairing.token === token) {
      lastAuthTime = Date.now();
      return extId;
    }
  }
  return null;
}

/**
 * 处理配对请求（异步，支持写入锁）
 * 安全策略：
 *   - 失败锁定：连续失败 PAIR_FAIL_LIMIT 次后临时锁定，并立即轮换配对码使已观测码失效
 *   - 一次性使用：配对成功后立即轮换配对码，防止配对码被重复利用
 * @param {string} code - 配对码
 * @param {string} extensionId - 扩展 ID
 * @param {Function} [tFn] - 可选的翻译函数（由 server.js 传入）
 */
async function handlePairRequest(code, extensionId, tFn) {
  // 锁定期内直接拒绝（不泄露是否处于锁定状态细节）
  if (Date.now() < pairLockUntil) {
    return { success: false, error: tr('auth.tooFrequent', undefined, tFn) };
  }
  if (!code || !extensionId) {
    return { success: false, error: tr('auth.missingCodeOrExtId', undefined, tFn) };
  }
  if (code.toUpperCase() !== currentPairCode) {
    pairFailCount++;
    if (pairFailCount >= PAIR_FAIL_LIMIT) {
      pairLockUntil = Date.now() + PAIR_LOCK_DURATION_MS;
      pairFailCount = 0;
      // 锁定时立即轮换配对码，使攻击者已观测到的配对码失效
      currentPairCode = generatePairCode();
      console.log('[Agent] Too many failed pairing attempts, locked for 60s and pairing code rotated');
    }
    return { success: false, error: tr('auth.invalidCode', undefined, tFn) };
  }
  // 配对码正确：重置失败计数
  pairFailCount = 0;

  // 检查是否已有配对
  const pairings = loadPairings();
  if (pairings[extensionId]) {
    // 一次性使用：成功后立即轮换配对码
    currentPairCode = generatePairCode();
    console.log('[Agent] Pairing code verified, code rotated (one-time use)');
    return { success: true, token: pairings[extensionId].token, message: tr('auth.alreadyPaired', undefined, tFn) };
  }
  // 生成新 token 并保存
  const token = crypto.randomBytes(32).toString('hex');
  try {
    await savePairing(extensionId, token);
  } catch (err) {
    return { success: false, error: tr('auth.saveFailed', { message: err.message }, tFn) };
  }
  // 一次性使用：成功后立即轮换配对码
  currentPairCode = generatePairCode();
  console.log('[Agent] Pairing successful, pairing code rotated (one-time use)');
  return { success: true, token, message: tr('auth.pairSuccess', undefined, tFn) };
}

export {
  verifyToken,
  getCurrentPairCode,
  startPairCodeRotation,
  stopPairCodeRotation,
  handlePairRequest
};
