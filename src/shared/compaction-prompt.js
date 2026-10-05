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

/**
 * 构建压缩提示词
 * @param {Array<{role: string, content: string}>} material - 素材（若含【已有摘要】条目应置于最前）
 * @returns {string}
 */
export function buildCompactionPrompt(material) {
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

  return `你是一个对话上下文压缩助手。下面是用户与 AI 助手之前的对话内容，请将其压缩为一份结构化中文摘要，供后续对话继续使用。

要求：
1. 保留：用户的当前任务目标与最新诉求、已达成的关键结论与决策、重要的文件路径/代码/数据/实体名称、未完成事项与下一步。
2. 省略：寒暄、重复表述、中间推理过程、已被推翻的方案。
3. 若素材中包含【已有摘要】条目，它是对更早历史的既有摘要，请将其内容与后续对话合并为一份新摘要（不要丢弃其中仍然有效的信息）。
4. 直接输出摘要正文，不要任何前缀说明（如"以下是摘要"）。

对话内容：
${kept.join('\n\n')}`;
}
