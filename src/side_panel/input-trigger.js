// input-trigger.js - 输入框 @ / $ 触发符检测（纯函数，便于单测）
//
// 只根据「光标之前」的文本判定：触发符必须在词首（行首 / 空格 / 起始之后），
// 且从触发符到光标之间没有空格或换行（输入空格 / 换行表示本次匹配结束）。
// 光标之后的文本（例如下方已有的多行内容）不参与判定——旧实现用
// value.substring(index + 1) 一直取到文末，下方只要出现换行 / 空格就会把
// 触发符判为无效，导致“下面已有内容时，在上面输入 @ / $ / 触发不了弹框”。

const TRIGGER_CHARS = { '/': 'slash', '@': 'at', $: 'dollar' };

/**
 * @param {{ value: string, caret: number }} param0
 * @returns {{ key: 'slash'|'at'|'dollar', index: number, filterText: string } | null}
 */
export function resolveActiveTrigger({ value, caret }) {
  if (typeof value !== 'string') return null;
  const pos = typeof caret === 'number' && caret >= 0 && caret <= value.length
    ? caret
    : value.length;
  // 只看光标之前的内容，光标之后的文本与当前是否在输入触发符无关
  const beforeCaret = value.substring(0, pos);

  let active = null;
  for (const ch of Object.keys(TRIGGER_CHARS)) {
    const index = beforeCaret.lastIndexOf(ch);
    if (index === -1) continue;
    // 触发符必须在词首：起始位置，或前一个字符是空格 / 换行
    if (index !== 0) {
      const prev = value[index - 1];
      if (prev !== ' ' && prev !== '\n') continue;
    }
    // 触发符到光标之间不能有空格 / 换行，否则本次匹配已结束
    const between = value.substring(index + 1, pos);
    if (between.includes(' ') || between.includes('\n')) continue;
    const candidate = { key: TRIGGER_CHARS[ch], index, filterText: between };
    // 多个触发符同时有效时，取位置最靠后的一个
    if (!active || candidate.index > active.index) active = candidate;
  }
  return active;
}

/**
 * 用 replacement 替换光标前最近的「指定触发符 + 过滤文本」token，
 * token 之前与光标之后的所有内容（包括其他行）一律保留。
 * 常用于选中条目后把 /code 原地替换为提示词正文。
 * @param {string} value
 * @param {number} caret
 * @param {'slash'|'at'|'dollar'} [key] - 限定触发符类型；不传则匹配任意有效触发符
 * @param {string} replacement
 * @returns {{ value: string, caret: number } | null} 无匹配触发符时返回 null
 */
export function replaceActiveTrigger(value, caret, key, replacement) {
  const trig = resolveActiveTrigger({ value, caret });
  if (!trig || (key && trig.key !== key)) return null;
  const newValue = value.substring(0, trig.index) + replacement + value.substring(caret);
  return { value: newValue, caret: trig.index + replacement.length };
}

/**
 * 移除光标前最近的「指定触发符 + 过滤文本」token，其余内容原样保留。
 * 常用于选中 @ 网页 / 知识库 / $ 文件后，只清掉触发文本而不动用户写的其他行。
 * @returns {{ value: string, caret: number } | null}
 */
export function stripActiveTrigger(value, caret, key) {
  return replaceActiveTrigger(value, caret, key, '');
}
