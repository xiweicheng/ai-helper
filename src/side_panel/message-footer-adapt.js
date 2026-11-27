// side_panel/message-footer-adapt.js - AI 回复底部工具栏溢出探测自适应
//
// 与输入底行（toolbar-adapt.js）同一思路：固定断点对不上真实可用宽度。
// 此前用 @media (max-width: 420px) 按视口宽度隐藏文字，但消息区的实际宽度会
// 被会话栏、工作区分栏等压缩，且中英文案长度差异明显——结果就是文字还在、
// 按钮被压成两行，右侧图标被挤出可视区。这里改为按条实测，逐级降级：
//   ① footer-compact        复制/引用/全屏/导出 只留图标，间距收紧
//   ② footer-compact-ultra  再收起 token 消耗标签
//   ③ footer-wrap           仍放不下则允许换行，宁可两行也不裁掉按钮
// 测量在 rAF 中批量进行：先统一清类、统一读一次 scrollWidth（一次布局），
// 再统一加类，避免逐条强制重排；容器宽度变化与新增消息后重测。

const COMPACT = 'footer-compact';
const ULTRA = 'footer-compact-ultra';
const WRAP = 'footer-wrap';
const MEASURING = 'footer-measuring';

let rafId = 0;

/** rAF 节流：合并拖拽缩放与批量插入消息期间的高频触发 */
function scheduleMessageFooterAdapt() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    adaptMessageFooters();
  });
}

/** 底部工具栏相关变更：自身被插入，或（异步）增删了其中的按钮/角标 */
function isFooterMutation(mutation) {
  if (mutation.target.nodeType === 1 && mutation.target.closest('.message-footer')) return true;
  for (const node of mutation.addedNodes) {
    if (node.nodeType !== 1) continue;
    if (node.classList?.contains('message-footer') || node.querySelector?.('.message-footer')) return true;
    if (node.closest?.('.message-footer')) return true;
  }
  return false;
}

/** 按条实测：空间不足时逐级降级，避免标签折行与右侧图标被裁剪 */
export function adaptMessageFooters() {
  const container = document.getElementById('chatContainer');
  if (!container) return;
  const footers = container.querySelectorAll('.message.assistant .message-footer');
  if (!footers.length) return;

  // 测量期间禁用过渡，并从完整布局开始（空间恢复时才能还原）
  footers.forEach((footer) => {
    footer.classList.add(MEASURING);
    footer.classList.remove(COMPACT, ULTRA, WRAP);
  });
  try {
    // 第一次读取强制布局，之后同一轮内的 scrollWidth 直接命中缓存
    let overflowing = [...footers].filter((f) => f.clientWidth > 0 && f.scrollWidth > f.clientWidth);
    overflowing.forEach((f) => f.classList.add(COMPACT));

    overflowing = overflowing.filter((f) => f.scrollWidth > f.clientWidth);
    overflowing.forEach((f) => f.classList.add(ULTRA));

    overflowing = overflowing.filter((f) => f.scrollWidth > f.clientWidth);
    overflowing.forEach((f) => f.classList.add(WRAP));
  } finally {
    footers.forEach((footer) => footer.classList.remove(MEASURING));
  }
}

/** 初始化：首次测量 + 宽度变化/新增消息后重测 */
export function initMessageFooterAdaptive() {
  const container = document.getElementById('chatContainer');
  if (!container) return;
  adaptMessageFooters();
  window.addEventListener('resize', scheduleMessageFooterAdapt);

  // 窗口不变但可用宽度变了（会话栏展开/收起、宽度拖拽、工作区分栏）
  if (typeof ResizeObserver !== 'undefined') {
    let lastWidth = container.clientWidth;
    new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      if (Math.abs(width - lastWidth) < 1) return;
      lastWidth = width;
      scheduleMessageFooterAdapt();
    }).observe(container);
  }

  // 新消息渲染、历史回放、异步按钮（产物角标等）增删后重测；
  // 流式正文的逐字变更不在 footer 内，会被过滤掉，避免每帧重测
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver((mutations) => {
      if (mutations.some(isFooterMutation)) scheduleMessageFooterAdapt();
    }).observe(container, { subtree: true, childList: true });
  }

  // 字体就绪后按钮文字宽度会变（换行/图标间距），补测一次
  document.fonts?.ready?.then(scheduleMessageFooterAdapt).catch(() => {});
}
