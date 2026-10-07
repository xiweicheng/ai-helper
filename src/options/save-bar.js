// options/save-bar.js - 保存按钮栏的吸附行为
//
// 配置项较多时保存按钮会被挤出可视区，用户必须滚到页面底部才能保存。
// 期望：放得下时按钮正常处于文档流；被视口底边截住时才吸附在视口底部保持可见。
//
// 吸附本身由 CSS 承担（.save-bar 的 position: sticky; bottom: 0），其语义恰好
// 就是上面描述的行为；这里只负责在「吸附生效中」加上 .floating 类，用于展示
// 悬浮层次（阴影），让按钮栏与滚动经过的内容有清晰分界。
//
// 判定：吸附中时按钮栏底边恒贴视口底边；回到文档流位置后底边位于视口底边之上。

const FLOATING_EPSILON = 1; // 亚像素容差

/**
 * 初始化保存按钮栏的吸附状态检测（按需更新 .floating 类）
 */
export function initSaveBarSticky() {
  const saveBar = document.getElementById('saveBar');
  if (!saveBar) return;

  const updateFloating = () => {
    const rect = saveBar.getBoundingClientRect();
    const floating = rect.bottom >= window.innerHeight - FLOATING_EPSILON;
    saveBar.classList.toggle('floating', floating);
  };

  window.addEventListener('scroll', updateFloating, { passive: true });
  window.addEventListener('resize', updateFloating);
  // 切换 Tab、展开折叠块等会改变页面高度且不一定触发 scroll/resize，观察 body 尺寸兜底
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateFloating).observe(document.body);
  }
  updateFloating();
}
