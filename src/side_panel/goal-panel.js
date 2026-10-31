// goal-panel.js - 目标模式（Goal）面板：开关 chip + 目标条 + 与后台的意图通道
//
// 三条纪律：
//   ① 面板只表达意图（SET_GOAL 的 action），目标语义与状态机全在后台
//      （goal-store 落库 + react-loop 裁定）。面板不自己判定达成、不自己推进轮次。
//   ② goalMode 是会话级开关（随会话持久化），不是全局设置——同一会话继续发消息
//      才会累加到同一个目标上。
//   ③ autoApprove（敏感操作自动放行）只由这里的开关授予，且必须在目标条上可见、
//      可一键撤销。意图识别触发的目标恒为 false（见 shared/goal.js createGoal）。

import state from './state.js';
import { t } from '../shared/i18n.js';
import { showToast, escapeHtml } from './utils.js';
import logger from '../shared/logger.js';
import { detectGoalIntent, stripGoalIntentPhrases } from '../shared/goal-intent.js';

// 与 shared/goal.js 的 GOAL_STATUS 对齐（这里只做展示映射，不参与裁决）
const STATUS_LABEL_KEYS = {
  active: 'goal.statusActive',
  paused: 'goal.statusPaused',
  achieved: 'goal.statusAchieved',
  unmet: 'goal.statusUnmet',
  budget_limited: 'goal.statusBudgetLimited',
  cleared: 'goal.statusCleared',
};
const FINISHED_STATUSES = new Set(['achieved', 'unmet', 'cleared']);

let els = null;

function el(id) {
  return document.getElementById(id);
}

function statusText(status) {
  const key = STATUS_LABEL_KEYS[status];
  return key ? t(key) : String(status || '');
}

function isFinished(goal) {
  return !!goal && FINISHED_STATUSES.has(goal.status);
}

/**
 * 统一的后台调用：SET_GOAL / GET_GOAL。
 * 一律 fail-soft —— 面板不能因为一次通道异常就把 UI 打崩，最坏退化成「没有目标」。
 */
function sendGoalMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        if (chrome.runtime.lastError) {
          logger.debug('[GoalPanel] message failed:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(resp || null);
      });
    } catch (e) {
      logger.debug('[GoalPanel] message threw:', e?.message);
      resolve(null);
    }
  });
}

function sendGoalCommand(cmd) {
  return sendGoalMessage({ type: 'SET_GOAL', ...cmd });
}

/**
 * 渲染目标条。
 * 显示规则：开关亮 → 常驻（无目标时提示怎么开始）；开关灭 → 只有「未结束的目标」
 * 才显示，避免用户关掉开关后既看不到目标、也无法继续。
 */
export function renderGoalBar() {
  if (!els) return;
  const goal = state.goalSnapshot;
  const enabled = state.goalMode;
  // chip 必须跟着重绘：goalMode 是会话级开关，switchToSession 只改了 state，
  // 不同步就会出现「切到未开目标的会话，🎯 还亮着」
  els.toggle.checked = enabled;
  const shouldShow = enabled || (goal && !isFinished(goal));
  els.bar.style.display = shouldShow ? '' : 'none';
  if (!shouldShow) return;

  els.bar.dataset.status = goal ? goal.status : 'none';
  els.status.textContent = goal ? statusText(goal.status) : '';
  els.status.style.display = goal ? '' : 'none';

  if (goal) {
    els.objective.textContent = goal.objective || '';
    els.objective.title = goal.objective || '';
    const parts = [t('goal.turns', { turns: goal.turnsUsed || 0, budget: goal.turnBudget || 0 })];
    const extra = Array.isArray(goal.constraints) ? goal.constraints.length : 0;
    if (extra > 0) parts.push(t('goal.constraints', { count: extra }));
    els.meta.textContent = parts.join(' · ');
  } else {
    els.objective.textContent = t('goal.startHint');
    els.objective.title = '';
    els.meta.textContent = '';
  }

  // 自动放行徽标：只在「目标在跑 + 持有授权」时亮，且必须可点撤销
  const approveOn = !!goal && goal.status === 'active' && goal.autoApprove === true;
  els.approve.style.display = approveOn ? '' : 'none';

  // 按钮随状态显隐：终态不再给「暂停/继续」
  const canPause = !!goal && goal.status === 'active';
  const canResume = !!goal && (goal.status === 'paused' || goal.status === 'budget_limited');
  els.pause.style.display = canPause ? '' : 'none';
  els.resume.style.display = canResume ? '' : 'none';
  els.edit.style.display = goal ? '' : 'none';
  els.clear.style.display = goal ? '' : 'none';
}

function currentSessionId() {
  return state.activeSessionId || null;
}

/**
 * 拉取指定会话的目标快照（面板刷新 / 切会话 / SW 重启后恢复目标条）。
 */
export async function loadGoalForSession(sessionId = currentSessionId()) {
  if (!sessionId) {
    state.goalSnapshot = null;
    renderGoalBar();
    return null;
  }
  const resp = await sendGoalMessage({ type: 'GET_GOAL', sessionId });
  // 异步回包可能对应已经切走的会话：丢弃陈旧结果
  if (sessionId !== currentSessionId()) return null;
  state.goalSnapshot = resp?.goal || null;
  renderGoalBar();
  return state.goalSnapshot;
}

/**
 * 设页 goalConfig（只取面板需要的 enabled / intentDetection）。
 * 读一次缓存：发送路径上每条消息都进这里，不应反复跳 storage；
 * 设页改动由 storage.onChanged 撤缓存。
 */
let goalCfgCache = null;
async function getGoalConfig() {
  if (goalCfgCache) return goalCfgCache;
  goalCfgCache = await new Promise((resolve) => {
    try {
      chrome.storage.local.get(['goalConfig'], (r) => resolve(r?.goalConfig || {}));
    } catch (e) {
      logger.debug('[GoalPanel] read goalConfig failed:', e?.message);
      resolve({});
    }
  });
  return goalCfgCache;
}

/** 根据设页总开关收起/恢复输入区的 🎯 chip（关关时留着开关只会让用户反复碰坑） */
async function syncChipVisibility() {
  const group = el('goalGroup');
  if (!group) return;
  const cfg = await getGoalConfig();
  group.style.display = cfg.enabled === false ? 'none' : '';
}

/**
 * 启程前把「本轮输入」交给后台并取回权威 goal 快照，供 CALL_API 的 apiParams.goal 下发。
 *
 * 两条入口：
 *   ① 用户点亮 🎯 开关 → createdBy=toggle + autoApprove，本轮输入整句当目标；
 *   ② 开关没亮，但文本里说了「按目标模式一直跑下去」→ 确定性意图识别命中，
 *      createdBy=intent 且 autoApprove 恒 false（能越过确认弹窗的授权只能用户亲手给）。
 *      目标本体取剖掉意图短语后的剩下的句子，否则 objective 里会带着
 *      「你要按目标模式执行」这串过时的元指令，污染目标描述、还被反复评估。
 *
 * 累加语义（会话内继续发消息 = 追加为约束、不替换目标）收在后台
 * applyGoalCommand('set')，面板永远不需要知道当前是什么状态。
 *
 * @param {{sessionId?: string|null, text?: string}} params
 * @returns {Promise<object|null>} 需要随 apiParams 下发的 goal；null = 本轮不走目标模式
 */
export async function prepareGoalForSend({ sessionId = currentSessionId(), text = '' } = {}) {
  if (!sessionId || !String(text || '').trim()) return null;

  const cfg = await getGoalConfig();
  const byToggle = !!state.goalMode;
  if (cfg.enabled === false) {
    // 开关亮着但设页已关：给出原因，而不是默默不发（静默降级比报错更难查）
    if (byToggle) showToast(t('goal.disabledHint'), 'warning');
    return null;
  }

  let objective = text;
  if (!byToggle) {
    if (cfg.intentDetection === false) return null;
    const intent = detectGoalIntent(text);
    if (!intent.detected) {
      // 弱命中（「直到全部通过」这类隐含句式）只提醒、不替你开目标：
      // 误判代价不对称，只有强命中才自动点亮开关
      if (intent.strength === 'weak') showToast(t('goal.intentHint'), 'info', 6000);
      return null;
    }
    // 剥完为空（整句就是一句「按目标模式」）则退回原文，不然 createGoal 得不到目标
    objective = String(stripGoalIntentPhrases(text) || '').trim() || text;
  }

  const resp = await sendGoalCommand({
    sessionId,
    action: 'set',
    objective,
    createdBy: byToggle ? 'toggle' : 'intent',
    autoApprove: byToggle,
  });
  if (!resp || resp.success === false) {
    if (resp?.disabled) showToast(t('goal.disabledHint'), 'warning');
    return null;
  }
  if (!byToggle) showToast(t('goal.intentDetected'), 'info', 6000);
  if (sessionId !== currentSessionId()) return resp.goal || null;
  state.goalSnapshot = resp.goal || null;
  renderGoalBar();
  return resp.goal || null;
}

/**
 * 清空面板侧的目标状态（切会话 / 会话被删时调用）。
 */
export function resetGoalPanel() {
  state.goalSnapshot = null;
  renderGoalBar();
}

/**
 * 会话切换后重建目标条：从后台拉当前会话的目标。
 */
export function refreshGoalPanel() {
  renderGoalBar();
  return loadGoalForSession();
}

// ==================== 目标编辑弹窗 ====================

/**
 * 精简输入弹窗（Chrome 扩展页面禁用 window.prompt，必须自建）。
 * 复用项目既有的 .modal-overlay / .modal-container 样式。
 * @returns {Promise<string|null>} 空/取消 → null
 */
function showObjectiveDialog(defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal-container" style="min-width:320px;">
        <div class="modal-title">${escapeHtml(t('goal.editTitle'))}</div>
        <input type="text" class="goal-edit-input" value="${escapeHtml(defaultValue)}"
          placeholder="${escapeHtml(t('goal.editPrompt'))}"
          style="width:100%;padding:8px 12px;border:1px solid var(--border-default);border-radius:6px;font-size:14px;margin:8px 0;box-sizing:border-box;">
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
          <button class="goal-edit-cancel" style="padding:6px 16px;border:1px solid var(--border-default);border-radius:6px;background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;">${escapeHtml(t('common.cancel'))}</button>
          <button class="goal-edit-confirm" style="padding:6px 16px;border:none;border-radius:6px;background:var(--brand-500);color:var(--text-inverse);cursor:pointer;">${escapeHtml(t('common.confirm'))}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.goal-edit-input');
    const done = (value) => {
      overlay.remove();
      resolve(value);
    };
    overlay.querySelector('.goal-edit-confirm').addEventListener('click', () => {
      const value = input.value.trim();
      done(value || null);
    });
    overlay.querySelector('.goal-edit-cancel').addEventListener('click', () => done(null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const value = input.value.trim();
        done(value || null);
      }
      if (e.key === 'Escape') done(null);
    });
    setTimeout(() => input.select(), 50);
  });
}

// ==================== 初始化 ====================

export function initGoalPanel() {
  if (els) return;
  const toggle = el('goalModeBtn');
  const bar = el('goalBar');
  if (!toggle || !bar) {
    logger.warn('[GoalPanel] init skipped: DOM not ready');
    return;
  }

  els = {
    toggle,
    bar,
    status: el('goalBarStatus'),
    objective: el('goalBarObjective'),
    meta: el('goalBarMeta'),
    approve: el('goalBarApprove'),
    edit: el('goalBarEditBtn'),
    pause: el('goalBarPauseBtn'),
    resume: el('goalBarResumeBtn'),
    clear: el('goalBarClearBtn'),
  };

  els.toggle.checked = !!state.goalMode;

  els.toggle.addEventListener('change', async () => {
    state.goalMode = els.toggle.checked;
    renderGoalBar();
    logger.debug('[GoalPanel] goal mode:', state.goalMode ? 'enabled' : 'disabled');

    // 关掉开关 = 目标暂停：停止自动推进 + 收回敏感操作放行授权（目标本身保留，
    // 用户可随时点亮开关继续）。绝不在这里静默删目标。
    if (!state.goalMode) {
      const sessionId = currentSessionId();
      if (sessionId && !isFinished(state.goalSnapshot)) {
        const resp = await sendGoalCommand({ sessionId, action: 'pause' });
        if (resp?.goal && sessionId === currentSessionId()) {
          state.goalSnapshot = resp.goal;
          renderGoalBar();
        }
      }
    } else {
      // 重新点亮：把放行授权补回去（后台 pause 时收回了）
      const sessionId = currentSessionId();
      const goal = state.goalSnapshot;
      if (sessionId && goal && goal.status === 'paused') {
        const resp = await sendGoalCommand({ sessionId, action: 'resume', autoApprove: true });
        if (resp?.goal && sessionId === currentSessionId()) {
          state.goalSnapshot = resp.goal;
          renderGoalBar();
        }
      }
    }
  });

  els.edit.addEventListener('click', async () => {
    const sessionId = currentSessionId();
    if (!sessionId) return;
    const next = await showObjectiveDialog(state.goalSnapshot?.objective || '');
    if (!next) return; // 空值/取消：不动目标（空目标描述没有意义）
    const resp = await sendGoalCommand({
      sessionId,
      action: 'replace',
      objective: next,
      autoApprove: !!state.goalMode,
    });
    if (resp?.goal && sessionId === currentSessionId()) {
      state.goalSnapshot = resp.goal;
      renderGoalBar();
      showToast(t('goal.updated'), 'success');
    }
  });

  els.pause.addEventListener('click', async () => {
    const sessionId = currentSessionId();
    if (!sessionId) return;
    const resp = await sendGoalCommand({ sessionId, action: 'pause' });
    if (resp?.goal && sessionId === currentSessionId()) {
      state.goalSnapshot = resp.goal;
      renderGoalBar();
    }
  });

  els.resume.addEventListener('click', async () => {
    const sessionId = currentSessionId();
    if (!sessionId) return;
    const resp = await sendGoalCommand({ sessionId, action: 'resume', autoApprove: !!state.goalMode });
    if (resp?.goal && sessionId === currentSessionId()) {
      state.goalSnapshot = resp.goal;
      renderGoalBar();
    }
  });

  els.clear.addEventListener('click', async () => {
    const sessionId = currentSessionId();
    if (!sessionId) return;
    const ok = window.showCustomConfirm
      ? await window.showCustomConfirm(t('goal.clearConfirm'), t('goal.label'))
      : true;
    if (!ok) return;
    await sendGoalCommand({ sessionId, action: 'clear' });
    if (sessionId === currentSessionId()) {
      state.goalSnapshot = null;
      renderGoalBar();
    }
  });

  // 放行徽标点击 = 撤销放行（转成暂停：目标不再自动推进，自然也不再放行）
  // 必须同时熄灭 🎯：否则下一条消息 prepareGoalForSend 会带 autoApprove: byToggle=true
  // 下发，goal-store 的 'set' 分支会把刚撤回的授权原样补回去（用户没有任何再授权动作）。
  els.approve.addEventListener('click', async () => {
    const sessionId = currentSessionId();
    if (!sessionId) return;
    const resp = await sendGoalCommand({ sessionId, action: 'pause' });
    state.goalMode = false;
    if (resp?.goal && sessionId === currentSessionId()) {
      state.goalSnapshot = resp.goal;
    }
    renderGoalBar();
    showToast(t('goal.approvalRevoked'), 'info', 6000);
  });

  // 后台回推（引擎侧状态机裁决后）
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'GOAL_UPDATE') return;
    if (message.sessionId && message.sessionId !== currentSessionId()) return;
    state.goalSnapshot = message.goal || null;
    renderGoalBar();
  });

  // 设页改了 goalConfig：撤缓存 + 重算 chip 显隐。
  // 不能不接这一手：面板是长活页面，不监听就只会在新开面板时重读，
  // 用户刚在设页关掉目标模式，这边 🎯 还亮着、还照旧往后台发 SET_GOAL。
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !('goalConfig' in changes)) return;
      goalCfgCache = null;
      syncChipVisibility();
    });
  } catch (e) {
    logger.debug('[GoalPanel] storage.onChanged unavailable:', e?.message);
  }
  syncChipVisibility();

  // 会话切换 / 启动水合完成：重建目标条
  document.addEventListener('session-switched', () => { refreshGoalPanel(); });
  document.addEventListener('session-hydrated', () => { refreshGoalPanel(); });
  // 会话被删 / 归档：清掉面板侧残留
  document.addEventListener('session-deleted', () => { resetGoalPanel(); });
  document.addEventListener('session-archived', () => { resetGoalPanel(); });

  renderGoalBar();
}
