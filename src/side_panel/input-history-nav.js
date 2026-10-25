// input-history-nav.js - 输入框上下键翻历史的决策
//
// 为什么单独抽出来：判断逻辑有三处边界（首行/末行/是否已在浏览历史），
// 都藏在 index.js 那个上千行的 keydown 里就只能靠读代码保证正确。
// 这里是纯函数、零依赖、零 DOM，可以直接单测。
//
// 三条约定：
// 1. 正常编辑时只在**首行**（↑）/ **末行**（↓）接管 —— 多行草稿里移动光标不能被抢走。
// 2. 已经在浏览历史（index >= 0）时，上下键一律继续翻：历史条目可能是多行，
//    此时光标常常不在首/末行，若还看光标就会“翻到一半翻不动了”。
// 3. ↓ 只有在浏览历史时才有意义。旧实现在 index === -1 时也接管，
//    结果是一份多行草稿按一下 ↓ 就被清空 —— 这条是纯丢用户内容的坑。
//
// 生成中不另设门槛：任务执行时输入框照样能写草稿，翻历史同样该可用。

/**
 * 决定这次 ↑/↓ 要不要由历史接管，以及接管后停在哪一条。
 * @param {{key: string, value?: string, caret?: number, history?: string[], index?: number}} input
 *   caret 直接用 textarea 的 selectionStart（-1/undefined 视为行尾）
 * @returns {{handled: boolean, index?: number, value?: string}}
 *   handled=false 表示放给浏览器原生光标移动；handled=true 时用返回的 index/value 覆盖输入框
 */
export function resolveHistoryNav({ key, value = '', caret, history = [], index = -1 } = {}) {
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return { handled: false };
  if (!Array.isArray(history) || history.length === 0) return { handled: false };

  const text = String(value ?? '');
  const pos = Number.isInteger(caret) && caret >= 0 ? caret : text.length;
  const browsing = Number.isInteger(index) && index >= 0;

  if (key === 'ArrowUp') {
    const onFirstLine = text.lastIndexOf('\n', pos - 1) === -1;
    if (!browsing && !onFirstLine) return { handled: false };
    // 没在浏览就从最新一条开始；已在浏览就在 0 处夹住（到底了不跳回最新，避免和 ↓ 打架）
    const current = browsing ? Math.min(index, history.length - 1) : history.length;
    const next = Math.max(0, current - 1);
    return { handled: true, index: next, value: history[next] };
  }

  // ArrowDown
  if (!browsing) return { handled: false };
  const onLastLine = text.indexOf('\n', pos) === -1;
  if (!onLastLine) return { handled: false };
  const current = Math.min(index, history.length - 1);
  if (current < history.length - 1) {
    const next = current + 1;
    return { handled: true, index: next, value: history[next] };
  }
  // 已在最新一条：再按一次回到空白草稿（与旧行为一致）
  return { handled: true, index: -1, value: '' };
}
