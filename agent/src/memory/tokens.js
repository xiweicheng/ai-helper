// agent/src/memory/tokens.js - 记忆召回的关键词提取（单一来源）
// 逐字平移自 service.js（其原件为扩展端 tool-memory.js:407-465），语义不得变更：
// CJK ≤4 字连续段整段保留、>4 字拆 bigram，同时把清洗后的整段作为 fallback 关键词；
// 英文/数字整词（长度 ≥2）；过滤停用词；最多 KEYWORD_CAP 个。
// 拆成独立模块是为了让后续的向量通道（embedding/tier）与 recall 复用同一份分词，避免两边漂移。

export const KEYWORD_CAP = 30;

// 截断长度：避免超长输入的 bigram 膨胀
export const SNIPPET_MAX_LENGTH = 200;

// 停用词列表：常见中英文虚词，避免噪音匹配（迁移自 tool-memory.js:407-419）
export const STOP_WORDS = new Set([
  '的', '是', '了', '在', '我', '你', '他', '她', '它', '们', '这', '那', '不', '也', '就',
  '都', '会', '要', '能', '可', '把', '被', '让', '给', '对', '从', '到', '和', '与', '或',
  '但', '而', '还', '又', '只', '很', '更', '最', '有', '没', '吗', '呢', '吧', '啊',
  '什么', '怎么', '为什么', '哪里', '哪个', '多少',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'shall', 'must', 'need', 'dare',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'into',
  'and', 'or', 'not', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
  'so', 'no', 'up', 'out', 'just', 'now', 'here', 'there', 'all', 'each', 'every'
]);

/**
 * 中英文混合关键词提取（迁移自 tool-memory.js:427-465）
 * - CJK 短文本（≤4字）：整段作为关键词保留，如"考试"→["考试"]
 * - CJK 长文本（>4字）：bigram 提取 + 整段作为 fallback 关键词
 * - 英文/数字：保持完整单词
 */
export function extractKeywords(text) {
  // 原实现依赖调用方（recall）先判空，独立成模块后补一道假值保护：不改变任何现有可达行为
  if (!text) return [];
  const clean = String(text).toLowerCase().trim();
  if (!clean) return [];
  // 取前 200 字符避免 bigram 膨胀
  const snippet = clean.length > SNIPPET_MAX_LENGTH ? clean.slice(0, SNIPPET_MAX_LENGTH) : clean;
  // 按语义边界拆分：CJK 连续块 | 字母连续块 | 数字连续块 | 分隔符
  const segments = snippet.split(/([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+|[a-z]+|\d+|[^a-z\d\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+)/i);

  const tokens = [];
  // 先将整段作为 fallback 关键词加入
  if (snippet.length >= 2) {
    tokens.push(snippet);
  }

  for (const seg of segments) {
    if (!seg || seg.trim().length === 0) continue;

    if (/^[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+$/.test(seg)) {
      // CJK 字符块
      if (seg.length <= 4) {
        // 短文本：整段作为关键词
        tokens.push(seg);
      } else {
        // 长文本：滑动窗口取二元组
        for (let i = 0; i <= seg.length - 2; i++) {
          tokens.push(seg.substring(i, i + 2));
        }
      }
    } else if (/^[a-z\d]+$/.test(seg)) {
      // 英文/数字：保持完整单词
      if (seg.length >= 2) {
        tokens.push(seg);
      }
    }
  }
  // 去重、过滤停用词、限制最多 30 个关键词（避免膨胀）
  return [...new Set(tokens)]
    .filter(k => k.length >= 1 && !STOP_WORDS.has(k))
    .slice(0, KEYWORD_CAP);
}
