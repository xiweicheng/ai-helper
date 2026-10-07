// notifier.js - 桌面通知中心：聊天任务完成/失败、定时任务结果、确认/澄清交互提醒
//
// 多实例防重复（关键设计）：插件在 tab 级模式下可同时存在多个侧边栏实例，通知创建权
// 统一收敛在 background SW（全局唯一实例）——侧边栏实例只通过 TASK_FEEDBACK_NOTIFY
// 上报，不直接创建通知，也不消费上报消息；确认/澄清提醒由 SW 在弹窗送达后直接创建
// 一次，与面板实例数量无关。同会话通知 id 固定，重复创建会被 Chrome 覆盖而非叠加。
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { getSession } from '../storage/db.js';

registerTranslations('zh', {
  notify: {
    feedbackSuccessTitle: '任务已完成',
    feedbackFailTitle: '任务失败',
    feedbackSuccessMsg: '「{name}」已完成，点击查看结果',
    feedbackFailMsg: '「{name}」执行失败：{error}',
    unknownError: '未知错误',
    defaultName: 'AI 助手',
    confirmTitle: '需要你的确认',
    confirmMsg: '敏感操作「{tool}」等待你确认，请打开侧边栏处理',
    clarifyTitle: 'AI 需要你的澄清',
    clarifyMsg: 'AI 在等待你的回答：{question}',
  },
});
registerTranslations('en', {
  notify: {
    feedbackSuccessTitle: 'Task completed',
    feedbackFailTitle: 'Task failed',
    feedbackSuccessMsg: '"{name}" completed. Click to view the result',
    feedbackFailMsg: '"{name}" failed: {error}',
    unknownError: 'Unknown error',
    defaultName: 'AI Assistant',
    confirmTitle: 'Confirmation needed',
    confirmMsg: 'Sensitive action "{tool}" is waiting for your confirmation. Open the side panel to proceed',
    clarifyTitle: 'AI needs your clarification',
    clarifyMsg: 'AI is waiting for your answer: {question}',
  },
});

// 通知 id 前缀：onClicked 只处理本模块创建的通知（show_notification 工具等其余通知不受影响）
const ID_PREFIX = 'aih|';
// 通知横幅显示空间有限，错误/详情文本做截断
const FEEDBACK_ERROR_MAX = 160;
const INTERACTION_DETAIL_MAX = 120;

// 依赖注入（index.js 调用 initNotifier 接线；避免 notifier → index 循环导入）
let _isPanelVisible = null; // (sessionId) => boolean：发起实例的面板当前是否对用户可见
let _revealPanel = null; // () => void：打开/聚焦侧边栏

/**
 * 接线通知中心（由 background/index.js 在镜像就绪后调用）
 * @param {{isPanelVisible?: (sessionId: string) => boolean, revealPanel?: () => void}} deps
 */
export function initNotifier({ isPanelVisible, revealPanel } = {}) {
  if (typeof isPanelVisible === 'function') _isPanelVisible = isPanelVisible;
  if (typeof revealPanel === 'function') _revealPanel = revealPanel;
  // onClicked 只在此处注册：模块顶层注册会让缺少 onClicked 的单测 mock 在导入时崩溃
  try {
    chrome.notifications?.onClicked?.addListener?.((notificationId) => {
      if (typeof notificationId !== 'string' || !notificationId.startsWith(ID_PREFIX)) return;
      _clear(notificationId);
      try {
        _revealPanel?.();
      } catch (err) {
        logger.debug('[Notifier] reveal panel failed:', err?.message);
      }
    });
  } catch (err) {
    logger.debug('[Notifier] register onClicked failed:', err?.message);
  }
}

/**
 * 读取开关配置（callback 式，undefined 视为 true）；API 不可用时按开启兜底
 * @param {string} key
 * @returns {Promise<boolean>}
 */
function _readEnabled(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get?.(key, (result) => {
        resolve(result?.[key] !== false);
      });
    } catch (err) {
      resolve(true);
    }
  });
}

/** 创建通知；chrome.notifications 访问全走可选链，create 返回非 Promise（测试 mock）时不崩 */
function _create(id, options) {
  try {
    const p = chrome.notifications?.create?.(id, options);
    p?.catch?.(() => {});
  } catch (err) {
    logger.debug('[Notifier] create notification failed:', err?.message);
  }
}

/** 清除通知（通知不存在时为无操作） */
function _clear(id) {
  try {
    const p = chrome.notifications?.clear?.(id);
    p?.catch?.(() => {});
  } catch (err) {
    logger.debug('[Notifier] clear notification failed:', err?.message);
  }
}

/** 文本压缩：折叠空白 + 按需截断（通知横幅显示空间有限） */
function _truncate(text, max) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function _iconUrl() {
  try {
    return chrome.runtime?.getURL?.('icons/icon128.png') || 'icons/icon128.png';
  } catch {
    return 'icons/icon128.png';
  }
}

/**
 * 任务完成/失败桌面通知（聊天任务与定时任务共用）
 * @param {Object} opts
 * @param {boolean} opts.success 成功 / 失败
 * @param {string|null} [opts.sessionId] 会话 id（可见性判定、显示名、通知 id）
 * @param {string} [opts.name] 显示名（优先于会话 title）
 * @param {string} [opts.error] 失败原因（失败时展示，截断）
 * @param {'chat'|'scheduled'} [opts.source] chat：看不到发起实例面板时才弹；scheduled：不受可见性抑制
 */
export async function notifyTaskFeedback({ success, sessionId = null, name = '', error = '', source = 'chat' } = {}) {
  try {
    const enabledKey = source === 'scheduled' ? 'scheduledNotificationEnabled' : 'completionNotificationEnabled';
    if (!(await _readEnabled(enabledKey))) return;
    // 聊天任务：只在“看不到发起实例的面板”时弹（按发起实例身份判定，多实例互不误判）；
    // 定时任务：后台执行无面板实例、无音效等其他提醒渠道 → 不做可见性抑制
    if (source === 'chat' && sessionId && _isPanelVisible && _isPanelVisible(sessionId)) return;

    let displayName = name;
    if (!displayName && sessionId) {
      try {
        const session = await getSession(sessionId);
        displayName = session?.title || '';
      } catch { /* 读取失败走默认名 */ }
    }
    displayName = displayName || t('notify.defaultName');

    const ok = !!success;
    _create(ID_PREFIX + 'feedback|' + (ok ? 'ok' : 'fail') + '|' + (sessionId || 'global'), {
      type: 'basic',
      iconUrl: _iconUrl(),
      title: ok ? t('notify.feedbackSuccessTitle') : t('notify.feedbackFailTitle'),
      message: ok
        ? t('notify.feedbackSuccessMsg', { name: displayName })
        : t('notify.feedbackFailMsg', { name: displayName, error: _truncate(error || t('notify.unknownError'), FEEDBACK_ERROR_MAX) }),
      // 已有自定义完成音效（completionSoundEnabled 开关），通知本身静音避免双重声音
      silent: true,
      // 成功由系统自动收起；失败停留至手动关闭（失败更需要被注意到）
      requireInteraction: !ok,
    });
  } catch (err) {
    logger.debug('[Notifier] notify task feedback failed:', err?.message || err);
  }
}

/**
 * 确认/澄清交互提醒（推理循环等待用户操作时）
 * @param {Object} opts
 * @param {'confirm'|'clarify'} [opts.kind]
 * @param {string|null} [opts.sessionId]
 * @param {string} [opts.detail] 确认=工具名；澄清=问题文本（截断）
 */
export async function notifyInteractionRequired({ kind = 'confirm', sessionId = null, detail = '' } = {}) {
  try {
    if (!(await _readEnabled('interactionNotificationEnabled'))) return;
    // 看得到发起实例的面板时不打扰（用户能直接操作弹窗），智能抑制
    if (sessionId && _isPanelVisible && _isPanelVisible(sessionId)) return;

    const isConfirm = kind !== 'clarify';
    _create(ID_PREFIX + 'interaction|' + (isConfirm ? 'confirm' : 'clarify') + '|' + (sessionId || 'global'), {
      type: 'basic',
      iconUrl: _iconUrl(),
      title: isConfirm ? t('notify.confirmTitle') : t('notify.clarifyTitle'),
      message: isConfirm
        ? t('notify.confirmMsg', { tool: _truncate(detail, INTERACTION_DETAIL_MAX) })
        : t('notify.clarifyMsg', { question: _truncate(detail, INTERACTION_DETAIL_MAX) }),
      // 交互提醒保留系统默认提示音（比任务结果更需要即时提醒）；
      // 停留至手动关闭，用户响应/超时/面板关闭时由调用方 clear 清除
      requireInteraction: true,
    });
  } catch (err) {
    logger.debug('[Notifier] notify interaction required failed:', err?.message || err);
  }
}

/**
 * 清除指定会话的交互提醒（用户响应 / 超时 / 面板关闭时调用）
 * 会话无对应通知时为无操作
 * @param {string|null} sessionId
 */
export function clearInteractionNotification(sessionId) {
  const key = sessionId || 'global';
  _clear(ID_PREFIX + 'interaction|confirm|' + key);
  _clear(ID_PREFIX + 'interaction|clarify|' + key);
}
