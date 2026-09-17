// background/index.js - Service Worker 入口文件

import { cancelReactLoop, resetDialogApiCallCount, incrementDialogApiCallCount, getDialogApiCallCount, abortCurrentTool } from './state.js';
import { getStoredConfig, getChatConfig } from './config.js';
import { getTools, clearAgentConnectivityCache, loadMcpTools, unloadMcpTools, cancelRunningAgentCommands, clearSkillLoadCache } from './tool-executor.js';
import { RAW_TOOLS } from './constants.js';
import { reactLoop, callApiNonStream, activeReactLoops, resumeReactLoopFromCheckpoint } from './react-loop.js';
import { preselectTools } from './tool-preselector.js';
import { recordTokenUsage } from './token-recorder.js';
import { rehydrateAlarms, handleScheduledTaskCommand } from './scheduler.js';
import * as AgentClient from './local-agent-client.js';
import { getReactCheckpoint, deleteReactCheckpoint, cleanupExpiredReactCheckpoints, getAllReactCheckpoints } from '../storage/db.js';
import { readMemoryFile } from './tool-memory.js';
import logger from '../shared/logger.js';
import { initI18n, t, registerTranslations } from '../shared/i18n.js';

// 背景脚本自注册翻译
registerTranslations('zh', { 
  bg: { 
    missingSessionId: '缺少 sessionId',
    resumingFromCheckpoint: '从 checkpoint 恢复中...',
    checkpointNotFound: '未找到可恢复的任务 checkpoint，可能已过期或被清理。请检查 Service Worker 控制台中的诊断日志（搜索 "checkpoint" 关键字）。',
    resumeFailed: '恢复失败',
    missingSkillName: '缺少技能名称',
    fetchFailed: '获取失败',
    preparing: '准备中...',
    toolPreselect: '工具预筛选',
    requestCancelled: '请求已被用户取消',
    reactCancelled: 'ReAct 循环已被用户取消',
    apiCallFailed: 'API 调用失败',
  } 
});
registerTranslations('en', { 
  bg: { 
    missingSessionId: 'Missing sessionId',
    resumingFromCheckpoint: 'Resuming from checkpoint...',
    checkpointNotFound: 'No checkpoint found for resumption. It may have expired or been cleaned. Check Service Worker console logs (search "checkpoint").',
    resumeFailed: 'Resume failed',
    missingSkillName: 'Missing skill name',
    fetchFailed: 'Fetch failed',
    preparing: 'Preparing...',
    toolPreselect: 'Tool Pre-filter',
    requestCancelled: 'Request was cancelled by user',
    reactCancelled: 'ReAct loop was cancelled by user',
  } 
});

// 初始化国际化（读取语言偏好，供 local-agent-client 设置 Accept-Language 头）
initI18n();

// 启动时重建定时任务闹钟（SW 空闲被回收后由 chrome.alarms 唤醒，需从 DB 恢复）
rehydrateAlarms();

// SW 启动时清理过期的 ReAct checkpoint（TTL: 7 天）
// 同时作为 DB 自检：验证 reactCheckpoints store 可访问（若 store 不存在会触发 retry 重建连接）
// 同时执行旧格式 Agent 数据迁移
Promise.all([
  cleanupExpiredReactCheckpoints().then(() => getAllReactCheckpoints()),
  AgentClient.migrateFromLegacyFormat()
])
  .then(([all, migrated]) => {
    logger.debug(`[Background] DB self-check passed,current has  ${all.length}  checkpoint` + (migrated ? ',completedoldformat Agent migrate' : ''));
  })
  .catch(err => {
    logger.warn('[Background] cleanup expired checkpoint  or  DB self-check failed:', err);
  });

// chrome.runtime.sendMessage 单条消息最大 64MiB，此常量用于截断大消息
const MAX_LOG_ENTRIES_FOR_MSG = 1000;

// MCP 工具查询缓存，避免每次 GET_MCP_TOOLS 都向 Agent 发网络请求
let mcpToolsCache = null;

// Agent Skill Prompts 缓存
let skillPromptsCache = null;

// SW 存活保持：side panel 通过 chrome.runtime.connect 建立长连接，
// 防止 API 调用期间 Chrome 判定 SW 空闲而将其杀死
const keepalivePorts = new Map(); // sessionId -> Port

// 脱离窗口的 windowId（全局变量，同步访问）
// chrome.sidePanel.open() 要求用户手势上下文，不能在 await 之后调用，
// 因此用全局变量跟踪脱离窗口状态，避免 async storage 破坏手势上下文
let _detachWindowId = null;

// SW 启动时从 storage 恢复脱离窗口状态
chrome.storage.local.get('_detachWindowId', (result) => {
  _detachWindowId = result._detachWindowId || null;
  // 验证窗口是否仍然存在
  if (_detachWindowId) {
    chrome.windows.get(_detachWindowId).catch(() => {
      _detachWindowId = null;
      chrome.storage.local.remove('_detachWindowId').catch(() => {});
    });
  }
});

chrome.runtime.onConnect.addListener(async (port) => {
  if (port.name?.startsWith('keepalive-')) {
    const sessionId = port.name.replace('keepalive-', '');
    // 判断是否为重连（SW 重启后的重连），而非首次连接
    const isReconnection = keepalivePorts.has(sessionId);
    keepalivePorts.set(sessionId, port);
    logger.debug('[Background] keepalive portconnected, sessionId:', sessionId, isReconnection ? '(reconnect)' : '(first times)');

    // SW 静默重启检测：仅在重连时检测，避免首次连接时 activeReactLoops 尚未初始化导致的误报
    if (isReconnection && !activeReactLoops.has(sessionId)) {
      logger.warn('[Background] ⚠️ detected SW re started,sessionId', sessionId, '  API call lost');
      // 检查是否存在 checkpoint，若存在则在通知中带上元数据，供前端展示"继续执行"按钮
      let checkpointMeta = null;
      try {
        const cp = await getReactCheckpoint(sessionId);
        if (cp) {
          checkpointMeta = {
            iteration: cp.iteration,
            interruptedReason: cp.interruptedReason,
            updatedAt: cp.updatedAt,
            messageCount: cp.currentMessages?.length || 0,
            subtaskPlan: cp.subtaskPlan ? { subtaskCount: cp.subtaskPlan.subtasks?.length || 0 } : null,
          };
          logger.debug('[Background] detected recoverable checkpoint:', checkpointMeta);
        }
      } catch (e) {
        logger.warn('[Background] read checkpoint failed:', e.message);
      }
      try {
        port.postMessage({ type: 'SW_RESTARTED', sessionId, checkpoint: checkpointMeta });
      } catch (e) {
        logger.warn('[Background] send SW_RESTARTED message failed:', e.message);
      }
    }

    port.onDisconnect.addListener(() => {
      keepalivePorts.delete(sessionId);
      logger.debug('[Background] keepalive port disconnected, sessionId:', sessionId);
    });
  }
});

// ==================== Side Panel 路由配置 ====================

/**
 * Side Panel 路由配置
 * Chrome 114+ 使用 side_panel.open() API
 * 不使用 openPanelOnActionClick，改为手动控制：
 * 当脱离窗口存在时，点击插件图标不再打开侧边栏，避免多窗口并行
 */
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false });

// 侧边栏作用域模式：'global' | 'tab-specific'
// 注：不再自建「绑定 tab」状态。Chrome 的侧边栏是 per-window 的，per-tab 的
// 启用状态由 Chrome 自己按 tab 保存，一个全局 tabId 既表达不了多窗口也用不上。
let _sidePanelScope = 'global';

// 侧边栏打开状态镜像：快捷键 toggle 必须在用户手势的同步调用栈里判断“是否已打开”
// （open() 之前不能 await），所以需要一份同步可读的状态。
// Chrome 141+ 用 sidePanel.onOpened/onClosed 精确维护，粒度是 windowId → tabId：
//   - null：该窗口打开的是全局面板（面板在窗口内所有 tab 可见）
//   - 数字：该窗口打开的是 tab 专属面板（仅该 tab 可见）
// 低版本没有这两个事件，退化为 SW 启动时的 getContexts 快照（best-effort）
const _openPanelsByWindow = new Map();
const _hasPanelOpenEvents = !!chrome.sidePanel?.onOpened;
let _legacyPanelOpen = false;

// SW 启动瞬间的面板快照。getContexts 的 IPC 在 onCommand 里的 open() 之前派发，
// 因此这份快照表达的是「open() 之前」的状态，冷启动时快捷键靠它判断
// “面板本来就开着”（见 toggleSidePanelColdStart）。
// 注意：实测 getContexts 对 side panel 返回的 windowId/tabId 是 -1（无法归到具体窗口），
// 所以它只能回答「有没有面板开着」，窗口归属只能靠 sidePanel.onOpened/onClosed。
const _startupPanelProbe = chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] })
  .then((contexts) => {
    _legacyPanelOpen = contexts.length > 0;
    return contexts;
  })
  .catch(() => []);
chrome.sidePanel?.onOpened?.addListener((info) => {
  if (info?.windowId == null) return;
  logger.debug('[Background] sidePanel onOpened:', JSON.stringify(info));
  _openPanelsByWindow.set(info.windowId, info.tabId ?? null);
});
chrome.sidePanel?.onClosed?.addListener((info) => {
  if (info?.windowId == null) return;
  logger.debug('[Background] sidePanel onClosed:', JSON.stringify(info));
  const boundTabId = _openPanelsByWindow.get(info.windowId);
  _openPanelsByWindow.delete(info.windowId);
  // 关闭的是某个 tab 的面板 → 该 tab 不再绑定，移出 AI Helper 分组
  // （info.tabId 仅在 tab 专属面板时提供，缺失时退回记录中的绑定 tab）
  const closedTabId = info.tabId ?? (typeof boundTabId === 'number' ? boundTabId : null);
  if (closedTabId != null) unbindTabFromAiHelperGroup(closedTabId);
});

// manifest 不再声明 side_panel.default_path（否则 manifest 默认值会覆盖运行时
// 全局禁用，导致 tabId 绑定失效），因此启动时先同步设置默认 path，
// 保证 storage 异步读取完成前 sidePanel.open() 可用
chrome.sidePanel?.setOptions?.({ path: 'side_panel.html', enabled: true });

// SW 启动时从 storage 恢复作用域模式（Chrome 自己保存 per-tab 启用状态，无需恢复）
chrome.storage.local.get(['sidePanelScope']).then((result) => {
  _sidePanelScope = normalizeSidePanelScope(result.sidePanelScope);
  applySidePanelScope();
}).catch(() => {});

/**
 * 作用域模式取值白名单（导入配置、手工改 storage 都可能写入非法值）
 * @param {*} value
 * @returns {'global'|'tab-specific'}
 */
function normalizeSidePanelScope(value) {
  return value === 'tab-specific' ? 'tab-specific' : 'global';
}

/**
 * 按当前作用域模式配置 sidePanel 默认启用状态。
 *
 * 采用 webbrain / Claude 官方扩展验证过的模型（避免“No active side panel”竞态）：
 * 竞态只发生在把某 tab 从 enabled→disabled→enabled 反复翻转时。因此：
 * - 全局模式：设全局默认 path+enabled，所有 tab 可用；
 * - 标签页绑定模式：关闭全局默认（面板不泄露到未点击的 tab），
 *   只在用户显式打开时对那个 tab 做 per-tab 启用，且绝不对任何 tab 调 enabled:false。
 * Chrome 原生会跨切换保留每个 tab 的面板打开状态：未点过的 tab 无面板（隐藏），
 * 点过的 tab 切走隐藏、切回自动重现，无需任何代码维护。
 */
function applySidePanelScope() {
  if (_sidePanelScope === 'tab-specific') {
    // 关闭全局默认：未显式启用的 tab 不显示面板（无 manifest default_path，此禁用生效）
    chrome.sidePanel?.setOptions?.({ enabled: false });
  } else {
    // 全局模式：所有 tab 可用；分组只在绑定模式下有意义，切回来时解散已有分组
    chrome.sidePanel?.setOptions?.({ path: 'side_panel.html', enabled: true });
    _aiHelperGroupsReady?.then(() => dissolveAiHelperGroups()).catch(() => {});
  }
}

/**
 * 用户显式打开侧边栏时调用（紧跟着同步 open({tabId})）。
 * tab-specific 模式：对该 tab 做 fire-and-forget 的 per-tab 启用（传 path 使其
 * 成为 tab 专属面板，open({tabId}) 仅在该 tab 打开）；因为从不主动禁用任何 tab，
 * setOptions+open 背靠背不会产生“新启用无法覆盖旧禁用”的竞态。
 * group 默认开启，但只在标签页绑定模式下生效（全局模式所有 tab 都可用面板，
 * 标记分组既无信息量又会打乱 tab 顺序）；设置变更等非用户主动行为传 { group: false }。
 */
function bindSidePanelToTab(tabId, { group = true } = {}) {
  if (group && _sidePanelScope === 'tab-specific') ensureAiHelperGroupById(tabId);
  if (_sidePanelScope !== 'tab-specific') return;
  // per-tab 启用（fire-and-forget，不 await，保留随后的 open() 手势）；绝不禁用其他 tab
  chrome.sidePanel?.setOptions?.({ tabId, path: 'side_panel.html', enabled: true }).catch(() => {});
}

// ==================== Tab 分组（仅标签页绑定模式，纯视觉整理，可选） ====================
//
// 把用户显式打开过侧边栏的 tab 归入一个每窗口一个的彩色分组，方便一眼看出哪些
// tab 绑定了 AI 面板；tab 的面板被关闭（或切回全局模式）时移出分组。分组不影响
// 面板可见性（关闭分组也不会禁用面板），由设置 autoGroupTabs（默认开）控制。
// windowId -> tabGroups groupId。
const _aiHelperGroupByWindow = new Map();
const AI_HELPER_GROUPS_KEY = '_aiHelperGroupByWindow';
const AI_HELPER_GROUP_TITLE = 'AI Helper';

async function shouldAutoGroupTabs() {
  try {
    const stored = await chrome.storage.local.get('autoGroupTabs');
    return stored?.autoGroupTabs !== false;
  } catch {
    return true;
  }
}

async function loadAiHelperGroups() {
  if (!chrome.tabGroups) return;
  try {
    const stored = await chrome.storage.session.get(AI_HELPER_GROUPS_KEY);
    const arr = stored[AI_HELPER_GROUPS_KEY];
    if (Array.isArray(arr)) {
      // 重新接管前校验分组仍存在（用户可能手动取消分组，或 SW 重启后 ID 失效）
      for (const [windowId, groupId] of arr) {
        try {
          await chrome.tabGroups.get(groupId);
          _aiHelperGroupByWindow.set(windowId, groupId);
        } catch { /* 分组已不存在，跳过 */ }
      }
    }
  } catch { /* session storage 不可用 */ }
}
function saveAiHelperGroups() {
  chrome.storage.session?.set({
    [AI_HELPER_GROUPS_KEY]: Array.from(_aiHelperGroupByWindow.entries()),
  }).catch(() => {});
}
// ensureAiHelperGroup 会 await 这个 Promise：避免冷启动后立刻打开面板时，
// 「乐观建组」与 loadAiHelperGroups 内部 await 循环交错，导致映射被旧 groupId 覆盖
const _aiHelperGroupsReady = loadAiHelperGroups();

/**
 * 确保 tab.windowId 有一个 AI Helper 分组且 tab 已在其中。
 */
async function ensureAiHelperGroup(tab) {
  if (!chrome.tabGroups || !tab?.id || tab.windowId == null) return;
  // 固定标签页无法归组（tabs.group 会抛错），直接跳过而不是静默失败
  if (tab.pinned) return;
  if (!await shouldAutoGroupTabs()) return;
  await _aiHelperGroupsReady;
  try {
    let groupId = _aiHelperGroupByWindow.get(tab.windowId);
    // 校验缓存的分组仍存在（用户可能手动取消分组，或 SW 重启后拿到陈旧 ID）
    if (groupId != null) {
      try {
        await chrome.tabGroups.get(groupId);
      } catch {
        groupId = null;
        _aiHelperGroupByWindow.delete(tab.windowId);
        saveAiHelperGroups();
      }
    }
    if (groupId == null) {
      // session storage 不跨浏览器重启，而 tab 分组会持久化：先按标题复用已有分组，
      // 避免重启后重复建出第二个 "AI Helper" 组
      try {
        const reused = await chrome.tabGroups.query({ windowId: tab.windowId, title: AI_HELPER_GROUP_TITLE });
        if (reused.length > 0) groupId = reused[0].id;
      } catch { /* query 失败则退回新建 */ }

      if (groupId == null) {
        // 为该窗口新建分组（不传 groupId → 把源 tab 归入新组）
        groupId = await chrome.tabs.group({ tabIds: [tab.id] });
        try {
          await chrome.tabGroups.update(groupId, { title: AI_HELPER_GROUP_TITLE, color: 'blue', collapsed: false });
        } catch { /* 忽略样式失败 */ }
      } else if (tab.groupId !== groupId) {
        // 复用已有同名分组：源 tab 不在其中则加入，不覆盖其标题/颜色
        try {
          await chrome.tabs.group({ groupId, tabIds: [tab.id] });
        } catch { /* tab 可能正在移动，忽略 */ }
      }
      _aiHelperGroupByWindow.set(tab.windowId, groupId);
      saveAiHelperGroups();
    } else if (tab.groupId !== groupId) {
      // 该窗口已有缓存分组但源 tab 不在其中，加入
      try {
        await chrome.tabs.group({ groupId, tabIds: [tab.id] });
      } catch { /* tab 可能正在移动，忽略 */ }
    }
  } catch (e) {
    logger.debug('[Background] ensureAiHelperGroup failed:', e?.message);
  }
}

// open 入口只有 tabId，分组需要 windowId，故先取 tab 再归组（异步，不占手势）
function ensureAiHelperGroupById(tabId) {
  if (!chrome.tabGroups || tabId == null) return;
  chrome.tabs.get(tabId).then((tab) => ensureAiHelperGroup(tab)).catch(() => {});
}

/**
 * 该 tab 上不再有侧边栏（面板被关闭 / tab 已绑定失效）→ 从 AI Helper 分组移出。
 * 只在绑定模式下执行；分组清空后 Chrome 会自动删除该分组，tabGroups.onRemoved 会清映射。
 */
async function unbindTabFromAiHelperGroup(tabId) {
  if (_sidePanelScope !== 'tab-specific' || !chrome.tabGroups || !chrome.tabs?.ungroup) return;
  try {
    const tab = await chrome.tabs.get(tabId);
    // 只有该 tab 仍是所在窗口的活动 tab 时才认定“用户真的关掉了这个 tab 的面板”：
    // 切到别的 tab 导致面板隐藏时活动 tab 已经变人，借此避免误把只是隐藏的 tab 移出分组
    const [activeTab] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (activeTab?.id !== tab.id) return;
    const groupId = _aiHelperGroupByWindow.get(tab.windowId);
    if (groupId == null || tab.groupId !== groupId) return;
    await chrome.tabs.ungroup([tab.id]);
    logger.debug('[Background] tab unbound from AI Helper group:', tab.id);
  } catch (e) {
    logger.debug('[Background] unbindTabFromAiHelperGroup failed:', e?.message);
  }
}

/**
 * 解散本扩展建过的所有 AI Helper 分组（把其中的 tab 移出，不动 tab 本身）。
 * 用于切回全局模式：全局模式下面板对所有 tab 可用，分组标记失去意义。
 */
async function dissolveAiHelperGroups() {
  if (!chrome.tabGroups || !chrome.tabs?.ungroup) return;
  const groupIds = [...new Set(_aiHelperGroupByWindow.values())];
  if (groupIds.length === 0) return;
  _aiHelperGroupByWindow.clear();
  saveAiHelperGroups();
  for (const groupId of groupIds) {
    try {
      const tabs = await chrome.tabs.query({ groupId });
      if (tabs.length > 0) await chrome.tabs.ungroup(tabs.map((tab) => tab.id));
    } catch { /* 分组可能已被用户删除 */ }
  }
  logger.debug('[Background] AI Helper groups dissolved (scope switched to global)');
}

// 监听配置变更，动态切换作用域模式
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.sidePanelScope) {
    const newScope = normalizeSidePanelScope(changes.sidePanelScope.newValue);
    if (newScope !== _sidePanelScope) {
      _sidePanelScope = newScope;
      if (newScope === 'tab-specific') {
        // 切成 tab-specific 会对全局默认做 enabled:false，当前 tab 若没有 per-tab
        // 启用（全局模式下不需要）面板会被关掉，因此这里必须补上 per-tab 启用，
        // 让用户已打开的面板原地保留。设置变更非用户主动打开，故不参与自动分组。
        chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).then((contexts) => {
          if (contexts.length > 0) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]?.id) bindSidePanelToTab(tabs[0].id, { group: false });
              applySidePanelScope();
            });
          } else {
            applySidePanelScope();
          }
        }).catch(() => { applySidePanelScope(); });
        return;
      }
      applySidePanelScope();
      logger.debug('[Background] sidePanel scope changed to:', newScope);
    }
  }
});

// 手动处理插件图标点击：脱离窗口存在时跳过，否则打开侧边栏
// 注意：sidePanel.open() 要求用户手势上下文，必须同步调用，不能 await
chrome.action.onClicked.addListener((tab) => {
  if (_detachWindowId) {
    // 脱离窗口仍存在，尝试聚焦到该窗口
    try {
      chrome.windows.update(_detachWindowId, { focused: true }).catch(() => {
        // 窗口已不存在，清理并打开侧边栏
        _detachWindowId = null;
        chrome.storage.local.remove('_detachWindowId').catch(() => {});
        bindSidePanelToTab(tab.id);
        chrome.sidePanel?.open?.({ tabId: tab.id }).catch(() => {});
      });
    } catch {
      _detachWindowId = null;
      chrome.storage.local.remove('_detachWindowId').catch(() => {});
      bindSidePanelToTab(tab.id);
      chrome.sidePanel?.open?.({ tabId: tab.id }).catch(() => {});
    }
    return;
  }
  // tab-specific 模式下先绑定再打开
  bindSidePanelToTab(tab.id);
  chrome.sidePanel?.open?.({ tabId: tab.id }).catch((e) => {
    logger.warn('[Background] open sidePanel failed:', e?.message);
  });
});

// 窗口关闭（用户直接关闭窗口）：清理脱离窗口 windowId + 丢弃该窗口的分组映射
// 注：windows.onRemoved 不在用户手势上下文中，无法调用 sidePanel.open()，
// 因此不自动重开侧边栏，用户点击插件图标或快捷键即可重新打开
chrome.windows.onRemoved.addListener((windowId) => {
  if (_detachWindowId === windowId) {
    _detachWindowId = null;
    chrome.storage.local.remove('_detachWindowId').catch(() => {});
    logger.debug('[Background] detached window closed, cleaned up windowId:', windowId);
  }
  if (_aiHelperGroupByWindow.has(windowId)) {
    _aiHelperGroupByWindow.delete(windowId);
    saveAiHelperGroups();
  }
});

// 监听标签页加载完成：仅全局模式下重申全局默认启用。
// tab-specific 模式下不在此处 setOptions 全局 path，避免反复重设默认实例
// 干扰绑定 tab 的原生“打开状态”记忆（影响切回自动重现）
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    if (_sidePanelScope === 'global') {
      chrome.sidePanel?.setOptions?.({ path: 'side_panel.html', enabled: true });
    }
  }
});

// 注：按 webbrain 模型，不在 onActivated/onCreated/onUpdated 里对单个 tab 做
// enabled:false 或重申启用——那正是导致面板泄露到新 tab、以及 enable→disable→enable
// 竞态（点不开）的根源。Chrome 已原生跨切换保留每个 tab 的面板状态，无需重申。

// 分组清理：用户取消分组（或 Chrome 自动折叠删除）后，忘掉该窗口的映射，
// 下次点击可重新建组而不是复用已失效的 groupId
chrome.tabGroups?.onRemoved?.addListener?.((group) => {
  for (const [windowId, gid] of _aiHelperGroupByWindow) {
    if (gid === group.id) {
      _aiHelperGroupByWindow.delete(windowId);
      saveAiHelperGroups();
      break;
    }
  }
});

// ==================== 全局快捷键：切换 Side Panel ====================
//
// sidePanel.open() 只在「用户手势的同步调用栈」里可用：哪怕只走一次 tabs.query
// 回调，手势就失效并抛 "sidePanel.open() may only be called in response to a
// user gesture"。所以判断与 open() 都必须在 onCommand 的同步栈内完成，靠三份同步
// 可读的镜像替代 await：
//   _lastFocusedWindowId / _activeTabByWindow → 目标 tab（窗口、tab 事件 + 启动补水）
//   _openPanelsByWindow → 面板是否已打开（sidePanel.onOpened/onClosed）
//   _startupPanelProbe → 冷启动镜像还空时，用启动瞬间的快照判断“本来就已打开”
// 关闭方向不校验手势（close() 无此限制），因此“纠错”可以放到异步里；
// 打开方向必须在同步栈里调用，冷启动只能对「当前窗口」下手（见 toggleSidePanelColdStart）。

const TOGGLE_SIDEPANEL_COMMAND = '_toggle_sidepanel';

// 目标 tab 的内存镜像：tabs/windows 事件维持
const _activeTabByWindow = new Map();
let _lastFocusedWindowId = null;

chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  _activeTabByWindow.set(windowId, tabId);
  _lastFocusedWindowId = windowId;
});
chrome.tabs.onRemoved.addListener((tabId, { windowId }) => {
  if (_activeTabByWindow.get(windowId) === tabId) _activeTabByWindow.delete(windowId);
});
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  _lastFocusedWindowId = windowId;
});
// 启动补水：SW 被任意事件唤醒后尽快把当前窗口的活跃 tab 放进镜像，
// 下一次按键即可走同步路径
chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
  if (!tab?.id) return;
  _activeTabByWindow.set(tab.windowId, tab.id);
  if (_lastFocusedWindowId == null) _lastFocusedWindowId = tab.windowId;
}).catch(() => {});

// 快捷键是否真的被绑定（被其它扩展占用时 Chrome 会静默不绑，表现为“按了没反应”）
chrome.commands?.getAll?.().then((commands) => {
  const cmd = commands.find((c) => c.name === TOGGLE_SIDEPANEL_COMMAND);
  if (!cmd) return;
  if (cmd.shortcut) logger.debug('[Background] sidePanel shortcut:', cmd.shortcut);
  else logger.warn('[Background] sidePanel shortcut is not bound, set it at chrome://extensions/shortcuts');
}).catch(() => {});

/**
 * 当前活跃 tab id（同步，读内存镜像）。SW 刚被唤醒、镜像还没补水时返回 null。
 * @returns {number|null}
 */
function getActiveTabId() {
  if (_lastFocusedWindowId == null) return null;
  return _activeTabByWindow.get(_lastFocusedWindowId) ?? null;
}

/**
 * 当前 tab 上侧边栏是否可见（同步，供快捷键 toggle 使用）。
 * @param {{id:number, windowId:number}} tab
 */
function isSidePanelOpenOnTab(tab) {
  const entry = _openPanelsByWindow.get(tab.windowId);
  if (entry !== undefined) {
    // null = 全局面板（窗口内所有 tab 可见）；数字 = tab 专属面板（仅该 tab 可见）
    return entry === null || entry === tab.id;
  }
  // 有事件能力但没有该窗口的记录 → 该窗口确实没打开面板
  return !_hasPanelOpenEvents && _legacyPanelOpen;
}

/**
 * 关闭 windowId 窗口上当前可见的侧边栏。
 * Chrome 141+ 用 sidePanel.close()：不需要跨上下文消息，也不会连带关掉别的窗口；
 * 旧版本退化为通知面板页 window.close()（会销毁面板实例，属兜底行为）。
 * @param {number} windowId
 * @param {number|null} tabId tab 专属面板才传；全局面板必须只传 windowId
 */
function closeSidePanelInWindow(windowId, tabId = null) {
  /** 最后兜底：通知面板页自己 window.close()（旧版 Chrome 或 close() 双路径都失败） */
  const notifySelfClose = (msg) => {
    logger.warn('[Background] close sidePanel failed, fallback to panel self-close:', msg);
    chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' }).catch(() => {});
  };
  if (!chrome.sidePanel?.close) {
    chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' }).catch((e) => {
      logger.warn('[Background] send CLOSE_SIDEPANEL failed:', e?.message);
    });
    return;
  }
  const options = typeof tabId === 'number' ? { tabId } : { windowId };
  chrome.sidePanel.close(options).then(() => {
    _openPanelsByWindow.delete(windowId);
  }).catch((e) => {
    if (typeof tabId !== 'number') return notifySelfClose(e?.message);
    // Chrome 141-144：该窗口当前只有全局面板时 close({tabId}) 会 reject，
    // 退回「按窗口关闭」——windowId 一定关得掉，否则就是只能开不能关
    chrome.sidePanel.close({ windowId }).then(() => {
      _openPanelsByWindow.delete(windowId);
    }).catch((e2) => notifySelfClose(e2?.message));
  });
}

/**
 * 按键后异步校准面板状态镜像。getContexts 只能回答「有没有面板开着」（其 windowId
 * 实测为 -1，无法归到具体窗口），所以：
 * - 没有任何面板 → 清空镜像（面板已被用户手动关掉等）
 * - 有面板 → 不动镜像（窗口归属以 onOpened/onClosed 与本次 open 的写值为准，
 *   清空重建反而会把正确记录冲掉，导致下次按键误判为「未打开」而关不掉）
 */
function refreshPanelState() {
  setTimeout(() => {
    chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).then((contexts) => {
      if (contexts.length === 0) _openPanelsByWindow.clear();
    }).catch(() => {});
  }, 300);
}

/**
 * 在当前 tab 上打开或关闭侧边栏（必须在手势的同步栈内调用）。
 * @param {{id:number, windowId:number}} tab
 */
function toggleSidePanelOnTab(tab) {
  // 全局模式一律用 windowId 开/关：此时 open({tabId}) 打开的其实是全局面板，
  // onOpened 可能不带 tabId，且 Chrome 141-144 对「仅有全局面板时 close({tabId})」
  // 会 reject —— 这正是「能开不能关」的原因。
  const byWindow = _sidePanelScope === 'global';
  if (isSidePanelOpenOnTab(tab)) {
    logger.debug('[Background] command: close sidePanel on tab', tab.id, tab.windowId);
    const entry = _openPanelsByWindow.get(tab.windowId);
    closeSidePanelInWindow(tab.windowId, byWindow || entry === null ? null : tab.id);
    return;
  }
  logger.debug('[Background] command: open sidePanel on tab', tab.id, tab.windowId);
  bindSidePanelToTab(tab.id);
  const options = byWindow ? { windowId: tab.windowId } : { tabId: tab.id };
  // 成功后同步镜像：不依赖 sidePanel.onOpened（Chrome <141 没有该事件），
  // 否则下一次按键会把「已打开」误判为「未打开」，表现为关不掉
  chrome.sidePanel?.open?.(options).then(() => {
    _openPanelsByWindow.set(tab.windowId, byWindow ? null : tab.id);
  }).catch((e) => {
    logger.warn('[Background] open sidePanel failed:', e?.message);
  });
}

/**
 * 冷启动兜底：SW 刚被快捷键唤醒，镜像还没补水，同步拿不到 tabId。
 * - 全局模式：可对「当前窗口」同步 open()（WINDOW_ID_CURRENT 由 Chrome 解析成具体
 *   窗口，已打开时是 no-op），手势不丢；再用启动快照把“本来就已打开”的情况异步关掉。
 * - 标签页绑定模式：open() 必须带 tabId 才是 tab 专属面板，只能异步取 tab —— 此时
 *   手势大概率已失效（open 会报 user gesture 错误），仅把 tab 记进镜像让下次按键生效。
 */
function toggleSidePanelColdStart() {
  if (_sidePanelScope === 'global') {
    logger.debug('[Background] command: cold start, open sidePanel on current window');
    chrome.sidePanel?.open?.({ windowId: chrome.windows.WINDOW_ID_CURRENT }).catch((e) => {
      logger.warn('[Background] open sidePanel failed:', e?.message);
    });
    // 用启动快照（表达 open() 之前的状态）判断本次按键是「开」还是「关」。
    // 快照的 windowId 是 -1，无法判断面板在哪个窗口，只能判断“有没有面板开着”：
    // 有 → 说明本来就已经打开（本次 open 是 no-op），用户意图是关闭当前窗口的面板。
    _startupPanelProbe.then((contexts) => {
      const wasOpen = contexts?.length > 0;
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) => {
        if (!tab?.id) return;
        _activeTabByWindow.set(tab.windowId, tab.id);
        if (_lastFocusedWindowId == null) _lastFocusedWindowId = tab.windowId;
        if (wasOpen) {
          // 关闭不需要手势，可以放在异步里；开别的窗口的面板不动
          closeSidePanelInWindow(tab.windowId, null);
          return;
        }
        // 本来没打开 → 上面的同步 open() 已生效，把状态记进镜像，下次按键才能关
        _openPanelsByWindow.set(tab.windowId, null);
      }).catch(() => {});
    }).catch(() => {});
    return;
  }
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;
    _activeTabByWindow.set(tab.windowId, tab.id);
    _lastFocusedWindowId = tab.windowId;
    toggleSidePanelOnTab(tab);
  });
}

chrome.commands?.onCommand?.addListener((command) => {
  if (command !== TOGGLE_SIDEPANEL_COMMAND) return;
  try {
    // 脱离窗口存在时，快捷键聚焦到脱离窗口而非操作侧边栏
    if (_detachWindowId) {
      try {
        chrome.windows.update(_detachWindowId, { focused: true }).catch(() => {
          _detachWindowId = null;
          chrome.storage.local.remove('_detachWindowId').catch(() => {});
        });
      } catch {
        _detachWindowId = null;
        chrome.storage.local.remove('_detachWindowId').catch(() => {});
      }
      return;
    }
    // 同步路径：镜像里有目标 tab，判断与 open()/close() 全在手势栈内完成
    const tabId = getActiveTabId();
    logger.debug('[Background] toggle: scope=%s focusedWindow=%s tab=%s panels=%s events=%s close=%s',
      _sidePanelScope, _lastFocusedWindowId, tabId, JSON.stringify([..._openPanelsByWindow]),
      _hasPanelOpenEvents, !!chrome.sidePanel?.close);
    if (tabId != null) {
      toggleSidePanelOnTab({ id: tabId, windowId: _lastFocusedWindowId });
    } else {
      toggleSidePanelColdStart();
    }
    refreshPanelState();
  } catch (e) {
    logger.warn('[Background] toggle sidePanel exception:', e?.message);
  }
});

// ==================== 消息路由表 ====================
//
// 所有消息类型通过 if-chain 分发（非 switch），按频率排序：
//
// | 消息类型                      | 来源        | 用途                       | 异步 |
// |-------------------------------|-------------|---------------------------|------|
// | CANCEL_REACT                  | side_panel  | 取消 ReAct 循环             | 否   |
// | TERMINATE_COMMAND             | side_panel  | 终止命令（不取消 ReAct）     | 否   |
// | RELOAD_MCP_TOOLS              | side_panel  | 强制重载 MCP 工具列表        | 是   |
// | GET_MCP_TOOLS                 | side_panel  | 获取 MCP 工具（30s 缓存）    | 是   |
// | GET_AGENT_SKILL_PROMPTS       | side_panel  | 获取 Skill Prompt（60s 缓存）| 是   |
// | GET_SKILL_LIST                | side_panel  | 获取 Skill 列表             | 是   |
// | CAPTURE_TAB                   | side_panel  | 截取可见标签页              | 是   |
// | CAPTURE_TAB_FROM_PAGE         | content     | 页面快捷键触发全屏截图       | 是   |
// | CAPTURE_REGION_FROM_PAGE      | content     | 页面快捷键触发区域截图       | 是   |
// | CALL_API                      | side_panel  | 主 API 调用入口             | 否   |
// | GET_SESSION                   | side_panel  | 获取当前模型配置            | 是   |
// | GET_CHAT_CONFIG               | side_panel  | 获取聊天完整配置            | 是   |
// | OPEN_OPTIONS_PAGE             | side_panel  | 打开配置页面                | 否   |
// | DETACH_SIDEPANEL              | side_panel  | 脱离为独立窗口              | 是   |
// | ATTACH_SIDEPANEL              | side_panel  | 回归侧边栏                  | 是   |
// | SELECTION_TOOLBAR_ACTION      | content     | 划词工具栏操作（ai-search/explain/translate/summary）| 否 |
// | FILL_SIDEPANEL_INPUT          | content     | 追问：填充输入框             | 否   |
// | DIRECT_SEND                   | content     | 追问：直接发送文本           | 否   |
// | GENERATE_PDF                  | content     | CDP 生成 PDF               | 是   |
// | TRIGGER_AGENT_HEALTH_CHECK    | side_panel  | 手动触发 Agent 健康检查      | 否   |
// | AGENT_CONNECTION_CHANGED      | options     | Agent 配对状态变更通知       | 否   |
// | OPTIONS_PAGE_OPEN             | options     | 配置页面已打开，触发全量心跳  | 否   |
// | OPTIONS_PAGE_CLOSED           | options     | 配置页面已关闭，仅维护活跃代理 | 否   |
// | OPEN_LOCAL_PROTOTYPE          | side_panel  | 本地浏览器打开原型文件        | 是   |
// | DELETE_LOCAL_PROTOTYPE        | side_panel  | 删除本地原型文件             | 是   |
//
// ==================== 消息监听 ====================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'IFRAME_SELECTION') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, {
        type: 'IFRAME_SELECTION',
        text: message.text,
        x: message.x,
        y: message.y
      }, { frameId: 0 }).catch(() => {});
    }
    return false;
  }

  if (message.type === 'IFRAME_CLICK_DISMISS') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'IFRAME_CLICK_DISMISS' }).catch(() => {});
    }
    return false;
  }

  if (message.type === 'IFRAME_SELECTION_CLEAR') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { type: 'IFRAME_SELECTION_CLEAR' }).catch(() => {});
    }
    return false;
  }

  if (message.type === 'CANCEL_REACT') {
    const { tabId, sessionId } = message;
    // 优先使用 sessionId，兼容旧版 tabId
    if (sessionId) {
      cancelReactLoop(sessionId);
      cancelRunningAgentCommands(sessionId);  // 关闭正在运行的命令 WebSocket + 杀进程
    } else {
      cancelReactLoop(tabId);
    }
    return false;
  }

  // 查询指定会话是否存在可恢复的 ReAct checkpoint
  // 前端加载会话时调用，用于决定是否展示"继续执行"按钮
  if (message.type === 'GET_CHECKPOINT') {
    const { sessionId } = message;
    if (!sessionId) {
      sendResponse({ exists: false });
      return false;
    }
    getReactCheckpoint(sessionId).then(cp => {
      if (!cp) {
        sendResponse({ exists: false });
        return;
      }
      sendResponse({
        exists: true,
        checkpoint: {
          iteration: cp.iteration,
          interruptedReason: cp.interruptedReason,
          updatedAt: cp.updatedAt,
          messageCount: cp.currentMessages?.length || 0,
          subtaskPlan: cp.subtaskPlan ? { subtaskCount: cp.subtaskPlan.subtasks?.length || 0 } : null,
        }
      });
    }).catch(err => {
      logger.warn('[Background] GET_CHECKPOINT query failed:', err);
      sendResponse({ exists: false });
    });
    return true;  // 异步响应
  }

  // 删除指定会话的 checkpoint（用户主动放弃恢复时调用）
  if (message.type === 'DELETE_CHECKPOINT') {
    const { sessionId } = message;
    if (sessionId) {
      deleteReactCheckpoint(sessionId).then(ok => {
        sendResponse({ success: ok });
      }).catch(err => {
        logger.warn('[Background] DELETE_CHECKPOINT failed:', err);
        sendResponse({ success: false });
      });
    } else {
      sendResponse({ success: false });
    }
    return true;
  }

  // 从 checkpoint 恢复 ReAct 循环
  // 与 CALL_API 类似的消息流，但使用 checkpoint 中的 currentMessages 作为初始消息
  if (message.type === 'RESUME_REACT') {
    const { sessionId, callId: resumeCallId, userGuidance = '' } = message;
    if (!sessionId) {
      sendResponse({ error: t('bg.missingSessionId') });
      return false;
    }

    logger.debug('[Background] recei to  RESUME_REACT,sessionId:', sessionId, 'userGuidance:', userGuidance ? `"${userGuidance.substring(0, 50)}..."` : '( no )');

    // 如果旧任务仍在运行（页面刷新后 SW 中的 reactLoop 可能还在），
    // 先取消旧任务，避免两个 reactLoop 同时运行导致状态冲突
    const cancelOldTask = activeReactLoops.has(sessionId);

    const doResume = () => {
      // 重置 API 调用计数器（恢复视为新的一轮 API 调用起点）
      resetDialogApiCallCount(sessionId);

      // 立即发送初始状态
      const initialStatus = {
        type: 'EXECUTION_STATUS_UPDATE',
        nodeName: t('bg.resumingFromCheckpoint'),
        status: 'processing',
        executionLog: [],
        sessionId,
      };
      if (resumeCallId) {
        initialStatus.callId = resumeCallId;
      }
      chrome.runtime.sendMessage(initialStatus).catch(() => {});

      // 关键：将 resumeCallId 传递给 resumeReactLoopFromCheckpoint，
      // 确保 reactLoop 内部的 StreamController 使用新的 callId 发送 STREAM_* 消息，
      // 与前端 listener 的 myCallId 匹配，否则流式消息会被过滤掉
      resumeReactLoopFromCheckpoint(sessionId, userGuidance, resumeCallId)
        .then(result => {
        // checkpoint 不存在或恢复失败返回 null
        if (!result) {
          logger.warn('[Background] RESUME_REACT: not found checkpoint  or restore failed');
          // 收集诊断信息，帮助定位问题
          getReactCheckpoint(sessionId).then(cp => {
            logger.warn('[Background] RESUME_REACT: re-query checkpoint result:', cp ? 'exists' : 'not found');
          }).catch(() => {});
          chrome.runtime.sendMessage({
            type: 'API_ERROR',
            sessionId,
            callId: resumeCallId,
            error: t('bg.checkpointNotFound'),
            executionLog: [],
            resumed: true,
          }).catch(() => {});
          return;
        }
        logger.debug('[Background] RESUME_REACT complete,content length:', result.content?.length);
        const truncatedLog = (result.executionLog || []).length > MAX_LOG_ENTRIES_FOR_MSG
          ? result.executionLog.slice(-MAX_LOG_ENTRIES_FOR_MSG)
          : (result.executionLog || []);
        chrome.runtime.sendMessage({
          type: 'API_COMPLETE',
          sessionId,
          callId: resumeCallId,
          content: result.content || '',
          executionLog: truncatedLog,
          reflectionScore: result.reflectionScore,
          reasoningContent: result.reasoningContent || null,
          wasRevised: result.wasRevised || false,
          resumed: true,  // 标记为恢复的任务
        }).catch(err => {
          logger.warn('[Background] send RESUME completemessage failed:', err);
        });
      })
      .catch(error => {
        const isAborted = error.name === 'AbortError' || error.message === t('bg.requestCancelled') || error.message === t('bg.reactCancelled');
        logger.debug('[Background] RESUME_REACT failed:', isAborted ? '(usercancel)' : error.message);
        const errLog = error.executionLog || [];
        const truncatedErrLog = errLog.length > MAX_LOG_ENTRIES_FOR_MSG ? errLog.slice(-MAX_LOG_ENTRIES_FOR_MSG) : errLog;
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          sessionId,
          callId: resumeCallId,
          error: error.message || t('bg.resumeFailed'),
          executionLog: truncatedErrLog,
          resumed: true,
        }).catch(() => {});
      });
    };  // doResume 函数结束

    if (cancelOldTask) {
      logger.debug('[Background] RESUME_REACT: detectedoldtaskstill running , first cancel');
      cancelReactLoop(sessionId);
      cancelRunningAgentCommands(sessionId);
      // 给旧任务一点时间清理后再恢复
      setTimeout(doResume, 300);
    } else {
      doResume();
    }

    return false;  // 异步通过 sendMessage 回传结果
  }

  if (message.type === 'TERMINATE_COMMAND') {
    const { sessionId, mode } = message;
    // 终止当前会话正在运行的命令（不取消 ReAct 循环）
    if (sessionId) {
      cancelRunningAgentCommands(sessionId, mode || 'kill');
    }
    return false;
  }

  if (message.type === 'ABORT_CURRENT_TOOL') {
    const { sessionId } = message;
    // 终止当前工具的执行等待（不取消 ReAct 循环，不杀进程）
    const aborted = abortCurrentTool(sessionId);
    sendResponse({ success: aborted });
    return false;
  }

  if (message.type === 'RELOAD_MCP_TOOLS') {
    mcpToolsCache = null; // 强制刷新缓存
    loadMcpTools().then(count => {
      sendResponse({ success: true, count });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_MCP_TOOLS') {
    // 带缓存的重载：30 秒内复用上次结果，避免每次查询都向 Agent 发网络请求
    const now = Date.now();
    if (mcpToolsCache && (now - mcpToolsCache.loadedAt) < 30000) {
      logger.debug(`[Background] GET_MCP_TOOLS usingcache (${mcpToolsCache.tools.length} tool,${Math.round((now - mcpToolsCache.loadedAt) / 1000)}s  before )`);
      sendResponse({ success: true, tools: mcpToolsCache.tools });
      return true;
    }
    loadMcpTools().then(count => {
      const mcpTools = RAW_TOOLS
        .filter(t => t.id.startsWith('mcp_'))
        .map(t => ({
          id: t.id,
          name: t.function?.name || t.id,
          description: t.function?.description || '',
          category: t.category || 'mcp',
          execution: t.execution || 'background',
          parallelizable: t.parallelizable !== false,
          requiresConfirmation: t.requiresConfirmation || false,
          enabled: true
        }));
      mcpToolsCache = { tools: mcpTools, loadedAt: Date.now() };
      logger.debug(`[Background] GET_MCP_TOOLS return ${mcpTools.length} tool ( reloads ${count} )`);
      sendResponse({ success: true, tools: mcpTools });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_AGENT_SKILL_PROMPTS') {
    // 带缓存：60 秒内复用上次结果（未指定 skillNames 时）
    const now = Date.now();
    const skillNames = message.skillNames || null;
    // 如果指定了 skillNames，不使用缓存（因为过滤条件不同）
    if (!skillNames && skillPromptsCache && (now - skillPromptsCache.loadedAt) < 60000) {
      sendResponse({ success: true, prompts: skillPromptsCache.prompts });
      return true;
    }
    
    const fetchPrompts = skillNames && skillNames.length > 0
      ? AgentClient.getAgentSkillPromptsFiltered(skillNames)
      : AgentClient.getAgentSkillPrompts();
    
    fetchPrompts.then(result => {
      const prompts = result.success ? (result.prompts || '') : '';
      // 仅全量请求时缓存（过滤请求不缓存）
      if (!skillNames) {
        skillPromptsCache = { prompts, loadedAt: Date.now() };
      }
      sendResponse({ success: true, prompts });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_AGENT_SKILL_PROMPT') {
    // 获取单个 Agent Skill 的完整 Prompt 内容（供 side_panel 选择技能后直接注入用户消息）
    const name = message.name;
    if (!name) {
      sendResponse({ success: false, error: t('bg.missingSkillName') });
      return true;
    }
    AgentClient.getAgentSkillPrompt(name).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'GET_SKILL_LIST') {
    // 获取技能列表（供 side_panel 技能选择器使用）
    AgentClient.getSkillList().then(result => {
      if (result?.success) {
        sendResponse({ success: true, skills: result.skills || [] });
      } else {
        sendResponse({ success: false, skills: [], error: result?.error || t('bg.fetchFailed') });
      }
    }).catch(err => {
      sendResponse({ success: false, skills: [], error: err.message });
    });
    return true;
  }
  
  if (message.type === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] screenshot failed:', chrome.runtime.lastError.message);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ dataUrl });
      }
    });
    return true; // 异步响应
  }

  if (message.type === 'CAPTURE_TAB_FROM_PAGE') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        logger.error('[Background] pageshortcutscreenshot failed:', chrome.runtime.lastError.message);
      } else {
        chrome.runtime.sendMessage({ type: 'SCREENSHOT_RESULT', dataUrl, mode: 'full' }).catch(() => {});
      }
    });
    return true;
  }

  if (message.type === 'CAPTURE_REGION_FROM_PAGE') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      return false;
    }
    chrome.tabs.sendMessage(tabId, { type: 'START_REGION_SELECTION' }, (rect) => {
      if (!rect) {
        return;
      }
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          logger.error('[Background] region screenshot failed:', chrome.runtime.lastError.message);
        } else {
          chrome.runtime.sendMessage({ type: 'SCREENSHOT_RESULT', dataUrl, mode: 'region', rect }).catch(() => {});
        }
      });
    });
    return true;
  }
  
  if (message.type === 'CALL_API') {
    const { messages, model, useTools, tabId, apiParams, sessionId, imageApiBase, imageApiKey, agentId, agentToolIds, agentSkillIds, callId } = message;

    // 将图片识别独立配置合并到 apiParams 中
    if (imageApiBase) {
      apiParams.imageApiBase = imageApiBase;
    }
    if (imageApiKey) {
      apiParams.imageApiKey = imageApiKey;
    }

    // 重置当前会话的 API 调用计数器
    resetDialogApiCallCount(sessionId);

    // 注意：不再在此处删除旧 checkpoint。
    // 原因：deleteReactCheckpoint 是异步的，可能与 reactLoop 内部的 saveCheckpointNow 产生竞态条件
    // （delete 在 save 之后执行，导致新保存的 checkpoint 被误删）。
    // saveCheckpointNow 使用 store.put()（覆盖写），会自动替换旧 checkpoint，无需预先删除。
    
    // 立即发送初始状态更新，避免用户在工具预筛选等前置步骤期间看不到任何反馈
    const initialStatus = {
      type: 'EXECUTION_STATUS_UPDATE',
      nodeName: t('bg.preparing'),
      status: 'processing',
      executionLog: []
    };
    if (sessionId) {
      initialStatus.sessionId = sessionId;
    }
    if (callId) {
      initialStatus.callId = callId;
    }
    chrome.runtime.sendMessage(initialStatus).catch(() => {});
    
    logger.debug('[Background] recei to  CALL_API message,sessionId:', sessionId, 'useTools:', useTools, 'tabId:', tabId, 'apiParams:', apiParams);
    
    const apiCall = useTools 
      ? (async () => {
          const tools = await getTools(agentToolIds, agentId, agentSkillIds);

          // 工具开关打开但实际没有可用工具，跳过预筛选，直接普通对话
          if (tools.length === 0) {
            logger.debug('[Background] no available tools, skip pre-filter, direct normal conversation');
            return callApiNonStream(messages, model, apiParams, sessionId, {}, callId);
          }

          logger.debug(`[Background] get to  ${tools.length} tool`);

          // 检查工具预筛选开关
          const config = await getStoredConfig();
          const enableToolPreselect = config.reactConfig.enableToolPreselect;

          // 预筛选工具：通过前置规划调用减少不必要的工具传递
          let preselection;
          if (enableToolPreselect) {
            preselection = await preselectTools(messages, model, tools, apiParams);
          } else {
            logger.debug('[Background] toolpre-filterclosed,using alltool');
            preselection = {
              type: 'tools',
              tools,
              executionLog: []
            };
          }

          // 发送预筛选完成状态，让实时日志面板也能看到这个步骤
          if (preselection.executionLog.length > 0) {
            const statusUpdate = {
              type: 'EXECUTION_STATUS_UPDATE',
              nodeName: t('bg.toolPreselect'),
              status: 'success',
              executionLog: preselection.executionLog
            };
            if (sessionId) {
              statusUpdate.sessionId = sessionId;
            }
            if (callId) {
              statusUpdate.callId = callId;
            }
            logger.debug('[Background] sendpre-filterstateupdate:', statusUpdate);
            chrome.runtime.sendMessage(statusUpdate).then(() => {
              logger.debug('[Background] pre-filterstateupdatesend successful');
            }).catch(err => {
              logger.error('[Background] pre-filterstateupdatesend failed:', err);
            });
          }

          // 模型直接回答了，无需再调主力模型
          if (preselection.type === 'answer') {
            logger.debug('[Background] pre-filtermodeldirect answer,skip mainmodelcall with ');
            return { content: preselection.content, executionLog: preselection.executionLog };
          }

          const { tools: selectedTools, executionLog: preselectLog } = preselection;
          logger.debug(`[Background] after pre-filter ${selectedTools.length} tool`);
          logger.debug('[Background] pre-filter executionlog:', JSON.stringify(preselectLog).substring(0, 500));

          // 发送预筛选日志到 Side Panel，使其在流式输出过程中也能看到
          if (preselectLog.length > 0) {
            chrome.runtime.sendMessage({
              type: 'STREAM_PRESELECT',
              sessionId: sessionId,
              callId: callId,
              preselectLog: preselectLog
            }).catch(() => {});
          }

          // 自动预加载长期记忆：检查 messages 中是否已有记忆内容，避免重复注入
          const reactResult = await reactLoop(messages, model, selectedTools, tabId, apiParams, sessionId, null, null, { value: 1 }, preselectLog, callId);
          logger.debug('[Background] ReAct complete,executionLog total:', reactResult.executionLog?.length);
          return {
            content: reactResult.content !== undefined ? reactResult.content : reactResult,
            executionLog: reactResult.executionLog || preselectLog,
            reflectionScore: reactResult.reflectionScore,
            wasRevised: reactResult.wasRevised || false,
            reasoningContent: reactResult.reasoningContent || null
          };
        })()
      : callApiNonStream(messages, model, apiParams, sessionId);
    
    apiCall
      .then(result => {
        // 兼容两种返回格式：{ content, executionLog } 或 { content, usage }
        const content = result.content !== undefined ? result.content : result;
        let executionLog = result.executionLog || [];
        const reflectionScore = result.reflectionScore;
        const wasRevised = result.wasRevised || false;
        const reasoningContent = result.reasoningContent || null;

        // 记录非 ReAct 模式的 token 使用统计
        if (result.usage) {
          recordTokenUsage({
            sessionId,
            model: model || '',
            usage: result.usage,
            callType: 'non_stream'
          }).catch(() => {});

          // 非 ReAct 模式下，将 usage 包装为 executionLog 条目，确保前端能展示 Token 消耗标签
          if (executionLog.length === 0) {
            executionLog = [{
              nodeType: 'api_call',
              nodeName: 'API Call',
              status: 'success',
              timestamp: new Date().toISOString(),
              apiResponse: { tokenUsage: result.usage }
            }];
          }
        }
        
        logger.debug('[Background] API call complete,content length:', content.length, 'execution logcount:', executionLog.length);
        console.log('[Background API_COMPLETE] useTools:', useTools, '| executionLog entries:', executionLog.length, '| agent_file entries:', executionLog.filter(e => e.nodeType === 'tool_exec' && e.action?.name === 'agent_file').length, '| first few types:', executionLog.slice(0, 5).map(e => `${e.nodeType}${e.action ? `(${e.action.name})` : ''}`));
        // 安全截断：防止 executionLog 超过 chrome.runtime.sendMessage 的 64MiB 限制
        const truncatedLog = executionLog.length > MAX_LOG_ENTRIES_FOR_MSG
          ? executionLog.slice(-MAX_LOG_ENTRIES_FOR_MSG)
          : executionLog;
        chrome.runtime.sendMessage({
          type: 'API_COMPLETE',
          sessionId: sessionId,
          callId: callId,
          content: content,
          executionLog: truncatedLog,
          reflectionScore: reflectionScore,
          reasoningContent: reasoningContent,
          wasRevised: wasRevised
        }).catch(err => {
          logger.warn('[Background] send backmessage failed:', err);
        });
      })
      .catch(error => {
        const isAborted = error.name === 'AbortError' || error.message === t('bg.requestCancelled') || error.message === t('bg.reactCancelled');
        if (isAborted) {
          logger.debug('[Background] API call with by usercancel');
        } else {
          logger.error('[Background] API call with failed:', error.message || error);
        }
        // 获取 executionLog（如果可用），安全截断防止 64MiB 限制
        const errExecutionLog = error.executionLog || [];
        const truncatedErrLog = errExecutionLog.length > MAX_LOG_ENTRIES_FOR_MSG
          ? errExecutionLog.slice(-MAX_LOG_ENTRIES_FOR_MSG)
          : errExecutionLog;
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          sessionId: sessionId,
          callId: callId,
          error: error.message || t('bg.apiCallFailed'),
          executionLog: truncatedErrLog
        }).catch(err => {
          logger.warn('[Background] send errormessage failed:', err);
        });
      });
    
    return false;
  }
  
  if (message.type === 'GET_SESSION') {
    getStoredConfig().then((config) => {
      sendResponse({
        modelName: config.modelName
      });
    });
    return true;
  }
  
  if (message.type === 'GET_CHAT_CONFIG') {
    getChatConfig().then((config) => {
      sendResponse(config);
    });
    return true;
  }

  // 获取永久记忆（注意事项），用于注入系统提示词
  if (message.type === 'GET_PERMANENT_NOTES') {
    readMemoryFile()
      .then((result) => {
        if (!result.success) {
          sendResponse({ success: false, facts: [], error: result.error });
          return;
        }
        // 只返回 fact 类型记忆（永久注意事项），按重要性降序排列
        const facts = (result.data.facts || [])
          .sort((a, b) => (b.importance || 0) - (a.importance || 0));
        sendResponse({ success: true, facts });
      })
      .catch((err) => {
        sendResponse({ success: false, facts: [], error: err.message });
      });
    return true;
  }
  
  // 打开配置页面
  if (message.type === 'OPEN_OPTIONS_PAGE') {
    const targetHash = message.hash || '';
    chrome.runtime.openOptionsPage(() => {
      if (targetHash) {
        // 找到 options 页面并设置 hash
        chrome.tabs.query({ url: chrome.runtime.getURL('options.html') + '*' }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { url: chrome.runtime.getURL('options.html') + '#' + targetHash });
          }
        });
      }
    });
    return false;
  }

  // 脱离侧边栏为独立窗口
  if (message.type === 'DETACH_SIDEPANEL') {
    // 弹窗宽度参考侧边栏当前宽度（由侧边栏页面传入），clamp 到合理范围
    const popupWidth = Math.min(Math.max(message.width || 480, 320), 900);
    const popupHeight = 720;
    (async () => {
      try {
        // 以当前浏览器窗口为基准计算居中位置
        let win = null;
        if (sender.tab?.windowId) {
          try { win = await chrome.windows.get(sender.tab.windowId); } catch (e) { /* 忽略 */ }
        }
        if (!win) {
          try { win = await chrome.windows.getLastFocused(); } catch (e) { /* 忽略 */ }
        }
        const left = win ? Math.max(win.left, Math.round(win.left + (win.width - popupWidth) / 2)) : undefined;
        const top = win ? Math.max(win.top, Math.round(win.top + (win.height - popupHeight) / 2)) : undefined;
        const newWin = await chrome.windows.create({
          url: chrome.runtime.getURL('side_panel.html') + '?popup=1',
          type: 'popup',
          width: popupWidth,
          height: popupHeight,
          left,
          top,
        });
        // 记录弹窗 windowId，供后续回归使用（全局变量 + storage 双写）
        _detachWindowId = newWin.id;
        await chrome.storage.local.set({ _detachWindowId: newWin.id }).catch(() => {});
        logger.debug('[Background] sidePanel detached, windowId:', newWin.id);
        sendResponse({ success: true, windowId: newWin.id });
      } catch (e) {
        logger.warn('[Background] detach sidePanel failed:', e?.message);
        sendResponse({ success: false, error: e?.message });
      }
    })();
    return true; // 异步响应
  }

  // 回归侧边栏
  if (message.type === 'ATTACH_SIDEPANEL') {
    // 清除全局变量和 storage
    _detachWindowId = null;
    // 关闭弹窗窗口
    if (message.windowId) {
      chrome.windows.remove(message.windowId).catch(() => {});
    }
    chrome.storage.local.remove('_detachWindowId').catch(() => {});
    // 获取当前活动标签页后打开侧边栏
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        bindSidePanelToTab(tabs[0].id);
        chrome.sidePanel?.open?.({ tabId: tabs[0].id }).catch(err => {
          logger.warn('[Background] open sidePanel after attach failed:', err?.message);
        });
      }
    });
    sendResponse({ success: true });
    return false;
  }

  // 选中文本工具栏操作
  if (message.type === 'SELECTION_TOOLBAR_ACTION') {
    const { prompt, action, text, systemPrompt } = message;
    const tabId = sender.tab?.id;
    const frameId = sender.frameId;
    
    logger.debug('[Background] received selected text toolbar operation:', action, 'tabId:', tabId);
    
    // AI搜索：打开侧边栏，在侧边栏中发起搜索
    if (action === 'ai-search') {
      // 检查脱离窗口是否存在，存在则不打开侧边栏（弹窗会接收消息）
      // 注：MV3 SW 中 chrome.extension.getViews 不可用，脱离窗口状态由 _detachWindowId 跟踪
      const hasDetachWindow = _detachWindowId != null;
      if (!hasDetachWindow && tabId) {
        bindSidePanelToTab(tabId);
        chrome.sidePanel.open({ tabId }).catch(err => {
          logger.warn('[Background] open Side Panel failed:', err?.message || err);
        });
      }
      handleSelectionSearch(prompt, text, tabId);
      return false;
    }
    
    // 其他操作（解释、翻译、总结、自定义工具）：直接调用 API
    const systemPrompts = {
      'explain': '你正在处理用户在网页上选中的内容。用1-3句简洁解释选中内容，必要时补充一个简短示例。不要展开长篇论述。',
      'translate': '你正在处理用户在网页上选中的内容。自动检测语言：中文→英文，英文→中文，其他语言→同时给出中英文。只输出翻译结果，不添加额外说明。',
      'summary': '你正在处理用户在网页上选中的内容。用3-5个要点总结选中内容，每条要点一句话，提炼核心信息即可。'
    };
    
    // 自定义工具使用传入的 systemPrompt，内置工具使用默认的
    const systemContent = systemPrompt || systemPrompts[action] || '你正在处理用户在网页上选中的内容，请用简洁的语言回答用户的问题。';
    
    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: prompt }
    ];
    
    resetDialogApiCallCount();
    
    getStoredConfig().then(async (config) => {
      try {
        const useStream = config.streamConfig?.streamEnabled !== false;

        if (useStream && tabId) {
          // 流式模式：通过 StreamController 向 content script 发送实时消息
          const streamSessionId = `toolbar_${tabId}_${Date.now()}`;
          const result = await callApiNonStream(messages, config.modelName, {}, streamSessionId, {
            sendFn: (msg) => chrome.tabs.sendMessage(tabId, msg, { frameId }).catch(() => {}),
            typePrefix: 'SELECTION_TOOLBAR_'
          });
          const content = result.content !== undefined ? result.content : result;

          // 记录 token 使用统计
          if (result.usage) {
            recordTokenUsage({
              sessionId: 'selection_toolbar',
              model: config.modelName,
              usage: result.usage,
              callType: 'stream'
            }).catch(() => {});
          }

          logger.debug('[Background] selected texttoolbarstreaming API complete,content length:', content.length);
        } else {
          // 非流式模式：等待完整结果后一次性返回
          const result = await callApiNonStream(messages, config.modelName, {});
          const content = result.content !== undefined ? result.content : result;

          // 记录 token 使用统计
          if (result.usage) {
            recordTokenUsage({
              sessionId: 'selection_toolbar',
              model: config.modelName,
              usage: result.usage,
              callType: 'non_stream'
            }).catch(() => {});
          }

          logger.debug('[Background] selected texttoolbar API complete,content length:', content.length);

          if (tabId) {
            chrome.tabs.sendMessage(tabId, {
              type: 'SELECTION_TOOLBAR_RESULT',
              content: content,
              usage: result.usage || null
            }, { frameId }).catch(() => {
              logger.warn('[Background] send SELECTION_TOOLBAR_RESULT  to  tab failed');
            });
          }
        }
      } catch (error) {
        logger.error('[Background] selected texttoolbar API failed:', error);
        
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SELECTION_TOOLBAR_RESULT',
            error: error.message || t('bg.apiCallFailed')
          }, { frameId }).catch(() => {});
        }
      }
    });
    
    return false;
  }
  
  // 选中文本工具栏追问：填充侧边栏输入框
  if (message.type === 'FILL_SIDEPANEL_INPUT') {
    const tabId = sender.tab?.id;
    const text = message.text;
    logger.debug('[Background] received follow-upfillrequested :', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      bindSidePanelToTab(tabId);
      chrome.sidePanel.open({ tabId }).catch(err => {
        logger.warn('[Background] open Side Panel failed:', err?.message || err);
      });
    }
    
    // 存储待填充的文本到 session storage（防止侧边栏未打开时丢失）
    chrome.storage.session.set({
      pendingFillInput: {
        text: text,
        timestamp: Date.now()
      }
    }).catch(() => {});
    
    // 发送消息给 Side Panel
    chrome.runtime.sendMessage({
      type: 'FILL_SIDEPANEL_INPUT',
      text: text
    }).catch(() => {
      logger.debug('[Background] Side Panel  not open,fillcontentstorage,waiting Side Panel load');
    });
    
    return false;
  }
  
  // 选中文本工具栏追问：直接发送到侧边栏
  if (message.type === 'DIRECT_SEND') {
    const tabId = sender.tab?.id;
    const text = message.text;
    const selectedText = message.selectedText || '';
    logger.debug('[Background] received directsendrequested :', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      bindSidePanelToTab(tabId);
      chrome.sidePanel.open({ tabId }).catch(err => {
        logger.warn('[Background] open Side Panel failed:', err?.message || err);
      });
    }
    
    // 存储待发送的文本到 session storage（防止侧边栏未打开时丢失）
    chrome.storage.session.set({
      pendingDirectSend: {
        text: text,
        selectedText: selectedText,
        timestamp: Date.now()
      }
    }).catch(() => {});
    
    // 发送消息给 Side Panel
    chrome.runtime.sendMessage({
      type: 'DIRECT_SEND',
      text: text,
      selectedText: selectedText
    }).catch(() => {
      logger.debug('[Background] Side Panel  not open,sendcontentstorage,waiting Side Panel load');
    });
    
    return false;
  }
  if (message.type === 'TRIGGER_AGENT_HEALTH_CHECK') {
    // 重置状态标记，确保无论状态是否变化都会通知 Side Panel
    _agentLastStatus.clear();
    performAgentHealthCheck();
    return false;
  }
  if (message.type === 'OPTIONS_PAGE_OPEN') {
    _optionsPageOpen = true;
    _agentLastStatus.clear();
    performAgentHealthCheck(); // 立即触发全量心跳
    return false;
  }
  if (message.type === 'OPTIONS_PAGE_CLOSED') {
    _optionsPageOpen = false;
    return false;
  }
  if (message.type === 'AGENT_CONNECTION_CHANGED') {
    chrome.runtime.sendMessage({
      type: 'AGENT_CONNECTION_CHANGED',
      connected: message.connected,
      agentId: message.agentId
    }).catch(() => {});
    if (message.connected && message.agentId) {
      // 1. 清空所有 agent 特定缓存（Skills/MCP/Prompts）
      AgentClient.clearSkillsCache();
      skillPromptsCache = null;
      mcpToolsCache = null;
      clearSkillLoadCache();

      // 2. 清空健康检查历史 + 连通性缓存
      _agentLastStatus.clear();
      clearAgentConnectivityCache();

      // 3. 乐观标记新代理可达，停止所有旧重连
      AgentClient.setAgentReachable(message.agentId, true);
      _stopAllAutoReconnect();

      // 4. 加载新代理的 MCP 工具
      loadMcpTools().then(count => {
        if (count > 0) logger.debug(`[Background] switchagent after loaded: ${count}  MCP tool`);
      }).catch(() => {});

      // 5. 延迟验证连通性
      setTimeout(() => {
        performAgentHealthCheck();
      }, 3000);
    } else if (!message.connected) {
      // 断开时停止所有重连 + 清理缓存
      _stopAllAutoReconnect();
      mcpToolsCache = null;
      skillPromptsCache = null;
      clearSkillLoadCache();
      performAgentHealthCheck();
    }
    return false;
  }
  // 批量检查文件是否存在（产物删除标记用）
  // 安全策略：Agent 离线/请求失败时假设文件存在，避免误标记删除
  // 此时保留命令解析的快照状态作为兜底
  if (message.type === 'CHECK_FILES_EXIST') {
    const paths = message.paths || [];
    if (paths.length === 0) {
      sendResponse({ success: true, results: {} });
      return false;
    }
    (async () => {
      const results = await Promise.allSettled(
        paths.map(p => AgentClient.statFile(p))
      );
      const existenceMap = {};
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value.success) {
          existenceMap[paths[i]] = r.value.exists;
        } else {
          // Agent 离线或请求失败 → 不标记，保留命令解析结果
          existenceMap[paths[i]] = true;
        }
      });
      sendResponse({ success: true, results: existenceMap });
    })();
    return true; // 异步 sendResponse
  }
  // 重启代理
  if (message.type === 'AGENT_RESTART') {
    (async () => {
      const result = await AgentClient.restartAgent();
      sendResponse(result);
    })();
    return true;
  }
  // 更新代理
  if (message.type === 'AGENT_UPDATE') {
    (async () => {
      const result = await AgentClient.updateAgent();
      sendResponse(result);
    })();
    return true;
  }
  // 停止代理
  if (message.type === 'AGENT_STOP') {
    (async () => {
      const result = await AgentClient.stopAgent();
      sendResponse(result);
    })();
    return true;
  }
  // 在本地浏览器打开原型文件
  if (message.type === 'OPEN_LOCAL_PROTOTYPE') {
    (async () => {
      const result = await AgentClient.openBrowser(message.path);
      sendResponse(result);
    })();
    return true; // 异步响应
  }
  // 删除本地原型文件
  if (message.type === 'DELETE_LOCAL_PROTOTYPE') {
    (async () => {
      try {
        const dirPath = message.path.replace(/[\\/][^\\/]+\.html$/, '');
        const result = await AgentClient.deleteFile(dirPath);
        if (result.success) {
          logger.debug('[Background] local prototypefile deleted:', dirPath);
        } else {
          logger.warn('[Background] local prototypefiledelete failed:', result.error);
        }
        sendResponse(result);
      } catch (err) {
        logger.warn('[Background] local prototypefiledelete failed:', err.message);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
  // 定时任务 CRUD / 立即执行
  if (message.type?.startsWith('SCHEDULED_TASK_')) {
    return handleScheduledTaskCommand(message, sendResponse);
  }
  // 查询审计日志
  if (message.type === 'QUERY_AUDIT_LOGS') {
    AgentClient.queryAuditLogs({ category: message.category, limit: message.limit }).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// 处理选中文本的 AI 搜索：存储搜索结果并通知 Side Panel
async function handleSelectionSearch(prompt, selectedText, tabId) {
  logger.debug('[Background] processselected text AI search:', prompt.substring(0, 50) + '...');
  
  // 存储待处理的搜索内容到 session storage
  await chrome.storage.session.set({
    pendingSelectionSearch: {
      prompt: prompt,
      selectedText: selectedText,
      timestamp: Date.now()
    }
  });
  
  // 发送消息给 Side Panel（Side Panel 已由 content script 在有用户手势时打开）
  chrome.runtime.sendMessage({
    type: 'SELECTION_AI_SEARCH',
    prompt: prompt,
    selectedText: selectedText
  }).catch(() => {
    logger.debug('[Background] Side Panel  not open,searchcontentstorage,waiting Side Panel load');
  });
}

// ==================== Agent 健康检查 ====================

let agentHealthCheckInterval = null;
let agentHeartbeatInterval = null;   // 活跃代理心跳定时器（带 token，维持 lastAuthTime）
let _optionsPageOpen = false;        // 配置页面是否打开（影响非活跃代理心跳）
const _agentLastStatus = new Map();  // agentId -> boolean（上次检查的状态）
const _autoReconnectTimers = new Map(); // agentId -> { timer, retries } — 自动重连

/**
 * 执行单次代理可达性检测（5秒超时 + 重试）
 */
async function checkSingleAgentReachable(agent) {
  let connected = false;
  const timeoutMs = 5000;

  // 首次检测
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${agent.url}/api/status`, { signal: controller.signal, cache: 'no-cache' });
    clearTimeout(timeoutId);
    connected = response.ok;
  } catch {
    connected = false;
  }

  // 首次失败后重试一次（给远程代理连接建立时间）
  if (!connected) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(`${agent.url}/api/status`, { signal: controller.signal, cache: 'no-cache' });
      clearTimeout(timeoutId);
      connected = response.ok;
    } catch {
      connected = false;
    }
  }

  return connected;
}

/**
 * 执行 Agent 健康检查，遍历所有配对代理，状态变化时通知 Side Panel
 */
async function performAgentHealthCheck() {
  try {
    const allAgents = await AgentClient.getPairedAgents();

    if (allAgents.length === 0) {
      if (_agentLastStatus.size > 0) {
        _agentLastStatus.clear();
        clearAgentConnectivityCache();
        AgentClient.setAgentReachable('__global__', false);
        notifyAgentStatusChange(false, '未配对');
      }
      return;
    }

    const activeAgent = await AgentClient.getActiveAgent();

    // 过滤停用的代理
    const enabledAgents = allAgents.filter(a => !a.disabled);

    // 仅检查的代理范围：配置页面打开 → 全部启用代理；否则 → 仅活跃代理
    const agentsToCheck = _optionsPageOpen
      ? enabledAgents
      : (activeAgent && !activeAgent.disabled ? [activeAgent] : []);

    if (agentsToCheck.length === 0) return;

    const results = await Promise.allSettled(
      agentsToCheck.map(async (agent) => {
        const connected = await checkSingleAgentReachable(agent);

        const prev = _agentLastStatus.get(agent.id);
        if (prev !== connected) {
          _agentLastStatus.set(agent.id, connected);
          AgentClient.setAgentReachable(agent.id, connected);
          logger.debug(`[Background] agent ${agent.name} status change: ${connected ? 'online' : 'offline'}`);
          return { agentId: agent.id, name: agent.name, connected, changed: true };
        }
        return { agentId: agent.id, name: agent.name, connected, changed: false };
      })
    );

    const changedAgents = results
      .filter(r => r.status === 'fulfilled' && r.value.changed)
      .map(r => r.value);

    if (changedAgents.length > 0) {
      clearAgentConnectivityCache();

      const activeChanged = changedAgents.find(a => a.agentId === activeAgent?.id);

      if (activeChanged) {
        notifyAgentStatusChange(activeChanged.connected, activeChanged.connected ? '在线' : '离线', activeChanged.agentId);

        if (activeChanged.connected) {
          _stopAutoReconnect(activeChanged.agentId);
          loadMcpTools().then(count => {
            if (count > 0) logger.debug(`[Background] Agent after reconnect loaded: ${count}  MCP tool`);
          }).catch(() => {});
        } else {
          await unloadMcpTools();
          mcpToolsCache = null;
          logger.debug('[Background] Agent disconnect,cleaned MCP tool');
          // 启动自动重连
          _startAutoReconnect(activeAgent);
        }
      }
    }
  } catch (err) {
    logger.warn('[Background] agenthealth checkexception:', err.message);
  }
}

/**
 * 启动自动重连（每 15 秒重试，最多 20 次）
 */
function _startAutoReconnect(agent) {
  if (!agent || agent.disabled) return;

  const existing = _autoReconnectTimers.get(agent.id);
  if (existing) return; // 已在重连中

  const schedule = (retries) => {
    if (retries >= 20) {
      _autoReconnectTimers.delete(agent.id);
      logger.debug(`[Background] agent ${agent.name} auto reconnectabandoned (exceed maxretry times)`);
      return;
    }

    const timer = setTimeout(async () => {
      // 重试前检查：代理是否已被删除或停用
      const currentAgents = await AgentClient.getPairedAgents();
      const current = currentAgents.find(a => a.id === agent.id);
      if (!current || current.disabled) {
        _autoReconnectTimers.delete(agent.id);
        logger.debug(`[Background] agent ${agent.name} ${current?.disabled ? 'disable' : 'delete'},stopauto reconnect`);
        return;
      }

      logger.debug(`[Background] agent ${agent.name} auto reconnectattempt ${retries + 1}/20`);
      const connected = await checkSingleAgentReachable(agent);

      if (connected) {
        _autoReconnectTimers.delete(agent.id);
        _agentLastStatus.set(agent.id, true);
        AgentClient.setAgentReachable(agent.id, true);
        clearAgentConnectivityCache();

        notifyAgentStatusChange(true, '在线', agent.id);
        _refreshActiveAgentState(agent.id);

        loadMcpTools().then(count => {
          if (count > 0) logger.debug(`[Background] Agent ${agent.name} reconnect successful,loaded: ${count}  MCP tool`);
        }).catch(() => {});
        logger.debug(`[Background] agent ${agent.name} auto reconnect successful`);
      } else {
        // 继续重试
        schedule(retries + 1);
      }
    }, 15000);

    _autoReconnectTimers.set(agent.id, { timer, retries });
  };

  schedule(0);
}

/**
 * 停止自动重连
 */
function _stopAutoReconnect(agentId) {
  const entry = _autoReconnectTimers.get(agentId);
  if (entry) {
    clearTimeout(entry.timer);
    _autoReconnectTimers.delete(agentId);
  }
}

/**
 * 停止所有重连计时器
 */
function _stopAllAutoReconnect() {
  for (const [agentId, entry] of _autoReconnectTimers) {
    clearTimeout(entry.timer);
  }
  _autoReconnectTimers.clear();
}

/**
 * 重连成功后刷新活跃代理状态（MCP 工具等）
 */
async function _refreshActiveAgentState(agentId) {
  try {
    const activeAgent = await AgentClient.getActiveAgent();
    if (activeAgent && activeAgent.id === agentId) {
      loadMcpTools().then(count => {
        if (count > 0) logger.debug(`[Background] active agentafter reconnect loaded: ${count}  MCP tool`);
      }).catch(() => {});
    }
  } catch (e) {
    logger.warn('[Background] refreshactive agentstate failed:', e.message);
  }
}

/**
 * 通知 Side Panel 代理状态变化
 */
function notifyAgentStatusChange(connected, status, agentId) {
  chrome.runtime.sendMessage({
    type: 'AGENT_STATUS_CHANGE',
    connected,
    status,
    agentId
  }).catch(() => {
    // Side Panel 可能未打开，忽略错误
  });
}

/**
 * 启动 Agent 定期健康检查（30 秒间隔）
 */
function startAgentHealthCheck() {
  stopAgentHealthCheck();
  logger.debug('[Background] start Agent health check (30s interval)');
  
  // 立即执行一次
  performAgentHealthCheck();
  
  agentHealthCheckInterval = setInterval(performAgentHealthCheck, 30000);

  // 启动活跃代理心跳（带 token，60s 间隔，只对当前活跃代理发）
  startAgentHeartbeat();
}

/**
 * 停止 Agent 定期健康检查
 */
function stopAgentHealthCheck() {
  if (agentHealthCheckInterval) {
    clearInterval(agentHealthCheckInterval);
    agentHealthCheckInterval = null;
    _agentLastStatus.clear();
  }
  stopAgentHeartbeat();
}

/**
 * 活跃代理心跳：只对当前活跃代理发轻量心跳（GET /api/heartbeat，带 token）
 * - 作用：刷新代理端 lastAuthTime，使其感知"插件在线"，从而停止刷新配对码
 * - 只发当前活跃代理，配对但未激活的代理不发
 */
async function performAgentHeartbeat() {
  try {
    const activeAgent = await AgentClient.getActiveAgent();
    if (!activeAgent || activeAgent.disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      await fetch(`${activeAgent.url}/api/heartbeat`, {
        headers: { 'Authorization': `Bearer ${activeAgent.token}` },
        signal: controller.signal,
        cache: 'no-cache'
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // 心跳失败静默（连接状态由 performAgentHealthCheck 负责）
  }
}

function startAgentHeartbeat() {
  stopAgentHeartbeat();
  // 立即发一次，让代理端尽快感知插件在线
  performAgentHeartbeat();
  agentHeartbeatInterval = setInterval(performAgentHeartbeat, 60 * 1000);
}

function stopAgentHeartbeat() {
  if (agentHeartbeatInterval) {
    clearInterval(agentHeartbeatInterval);
    agentHeartbeatInterval = null;
  }
}

// SW 启动时自动开始健康检查
startAgentHealthCheck();
