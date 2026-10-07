// panel-visibility.js - 判定“发起任务的侧边栏实例”当前是否对用户可见
//
// 多实例场景（tab 级模式可同时开多个面板）必须按「发起实例」精确判定，而不是
// “当前有没有任意面板可见”：否则用户看着 tab A 的面板时，tab B 实例发起的
// 确认/完成任务提醒会被误静默。
//
// 判定数据 = ① 实例身份（state.js，keepalive 连接建立时上报 {windowId, hostTabId}）
//           ② index.js 的三份同步内存镜像（浏览器焦点 / 聚焦窗口 / 各窗口活跃 tab / 作用域）
// 信息缺失、陈旧或未接线时一律按“不可见”处理（宁可多弹不漏弹）。
import { getKeepaliveIdentity } from './state.js';

// 环境读取器：由 index.js 模块初始化时注入（避免循环导入：index → panel-visibility）
let _isBrowserFocused = null; // () => boolean
let _getFocusedWindowId = null; // () => number|null
let _getActiveTabId = null; // (windowId: number) => number|null
let _getScope = null; // () => 'global' | 'tab-specific'

export function initPanelVisibility(deps = {}) {
  if (typeof deps.isBrowserFocused === 'function') _isBrowserFocused = deps.isBrowserFocused;
  if (typeof deps.getFocusedWindowId === 'function') _getFocusedWindowId = deps.getFocusedWindowId;
  if (typeof deps.getActiveTabId === 'function') _getActiveTabId = deps.getActiveTabId;
  if (typeof deps.getScope === 'function') _getScope = deps.getScope;
}

/**
 * 发起会话的侧边栏实例当前是否对用户可见（同步，读内存镜像）
 * @param {string|null} sessionId
 * @returns {boolean}
 */
export function isPanelVisibleToUser(sessionId) {
  // 未接线（单测/异常场景）→ 保守按不可见
  if (!_isBrowserFocused || !_getFocusedWindowId || !_getActiveTabId || !_getScope) return false;
  // 无身份记录（定时任务无面板连接、SW 重启竞态、上报失败）→ 不可见
  const identity = sessionId ? getKeepaliveIdentity(sessionId) : null;
  if (!identity || identity.windowId == null) return false;
  // 浏览器未处于 OS 焦点（用户在别的应用），或实例窗口不是当前聚焦窗口 → 不可见
  if (!_isBrowserFocused()) return false;
  if (identity.windowId !== _getFocusedWindowId()) return false;
  // 全局模式：窗口聚焦 → 全局面板在窗口内处处可见
  if (_getScope() === 'global') return true;
  // tab 绑定模式：实例宿主 tab 必须仍是该窗口的活跃 tab（切到别的 tab 后面板被隐藏）
  const hostTabId = identity.hostTabId;
  return hostTabId != null && hostTabId === _getActiveTabId(identity.windowId);
}
