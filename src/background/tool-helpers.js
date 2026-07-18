// background/tool-helpers.js - 工具执行辅助函数
// 从 tool-executor.js 拆分，提供参数解析、结果格式化、统计、消息重试等通用能力

import logger from '../shared/logger.js';

/**
 * 两阶段解析工具参数：
 * 1. 先尝试标准 JSON.parse
 * 2. 失败后尝试修复常见问题：尾随逗号、未加引号的字符串值、嵌套对象
 * 返回 null 表示所有解析尝试均失败
 */
export function tryParseToolArgs(argsStr) {
  if (!argsStr || typeof argsStr !== 'string') return null;

  const trimmed = argsStr.trim();
  if (!trimmed) return null;

  // 阶段 1: 标准 JSON 解析
  try {
    return JSON.parse(trimmed);
  } catch {
    logger.warn('[Background] 工具参数直接解析失败，尝试修复...');
  }

  // 阶段 2: 修复常见问题后重试
  let fixed = trimmed;

  // 2a. 移除尾随逗号（对象和数组）
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  // 2b. 修复未加引号的字符串值
  // 匹配模式: "key": value 其中 value 是未加引号的中文/英文/数字组合
  // 支持包含空格、特殊字符的值，直到遇到 , 或 } 或换行符
  fixed = fixed.replace(/"([^"]+)":\s*([^",\{\}\[\]]+?)(\s*[,}\]])/g, (match, key, value, delimiter) => {
    const trimmedValue = value.trim();
    // 跳过已经是数字、布尔值、null 的值
    if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(trimmedValue)) {
      return match;
    }
    // 转义值内部的双引号
    const escapedValue = trimmedValue.replace(/"/g, '\\"');
    return `"${key}": "${escapedValue}"${delimiter}`;
  });

  // 2c. 递归修复嵌套对象中的未加引号字符串值
  // 使用深度优先策略：从内层向外层修复
  let prevFixed;
  do {
    prevFixed = fixed;
    fixed = fixed.replace(/"([^"]+)":\s*([^",\{\}\[\]]+?)(\s*[,}\]])/g, (match, key, value, delimiter) => {
      const trimmedValue = value.trim();
      if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(trimmedValue)) {
        return match;
      }
      // 转义值内部的双引号
      const escapedValue = trimmedValue.replace(/"/g, '\\"');
      return `"${key}": "${escapedValue}"${delimiter}`;
    });
  } while (fixed !== prevFixed);

  // 2d. 修复已加引号但内部双引号未转义的情况
  // 匹配模式: "key": "value" 其中 value 内部包含未转义的双引号
  fixed = fixed.replace(/"([^"]+)":\s*"([^"]*)(")([^"]*)"/g, (match, key, part1, unescapedQuote, part2) => {
    return `"${key}": "${part1}\\"${part2}"`;
  });

  // 阶段 2 最终尝试
  try {
    const result = JSON.parse(fixed);
    logger.debug('[Background] 工具参数修复解析成功:', result);
    return result;
  } catch (e) {
    logger.error('[Background] 工具参数修复解析也失败:', e, '修复后字符串:', fixed.substring(0, 200));
    return null;
  }
}

/**
 * 创建统一格式的工具返回结果
 * @param {boolean} success - 是否成功
 * @param {string} content - 给大模型读的内容（必须）
 * @param {Object} [extra] - 额外的元数据字段
 * @returns {{ success: boolean, content: string, tool_call_id?: string }}
 */
export function makeResult(success, content, extra = {}) {
  return { success, content, ...extra };
}

/**
 * 安全网：统一工具结果格式为 { success, content, error?, ... }
 * 所有 handler 都应该使用 makeResult() 返回，此函数仅处理异常情况
 */
export function normalizeToolResult(result, toolCallId) {
  if (result && typeof result === 'object' && 'success' in result) {
    // 标准对象格式：补充缺失的 content 和 tool_call_id
    if (!('content' in result)) {
      if (result.message) {
        result.content = result.message;
      } else if (!result.success && result.error) {
        // 失败且有 error 时，将错误信息作为内容展示，确保 LLM 和用户能看到失败原因
        result.content = `操作失败: ${result.error}`;
        result.message = result.error;
      } else {
        const { success, error, tool_call_id, ...rest } = result;
        result.content = JSON.stringify(rest);
        result.metadata = rest;
      }
      logger.debug('[Background] 工具返回格式不标准（缺少 content 字段），已自动补充');
    }
    if (!result.tool_call_id) result.tool_call_id = toolCallId;
    return result;
  }
  if (typeof result === 'string') {
    logger.warn('[Background] 工具返回了纯字符串而非标准对象，请改用 makeResult()');
    return { success: true, content: result, tool_call_id: toolCallId };
  }
  return { success: false, error: '未知结果格式', content: '', tool_call_id: toolCallId };
}

/**
 * 记录工具使用统计到 chrome.storage.local
 */
export async function recordToolStats(toolName, result, duration) {
  try {
    const toolStatsKey = 'toolUsageStats';
    const stats = await chrome.storage.local.get([toolStatsKey]);
    const toolStats = stats[toolStatsKey] || {};
    const entry = toolStats[toolName] || { callCount: 0, successCount: 0, totalDuration: 0, lastUsed: 0 };
    entry.callCount++;
    if (result.success) entry.successCount++;
    entry.totalDuration += duration;
    entry.lastUsed = Date.now();
    toolStats[toolName] = entry;
    chrome.storage.local.set({ [toolStatsKey]: toolStats });
  } catch (e) {
    logger.warn('[Background] 记录工具统计失败:', e);
  }
}

/**
 * 获取当前活跃标签页 ID
 */
export function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0].id : null);
    });
  });
}

/**
 * 向 Content Script 发送消息，失败时自动注入并重试
 * @param {number} tabId - 目标标签页 ID
 * @param {Object} message - 要发送的消息（需包含 type 字段）
 * @param {string} toolCallId - 工具调用 ID
 * @returns {Promise<Object>} 带有 tool_call_id 的结果对象
 */
export async function sendToContentScriptWithRetry(tabId, message, toolCallId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message;
        logger.warn('[Background] 发送消息到 content script 失败:', errorMsg);

        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError || !tab) {
            resolve({ success: false, error: '无法访问该标签页: ' + errorMsg, tool_call_id: toolCallId });
            return;
          }

          const url = tab.url || '';
          if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
            resolve({ success: false, error: '无法在系统页面使用工具: ' + url, tool_call_id: toolCallId });
            return;
          }

          logger.debug('[Background] 尝试自动注入 content script 到 Tab:', tabId);
          const manifest = chrome.runtime.getManifest();
          const contentJsFiles = manifest.content_scripts?.[0]?.js || [];
          const contentFileIdx = contentJsFiles.findIndex(f => /content/i.test(f) && f.endsWith('.js'));
          if (contentFileIdx === -1) {
            resolve({ success: false, error: '无法找到 content script 文件', tool_call_id: toolCallId });
            return;
          }
          const contentFilePath = contentJsFiles[contentFileIdx];
          const contentUrl = chrome.runtime.getURL(contentFilePath);
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (url) => {
              return new Promise((resolve) => {
                if (document.getElementById('__aih_content_script__')) {
                  resolve(true);
                  return;
                }
                const script = document.createElement('script');
                script.id = '__aih_content_script__';
                script.src = url;
                script.onload = () => resolve(true);
                script.onerror = () => resolve(false);
                document.head.appendChild(script);
              });
            },
            args: [contentUrl]
          })
            .then(() => {
              logger.debug('[Background] Content script 注入成功, 重试发送消息');
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, message, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    logger.warn('[Background] 重试发送消息也失败:', chrome.runtime.lastError.message);
                    resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
                  } else {
                    resolve({ ...retryResponse, tool_call_id: toolCallId });
                  }
                });
              }, 500);
            })
            .catch(err => {
              logger.error('[Background] 注入 content script 失败:', err);
              resolve({ success: false, error: '注入 Content Script 失败: ' + err.message, tool_call_id: toolCallId });
            });
        });
      } else {
        resolve({ ...response, tool_call_id: toolCallId });
      }
    });
  });
}
