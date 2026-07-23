// agent/src/auth.js - 配对认证模块
import crypto from 'crypto';
import { loadConfig, loadPairings, savePairing } from './config.js';

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
 * 启动配对码定时刷新
 * - 如果有配对记录且最近有活跃认证（5分钟内），跳过刷新
 * - 否则启动定时刷新，允许新扩展配对
 */
function startPairCodeRotation() {
  const config = loadConfig();
  const pairings = loadPairings();
  const hasPairings = Object.keys(pairings).length > 0;
  const isRecentlyActive = (Date.now() - lastAuthTime) < ACTIVE_WINDOW_MS;

  // 有配对且最近有活跃连接，无需刷新配对码
  if (hasPairings && isRecentlyActive) {
    console.log(`[Agent] 已有 ${Object.keys(pairings).length} 个配对扩展，最近 ${Math.round((Date.now() - lastAuthTime) / 1000)}s 前有认证活动，跳过配对码刷新`);
    currentPairCode = generatePairCode();
    console.log(`[Agent] 当前配对码（用于新增配对）: ${currentPairCode}`);
    return;
  }

  // 有配对但无活跃连接，给出提示
  if (hasPairings && !isRecentlyActive) {
    console.log(`[Agent] 存在配对记录但无活跃连接（超过 ${ACTIVE_WINDOW_MS / 60000} 分钟），恢复配对码刷新`);
  }

  const ttl = (config.pairCodeTTL || 30) * 1000;

  currentPairCode = generatePairCode();
  console.log(`[Agent] 当前配对码: ${currentPairCode}`);

  if (pairCodeTimer) clearInterval(pairCodeTimer);
  pairCodeTimer = setInterval(() => {
    currentPairCode = generatePairCode();
    console.log(`[Agent] 配对码已更新: ${currentPairCode}`);
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
 */
async function handlePairRequest(code, extensionId) {
  // 锁定期内直接拒绝（不泄露是否处于锁定状态细节）
  if (Date.now() < pairLockUntil) {
    return { success: false, error: '配对尝试过于频繁，请稍后再试' };
  }
  if (!code || !extensionId) {
    return { success: false, error: '缺少配对码或扩展ID' };
  }
  if (code !== currentPairCode) {
    pairFailCount++;
    if (pairFailCount >= PAIR_FAIL_LIMIT) {
      pairLockUntil = Date.now() + PAIR_LOCK_DURATION_MS;
      pairFailCount = 0;
      // 锁定时立即轮换配对码，使攻击者已观测到的配对码失效
      currentPairCode = generatePairCode();
      console.log('[Agent] 配对失败次数过多，已临时锁定 60s 并轮换配对码');
    }
    return { success: false, error: '配对码无效' };
  }
  // 配对码正确：重置失败计数
  pairFailCount = 0;

  // 检查是否已有配对
  const pairings = loadPairings();
  if (pairings[extensionId]) {
    // 一次性使用：成功后立即轮换配对码
    currentPairCode = generatePairCode();
    console.log('[Agent] 配对码校验通过，配对码已轮换（一次性使用）');
    return { success: true, token: pairings[extensionId].token, message: '已配对，返回现有 token' };
  }
  // 生成新 token 并保存
  const token = crypto.randomBytes(32).toString('hex');
  try {
    await savePairing(extensionId, token);
  } catch (err) {
    return { success: false, error: `配对保存失败: ${err.message}` };
  }
  // 一次性使用：成功后立即轮换配对码
  currentPairCode = generatePairCode();
  console.log('[Agent] 配对成功，配对码已轮换（一次性使用）');
  return { success: true, token, message: '配对成功' };
}

export {
  verifyToken,
  getCurrentPairCode,
  startPairCodeRotation,
  stopPairCodeRotation,
  handlePairRequest
};
