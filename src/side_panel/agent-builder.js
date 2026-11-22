// agent-builder.js - AI 创建助手向导（对话 UI + LLM 调用 + 落库）
//
// 与 agent-builder-core.js 的分工：
// - core：纯逻辑（prompt / JSON 解析 / 白名单校验），可单测
// - 本文件：DOM 交互、API 配置读取、请求取消、创建/更新助手
//
// 对外只暴露 openAgentBuilder / initAgentBuilder，由 agent-manager 调用并注入
// onAgentSaved / onEditAgent 回调，避免与 agent-manager 形成循环依赖。
import { createAgent, updateAgent } from './agent-store.js';
import { callChatCompletion, readStreamEnabledFromStorage } from '../shared/chat-client.js';
import { decodeSecret } from '../shared/secret.js';
import { t, registerTranslations, getLanguage } from '../shared/i18n.js';
import { showToast } from './utils.js';
import logger from '../shared/logger.js';
import { loadAgentCatalog } from './agent-catalog.js';
import { buildBuilderSystemPrompt, parseBuilderReply, normalizeAgentDraft } from './agent-builder-core.js';

registerTranslations('zh', {
  agentBuilder: {
    title: 'AI 创建助手',
    subtitle: '描述你的需求，AI 会通过几个问题帮你生成配置',
    entry: 'AI 帮我创建',
    editorBanner: '不知道怎么填？让 AI 问几个问题 →',
    greeting: '告诉我你想让这个助手做什么，我会问几个关键问题，然后直接帮你创建。',
    example1: '帮我汇总周报',
    example2: '帮我审查代码',
    example3: '帮我抓取网页表格数据',
    placeholder: '描述你的需求，例如：帮我每天汇总科技新闻…',
    send: '发送',
    hint: '最多 3 轮澄清，信息够了会自动创建',
    restart: '重新开始',
    thinking: '正在理解你的需求…',
    recommended: '推荐',
    customHint: '也可以直接在下方输入你的答案',
    noConfig: '请先在设置中配置 API 地址和模型',
    requestFailed: '生成失败：{message}',
    protocolError: 'AI 返回的配置格式不正确，请重试或换个说法。',
    timeout: '请求超时',
    repairInstruction: '你上一次的输出不是合法 JSON。请严格按协议只输出一个 JSON 对象；所有键和字符串使用英文双引号，字符串内换行写成 \\n，不要代码块和解释。',
    created: '助手「{name}」已创建并切换',
    updated: '助手「{name}」已更新',
    saveFailed: '保存失败：{message}',
    promptLabel: '系统提示词',
    toolsLabel: '工具',
    skillsLabel: '技能',
    inheritTools: '继承全局（全部工具）',
    inheritSkills: '继承全部启用技能',
    continueAdjust: '继续调整',
    editInEditor: '在编辑器中微调',
    finish: '完成',
    adjustHint: '可以直接说想改什么，例如：把输出改成英文、只保留网页相关工具。',
    warnIconFallback: '图标不可用，已使用默认图标',
    warnPromptShort: '提示词偏短，建议在编辑器中补充',
    warnToolsDropped: '已忽略 {count} 个不可用的工具：{names}',
    warnSkillsDropped: '已忽略 {count} 个不可用的技能：{names}',
    warnToolsAllDropped: '所有推荐工具都不可用，已继承全部工具，请在编辑器中确认权限范围',
    warnSkillsAllDropped: '所有推荐技能都不可用，已继承全部启用技能',
    roundCapHint: '澄清轮数已达上限，本轮必须直接输出 done，不要再提问。',
  },
});

registerTranslations('en', {
  agentBuilder: {
    title: 'Create assistant with AI',
    subtitle: 'Describe your need; AI asks a few questions and builds the config',
    entry: 'Create with AI',
    editorBanner: "Not sure what to fill in? Let AI ask a few questions →",
    greeting: 'Tell me what you want this assistant to do. I will ask a few key questions and then create it.',
    example1: 'Summarize my weekly report',
    example2: 'Review my code',
    example3: 'Scrape table data from a page',
    placeholder: 'Describe your need, e.g. summarize tech news every day…',
    send: 'Send',
    hint: 'Up to 3 clarification rounds, then it creates automatically',
    restart: 'Restart',
    thinking: 'Understanding your need…',
    recommended: 'Recommended',
    customHint: 'You can also type your answer below',
    noConfig: 'Please configure the API base and model in settings first',
    requestFailed: 'Generation failed: {message}',
    protocolError: 'AI returned an invalid configuration. Please retry or rephrase.',
    timeout: 'Request timed out',
    repairInstruction: 'Your previous output was not valid JSON. Output exactly one JSON object; use English double quotes and escape line breaks inside strings as \\n. No code fences or explanation.',
    created: 'Assistant "{name}" created and activated',
    updated: 'Assistant "{name}" updated',
    saveFailed: 'Save failed: {message}',
    promptLabel: 'System prompt',
    toolsLabel: 'Tools',
    skillsLabel: 'Skills',
    inheritTools: 'Inherit global (all tools)',
    inheritSkills: 'Inherit all enabled skills',
    continueAdjust: 'Keep adjusting',
    editInEditor: 'Fine-tune in editor',
    finish: 'Done',
    adjustHint: 'Just say what to change, e.g. output in English, or keep only web tools.',
    warnIconFallback: 'Icon was invalid; default icon applied',
    warnPromptShort: 'Prompt is short; consider enriching it in the editor',
    warnToolsDropped: 'Ignored {count} unavailable tool(s): {names}',
    warnSkillsDropped: 'Ignored {count} unavailable skill(s): {names}',
    warnToolsAllDropped: 'None of the suggested tools were available; all global tools are inherited. Review permissions in the editor.',
    warnSkillsAllDropped: 'None of the suggested skills were available; all enabled skills are inherited.',
    roundCapHint: 'Clarification limit reached. Output done now without asking more questions.',
  },
});

// 保留首条用户诉求 + 最近若干条，避免「继续调整」时草稿 JSON 无限累积
const MAX_HISTORY_MESSAGES = 8;

const builderState = {
  open: false,
  catalog: null,
  catalogPromise: null,
  messages: [],        // 发给模型的原始对话（user / assistant）
  askCount: 0,
  pending: false,
  controller: null,
  runId: 0,
  createdAgentId: null,
  draft: null,
  callbacks: null,
};

let initialized = false;

function $(id) {
  return document.getElementById(id);
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

function previewForLog(text, max = 300) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function scrollChatToBottom() {
  const chat = $('agentBuilderChat');
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function appendBubble(role, text) {
  const chat = $('agentBuilderChat');
  if (!chat) return;
  const bubble = makeEl('div', `agent-builder-msg ${role}`, text);
  chat.appendChild(bubble);
  scrollChatToBottom();
}

function appendExampleChips(examples) {
  const chat = $('agentBuilderChat');
  if (!chat) return;
  const row = makeEl('div', 'agent-builder-examples');
  for (const example of examples) {
    const btn = makeEl('button', 'agent-builder-example', example);
    btn.type = 'button';
    btn.dataset.example = example;
    row.appendChild(btn);
  }
  chat.appendChild(row);
  scrollChatToBottom();
}

function setPending(pending) {
  builderState.pending = pending;
  const sendBtn = $('agentBuilderSendBtn');
  if (sendBtn) sendBtn.disabled = pending;

  const chat = $('agentBuilderChat');
  if (!chat) return;
  const existing = chat.querySelector('.agent-builder-typing');
  if (pending && !existing) {
    chat.appendChild(makeEl('div', 'agent-builder-msg assistant agent-builder-typing', t('agentBuilder.thinking')));
    scrollChatToBottom();
  } else if (!pending && existing) {
    existing.remove();
  }
}

function setComposerVisible(visible) {
  const composer = $('agentBuilderComposer');
  if (composer) composer.style.display = visible ? 'flex' : 'none';
}

function clearPanel() {
  const panel = $('agentBuilderPanel');
  if (panel) panel.innerHTML = '';
}

function abortInflight() {
  builderState.runId += 1;
  if (builderState.controller) {
    try { builderState.controller.abort(); } catch { /* ignore */ }
    builderState.controller = null;
  }
}

async function readApiConfig() {
  let cfg = {};
  try {
    cfg = await chrome.storage.local.get(['apiBase', 'apiKey', 'modelName']);
  } catch { /* ignore */ }
  const apiBase = String(cfg.apiBase || '').trim().replace(/\/+$/, '');
  const model = String(cfg.modelName || '').trim();
  if (!apiBase || !model) {
    showToast(t('agentBuilder.noConfig'), 'warning');
    return null;
  }
  const apiKey = decodeSecret(cfg.apiKey);
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return { apiBase, model, headers };
}

function trimHistory(messages, max = MAX_HISTORY_MESSAGES) {
  if (messages.length <= max) return messages;
  const head = messages[0]?.role === 'user' ? [messages[0]] : [];
  return [...head, ...messages.slice(-(max - head.length))];
}

function buildApiMessages() {
  let system = buildBuilderSystemPrompt({
    language: getLanguage(),
    tools: builderState.catalog?.tools || [],
    skills: builderState.catalog?.skills || [],
  });
  if (builderState.askCount >= 3) {
    system += `\n\n${t('agentBuilder.roundCapHint')}`;
  }
  return [
    { role: 'system', content: system },
    ...trimHistory(builderState.messages),
  ];
}

async function waitForCatalog() {
  if (!builderState.catalogPromise) return;
  try {
    await builderState.catalogPromise;
  } catch { /* 目录加载失败已在 openAgentBuilder 中兜底 */ }
}

async function postChat(config, temperature, useJsonMode) {
  const controller = new AbortController();
  builderState.controller = controller;
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const body = {
      model: config.model,
      temperature,
      max_tokens: 2000,
      messages: buildApiMessages(),
    };
    // 支持 json_object 的网关可显著降低非法 JSON 概率；不支持时由下层回退
    if (useJsonMode) body.response_format = { type: 'json_object' };

    return await callChatCompletion(`${config.apiBase}/chat/completions`, {
      headers: config.headers,
      body,
      useStream: await readStreamEnabledFromStorage(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    if (builderState.controller === controller) builderState.controller = null;
  }
}

async function requestReply(temperature = 0.3) {
  const config = await readApiConfig();
  if (!config) throw new Error(t('agentBuilder.noConfig'));

  let result = await postChat(config, temperature, true);
  // 仅参数类错误（400/422）可能是网关不支持 response_format；
  // 404/500 与格式无关，重发只会白白多消耗一次请求
  if (!result.ok && [400, 422].includes(result.status)) {
    logger.debug('[AgentBuilder] json mode unsupported, retrying without response_format');
    result = await postChat(config, temperature, false);
  }

  if (!result.ok) {
    throw new Error(`HTTP ${result.status}${result.errorText ? `: ${result.errorText}` : ''}`);
  }
  return result.data?.choices?.[0]?.message?.content || '';
}

function renderQuestion(question) {
  const panel = $('agentBuilderPanel');
  if (!panel) return;
  panel.innerHTML = '';

  const card = makeEl('div', 'agent-builder-q');
  card.appendChild(makeEl('div', 'agent-builder-q-text', question.text));

  const options = makeEl('div', 'agent-builder-options');
  question.options.forEach((option, index) => {
    const isRecommended = index === question.recommended;
    const btn = makeEl('button', `agent-builder-option${isRecommended ? ' recommended' : ''}`, option);
    btn.type = 'button';
    btn.dataset.optionIndex = String(index);
    btn.dataset.answer = option;
    if (isRecommended) btn.appendChild(makeEl('span', 'agent-builder-badge', t('agentBuilder.recommended')));
    options.appendChild(btn);
  });
  card.appendChild(options);

  if (question.allowCustom) {
    card.appendChild(makeEl('div', 'agent-builder-custom-hint', t('agentBuilder.customHint')));
  }
  panel.appendChild(card);

  const input = $('agentBuilderInput');
  if (input) input.focus();
}

function localizeWarning(warning) {
  switch (warning.code) {
    case 'iconFallback':
      return t('agentBuilder.warnIconFallback');
    case 'promptShort':
      return t('agentBuilder.warnPromptShort');
    case 'toolsDropped':
      return t('agentBuilder.warnToolsDropped', { count: warning.count, names: (warning.names || []).join(', ') });
    case 'skillsDropped':
      return t('agentBuilder.warnSkillsDropped', { count: warning.count, names: (warning.names || []).join(', ') });
    case 'toolsAllDropped':
      return t('agentBuilder.warnToolsAllDropped');
    case 'skillsAllDropped':
      return t('agentBuilder.warnSkillsAllDropped');
    default:
      return '';
  }
}

function toolDisplayName(id) {
  return builderState.catalog?.tools.find(tool => tool.id === id)?.name || id;
}

function buildTagRow(values, emptyText) {
  const row = makeEl('div', 'agent-builder-tags');
  if (!values || values.length === 0) {
    row.appendChild(makeEl('span', 'agent-builder-tag', emptyText));
    return row;
  }
  for (const value of values) {
    row.appendChild(makeEl('span', 'agent-builder-tag', value));
  }
  return row;
}

function renderResult(draft, warnings) {
  const panel = $('agentBuilderPanel');
  if (!panel) return;
  panel.innerHTML = '';

  const card = makeEl('div', 'agent-builder-result');

  const head = makeEl('div', 'agent-builder-result-head');
  head.appendChild(makeEl('span', 'agent-builder-result-icon', draft.icon));
  const info = makeEl('div', 'agent-builder-result-info');
  info.appendChild(makeEl('div', 'agent-builder-result-name', draft.name));
  info.appendChild(makeEl('div', 'agent-builder-result-desc', draft.description || ''));
  head.appendChild(info);
  card.appendChild(head);

  const promptSection = makeEl('div', 'agent-builder-section');
  promptSection.appendChild(makeEl('div', 'agent-builder-section-title', t('agentBuilder.promptLabel')));
  promptSection.appendChild(makeEl('div', 'agent-builder-prompt', draft.systemPrompt || ''));
  card.appendChild(promptSection);

  const toolSection = makeEl('div', 'agent-builder-section');
  toolSection.appendChild(makeEl('div', 'agent-builder-section-title', t('agentBuilder.toolsLabel')));
  const toolNames = draft.toolIds ? draft.toolIds.map(toolDisplayName) : null;
  toolSection.appendChild(buildTagRow(toolNames, t('agentBuilder.inheritTools')));
  card.appendChild(toolSection);

  const skillSection = makeEl('div', 'agent-builder-section');
  skillSection.appendChild(makeEl('div', 'agent-builder-section-title', t('agentBuilder.skillsLabel')));
  skillSection.appendChild(buildTagRow(draft.skillIds, t('agentBuilder.inheritSkills')));
  card.appendChild(skillSection);

  const warningTexts = (warnings || []).map(localizeWarning).filter(Boolean);
  if (warningTexts.length > 0) {
    const separator = getLanguage() === 'en' ? '; ' : '；';
    card.appendChild(makeEl('div', 'agent-builder-warn', warningTexts.join(separator)));
  }

  const actions = makeEl('div', 'agent-builder-actions');
  const continueBtn = makeEl('button', 'modal-btn cancel', t('agentBuilder.continueAdjust'));
  continueBtn.type = 'button';
  continueBtn.dataset.action = 'continue';
  const editBtn = makeEl('button', 'modal-btn cancel', t('agentBuilder.editInEditor'));
  editBtn.type = 'button';
  editBtn.dataset.action = 'edit';
  const finishBtn = makeEl('button', 'modal-btn confirm', t('agentBuilder.finish'));
  finishBtn.type = 'button';
  finishBtn.dataset.action = 'finish';
  actions.append(continueBtn, editBtn, finishBtn);
  card.appendChild(actions);

  panel.appendChild(card);
}

async function finalizeDraft(rawAgent) {
  const { draft, warnings } = normalizeAgentDraft(rawAgent, {
    tools: builderState.catalog?.tools || [],
    skills: builderState.catalog?.skills || [],
    language: getLanguage(),
  });
  builderState.draft = draft;

  let saved = null;
  const isUpdate = !!builderState.createdAgentId;
  try {
    if (isUpdate) {
      saved = await updateAgent(builderState.createdAgentId, draft);
      if (!saved) throw new Error('agent_not_found');
      showToast(t('agentBuilder.updated', { name: draft.name }), 'success');
    } else {
      saved = await createAgent(draft);
      builderState.createdAgentId = saved.id;
      showToast(t('agentBuilder.created', { name: saved.name }), 'success');
    }
  } catch (err) {
    logger.error('[AgentBuilder] save failed:', err);
    appendBubble('assistant error', t('agentBuilder.saveFailed', { message: err?.message || '' }));
    return;
  }

  if (builderState.callbacks?.onAgentSaved) {
    try {
      await builderState.callbacks.onAgentSaved(saved, { updated: isUpdate });
    } catch (err) {
      logger.warn('[AgentBuilder] onAgentSaved failed:', err?.message || err);
    }
  }

  renderResult(draft, warnings);
  setComposerVisible(false);
}

async function sendMessage(text) {
  const message = String(text || '').trim();
  if (!message || builderState.pending) return;

  clearPanel();
  // 示例问题只用于开场，发出第一条消息后移除，避免重复触发
  $('agentBuilderChat')?.querySelector('.agent-builder-examples')?.remove();
  appendBubble('user', message);
  builderState.messages.push({ role: 'user', content: message });
  setPending(true);

  const runId = ++builderState.runId;
  try {
    // 目录可能仍在加载；等待完成后再组装 prompt，避免首条消息拿到空目录
    await waitForCatalog();
    if (runId !== builderState.runId || !builderState.open) return;

    let replyText = await requestReply();
    if (runId !== builderState.runId || !builderState.open) return;

    let parsed;
    try {
      parsed = parseBuilderReply(replyText);
    } catch (err) {
      logger.warn('[AgentBuilder] invalid reply, retrying once:', err?.message, '| raw:', previewForLog(replyText));
      builderState.messages.push({ role: 'assistant', content: replyText || '' });
      builderState.messages.push({ role: 'user', content: t('agentBuilder.repairInstruction') });
      replyText = await requestReply(0);
      if (runId !== builderState.runId || !builderState.open) return;
      parsed = parseBuilderReply(replyText);
    }

    builderState.messages.push({ role: 'assistant', content: replyText });
    if (parsed.message) appendBubble('assistant', parsed.message);

    if (parsed.action === 'ask') {
      builderState.askCount += 1;
      renderQuestion(parsed.question);
    } else {
      await finalizeDraft(parsed.agent);
    }
  } catch (err) {
    if (runId !== builderState.runId) return;
    logger.warn('[AgentBuilder] request failed:', err?.message || err);
    const protocolCodes = new Set([
      'empty_reply', 'no_json_object', 'invalid_json', 'invalid_action', 'invalid_question', 'invalid_agent',
    ]);
    let detail = err?.message || '';
    if (err?.name === 'AbortError') detail = t('agentBuilder.timeout');
    else if (protocolCodes.has(detail)) detail = t('agentBuilder.protocolError');
    appendBubble('assistant error', t('agentBuilder.requestFailed', { message: detail }));
  } finally {
    if (runId === builderState.runId) setPending(false);
  }
}

function showGreeting() {
  appendBubble('assistant', t('agentBuilder.greeting'));
  appendExampleChips([
    t('agentBuilder.example1'),
    t('agentBuilder.example2'),
    t('agentBuilder.example3'),
  ]);
}

function resetConversation() {
  abortInflight();
  builderState.messages = [];
  builderState.askCount = 0;
  builderState.createdAgentId = null;
  builderState.draft = null;
  builderState.pending = false;

  const chat = $('agentBuilderChat');
  if (chat) chat.innerHTML = '';
  clearPanel();
  setComposerVisible(true);
  setPending(false);

  const input = $('agentBuilderInput');
  if (input) input.value = '';

  showGreeting();
}

/**
 * 打开向导
 * @param {{ onAgentSaved?: (agent: Object, meta: {updated: boolean}) => Promise<void>, onEditAgent?: (agentId: string) => void }} callbacks
 */
export async function openAgentBuilder(callbacks = {}) {
  const modal = $('agentBuilderModal');
  if (!modal) return;

  builderState.callbacks = callbacks;
  builderState.open = true;
  modal.style.display = 'flex';

  // 先重置界面，避免上一次会话的残留内容闪现
  resetConversation();

  // 每次打开都重新读取目录：技能启用状态、代理连接状态可能已变化。
  // 不阻塞弹窗打开；发送时由 waitForCatalog 兜底等待。
  builderState.catalogPromise = (async () => {
    try {
      builderState.catalog = await loadAgentCatalog();
    } catch (err) {
      logger.warn('[AgentBuilder] load catalog failed:', err?.message || err);
      builderState.catalog = { tools: [], skills: [] };
    }
  })();

  const input = $('agentBuilderInput');
  if (input) input.focus();
}

/**
 * 关闭向导（保留已创建的助手，不删除）
 */
export function closeAgentBuilder() {
  abortInflight();
  builderState.open = false;
  builderState.pending = false;
  const modal = $('agentBuilderModal');
  if (modal) modal.style.display = 'none';
}

/**
 * 初始化向导事件（只执行一次）
 */
export function initAgentBuilder() {
  if (initialized) return;
  const modal = $('agentBuilderModal');
  if (!modal) return;
  initialized = true;

  $('agentBuilderCloseBtn')?.addEventListener('click', closeAgentBuilder);
  $('agentBuilderRestartBtn')?.addEventListener('click', resetConversation);

  $('agentBuilderSendBtn')?.addEventListener('click', () => {
    const input = $('agentBuilderInput');
    const text = input?.value || '';
    if (input) input.value = '';
    sendMessage(text);
  });

  $('agentBuilderInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const input = e.target;
      const text = input.value || '';
      input.value = '';
      sendMessage(text);
    }
  });

  // 示例问题
  $('agentBuilderChat')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-example]');
    if (!btn || builderState.pending) return;
    sendMessage(btn.dataset.example || '');
  });

  // 选项 / 结果操作
  $('agentBuilderPanel')?.addEventListener('click', (e) => {
    const optionBtn = e.target.closest('[data-option-index]');
    if (optionBtn) {
      if (builderState.pending) return;
      sendMessage(optionBtn.dataset.answer || '');
      return;
    }

    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    if (action === 'continue') {
      clearPanel();
      builderState.askCount = 0;
      appendBubble('assistant', t('agentBuilder.adjustHint'));
      setComposerVisible(true);
      $('agentBuilderInput')?.focus();
    } else if (action === 'edit') {
      const agentId = builderState.createdAgentId;
      const onEditAgent = builderState.callbacks?.onEditAgent;
      closeAgentBuilder();
      if (agentId && onEditAgent) onEditAgent(agentId);
    } else if (action === 'finish') {
      closeAgentBuilder();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && builderState.open) closeAgentBuilder();
  });
}
