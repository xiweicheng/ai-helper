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
import { buildGoalMetaParts } from '../shared/goal.js';

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
    // 副行不再直接铺「3/20 轮」：这是内部计量单位，且 0 时完全无信息。
    // 改由纯函数输出「已尝试 3 次 · 还剩 2 次」（接近上限才提示剩余）。
    els.meta.textContent = buildGoalMetaParts(goal, t).join(' · ');
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
 * @param {{sessionId?: string|null, text?: string, attachments?: Array}} params attachments 见
 *   summarizeGoalAttachments（只记清单，不记内容），后台累加不替换
 * @returns {Promise<object|null>} 需要随 apiParams 下发的 goal；null = 本轮不走目标模式
 */
export async function prepareGoalForSend({ sessionId = currentSessionId(), text = '', attachments = [] } = {}) {
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
    // 附件清单只随创建/追加下发：后台按「累加不替换」并入目标，供锚点与评估器使用
    attachments: Array.isArray(attachments) ? attachments : [],
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
 * 把输入区挂载的上下文压成「附件清单」元信息，随目标一起下发。
 * 只记「有哪些、叫什么、走的哪条通道」，绝不记内容：objective 必须保持用户原话
 * （finalText 里拼的知识库/网页/文件正文不能进目标，否则目标描述被污染）。
 *
 * 为什么不记内容就够：锚点本来就每轮重申 objective，而这些内容只跟着首条消息走，
 * 图片从第 2 次 API 调用起就被剥掉（react-loop 只保留最后一条消息的图）。
 * 记下清单，锚点才能明确告诉模型「它们不在目标里、也回不来，先读成笔记」。
 *
 * @param {object} inputCtx 发送批次快照（readInputContextSnapshot / 队列 contextSnapshot）
 * @returns {Array<{kind:string, name:string, detail?:string}>}
 */
export function summarizeGoalAttachments(inputCtx = {}) {
  const items = [];
  const images = Array.isArray(inputCtx.attachedImages) ? inputCtx.attachedImages.length : 0;
  if (images > 0) items.push({ kind: 'image', name: t('goal.attachmentImage', { count: images }) });
  for (const f of Array.isArray(inputCtx.attachedFiles) ? inputCtx.attachedFiles : []) {
    // 只记已抽取完成的：失败文件既没内容也没路径，记进目标只会让模型去找不存在的东西
    if (!f || f.status !== 'done' || !f.name) continue;
    items.push({ kind: 'file', name: String(f.name), detail: f.agentPath ? 'workspace file' : 'inline text' });
  }
  const page = inputCtx.selectedPage;
  if (page && (page.title || page.url)) {
    items.push({
      kind: 'page',
      name: String(page.title || page.url),
      detail: page.id != null ? `tab ${page.id}` : '',
    });
  }
  for (const ref of Array.isArray(inputCtx.knowledgeRefs) ? inputCtx.knowledgeRefs : []) {
    if (ref && ref.name) items.push({ kind: 'knowledge', name: String(ref.name) });
  }
  return items;
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

/**
 * 恢复被拒时的如实提示：轮数顶到硬顶后 resumeGoal 拒绝复活，
 * 按钮不能假装成功（用户点了「继续」却一步没动，比直接报错更难查）。
 */
function warnIfResumeBlocked(goal) {
  if (!goal || goal.status === 'active') return;
  showToast(t('goal.resumeBlocked', { turns: goal.turnBudget }), 'warning', 6000);
}

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
      // budget_limited 同样要能靠重新点亮恢复：resumeGoal 会补上撞掉的那一档预算；
      // 只认 paused 会让「预算用完」的目标在开关上无路可走。
      if (sessionId && goal && (goal.status === 'paused' || goal.status === 'budget_limited')) {
        const resp = await sendGoalCommand({ sessionId, action: 'resume', autoApprove: true });
        if (resp?.goal && sessionId === currentSessionId()) {
          state.goalSnapshot = resp.goal;
          renderGoalBar();
          warnIfResumeBlocked(resp.goal);
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
      warnIfResumeBlocked(resp.goal);
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
