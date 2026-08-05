import logger from './logger.js';
import { t, registerTranslations } from './i18n.js';

// shared/token-counter.js - Token 估算工具
// 使用字符数估算 token 数，无需引入 tiktoken 等重量级依赖

registerTranslations('zh', {
  tokenCounter: {
    truncatedMiddle: '\n\n... [中间 {tokens} tokens 已截断] ...\n\n',
    omittedTokens: '\n\n... [省略 {tokens} tokens] ...\n\n',
    omittedMiddleHtml: '\n<!-- 省略中间内容 -->\n',
    truncated: '[截断]',
    omittedKey: '...[省略]',
    moreFields: '还有 {count} 个字段',
    unknownTool: '未知工具',
    userQuestion: '- 用户问题：{question}',
    usedTools: '- 使用的工具：{tools}',
    historySummary: '[历史摘要]',
  },
});

registerTranslations('en', {
  tokenCounter: {
    truncatedMiddle: '\n\n... [middle {tokens} tokens truncated] ...\n\n',
    omittedTokens: '\n\n... [{tokens} tokens omitted] ...\n\n',
    omittedMiddleHtml: '\n<!-- middle content omitted -->\n',
    truncated: '[truncated]',
    omittedKey: '...[omitted]',
    moreFields: '{count} more fields',
    unknownTool: 'Unknown tool',
    userQuestion: '- User question: {question}',
    usedTools: '- Tools used: {tools}',
    historySummary: '[History Summary]',
  },
});

// 估算常量：中文约 1.5 字符/token，英文约 4 字符/token
// 参考 DeepSeek tokenizer 的行为特征
const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
const CHARS_PER_TOKEN_CN = 1.5;
const CHARS_PER_TOKEN_EN = 4;

// 每条消息的 role + 结构开销（约 4 tokens）
const MESSAGE_OVERHEAD = 4;

// ============================================================
// 图片 Token 估算（参考 OpenAI Vision 高分辨率模式）
// 多数多模态模型（OpenAI/Claude/DeepSeek VL 等）的图片 token 与分辨率相关，
// 而非 Base64 字符串长度。按 Base64 字符串估算会严重高估（约 20 倍）。
// 公式：tiles = ceil(w/512) * ceil(h/512)，tokens = 85 + 170 * tiles
// ============================================================
const IMAGE_BASE_TOKENS = 85;
const IMAGE_TOKENS_PER_TILE = 170;
const IMAGE_TILE_SIZE = 512;

/**
 * 估算单张图片的 token 数量
 * 优先用压缩后尺寸（width/height）按 tile 公式计算；
 * 缺失尺寸时按 Base64 字节大小兜底估算（经验值：JPEG 约 65 bytes/token）
 * @param {{ url?: string, width?: number, height?: number }} imageUrlObj
 * @returns {number}
 */
function estimateImageTokens(imageUrlObj) {
  if (!imageUrlObj) return IMAGE_BASE_TOKENS;

  const w = Number(imageUrlObj.width);
  const h = Number(imageUrlObj.height);
  if (w > 0 && h > 0) {
    const tiles = Math.ceil(w / IMAGE_TILE_SIZE) * Math.ceil(h / IMAGE_TILE_SIZE);
    return IMAGE_BASE_TOKENS + IMAGE_TOKENS_PER_TILE * tiles;
  }

  // 兜底：按 Base64 字节估算（无尺寸信息，如旧数据）
  // 50KB JPEG ≈ 765 tokens（OpenAI），故 1 token ≈ 65 bytes
  const url = imageUrlObj.url || '';
  const base64Data = url.split(',')[1] || url;
  const bytes = (base64Data.length * 3) / 4;  // Base64 每 4 字符 ≈ 3 字节
  return Math.max(IMAGE_BASE_TOKENS, Math.ceil(bytes / 65));
}

// ============================================================
// 实时校准：基于 API 实际返回的 prompt_tokens 修正估算偏差
// 使用指数加权移动平均（EWMA）平滑，避免单次异常波动
// ============================================================
let calibrationFactor = 1.0;
let calibrationSamples = 0;
const CALIBRATION_MIN_SAMPLES = 3;    // 至少 3 次采样后才启用校准
const CALIBRATION_RATIO_MIN = 0.3;    // 异常比例下限
const CALIBRATION_RATIO_MAX = 3.0;    // 异常比例上限

/**
 * 更新 token 估算校准因子
 * 在每次 API 调用完成后，用 API 返回的实际 prompt_tokens 与我们的估算值对比
 * @param {number} estimated - 我们的估算值（不含输出预留）
 * @param {number} actual - API 返回的 prompt_tokens
 */
export function updateCalibration(estimated, actual) {
  if (!actual || actual <= 0 || !estimated || estimated <= 0) return;

  const ratio = actual / estimated;
  // 过滤异常比例（如估算或实际值明显错误）
  if (ratio < CALIBRATION_RATIO_MIN || ratio > CALIBRATION_RATIO_MAX) {
    logger.warn(`[TokenCounter] calibration ratioexception,ignore: estimated=${estimated}, actual=${actual}, ratio=${ratio.toFixed(3)}`);
    return;
  }

  calibrationSamples++;
  // EWMA：样本少时权重高（快速收敛），样本多时权重低（稳定）
  const alpha = Math.min(0.3, 1 / calibrationSamples);
  const oldFactor = calibrationFactor;
  calibrationFactor = calibrationFactor * (1 - alpha) + ratio * alpha;

  logger.debug(`[TokenCounter] Tokencalibration update: ratio=${ratio.toFixed(3)}, alpha=${alpha.toFixed(3)}, old=${oldFactor.toFixed(3)} → new=${calibrationFactor.toFixed(3)}, samples=${calibrationSamples}`);
}

/**
 * 获取校准后的 token 估算
 * 样本不足时不校准（返回原始估算值）
 * @param {number} rawEstimate - 原始估算值
 * @returns {number}
 */
export function getCalibratedTokens(rawEstimate) {
  if (calibrationSamples < CALIBRATION_MIN_SAMPLES || calibrationFactor <= 0) {
    return rawEstimate;
  }
  return Math.ceil(rawEstimate * calibrationFactor);
}

/**
 * 获取当前校准状态信息（用于诊断/日志）
 * @returns {{ factor: number, samples: number, active: boolean }}
 */
export function getCalibrationInfo() {
  return {
    factor: calibrationFactor,
    samples: calibrationSamples,
    active: calibrationSamples >= CALIBRATION_MIN_SAMPLES
  };
}

/**
 * 估算单段文本的 token 数量
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  const chineseMatches = text.match(CHINESE_CHAR_REGEX);
  const chineseChars = chineseMatches ? chineseMatches.length : 0;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / CHARS_PER_TOKEN_CN + otherChars / CHARS_PER_TOKEN_EN);
}

/**
 * 估算消息数组的总 token 数
 * 支持 multipart content（文本 + 图片）：图片按分辨率估算，避免 Base64 字符串高估
 * @param {Array<{role: string, content: string|Array, tool_calls?: Array, tool_call_id?: string, reasoning_content?: string}>} messages
 * @returns {number}
 */
export function estimateMessagesTokens(messages) {
  if (!messages || messages.length === 0) return 0;
  return messages.reduce((sum, m) => {
    let tokens = 0;
    if (typeof m.content === 'string') {
      tokens = estimateTokens(m.content);
    } else if (Array.isArray(m.content)) {
      // 多模态 content：分别按 part 类型估算
      for (const part of m.content) {
        if (!part) continue;
        if (part.type === 'text') {
          tokens += estimateTokens(part.text || '');
        } else if (part.type === 'image_url' && part.image_url) {
          // 图片按分辨率估算，不把 Base64 字符串计入
          tokens += estimateImageTokens(part.image_url);
        } else {
          tokens += estimateTokens(JSON.stringify(part));
        }
      }
    } else if (m.content) {
      tokens = estimateTokens(JSON.stringify(m.content));
    }

    // 附加字段 token
    let extra = '';
    if (m.tool_calls) extra += JSON.stringify(m.tool_calls);
    if (m.tool_call_id) extra += m.tool_call_id;
    if (m.reasoning_content) extra += m.reasoning_content;
    if (extra) tokens += estimateTokens(extra);

    return sum + tokens + MESSAGE_OVERHEAD;
  }, 0);
}

/**
 * 按 token 上限截断文本，保留头部和尾部
 * @param {string} content - 原始文本
 * @param {number} maxTokens - 最大 token 数
 * @returns {string}
 */
export function truncateByTokens(content, maxTokens) {
  if (!content || typeof content !== 'string') return content;
  const currentTokens = estimateTokens(content);
  if (currentTokens <= maxTokens) return content;

  // 保留头部 70%，尾部 30%
  const headTokens = Math.floor(maxTokens * 0.7);
  const tailTokens = maxTokens - headTokens;

  const headChars = Math.floor(headTokens * CHARS_PER_TOKEN_EN);
  const tailChars = Math.floor(tailTokens * CHARS_PER_TOKEN_EN);

  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);

  const truncatedTokens = currentTokens - maxTokens;
  return head + t('tokenCounter.truncatedMiddle', { tokens: truncatedTokens }) + tail;
}

/**
 * 智能工具结果截断：根据内容类型采用不同的保留策略
 * - HTML: 优先保留 <body> 内容
 * - JSON: 保留顶层 key 结构，值摘要
 * - 代码: 保留头部 + 关键结构 + 尾部
 * - 纯文本: 固定 60% / 20% 头尾截断
 * @param {string} content - 原始内容
 * @param {number} maxTokens - 最大 token 数
 * @param {string} [contentType] - 内容类型提示: 'html' | 'json' | 'code' | 'text'
 * @returns {string}
 */
export function truncateContentSmart(content, maxTokens, contentType) {
  if (!content || typeof content !== 'string') return content;
  if (estimateTokens(content) <= maxTokens) return content;

  // 自动检测类型
  if (!contentType) {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      contentType = 'json';
    } else if (/<(!DOCTYPE|html|head|body)[\s>]/i.test(trimmed.substring(0, 200))) {
      contentType = 'html';
    } else {
      contentType = 'text';
    }
  }

  if (contentType === 'html') {
    return truncateHtmlSmart(content, maxTokens);
  } else if (contentType === 'json') {
    return truncateJsonSmart(content, maxTokens);
  }
  // text/code: 保留前 60% 字符 + 后 20% 字符
  const headChars = Math.floor(maxTokens * 0.6 * CHARS_PER_TOKEN_EN);
  const tailChars = Math.floor(maxTokens * 0.2 * CHARS_PER_TOKEN_EN);
  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);
  return head + t('tokenCounter.omittedTokens', { tokens: estimateTokens(content) - maxTokens }) + tail;
}

/**
 * HTML 智能截断：优先保留 <body> 内容
 */
function truncateHtmlSmart(content, maxTokens) {
  const bodyMatch = content.match(/<body[\s>][\s\S]*<\/body>/i);
  if (bodyMatch) {
    const bodyContent = bodyMatch[0];
    const headContent = content.substring(0, content.indexOf(bodyContent));
    // body 内容占 80%，头部占 20%
    const bodyBudget = Math.floor(maxTokens * 0.8);
    const headBudget = maxTokens - bodyBudget;
    const headChars = Math.floor(headBudget * CHARS_PER_TOKEN_EN);
    const bodyChars = Math.floor(bodyBudget * CHARS_PER_TOKEN_EN);
    return content.slice(0, headChars) +
      bodyContent.slice(0, bodyChars) +
      t('tokenCounter.omittedMiddleHtml') +
      bodyContent.slice(-Math.floor(bodyChars * 0.3)) +
      content.slice(-Math.floor(headChars * 0.3));
  }
  // 无 body 标签，fallback 到通用截断
  return truncateByTokens(content, maxTokens);
}

/**
 * JSON 智能截断：保留顶层 key 结构，值摘要
 */
function truncateJsonSmart(content, maxTokens) {
  try {
    const obj = JSON.parse(content);
    if (typeof obj !== 'object' || obj === null) {
      return truncateByTokens(content, maxTokens);
    }

    const summarized = {};
    const keys = Object.keys(obj);
    const maxKeys = Math.min(keys.length, 30);

    for (let i = 0; i < maxKeys; i++) {
      const key = keys[i];
      const val = obj[key];
      if (typeof val === 'string' && val.length > 200) {
        summarized[key] = val.substring(0, 200) + '...' + t('tokenCounter.truncated');
      } else if (typeof val === 'object' && val !== null) {
        summarized[key] = `[${Array.isArray(val) ? `Array(${val.length})` : `Object(${Object.keys(val).length} keys)`}]`;
      } else {
        summarized[key] = val;
      }
    }

    if (keys.length > maxKeys) {
      summarized['...[省略]'] = `还有 ${keys.length - maxKeys} 个字段`;
    }

    let result = JSON.stringify(summarized, null, 2);
    // 如果摘要后仍超预算，做最终字符截断
    if (estimateTokens(result) > maxTokens) {
      result = result.substring(0, Math.floor(maxTokens * CHARS_PER_TOKEN_EN));
    }
    return result;
  } catch {
    return truncateByTokens(content, maxTokens);
  }
}

/**
 * 模型上下文窗口配置（单位：tokens）
 * 作为内置默认值，可通过添加自定义模型时设置上下文窗口来覆盖
 */
export const MODEL_CONTEXT_WINDOWS = {
  'deepseek-v4-pro': 128000,
  'deepseek-v3': 128000,
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'claude-3.5-sonnet': 200000,
  'claude-3-opus': 200000,
  'claude-3-haiku': 200000,
  'claude-3-sonnet': 200000,
  default: 64000
};

/**
 * 标准化自定义模型配置数组，向前兼容旧格式（string[] → object[]）
 * @param {Array<string|{name: string, contextWindow?: number}>} customModels
 * @returns {Map<string, number>} modelName → contextWindow 的映射
 */
export function normalizeCustomModels(customModels) {
  const map = new Map();
  if (!customModels || !Array.isArray(customModels)) return map;
  for (const item of customModels) {
    if (typeof item === 'string') {
      // 旧格式：仅模型名，上下文窗口未知，不加入 map（回退到内置映射）
      continue;
    }
    if (item && typeof item === 'object' && item.name) {
      map.set(item.name, item.contextWindow || 0);
    }
  }
  return map;
}

/**
 * 获取模型上下文窗口大小
 * 优先级：自定义模型配置 > 用户全局配置 > 内置映射 > default
 * @param {string} modelName
 * @param {number} [userConfiguredWindow] - 用户手动配置的上下文窗口（全局覆盖）
 * @param {Map<string, number>} [customModelMap] - 自定义模型的上下文窗口映射
 * @returns {number}
 */
export function getContextWindow(modelName, userConfiguredWindow, customModelMap) {
  // 1. 优先使用自定义模型中该模型单独配置的上下文窗口
  if (customModelMap && customModelMap.has(modelName)) {
    const window = customModelMap.get(modelName);
    if (window && window > 0) return window;
  }
  // 2. 全局上下文窗口覆盖
  if (userConfiguredWindow && userConfiguredWindow > 0) return userConfiguredWindow;
  // 3. 内置模型映射
  return MODEL_CONTEXT_WINDOWS[modelName] || MODEL_CONTEXT_WINDOWS.default;
}

// ============================================================
// 上下文预算分配
// ============================================================

// 系统提示词预留 token 数
export const SYSTEM_PROMPT_BUDGET = 2000;

// 工具定义预留 token 数（工具数量 * 平均每个工具定义 ~200 tokens）
export function estimateToolsTokens(toolCount) {
  return toolCount * 200;
}

// 输出预留 token 数（给模型生成回答的空间）
export const OUTPUT_BUDGET = 4096;

/**
 * 计算可用于消息历史的 token 预算
 * @param {string} modelName
 * @param {number} toolCount
 * @param {number} [userConfiguredWindow]
 * @param {Map<string, number>} [customModelMap] - 自定义模型的上下文窗口映射
 * @returns {number}
 */
export function getMessageBudget(modelName, toolCount = 0, userConfiguredWindow, customModelMap) {
  const contextWindow = getContextWindow(modelName, userConfiguredWindow, customModelMap);
  return contextWindow - SYSTEM_PROMPT_BUDGET - estimateToolsTokens(toolCount) - OUTPUT_BUDGET;
}

/**
 * 评估上下文压力等级
 * @param {number} usedTokens
 * @param {number} budget
 * @returns {{ level: 'safe'|'warning'|'critical', ratio: number }}
 */
export function assessContextPressure(usedTokens, budget) {
  const ratio = usedTokens / budget;
  if (ratio < 0.7) return { level: 'safe', ratio };
  if (ratio < 0.9) return { level: 'warning', ratio };
  return { level: 'critical', ratio };
}

/**
 * 基于 token 预算裁剪历史消息（从旧到新移除，确保 tool_calls/tool 配对）
 * 返回裁剪后的消息数组 + 被裁剪掉的消息摘要信息
 * @param {Array} messages - 包含 system message 的完整消息数组
 * @param {number} budget - token 预算上限
 * @param {Object} [options]
 * @param {boolean} [options.preserveSystem=true] - 是否保留 system message
 * @param {boolean} [options.generateSummary=true] - 是否生成被裁剪消息的摘要
 * @returns {{ messages: Array, trimmedCount: number, summary: string|null }}
 */
export function trimMessagesByBudget(messages, budget, options = {}) {
  const { preserveSystem = true, generateSummary = true } = options;
  const originalLen = messages.length;

  if (estimateMessagesTokens(messages) <= budget) {
    return { messages: [...messages], trimmedCount: 0, summary: null };
  }

  const systemMsg = preserveSystem && messages[0]?.role === 'system' ? [messages[0]] : [];
  const rest = systemMsg.length ? [...messages.slice(1)] : [...messages];

  const trimmedMessages = [];

  while (rest.length > 0) {
    const currentTokens = estimateMessagesTokens([...systemMsg, ...rest]);
    if (currentTokens <= budget) break;

    const removed = rest.shift();
    trimmedMessages.push(removed);

    // 如果移除的是 assistant(tool_calls)，则后续的 tool 消息也要一并移除
    if (removed?.role === 'assistant' && removed.tool_calls) {
      while (rest.length > 0 && rest[0]?.role === 'tool') {
        trimmedMessages.push(rest.shift());
      }
    }
  }

  const result = [...systemMsg, ...rest];
  const summary = generateSummary ? generateMessagesSummary(trimmedMessages) : null;

  return {
    messages: result,
    trimmedCount: originalLen - result.length,
    summary
  };
}

/**
 * 从被裁剪的消息中生成规则式结构化摘要
 * @param {Array} trimmedMessages - 被裁剪的消息
 * @returns {string|null}
 */
export function generateMessagesSummary(trimmedMessages) {
  if (!trimmedMessages || trimmedMessages.length === 0) return null;

  const summaryParts = [];
  const userQuestions = [];
  const toolCalls = [];

  for (const msg of trimmedMessages) {
    if (msg.role === 'user') {
      const text = typeof msg.content === 'string'
        ? msg.content
        : (Array.isArray(msg.content)
          ? msg.content.filter(c => c.type === 'text').map(c => c.text).join('')
          : '');
      if (text && text.trim()) {
        const question = text.replace(/\[选中内容\]\n[\s\S]*?\n\n\[用户问题\]\n/, '')
          .replace(/\[引用内容\]\n[\s\S]*?\n\n\[用户问题\]\n/, '')
          .replace(/\[选中内容摘要\]\n[\s\S]*?\n\n\[用户问题\]\n/, '')
          .replace(/\[引用内容摘要\]\n[\s\S]*?\n\n\[用户问题\]\n/, '')
          .trim()
          .substring(0, 80);
        if (question) userQuestions.push(question);
      }
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        const name = tc.function?.name || tc.name || t('tokenCounter.unknownTool');
        toolCalls.push(name);
      }
    }
  }

  if (userQuestions.length > 0) {
    summaryParts.push(t('tokenCounter.userQuestion', { question: userQuestions[userQuestions.length - 1] }));
  }
  if (toolCalls.length > 0) {
    // 去重并限制数量
    const uniqueTools = [...new Set(toolCalls)].slice(0, 10);
    summaryParts.push(t('tokenCounter.usedTools', { tools: uniqueTools.join(', ') }));
  }

  if (summaryParts.length === 0) return null;
  return t('tokenCounter.historySummary') + '\n' + summaryParts.join('\n');
}

/**
 * 清洗消息 content 字符串中的非法 Unicode 字符
 * - 替换孤立代理对字符（lone surrogates，由 substring 截断 emoji 等导致）为 U+FFFD
 * - 某些 API 服务端 JSON 解析器（如支持 \x 扩展的解析器）会因非法 Unicode 而解析失败
 * @param {string} str - 原始字符串
 * @returns {string} 清洗后的字符串
 */
function sanitizeContentForApi(str) {
  if (typeof str !== 'string') return str;
  // 匹配：
  // 1. 高位代理 U+D800..U+DBFF 后面没有紧跟低位代理
  // 2. 低位代理 U+DC00..U+DFFF 前面没有高位代理
  // 使用 Unicode property escapes 可读性更好，但兼容性考虑用显式范围
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

const API_ALLOWED_FIELDS = new Set(['role', 'content', 'tool_calls', 'tool_call_id', 'name', 'reasoning_content', 'prefix']);

/**
 * 过滤消息中的内部字段，确保消息格式符合 API 要求
 * 同时扫描并修复 assistant(tool_calls) 与 tool 消息的配对关系
 * @param {Array} messages - 原始消息数组
 * @returns {Array} 过滤后的消息数组
 */
export function filterApiMessages(messages) {
  const filtered = messages.map((msg, index) => {
    const result = {};
    for (const key of API_ALLOWED_FIELDS) {
      if (key in msg) {
        result[key] = msg[key];
      }
    }

    // 清理 multipart content 中 image_url 的内部字段
    // filterApiMessages 负责剥离 original_url（原图 Base64），保留 width/height 供 token 估算
    // 此函数在 token 估算之前调用，width/height 用于 estimateImageTokens 按分辨率精准估算（避免按 Base64 字节高估约 20 倍）
    if (Array.isArray(result.content)) {
      result.content = result.content.map(part => {
        if (part && part.type === 'image_url' && part.image_url) {
          const clean = { url: part.image_url.url };
          if (part.image_url.width != null) clean.width = part.image_url.width;
          if (part.image_url.height != null) clean.height = part.image_url.height;
          return { ...part, image_url: clean };
        }
        // 清洗 text part 中的非法 Unicode 字符
        if (part && part.type === 'text' && typeof part.text === 'string') {
          return { ...part, text: sanitizeContentForApi(part.text) };
        }
        return part;
      });
    }

    // 清洗 content 字符串中的非法 Unicode（如孤立的代理对字符）
    // 防止 substring 截断 emoji 等原因产生的非法字符导致 API 服务端 JSON 解析失败
    if (typeof result.content === 'string') {
      result.content = sanitizeContentForApi(result.content);
    }

    if (result.role === 'tool') {
      if (!result.tool_call_id) {
        logger.warn(`[Background] foundmessage ${index} missing tool_call_id,skipped`, msg);
        return null;
      }
      return result;
    }

    if (result.role === 'assistant' && Array.isArray(result.tool_calls)) {
      result.tool_calls = result.tool_calls.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: tc.function
      }));
    } else if (result.role === 'assistant' && result.tool_calls !== undefined) {
      logger.warn(`[Background] foundmessage ${index} tool_calls  non-group (type: ${typeof result.tool_calls}),cleared`);
      delete result.tool_calls;
    }

    if (result.role === 'assistant' && result.content === null) {
      result.content = '';
    }

    return result;
  }).filter(msg => msg !== null);

  // 扫描并修复 tool_calls/tool 配对：验证 tool_call_id 与 tool_calls[].id 严格匹配
  for (let i = 0; i < filtered.length; i++) {
    const msg = filtered[i];
    if (msg?.role === 'assistant' && msg.tool_calls) {
      // 收集该 assistant 之后连续出现的 tool 消息的 tool_call_id
      const followingToolIds = new Set();
      for (let j = i + 1; j < filtered.length; j++) {
        if (filtered[j].role === 'tool') {
          followingToolIds.add(filtered[j].tool_call_id);
        } else {
          break;
        }
      }

      // 检查 assistant.tool_calls 中的每个 id 是否都有对应的 tool 响应
      const matchedCalls = msg.tool_calls.filter(tc => followingToolIds.has(tc.id));

      if (matchedCalls.length === 0) {
        // 完全没有匹配的 tool 响应 → 清除所有 tool_calls
        logger.warn('[Background] filterApiMessages: ', i, ' assistant message tool_calls  no matchconfig  tool response,cleared');
        delete msg.tool_calls;
        if (!msg.content) {
          filtered.splice(i, 1);
          i--;
        }
      } else if (matchedCalls.length < msg.tool_calls.length) {
        // 部分匹配 → 只保留有响应的 tool_calls
        const unmatched = msg.tool_calls.filter(tc => !followingToolIds.has(tc.id));
        logger.warn('[Background] filterApiMessages: ', i, ' assistant message', unmatched.length, ' tool_call no corresponding response,removed,keep', matchedCalls.length, '');
        msg.tool_calls = matchedCalls;
      }
    }
  }

  return filtered;
}

/**
 * 清理 image_url 中的额外字段，仅保留标准 url 字段
 * 在实际构建 API 请求体时调用，移除 width/height 等所有非标准字段
 * 返回浅拷贝新数组，不修改原数组，不影响后续 token 估算和裁剪逻辑
 * @param {Array} messages - 消息数组
 * @returns {Array} 清理后的消息数组
 */
export function sanitizeImageUrlsForApi(messages) {
  if (!messages || messages.length === 0) return messages;
  return messages.map(msg => {
    if (!msg || !Array.isArray(msg.content)) return msg;
    let contentChanged = false;
    const newContent = msg.content.map(part => {
      if (part && part.type === 'image_url' && part.image_url) {
        contentChanged = true;
        return { type: 'image_url', image_url: { url: part.image_url.url } };
      }
      return part;
    });
    return contentChanged ? { ...msg, content: newContent } : msg;
  });
}

/**
 * 从消息 content 中移除图片数据，仅保留文本部分
 * 用于发送历史消息时避免携带已无用的 Base64 图片
 * @param {string|Array} content - 消息内容
 * @returns {string|Array} 仅含文本的内容
 */
export function stripImagesFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textParts = content.filter(c => c.type === 'text');
    return textParts.length === 1 ? textParts[0].text : textParts;
  }
  return content;
}

/**
 * 从消息 content 中提取纯文本字符串
 * 用于日志、摘要、预筛选、反思等"把 content 当文本用"的场景，
 * 避免把含 Base64 图片的数组 content 直接 JSON.stringify 导致图片数据污染文本
 * - 字符串：原样返回
 * - 数组（多模态）：拼接所有 text part，忽略 image_url 等非文本部分
 * - null/undefined：返回空字符串
 * - 其他对象：JSON.stringify 兜底
 * @param {string|Array|*} content
 * @returns {string}
 */
export function extractTextFromContent(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(part => part && part.type === 'text' && part.text)
      .map(part => part.text)
      .join('\n');
  }
  return JSON.stringify(content);
}

// ============================================================
// 引用内容压缩
// ============================================================

// 引用内容保留的最大 token 数（超过此值的引用将压缩）
const MAX_QUOTED_CONTEXT_TOKENS = 2000;

/**
 * 压缩引用/选中内容，防止大段内容永久占据上下文
 * @param {string} ctx - 原始引用内容
 * @returns {{ compressed: string, wasCompressed: boolean }}
 */
export function compressQuotedContext(ctx) {
  if (!ctx) return { compressed: ctx, wasCompressed: false };
  const tokens = estimateTokens(ctx);
  if (tokens <= MAX_QUOTED_CONTEXT_TOKENS) {
    return { compressed: ctx, wasCompressed: false };
  }
  const truncated = truncateByTokens(ctx, MAX_QUOTED_CONTEXT_TOKENS);
  logger.debug(`[TokenCounter] referenced contentcompress: ${tokens} → ${estimateTokens(truncated)} tokens`);
  return { compressed: truncated, wasCompressed: true };
}
