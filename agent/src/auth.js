// agent/src/auth.js - 配对认证模块
import crypto from 'crypto';
import { loadConfig, loadPairings, savePairing } from './config.js';

// 当前有效的配对码（30秒刷新一次）
let currentPairCode = null;
let pairCodeTimer = null;

/**
 * 生成随机配对码（4位数字）
 */
function generatePairCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * 生成认证 token（HMAC-SHA256）
 */
function generateToken(extensionId) {
  const secret = crypto.randomBytes(32).toString('hex');
  const pairings = loadPairings();
  pairings[extensionId] = {
    token: secret,
    pairedAt: Date.now()
  };
  // 直接用 secret 作为 token
  return secret;
}

/**
 * 验证 token 是否有效
 */
function verifyToken(token) {
  if (!token) return null;
  const pairings = loadPairings();
  for (const [extId, pairing] of Object.entries(pairings)) {
    if (pairing.token === token) {
      return extId;
    }
  }
  return null;
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
 * 处理配对请求
 */
function handlePairRequest(code, extensionId) {
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
  savePairing(extensionId, token);
  return { success: true, token, message: '配对成功' };
}

/**
 * Bearer Token 认证中间件（Express）
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: '未提供认证 token' });
  }
  const token = authHeader.slice(7);
  const extId = verifyToken(token);
  if (!extId) {
    return res.status(403).json({ success: false, error: '认证 token 无效' });
  }
  req.extensionId = extId;
  next();
}

export {
  generateToken,
  verifyToken,
  getCurrentPairCode,
  startPairCodeRotation,
  stopPairCodeRotation,
  handlePairRequest,
  authMiddleware
};
