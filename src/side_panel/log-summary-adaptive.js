// side_panel/log-summary-adaptive.js - 执行日志统计区自适应降级
// 空间不足时由 adaptLogSummary 测量 scrollWidth/clientWidth 逐级降级（挂类到 .log-summary）：
//   ① combo-collapsed：折叠组合块文案（执行节点/成功/失败…），仅留图标+数字
//   ② summary-collapsed：再折叠总耗时/Token 文案
//   ③ summary-wrapped：极窄时允许整块换行兜底，避免右侧展开按钮被裁剪
// 悬停 tooltip 保持完整信息；适配中英文文案与数字长度差异（固定断点无法按语言校准）

const COMBO_COLLAPSED = 'combo-collapsed';
const SUMMARY_COLLAPSED = 'summary-collapsed';
const WRAPPED = 'summary-wrapped';
const DEGRADE_CLASSES = [COMBO_COLLAPSED, SUMMARY_COLLAPSED, WRAPPED];

/** 测量并应用降级级别；先恢复完整状态再测量，保证空间恢复时能还原 */
export function adaptLogSummary(panel) {
  if (!panel) return;
  const summary = panel.querySelector('.log-summary');
  if (!summary) return;

  summary.classList.remove(...DEGRADE_CLASSES);
  if (summary.scrollWidth <= summary.clientWidth) return;
  summary.classList.add(COMBO_COLLAPSED);
  if (summary.scrollWidth <= summary.clientWidth) return;
  summary.classList.add(SUMMARY_COLLAPSED);
  if (summary.scrollWidth <= summary.clientWidth) return;
  summary.classList.add(WRAPPED);
}

let pendingPanel = null;
let rafId = 0;
let resizeBound = false;

/** rAF 节流：合并面板创建 / 统计数字更新 / resize 期间的高频触发 */
export function scheduleLogSummaryAdapt(panel) {
  if (!panel) return;
  pendingPanel = panel;
  bindResizeOnce();
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    const target = pendingPanel;
    pendingPanel = null;
    if (target) adaptLogSummary(target);
  });
}

/** 首次调度时注册全局 resize 监听：面板打开期间窗口缩放后按当前 DOM 重新测量 */
function bindResizeOnce() {
  if (resizeBound || typeof window === 'undefined') return;
  resizeBound = true;
  window.addEventListener('resize', () => {
    const panel = document.querySelector('.execution-log-panel');
    if (panel) scheduleLogSummaryAdapt(panel);
  });
}
