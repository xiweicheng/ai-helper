// side_panel/selection-scope.js - 划词问答的作用域判定
//
// 独立成模块的原因：AI 回答「全屏阅读」采用节点迁移方案（见 message-fullscreen.js），
// 消息真实节点在全屏期间已不在 #chatContainer 内。若沿用「选区必须在 #chatContainer 里」
// 的判定，全屏里划词既不触发也不显示。该判定被 index.js 的事件绑定与选区校验共用，
// 拆出来可在 jsdom 中直接对迁移后的真实 DOM 断言。

/** 划词作用域容器：聊天区 + AI 回答全屏查看覆盖层正文（与 markdown-render 的 Ctrl+单击同口径） */
export const SELECTION_HOST_SELECTOR = '#chatContainer, .message-fullscreen-body';

/**
 * 节点是否落在划词作用域内
 * @param {Node|null} node - Range 的 anchorNode 或事件 target（文本节点自动回溯到父元素）
 * @returns {boolean}
 */
export function isInSelectionScope(node) {
  if (!node) return false;
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return !!(el && el.closest && el.closest(SELECTION_HOST_SELECTOR));
}
