// src/side_panel/voice-draft-items.js - 语音草稿的句表纯函数
//
// 为什么拆出来：voice-input.js 已经 1100+ 行，而这几个算法要能被单测精确覆盖。
//
// 为什么句表而不是单区间：句级精修要能「回头只改那一句」，单区间做不到；
// 而用户的编辑权限又必须精确到句（改了一句话，只有那句不该再被模型改写）。

const PUNCT = /[\p{P}\p{S}]/gu;

/**
 * 句表拼成整段文本
 * @param {Array<{id:number|null,text:string,state:string}>} items
 * @returns {string}
 */
export function buildDraftText(items) {
  if (!Array.isArray(items)) return '';
  return items.map((i) => (i && i.text) || '').join('');
}

/**
 * 去掉标点与空白，只留可比对的字符
 * @param {string} s
 * @returns {string}
 */
export function stripPunct(s) {
  return String(s || '').replace(/[\s\u3000]/g, '').replace(PUNCT, '');
}

/**
 * 替换某一句的文本
 * 只认服务端下发的 id（>=1）：开放句 id 是 null，按 id 替换会误伤。
 * @param {Array<{id:number|null,text:string,state:string}>} items
 * @param {{id:number, text:string}} patch
 */
export function applySentence(items, patch) {
  if (!Array.isArray(items)) return items;
  const id = patch && patch.id;
  const text = patch && typeof patch.text === 'string' ? patch.text : null;
  if (text === null || typeof id !== 'number') return items;
  let hit = false;
  const next = items.map((item) => {
    if (!item || item.id !== id || item.state === 'locked') return item;
    hit = true;
    return { ...item, text };
  });
  return hit ? next : items;
}

/**
 * 用户手改归位：用「公共前缀 + 公共后缀」确定改动区间，映射回句子
 * @param {Array} items
 * @param {string} beforeText 改动前的草稿全文
 * @param {string} afterText  改动后的输入框全文（仅草稿块部分）
 * @returns {{lockedIds: Array<number|null>, shift: number}} shift = 草稿块起点之前插入的长度
 */
export function locateEdit(items, beforeText, afterText) {
  const before = String(beforeText || '');
  const after = String(afterText || '');
  if (before === after || !Array.isArray(items) || items.length === 0) {
    return { lockedIds: [], shift: 0 };
  }

  // 公共前缀
  let p = 0;
  const maxP = Math.min(before.length, after.length);
  while (p < maxP && before[p] === after[p]) p++;

  // 公共后缀（不与前缀重叠）
  let s = 0;
  const maxS = Math.min(before.length - p, after.length - p);
  while (s < maxS && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;

  const changedFrom = p;
  const changedTo = before.length - s; // 改动区间 [changedFrom, changedTo)

  // 改动纯追加在草稿块之后：不算手改，不锁句
  if (changedFrom >= before.length && changedTo >= before.length) {
    return { lockedIds: [], shift: 0 };
  }

  // 有交集的句子即被用户改过
  const lockedIds = [];
  let pos = 0;
  for (const item of items) {
    const len = (item && item.text ? item.text : '').length;
    if (changedFrom < pos + len && changedTo > pos) lockedIds.push(item.id);
    pos += len;
  }

  // 没碰到任何句、且改动从块首开始 => 是草稿块之前插了字，返回长度偏移
  const shift = lockedIds.length === 0 && changedFrom === 0 ? after.length - before.length : 0;
  return { lockedIds, shift };
}

/**
 * 整段结果与逐句结果缝合：字词取整段、断句取逐句
 *
 * 实测依据：两路字词差异最大 1 字（它/他），但整段会把 4 句串成 2 个句号。
 * 所以默认只替换字符、不动标点；差异超阈值才判定「逐句出了实质问题」并整段接管。
 *
 * @param {Array} items
 * @param {string} finalText 整段重转结果
 * @returns {{items: Array, changed: number, takeAll: boolean}}
 */
export function mergeRefined(items, finalText) {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: Array.isArray(items) ? items : [], changed: 0, takeAll: false };
  }
  const draft = buildDraftText(items);
  const final = String(finalText || '');
  if (!final) return { items, changed: 0, takeAll: false };

  const a = stripPunct(draft);
  const b = stripPunct(final);
  if (a === b) return { items, changed: 0, takeAll: false };

  // 差异超阈值：逐句结果漏句/串句，整段接管（lock 句也丢，否则会重复）
  const diff = Math.abs(a.length - b.length) + countMismatch(a, b);
  if (diff > 2 || a.length !== b.length) {
    const firstId = items[0] && typeof items[0].id === 'number' ? items[0].id : null;
    return { items: [{ id: firstId, text: final, state: 'refined' }], changed: 1, takeAll: true };
  }

  // 差异 ≤ 2 字符且等长：逐个把 final 的字符缝回 draft 的非标点位置
  const chars = draft.split('');
  let idx = 0; // 非标点字符序号
  let changed = 0;
  for (let i = 0; i < chars.length; i++) {
    if (stripPunct(chars[i]) === '') continue; // 标点不动
    if (idx < b.length && chars[i] !== b[idx]) {
      chars[i] = b[idx];
      changed += 1;
    }
    idx += 1;
  }
  if (changed === 0) return { items, changed: 0, takeAll: false };

  // 长度不变，按原句长度切回落回；locked 句原样保留
  const merged = chars.join('');
  let pos = 0;
  const next = items.map((item) => {
    const len = (item && item.text ? item.text : '').length;
    const text = item && item.state === 'locked' ? item.text : merged.slice(pos, pos + len);
    pos += len;
    return item && item.state === 'locked' ? item : { ...item, text };
  });
  return { items: next, changed, takeAll: false };
}

/** 同长度时统计位置不一致的字符数 */
function countMismatch(a, b) {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n += 1;
  return n;
}
