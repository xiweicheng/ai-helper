// shared/goal-intent.js - 目标模式意图识别（确定性正则，零 token、零模型调用）
//
// 为什么不用「注入系统提示词 + 让模型调工具」：
//   ① 判定时机必须在**发请求之前**——要决定的是本次请求用哪种循环策略，工具调用发生在
//      循环内部，那时已经晚了；
//   ② 「要不要进入目标模式」属于控制面决策。Codex 的设计纪律是 pause/resume/clear 只由
//      用户与 runtime 掌握，模型只能声明「完成」；让模型给自己开目标，等于把预算开关交给
//      被考核方。
//
// 因此这里只做「文本 → 是否疑似目标模式请求」的确定性判断，命中后由面板弹一条**可撤销**
// 的提示条（同时点亮开关），用户一眼能看见、一键能关。宁可多提示一次，也不静默接管。
//
// 分两档强度：
//   strong —— 显式说法（按目标模式 / goal mode / 持续执行直到 / 无人值守…），自动点亮开关；
//   weak   —— 隐含句式（直到…全部通过 / 确保…通过），只做提示，不自动开。
// 误判代价不对称：strong 误判 = 用户点一下撤销；weak 误判 = 只多一条提示。
// 意图识别是纯正则层，不依赖 goal.js 的任何运行时函数（只是同属一个功能的两个模块）。
// 强命中：用户明确要求「按目标模式跑」。每条都写成「动词/介词 + 目标模式」或行业惯用语，
// 避免只提到「目标模式」四个字（例如「目标模式是怎么实现的」）就被误判。
export const GOAL_INTENT_STRONG_PATTERNS = [
  // 中文：按/以/用/按照/走 + 目标模式（goal 模式）
  /(?:按|按照|以|用|走|使用|开启|启用|切换?到)\s*(?:goal|目标)\s*模式/i,
  // 中文：进入/改成/设为 + 目标模式
  /(?:进入|改成|改为|设为|设置为|切换到)\s*(?:goal|目标)\s*模式/i,
  // 英文：goal mode
  /\b(?:in|use|using|enable|enter|switch\s+to|with)\s+(?:the\s+)?goal\s+mode\b/i,
  // 无人值守 / 一直跑到完成这类显式「不许提前收工」的表述
  /(?:无人值守|不用管我|别停下来|不要停|直到(?:我|你)(?:叫停|喊停))/,
  /\bunattended\b|\bwithout\s+(?:me|supervision)\b|\bdon'?t\s+stop\s+until\b/i,
  // 持续执行直到 / 一直做到 / 跑到完成
  /(?:持续|一直|连续)(?:执行|跑|做|干|尝试|迭代)\s*(?:到|直到)/,
  /(?:跑到|做到|干到|做到)(?:完成|通过|结束|成功)/,
  /\bkeep\s+(?:working|going|trying|iterating)\s+until\b/i,
  /\brun\s+until\s+(?:done|complete|passing|it\s+passes)\b/i,
];

// 弱命中：隐含「要一直做到达成」的句式。只提示，不自动开。
export const GOAL_INTENT_WEAK_PATTERNS = [
  /直到\s*[^。；;\n]{1,40}?(?:全部|都)?(?:通过|完成|跑通|变绿)/,
  /(?:确保|保证)\s*[^。；;\n]{1,40}?(?:通过|跑通|可用)/,
  /\buntil\s+[^.;\n]{1,40}?(?:pass|passes|green|works)\b/i,
];

// 否定上下文：命中点前若紧跟这些词，说明用户在「关掉/别用」目标模式，不能反向点亮开关。
// 末尾的单字「不/别」必须留：正则命中的是「按目标模式」这类片段，否定词天然落在匹配之外
// （「这次不按目标模式」里匹配从「按」开始，前缀只剩「这次不」），没有单字兜底就会误开目标。
const NEGATION_PREFIX = /(?:不要|不用|不必|无需|取消|关闭|停用|停止|退出|不按|不以|别|不)\s*$/;

// 扫描窗口：意图只可能出现在开头或指令部分，超长粘贴（贴代码/日志）不应拉高误判概率。
const SCAN_CHARS = 2000;

function collectMatches(text, patterns, negationAware) {
  const found = [];
  for (const re of patterns) {
    // 用 exec 循环取所有命中：同一句话里可能出现多次
    const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
    const gre = new RegExp(re.source, flags);
    let m;
    while ((m = gre.exec(text)) !== null) {
      if (m[0].length === 0) break; // 防零宽匹配死循环
      const before = text.slice(Math.max(0, m.index - 8), m.index);
      if (negationAware && NEGATION_PREFIX.test(before)) continue;
      found.push(m[0].trim());
      if (m[0].length === 0) break;
    }
  }
  return found;
}

/**
 * 判断一段用户输入是否在要求「按目标模式执行」。
 *
 * @param {string} text 用户原始输入
 * @returns {{detected:boolean, strength:'strong'|'weak'|'none', matches:string[]}}
 *   detected 仅在 strong 命中时为 true —— 调用方据此自动点亮开关；
 *   strength='weak' 时只弹一条提示（不碰开关，也不剥任何字）。
 */
export function detectGoalIntent(text) {
  const none = { detected: false, strength: 'none', matches: [] };
  if (typeof text !== 'string') return none;
  const body = text.trim();
  if (!body) return none;
  const scoped = body.slice(0, SCAN_CHARS);

  const strong = collectMatches(scoped, GOAL_INTENT_STRONG_PATTERNS, true);
  if (strong.length > 0) {
    return {
      detected: true,
      strength: 'strong',
      matches: dedupe(strong).slice(0, 3),
    };
  }

  const weak = collectMatches(scoped, GOAL_INTENT_WEAK_PATTERNS, true);
  if (weak.length > 0) {
    return {
      detected: false,
      strength: 'weak',
      matches: dedupe(weak).slice(0, 3),
    };
  }
  return none;
}

function dedupe(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * 从用户输入里剥掉「按目标模式执行」这类元指令，剩下的才是真正的目标描述。
 * 只剥精确命中的片段，不动其余内容；剥完为空则退回原文（宁可目标写得啰嗦，
 * 也不能因为剥空而判「没有目标」）。
 *
 * @param {string} text
 * @returns {string}
 */
export function stripGoalIntentPhrases(text) {
  if (typeof text !== 'string') return '';
  let out = text;
  const phrases = collectMatches(text.slice(0, SCAN_CHARS), GOAL_INTENT_STRONG_PATTERNS, true);
  for (const p of phrases) {
    if (!p) continue;
    out = out.replace(p, ' ');
  }
  out = out.replace(/^[\s，,。.、:：;；-]+/, '').trim();
  return out || text.trim();
}
