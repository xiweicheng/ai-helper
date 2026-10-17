// agent/src/memory/injection.js - 记忆分级注入策略（纯函数、零依赖，便于单测）
// 三级加载：
//   Tier1 常驻   importance ≥ alwaysInjectImportance 无条件注入（不占预算）
//   Tier2 预算内 其余按 calcMemoryValue 降序在预算内填充（装不下的跳过继续尝试）
//   Tier3 按需   未注入的转由系统提示词索引行引导 agent_memory recall 检索

export const MEMORY_INJECTION_CONFIG = {
  alwaysInjectImportance: 8, // Tier1 常驻阈值（importance ≥ 此值不占预算）
  budgetChars: 1500,         // Tier2 字符预算（content + 标签 + 渲染开销近似）
  budgetCount: 12,           // Tier2 条数预算
  itemOverheadChars: 50,     // 每条渲染开销近似（序号、[重要性: N]、(标签: ...)）
  maxTopicTags: 8,           // 索引提示最多展示的主题标签数
  maxTagLength: 12,          // 单个主题标签最大长度（超出截断）
  tier1MaxChars: 500,        // Tier1 常驻单条长度上限（P1-3：防大载荷永久驻留 system prompt）
};

/**
 * 计算记忆价值分数（用于淘汰判断与注入排序）
 * 迁移自 tool-memory.js（单一来源），行为不变：
 * value = importance × (1 + ln(访问次数 + 1)) × 时间衰减
 */
export function calcMemoryValue(memory, now) {
  const importance = memory.importance || 5;
  const accessCount = memory.accessCount || 0;
  const createdAt = new Date(memory.createdAt).getTime();
  const ageDays = (now - createdAt) / (1000 * 60 * 60 * 24);

  // 时间衰减因子
  let decay;
  if (ageDays <= 7) decay = 1.0;
  else if (ageDays <= 30) decay = 0.8;
  else if (ageDays <= 90) decay = 0.5;
  else decay = 0.2;

  return importance * (1 + Math.log(accessCount + 1)) * decay;
}

/**
 * 单条记忆注入成本近似（字符）
 */
function estimateInjectionCost(memory, config) {
  const contentLen = typeof memory.content === 'string' ? memory.content.length : 0;
  const tagsLen = Array.isArray(memory.tags) ? memory.tags.join(', ').length : 0;
  return contentLen + tagsLen + config.itemOverheadChars;
}

/**
 * 收集未注入记忆的主题标签索引：
 * 去重 → 频率降序（同频按首现顺序）→ 截断数量与单标签长度
 */
function collectRemainingTags(remainingFacts, summaries, config) {
  const counts = new Map();
  const firstSeen = new Map();
  let seq = 0;
  const addTags = (item) => {
    if (!Array.isArray(item.tags)) return;
    for (const raw of item.tags) {
      const tag = String(raw ?? '').trim();
      if (!tag) continue;
      if (!counts.has(tag)) {
        counts.set(tag, 0);
        firstSeen.set(tag, seq++);
      }
      counts.set(tag, counts.get(tag) + 1);
    }
  };
  for (const m of remainingFacts) addTags(m);
  for (const m of summaries) addTags(m);

  return [...counts.keys()]
    .sort((a, b) => (counts.get(b) - counts.get(a)) || (firstSeen.get(a) - firstSeen.get(b)))
    .slice(0, config.maxTopicTags)
    .map(tag => (tag.length > config.maxTagLength ? tag.slice(0, config.maxTagLength) : tag));
}

/**
 * 三级筛选：选出注入系统提示词的记忆
 * @param {Array} facts - 事实记忆数组（原文件顺序）
 * @param {Array} summaries - 摘要记忆数组（永不注入，仅计入按需召回）
 * @param {object} [config] - 注入配置
 * @param {number} [now] - 当前时间戳（测试注入用）
 * @returns {{injected: Array, remainingCount: number, remainingTags: string[]}}
 */
export function selectMemoriesForInjection(facts, summaries, config = MEMORY_INJECTION_CONFIG, now = Date.now()) {
  const factList = Array.isArray(facts) ? facts : [];
  const summaryList = Array.isArray(summaries) ? summaries : [];
  const threshold = config.alwaysInjectImportance;

  // Tier1：常驻（不占预算），内部按价值降序。
  // P1-3 来源分级：仅 origin==='user'（用户在面板手动新建/编辑）可进永久常驻；
  // origin 缺失（旧数据）或 'model'（模型经工具/自动压缩写入）一律降入 Tier2/Tier3——
  // 即便模型把投毒记忆的 importance 顶到 ≥8 也无法常驻，只能按需/预算召回。
  // 单条长度 > tier1MaxChars 也不进 Tier1（防大载荷永久驻留）；未配置该字段时不限制（自定义 config 兼容）。
  const tier1MaxChars = config.tier1MaxChars ?? Infinity;
  const isTier1Eligible = (m) =>
    m.origin === 'user'
    && (m.importance || 5) >= threshold
    && (typeof m.content === 'string' ? m.content.length <= tier1MaxChars : false);
  const tier1 = factList
    .filter(isTier1Eligible)
    .sort((a, b) => calcMemoryValue(b, now) - calcMemoryValue(a, now));
  const tier1Set = new Set(tier1);

  // Tier2：剩余按价值降序，在预算内贪心填充（装不下的跳过，继续尝试后续小条目）
  const tier2Pool = factList
    .filter(m => !tier1Set.has(m))
    .sort((a, b) => calcMemoryValue(b, now) - calcMemoryValue(a, now));

  const injected = [...tier1];
  let usedChars = 0;
  let usedCount = 0;
  for (const m of tier2Pool) {
    if (usedCount >= config.budgetCount) break;
    const cost = estimateInjectionCost(m, config);
    if (usedChars + cost > config.budgetChars) continue;
    injected.push(m);
    usedChars += cost;
    usedCount++;
  }

  // Tier3：未注入的 facts + 全部 summaries 转按需召回
  const injectedSet = new Set(injected);
  const remainingFacts = factList.filter(m => !injectedSet.has(m));
  const remainingCount = remainingFacts.length + summaryList.length;
  const remainingTags = collectRemainingTags(remainingFacts, summaryList, config);

  return { injected, remainingCount, remainingTags };
}
