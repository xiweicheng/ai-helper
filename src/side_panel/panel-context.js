// panel-context.js - 侧边栏实例上下文镜像（窗口 id / 作用域 / 发起时刻的宿主 tab）
//
// 桌面通知的「面板是否对用户可见」判定所需数据全部在此维护为同步可读，并随
// TASK_FEEDBACK_NOTIFY 消息以快照形式上报给 background —— 判定不再依赖 keepalive
// 连接身份（任务完成时 port 先断开、身份已删除，判定与 onDisconnect 的处理顺序
// 是跨通道 IPC 竞速，无法保证稳定）。
//
// 三项数据的获取原则：
// - 窗口 id：面板实例与其宿主窗口绑定不变，启动时查询一次后缓存（无竞态窗口）；
// - 作用域：storage 读取 + onChanged 跟随（快照携带可消除 background SW 冷启动
//   期间作用域未恢复的竞态）；
// - 宿主 tab：tab 绑定模式下面板只在宿主 tab 活跃时可见，用户能操作面板即说明
//   宿主 tab 活跃，因此「发起任务瞬间的活跃 tab」就是宿主 tab。必须同步读取
//   （state.currentTabId 由 tabs.onActivated 实时维护），不能异步查询 —— 用户
//   “发完任务马上切 tab”会落在异步查询窗口内，把切过去的 tab 误记为宿主 tab，
//   导致任务完成时误判“面板可见”而静默桌面通知。
import logger from '../shared/logger.js';
import state from './state.js';

// 面板实例所在窗口 id（启动时查询一次后缓存；未就绪返回 null）
let _windowIdCache = null;
// 侧边栏作用域镜像：'global' | 'tab-specific'
let _scopeCache = 'global';

// sessionId → 发起任务时刻的活跃 tab id（= 宿主 tab）
const _sessionHostTab = new Map();

/**
 * 初始化实例上下文镜像（side_panel/index.js 启动链调用）。
 * 只同步注册监听器并触发一次异步补水，不返回 Promise、不阻塞启动。
 */
export function initPanelContext() {
  try {
    chrome.windows?.getCurrent?.().then?.((win) => {
      if (win?.id != null) _windowIdCache = win.id;
    }).catch?.((err) => {
      logger.debug('[PanelContext] query current window failed:', err?.message);
    });
  } catch (err) {
    logger.debug('[PanelContext] init window query failed:', err?.message);
  }

  try {
    chrome.storage?.local?.get?.(['sidePanelScope'], (result) => {
      _scopeCache = result?.sidePanelScope === 'tab-specific' ? 'tab-specific' : 'global';
    });
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area !== 'local' || !changes?.sidePanelScope) return;
      _scopeCache = changes.sidePanelScope.newValue === 'tab-specific' ? 'tab-specific' : 'global';
    });
  } catch (err) {
    logger.debug('[PanelContext] init scope mirror failed:', err?.message);
  }
}

/**
 * 面板实例所在窗口 id（未就绪返回 null）
 * @returns {number|null}
 */
export function getPanelWindowId() {
  return _windowIdCache;
}

/**
 * 捕获发起任务时刻的宿主 tab（同步读取活跃 tab 镜像，无异步查询竞态）。
 * 由 callApi 在发起任务的同步栈内调用（resumeTask 复用 callApi 同样覆盖）。
 * @param {string} sessionId
 */
export function markSessionHostTab(sessionId) {
  if (!sessionId) return;
  if (typeof state.currentTabId === 'number') {
    _sessionHostTab.set(sessionId, state.currentTabId);
  }
}

/**
 * 权威回填宿主 tab：background 在 KEEPALIVE_IDENTITY 到达时刻用它自己的活跃 tab
 * 镜像（tabs.onActivated 无条件维护，不受面板启用性判断与可见性影响）解析出宿主
 * tab 后经 HOST_TAB_RESOLVED 回传。覆盖发起时的乐观值；tabId 非 number（权威源
 * 暂无值）时删除记录 → 判定方按“不可见”保守处理（宁可多弹不漏弹）。
 * @param {string} sessionId
 * @param {number|null} tabId
 */
export function setSessionHostTab(sessionId, tabId) {
  if (!sessionId) return;
  if (typeof tabId === 'number') {
    _sessionHostTab.set(sessionId, tabId);
  } else {
    _sessionHostTab.delete(sessionId);
  }
}

/**
 * 读取会话发起时刻捕获的宿主 tab（无记录返回 null）
 * @param {string} sessionId
 * @returns {number|null}
 */
export function getSessionHostTab(sessionId) {
  if (!sessionId) return null;
  const tabId = _sessionHostTab.get(sessionId);
  return typeof tabId === 'number' ? tabId : null;
}

/**
 * 任务反馈消息的可见性快照（发送时刻实时组装）。
 * background 按它判定“发起实例的面板是否对用户可见”，与 keepalive 身份生命周期无关：
 * - windowId：面板实例窗口（缺失 → background 保守按不可见处理）
 * - hostTabId：发起时刻的宿主 tab（tab 绑定模式判定用）
 * - scope：作用域快照（优先于 background 侧镜像，消除 SW 冷启动竞态）
 * - panelHidden：面板自身是否被隐藏（tab 绑定模式下切走 tab / 面板不可见时为 true，
 *   是“不可见”的最强证据；环境不支持时为 null，判定方跳过该信号）
 * @param {string|null} sessionId
 * @returns {{windowId:number|null, hostTabId:number|null, scope:string, panelHidden:boolean|null}}
 */
export function getFeedbackSnapshot(sessionId) {
  let panelHidden = null;
  try {
    panelHidden = typeof document !== 'undefined' ? !!document.hidden : null;
  } catch {
    /* 非 DOM 环境（异常兜底）：保持 null */
  }
  return {
    windowId: _windowIdCache,
    hostTabId: getSessionHostTab(sessionId),
    scope: _scopeCache,
    panelHidden,
  };
}
