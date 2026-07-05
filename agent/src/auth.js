// agent/src/auth.js - 配对认证模块
import crypto from 'crypto';
import { loadConfig, loadPairings, savePairing } from './config.js';

// 当前有效的配对码（30秒刷新一次）
let currentPairCode = null;
let pairCodeTimer = null;

// 最后一次成功认证的时间戳（用于判断是否有活跃连接）
let lastAuthTime = 0;

// 判定"活跃"的时间窗口：此时间内有过认证则认为仍有扩展连接
const ACTIVE_WINDOW_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 生成随机配对码（4位数字，使用密码学安全的随机数）
 */
function generatePairCode() {
  return String(crypto.randomInt(1000, 10000));
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
 */
async function handlePairRequest(code, extensionId) {
  if (!code || !extensionId) {
    return { success: false, error: '缺少配对码或扩展ID' };
  }
  if (code !== currentPairCode) {
    return { success: false, error: '配对码无效' };
  }
  // 检查是否已有配对
  const pairings = loadPairings();
  if (pairings[extensionId]) {
    return { success: true, token: pairings[extensionId].token, message: '已配对，返回现有 token' };
  }
  // 生成新 token 并保存
  const token = crypto.randomBytes(32).toString('hex');
  try {
    await savePairing(extensionId, token);
  } catch (err) {
    return { success: false, error: `配对保存失败: ${err.message}` };
  }
  return { success: true, token, message: '配对成功' };
}

export {
  verifyToken,
  getCurrentPairCode,
  startPairCodeRotation,
  stopPairCodeRotation,
  handlePairRequest
};
