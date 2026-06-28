// agent/src/auth.js - 配对认证模块
import crypto from 'crypto';
import { loadConfig, loadPairings, savePairing } from './config.js';

// 当前有效的配对码（30秒刷新一次）
let currentPairCode = null;
let pairCodeTimer = null;

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
 */
function startPairCodeRotation() {
  const config = loadConfig();
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
