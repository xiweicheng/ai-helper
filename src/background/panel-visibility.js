// panel-visibility.js - 判定“发起任务的侧边栏实例”当前是否对用户可见
//
// 多实例场景（tab 级模式可同时开多个面板）必须按「发起实例」精确判定，而不是
// “当前有没有任意面板可见”：否则用户看着 tab A 的面板时，tab B 实例发起的
// 确认/完成任务提醒会被误静默。
//
// 判定数据优先级：
//   ① 快照 snapshot：随 TASK_FEEDBACK_NOTIFY 消息携带，面板发起时刻同步生成
//   ② 实例身份 identity：state.js keepalive 上报，快照缺失时兜底
// 快照使判定与 keepalive 身份生命周期解耦：任务完成时端口先断、身份先删，而通知
// 消息后发（跨通道 IPC 无顺序保证）——只依赖身份会让同一操作“有时弹有时不弹”。
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
 * @param {{windowId?: number|null, hostTabId?: number|null, scope?: string, panelHidden?: boolean|null}|null} [snapshot]
 *        面板发起时刻同步生成的可见性快照；提供时优先于 keepalive 身份
 * @returns {boolean}
 */
export function isPanelVisibleToUser(sessionId, snapshot = null) {
  // 未接线（单测/异常场景）→ 保守按不可见
  if (!_isBrowserFocused || !_getFocusedWindowId || !_getActiveTabId || !_getScope) return false;
  // 数据源：快照优先（与身份删除竞速解耦）；无快照回退 keepalive 身份；两者皆无 → 不可见
  const data = snapshot && typeof snapshot === 'object'
    ? snapshot
    : (sessionId ? getKeepaliveIdentity(sessionId) : null);
  if (!data || data.windowId == null) return false;
  // 浏览器未处于 OS 焦点（用户在别的应用），或实例窗口不是当前聚焦窗口 → 不可见
  if (!_isBrowserFocused()) return false;
  if (data.windowId !== _getFocusedWindowId()) return false;
  // 面板自身报告已隐藏（document.hidden）→ 镜像推算的“可见”不足为凭，保守弹
  if (data.panelHidden === true) return false;
  // 作用域以快照携带值为准（发起时刻语义）；非法/缺失值回退实时镜像
  const scope = data.scope === 'global' || data.scope === 'tab-specific' ? data.scope : _getScope();
  // 全局模式：窗口聚焦 → 全局面板在窗口内处处可见
  if (scope === 'global') return true;
  // tab 绑定模式：实例宿主 tab 必须仍是该窗口的活跃 tab（切到别的 tab 后面板被隐藏）
  const hostTabId = data.hostTabId;
  return hostTabId != null && hostTabId === _getActiveTabId(data.windowId);
}
