// agent/src/rag/keyword-match.js - 关键词片段化匹配的纯函数（知识库与长期记忆共用）
// 拆出本模块的原因：两侧原本各写一套匹配。知识库在 2026-09 就修掉了「英文子串误伤」
// （rag 命中 storage）与「中文整段失配」两类缺陷，而记忆侧一直沿用更早的碎 bigram 方案，
// 于是同一条 query 在两个子系统里的命中口径完全不同。共用一份实现，杜绝再次漂移。
//
// 语义约束（改动前必读）：
//   - 英文/数字按词边界判定，CJK 相邻视为边界；
//   - 中文取「最长命中片段」，且 2 字片段命中必蕴含更长片段的命中，故先做 2 字预检；
//   - 单元数只按长度分层（L=2 → 1，L=3 → 2，L≥4 → 3 顶格），不做出现次数累加；
//   - 本模块只负责「匹配」，df 统计与抬分属各调用方自己的刻度（知识库 [0,1]、记忆整数），不在此处。

export const KEYWORD_MIN_LEN = 2;          // 命中单元最小长度（单字符匹配噪声过大）
export const KEYWORD_MAX_FRAGMENT_LEN = 4; // 中文最长匹配窗口（≥4 字命中已顶格 3 单元，无需更长窗口）
export const KEYWORD_MAX_HITS = 3;         // 计分单元总数上限（防止长查询过度加分）

/**
 * 从查询中提取关键词（英文/数字按分隔符成段；中文取连续段）
 * 说明：不引入分词依赖——中文长段由 matchCjk 按最长命中片段降级匹配，
 * 本函数只负责切段与小写去重
 * @param {string} query
 * @returns {string[]} 小写去重后的关键词
 */
export function extractKeywords(query) {
  const parts = String(query || '').toLowerCase().split(/[^a-z0-9\u4e00-\u9fff]+/);
  const seen = new Set();
  const keywords = [];
  for (const p of parts) {
    if (p.length >= KEYWORD_MIN_LEN && !seen.has(p)) {
      seen.add(p);
      keywords.push(p);
    }
  }
  return keywords;
}

/**
 * 将关键词段拆分为带类型的命中单元：英文/数字段与中文段分开处理
 * 段内非 [a-z0-9] 的字符必为汉字（切分阶段已剔除其他字符），无需引入 Unicode 转义
 * @param {string} query
 * @returns {{latin: string[], cjk: string[]}} 小写去重后的单元列表
 */
export function extractQueryTerms(query) {
  const latin = [];
  const cjk = [];
  const seenLatin = new Set();
  const seenCjk = new Set();
  for (const seg of extractKeywords(query)) {
    for (const run of seg.match(/[a-z0-9]+|[^a-z0-9]+/g) || []) {
      if (run.length < KEYWORD_MIN_LEN) continue;
      if (/^[a-z0-9]+$/.test(run)) {
        if (!seenLatin.has(run)) {
          seenLatin.add(run);
          latin.push(run);
        }
      } else if (!seenCjk.has(run)) {
        seenCjk.add(run);
        cjk.push(run);
      }
    }
  }
  return { latin, cjk };
}

/**
 * 英文/数字：词边界匹配（前后须为非字母数字；CJK 相邻视为边界）
 * @param {string} text 已小写的待匹配文本
 * @param {string[]} latin 拉丁/数字单元
 * @returns {string[]} 命中的单元
 */
export function matchLatin(text, latin) {
  if (!latin || latin.length === 0) return [];
  const bounded = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
  return latin.filter(term => bounded.includes(' ' + term + ' '));
}

/**
 * 中文：文本内此段的最长命中片段
 * @param {string} text 已小写的待匹配文本
 * @param {string} seg 一个连续中文段
 * @returns {{keys: string[], units: number} | null} 无 2 字片段命中时为 null；
 *          units = min(bestLen - 1, KEYWORD_MAX_HITS)
 */
export function matchCjk(text, seg) {
  const hay = String(text || '').toLowerCase();
  if (!hay || !seg || seg.length < KEYWORD_MIN_LEN) return null;

  // 2 字片段预检：更长片段的命中必蕴含其 2 字子串命中，全未命中即可跳过
  const keys2 = new Set();
  for (let i = 0; i + 2 <= seg.length; i++) {
    const frag = seg.slice(i, i + 2);
    if (hay.includes(frag)) keys2.add(frag);
  }
  if (keys2.size === 0) return null;

  const maxLen = Math.min(seg.length, KEYWORD_MAX_FRAGMENT_LEN);
  let bestKeys = keys2;
  let bestLen = 2;
  for (let len = maxLen; len >= 3; len--) {
    const keys = new Set();
    for (let i = 0; i + len <= seg.length; i++) {
      const frag = seg.slice(i, i + len);
      if (hay.includes(frag)) keys.add(frag);
    }
    if (keys.size > 0) {
      bestKeys = keys;
      bestLen = len;
      break;
    }
  }
  // 命中越长计分单元越多（L=2 → 1 单元；L≥4 顶格 3 单元）
  return { keys: [...bestKeys], units: Math.min(bestLen - 1, KEYWORD_MAX_HITS) };
}
