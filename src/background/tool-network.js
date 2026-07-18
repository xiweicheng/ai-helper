// background/tool-network.js - 网络请求工具
// 从 tool-executor.js 拆分，提供带超时和重试的 fetch 封装，以及 URL 请求工具

import logger from '../shared/logger.js';

/**
 * 带超时的 fetch 请求
 * @param {string} url
 * @param {Object} options - fetch options（可包含外部 signal）
 * @param {number} timeoutMs
 */
export async function fetchWithTimeout(url, options, timeoutMs) {
  // 确保 timeoutMs 是有效的正整数，防止 AbortSignal.timeout() 报错
  const safeTimeoutMs = Math.max(1, Math.floor(Number(timeoutMs) || 60000));
  const controller = new AbortController();
  const externalSignal = options?.signal;

  // AbortSignal.timeout() 是浏览器引擎级超时，不受 SW 定时器节流影响
  // 低版本 Chrome（<103）不支持，使用 setTimeout 作为回退
  let timeoutSignal;
  let timeoutId;
  if (typeof AbortSignal.timeout === 'function') {
    timeoutSignal = AbortSignal.timeout(safeTimeoutMs);
  } else {
    // 回退：使用 setTimeout 模拟超时
    timeoutSignal = controller.signal;
    timeoutId = setTimeout(() => controller.abort(), safeTimeoutMs);
  }

  // 统一 abort 通道：超时和外部取消都通过 controller.abort() 触发
  const onAbort = () => controller.abort();
  timeoutSignal.addEventListener('abort', onAbort, { once: true });

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal   // 始终使用内部 signal，避免 AbortSignal.any 潜在 bug
    });
    // 清理监听器
    timeoutSignal.removeEventListener('abort', onAbort);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    if (timeoutId) clearTimeout(timeoutId);
    return response;
  } catch (error) {
    // 清理监听器
    timeoutSignal.removeEventListener('abort', onAbort);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    if (timeoutId) clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      // 外部取消 → 传播原始 AbortError（fetchWithRetry 不重试）
      if (externalSignal?.aborted) {
        throw error;
      }
      // 内部超时 → 包装为超时错误（fetchWithRetry 会重试）
      throw new Error(`请求超时 (${safeTimeoutMs}ms)`);
    }
    throw error;
  }
}

/**
 * 带重试的 fetch 请求
 * 可重试的错误：网络错误、超时、5xx、429（Rate Limit）
 * 不重试的错误：4xx（除429外）、取消
 * 使用指数退避策略：baseDelay * 2^attempt
 *
 * @param {string} url
 * @param {Object} options - fetch options
 * @param {number} timeoutMs - 单次请求超时时间
 * @param {number} maxRetries - 最大重试次数（默认3）
 * @param {number} baseDelay - 基础延迟毫秒数（默认1000）
 * @param {Function} onRetry - 重试回调 (attempt, error, delay) => void
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options, timeoutMs, maxRetries = 3, baseDelay = 1000, onRetry = null) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      // 5xx 或 429 可重试
      if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
        const errorText = await response.text().catch(() => '');
        lastError = new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        const delay = baseDelay * Math.pow(2, attempt);
        logger.debug(`[Background] API 返回 ${response.status}，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`);
        if (onRetry) onRetry(attempt + 1, lastError, delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries) break;

      // 被取消（AbortError 且不是超时）不重试
      if (error.name === 'AbortError' && !error.message.includes('超时')) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      logger.debug(`[Background] API 调用失败，${delay}ms 后重试 (${attempt + 1}/${maxRetries}):`, error.message);
      if (onRetry) onRetry(attempt + 1, error, delay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export async function executeFetchUrl(args, toolCallId) {
  const { url, method = 'GET', headers = {}, body, timeout = 30000 } = args;

  logger.debug('[Background] 执行 HTTP 请求:', 'method=', method, 'url=', url, 'timeout=', timeout);

  // 验证 URL 格式
  if (!url) {
    return {
      success: false,
      error: '缺少 URL 参数',
      tool_call_id: toolCallId
    };
  }

  // 检查 URL 是否有效
  try {
    new URL(url);
  } catch (e) {
    return {
      success: false,
      error: `无效的 URL 格式: ${url}`,
      tool_call_id: toolCallId
    };
  }

  // Service Worker 的 fetch() 对 headers 类型校验严格，所有值必须是 ByteString。
  // AI 模型可能传入 non-string 类型的 header 值（如 number、boolean、null），
  // 需要先做类型清洗，避免 "is not of type '(record<ByteString, ByteString>'" 错误。
  const sanitizedHeaders = {};
  if (headers && typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers)) {
      sanitizedHeaders[key] = String(value ?? '');
    }
  }

  const fetchOptions = {
    method: method.toUpperCase(),
    headers: sanitizedHeaders
  };

  // 只在有 body 且不是 GET/HEAD 方法时添加 body
  if (body && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
    fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
  }

  logger.debug('[Background] fetch 选项:', JSON.stringify(fetchOptions));

  try {
    const response = await fetchWithRetry(url, fetchOptions, timeout);
    logger.debug('[Background] HTTP 响应状态:', response.status, response.statusText);

    try {
      const text = await response.text();
      const result = {
        success: response.status >= 200 && response.status < 300,
        status: response.status,
        statusText: response.statusText,
        content: text.substring(0, 10000),
        contentLength: text.length,
        url: response.url
      };
      logger.debug('[Background] HTTP 响应内容长度:', text.length);
      return { ...result, tool_call_id: toolCallId };
    } catch (textError) {
      logger.error('[Background] 读取响应内容失败:', textError);
      return {
        success: false,
        error: `读取响应内容失败: ${textError.message}`,
        status: response.status,
        tool_call_id: toolCallId
      };
    }
  } catch (error) {
    let errorMessage = error.message;

    if (error.name === 'AbortError') {
      logger.warn('[Background] HTTP 请求超时:', url, `(${timeout}ms)`);
      errorMessage = `请求超时 (${timeout}ms)，目标服务器响应过慢。如需获取数据，可尝试：\n1. 适当增大 timeout 参数重新请求\n2. 检查该 URL 在浏览器中是否能快速访问\n3. 如果是 API 接口，尝试缩小请求范围`;
    } else {
      logger.error('[Background] HTTP 请求失败:', error.name, error.message);
      if (error.message === 'Failed to fetch') {
        errorMessage = `无法访问目标 URL，可能原因：\n1. 目标服务器不可达\n2. URL 不存在或已失效\n3. 目标服务器拒绝连接\n4. 网络连接问题`;
      } else if (error.message.includes('CORS')) {
        errorMessage = `CORS 跨域限制，目标服务器不允许跨域访问`;
      }
    }

    return {
      success: false,
      error: errorMessage,
      originalError: error.message,
      url: url,
      tool_call_id: toolCallId
    };
  }
}
