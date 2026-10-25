// shared/tool-timeout.js - 工具超时参数归一（毫秒语义）
//
// 背景：工具的 timeout / loadTimeout 在 schema 里曾只是裸的 { type: 'integer' }，既没写单位
// 也没有下限，模型按"秒"理解传 30，执行侧照毫秒用 —— 20~30ms 内必定失败（控制台实录
// "请求超时 (30ms)"、"等待导航超时 (30ms)"）。schema 声明不参与执行，执行侧必须再归一一次，
// 两层共同兜住；边界集中在这里，避免每处各写一套 Math.max/Math.min 日后漂移。
//
// 语义统一：非数字 / 0 / 负数 → 视为"没传"，回落 fallback；越界 → 钳到 [min, max]；小数 → 向下取整。

export const TOOL_TIMEOUT_BOUNDS = {
  // fetch_url：单次请求等响应头的预算（不含整包下载；重试由 fetchWithRetry 另行计次）
  fetchUrl: { fallback: 15000, min: 1000, max: 120000 },
  // manage_tab(open)+waitForLoad：等页面加载完成
  tabLoad: { fallback: 15000, min: 1000, max: 120000 },
  // wait_navigation：监听 chrome.tabs.onUpdated 等导航到位
  navigation: { fallback: 30000, min: 1000, max: 120000 },
  // wait_element：内容脚本轮询元素状态
  waitElement: { fallback: 10000, min: 200, max: 60000 },
  // select_dropdown：内容脚本等下拉选项出现
  selectOption: { fallback: 5000, min: 200, max: 60000 },
  // interact_element：点击/输入后的自动等待上限（覆盖 DOM/URL 稳定检测）
  actionWait: { fallback: 2000, min: 200, max: 30000 },
  // interact_element.waitTime：点击/输入后的最小等待（默认值与上限跟 actionWait 不同，不可共用）
  actionMinWait: { fallback: 300, min: 200, max: 5000 },
};

/**
 * 把模型传来的超时值归一成可用的毫秒数。
 * @param {*} value - 模型传入的原始值（可能是数字、数字字符串、undefined）
 * @param {{fallback:number,min:number,max:number}} bounds - TOOL_TIMEOUT_BOUNDS 中的一组边界
 * @returns {number} 可直接用于 setTimeout / AbortSignal.timeout 的毫秒数
 */
export function clampTimeoutMs(value, bounds) {
  const { fallback, min, max } = bounds;
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.floor(ms)));
}
