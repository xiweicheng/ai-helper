// background/tool-helpers.js - 工具执行辅助函数
// 从 tool-executor.js 拆分，提供参数解析、结果格式化、统计、消息重试等通用能力

import logger from '../shared/logger.js';

/**
 * 自动补全截断的 JSON 字符串
 * - 追踪引号状态（处理转义 \"）和括号栈（{ [ (）
 * - 字符串结束时引号未闭合 → 补上 "
 * - 移除末尾残留的尾随逗号
 * - 根据栈中剩余的未闭合括号，按相反顺序补全 } ] )
 */
export function autoCompleteJson(str) {
  if (!str || typeof str !== 'string') return str;

  let inString = false;
  let escapeNext = false;
  const bracketStack = []; // 存储 '{' '[' '('

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === '{' || ch === '[' || ch === '(') {
        bracketStack.push(ch);
      } else if (ch === '}' || ch === ']' || ch === ')') {
        const expected = ch === '}' ? '{' : ch === ']' ? '[' : '(';
        if (bracketStack.length > 0 && bracketStack[bracketStack.length - 1] === expected) {
          bracketStack.pop();
        }
      }
    }
  }

  let result = str;

  // 补全未闭合的引号
  if (inString) {
    result += '"';
  }

  // 移除末尾残留的尾随逗号（在补引号之后，因为逗号可能在引号内）
  result = result.replace(/,\s*$/, '');

  // 按相反顺序补全缺失的闭合括号
  const closingMap = { '{': '}', '[': ']', '(': ')' };
  while (bracketStack.length > 0) {
    const open = bracketStack.pop();
    result += closingMap[open];
  }

  return result;
}

/**
 * 清除数组中混入的对象键值对
 * LLM 有时会把 "key": value 风格的对象字段错误放进数组中，例如：
 *   ["a", "recommendedOption": 1, "b"] → ["a", "b"]
 * 通过字符扫描追踪括号上下文，仅在数组内检测并移除这些非法条目
 */
export function fixArrayObjectMismatch(str) {
  if (!str || typeof str !== 'string') return str;

  const result = [];
  let inString = false;
  let escapeNext = false;
  const bracketStack = [];

  let i = 0;
  while (i < str.length) {
    const ch = str[i];

    if (escapeNext) {
      result.push(ch);
      escapeNext = false;
      i++;
      continue;
    }

    if (ch === '\\' && inString) {
      result.push(ch);
      escapeNext = true;
      i++;
      continue;
    }

    // 在数组上下文中优先检测 "key": value 模式（必须在引号切换之前）
    if (ch === '"' && bracketStack.length > 0 && bracketStack[bracketStack.length - 1] === '[') {
      const remaining = str.substring(i);
      const kvMatch = remaining.match(/^"[^"]+"\s*:\s*(true|false|null|-?\d+(?:\.\d+)?|"[^"]*")/);

      if (kvMatch) {
        // 跳过输入中的 key-value 对及其前后逗号
        // （逗号清理放到最后统一处理，避免误删相邻有效条目间的逗号）
        i += kvMatch[0].length;
        // 跳过尾部空白和逗号
        while (i < str.length && ' \t\n\r'.includes(str[i])) i++;
        if (i < str.length && str[i] === ',') i++;
        while (i < str.length && ' \t\n\r'.includes(str[i])) i++;
        continue;
      }
    }

    if (ch === '"') {
      inString = !inString;
      result.push(ch);
      i++;
      continue;
    }

    if (inString) {
      result.push(ch);
      i++;
      continue;
    }

    if (ch === '{' || ch === '[') {
      bracketStack.push(ch);
      result.push(ch);
      i++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      if (bracketStack.length > 0) bracketStack.pop();
      result.push(ch);
      i++;
      continue;
    }

    result.push(ch);
    i++;
  }

  let fixed = result.join('');
  // 统一清理：处理移除 KV 对后残留的逗号问题
  fixed = fixed.replace(/,\s*,/g, ',');       // 双逗号 → 单逗号
  fixed = fixed.replace(/,\s*([}\]])/g, '$1'); // 逗号在括号前
  fixed = fixed.replace(/\[\s*,/g, '[');       // 数组开场逗号
  fixed = fixed.replace(/,\s*\]/g, ']');       // 数组结尾逗号

  return fixed;
}

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

  // 安全检查：输入过长（>100KB）跳过正则修复，避免 ReDoS
  if (trimmed.length > 102400) {
    logger.warn('[Background] 工具参数过长（' + trimmed.length + ' 字符），跳过正则修复');
    return null;
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
  // 使用深度优先策略：从内层向外层修复，最多迭代 10 次防 ReDoS
  const MAX_FIX_ITERATIONS = 10;
  let prevFixed;
  let fixIterations = 0;
  do {
    prevFixed = fixed;
    fixIterations++;
    fixed = fixed.replace(/"([^"]+)":\s*([^",\{\}\[\]]+?)(\s*[,}\]])/g, (match, key, value, delimiter) => {
      const trimmedValue = value.trim();
      if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(trimmedValue)) {
        return match;
      }
      // 转义值内部的双引号
      const escapedValue = trimmedValue.replace(/"/g, '\\"');
      return `"${key}": "${escapedValue}"${delimiter}`;
    });
  } while (fixed !== prevFixed && fixIterations < MAX_FIX_ITERATIONS);

  if (fixIterations >= MAX_FIX_ITERATIONS && fixed !== prevFixed) {
    logger.warn('[Background] 工具参数修复迭代达到上限（' + MAX_FIX_ITERATIONS + '次），停止修复');
    return null;
  }

  // 2d. 修复已加引号但内部双引号未转义的情况
  // 匹配模式: "key": "value" 其中 value 内部包含未转义的双引号
  fixed = fixed.replace(/"([^"]+)":\s*"([^"]*)(")([^"]*)"/g, (match, key, part1, unescapedQuote, part2) => {
    return `"${key}": "${part1}\\"${part2}"`;
  });

  // 2e. 自动补全缺失的闭合引号和括号（处理 LLM 截断输出）
  fixed = autoCompleteJson(fixed);

  // 2f. 清除数组中混入的对象键值对（LLM 有时把 "key": value 错误放进数组）
  fixed = fixArrayObjectMismatch(fixed);

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
