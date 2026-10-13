// shared/compaction-prompt.js - 压缩摘要的素材限量与提示词构建（纯函数，无外部依赖）
// 侧边栏收集素材与 background 构建请求共用同一套限量口径。

// 单条素材消息在提示词中保留的最大字符数
const MATERIAL_MAX_CHARS = 4000;
// 素材总字符上限（超出时从最早素材开始丢弃，保留最近内容）
const MATERIAL_TOTAL_MAX_CHARS = 80000;

export { MATERIAL_MAX_CHARS, MATERIAL_TOTAL_MAX_CHARS };

/**
 * 清洗单条素材消息内容为受控长度字符串
 */
export function sanitizeMaterialContent(content) {
  if (content === null || content === undefined) return '';
  const text = typeof content === 'string' ? content : JSON.stringify(content) ?? '';
  if (text.length <= MATERIAL_MAX_CHARS) return text;
  return text.substring(0, MATERIAL_MAX_CHARS) + '…[已截断]';
}

// 结构化摘要的小节标题：固定四节，供注入与长期记忆切分复用
export const COMPACTION_SECTION_HEADINGS = {
  zh: ['任务目标', '已完成与关键结论', '关键标识符', '未决问题与下一步'],
  en: ['Task goal', 'Completed & key conclusions', 'Key identifiers', 'Open questions & next steps']
};

// 指令块按语言选取；未知语言回落 zh（与 resolveSummaryLang 同一口径）
const INSTRUCTIONS = {
  zh: `你是一个对话上下文压缩助手。下面是用户与 AI 助手之前的对话内容，请将其压缩为一份结构化中文摘要，供后续对话继续使用。

输出必须且只包含以下四个小节，逐节使用给定标题作为行首：
1. 任务目标：用户的当前目标与最新诉求（一句话）。
2. 已完成与关键结论：已达成的结论与决策，条目化。
3. 关键标识符：必须原样保留的文件路径、代码符号、数据值、实体名称、URL，条目化。
4. 未决问题与下一步：未完成事项与建议的下一步，条目化。

要求：
- 省略：寒暄、重复表述、中间推理过程、已被推翻的方案。
- 若素材中包含【已有摘要】条目，它是对更早历史的既有摘要，请把其中仍然有效的信息合并进新摘要，不得丢弃。
- 全文控制在 600 字以内。
- 直接输出四个小节，不要任何前缀说明（如"以下是摘要"）。`,
  en: `You are a context compaction assistant. Compact the following conversation between the user and an AI assistant into a structured English summary for continued use.

The output must contain exactly these four sections, each starting with the given heading:
1. Task goal: the user's current objective and latest request (one sentence).
2. Completed & key conclusions: decisions and outcomes reached, as bullets.
3. Key identifiers: file paths, code symbols, data values, entity names, URLs that must be kept verbatim, as bullets.
4. Open questions & next steps: unfinished items and the suggested next step, as bullets.

Rules:
- Omit: small talk, repetition, intermediate reasoning, and superseded approaches.
- If the material contains an 【已有摘要】 entry, it is an existing summary of earlier history; merge every still-valid fact into the new summary instead of dropping it.
- Keep the summary under 400 words.
- Output only the four sections, with no preamble such as "Here is the summary".`
};

/**
 * 构建压缩提示词
 * @param {Array<{role: string, content: string}>} material - 素材（若含【已有摘要】条目应置于最前）
 * @param {'zh'|'en'} [lang] - 摘要目标语言，未知值回落 zh
 * @returns {string}
 */
export function buildCompactionPrompt(material, lang = 'zh') {
  const lines = (material || []).map(m => {
    const roleLabel = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : (m.role || 'Unknown');
    return `[${roleLabel}]\n${sanitizeMaterialContent(m.content)}`;
  });

  // 总长控制：从最新往旧保留，保证最近内容优先进入提示词
  let total = 0;
  const kept = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    total += lines[i].length;
    if (total > MATERIAL_TOTAL_MAX_CHARS && kept.length > 0) break;
    kept.unshift(lines[i]);
  }

  const instructions = INSTRUCTIONS[lang] || INSTRUCTIONS.zh;
  return `${instructions}

对话内容：
${kept.join('\n\n')}`;
}
