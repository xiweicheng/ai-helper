// @vitest-environment jsdom
// test/unit/selection-answer-popup.unit.test.js
// 划词浮层解答的纯函数契约测试：
//   1) extractSelectionContext：以选中片段所在消息为上下文；预算内取整条、超预算截断且保证选中片段落在窗口内；无消息祖先返回空。
//   2) buildPopupMessages：system + user 两条，user 含 [上下文]/[选中内容]/[用户问题] 三段契约，截断时标注。
//   3) 转入对话的全屏接线（源码守卫）：写入对话流前必须先退出全屏，否则新消息在覆盖层之下。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractSelectionContext, buildPopupMessages } from '../../src/side_panel/selection-answer-popup.js';

const modSrc = readFileSync(resolve(process.cwd(), 'src/side_panel/selection-answer-popup.js'), 'utf8');
const bgSrc = readFileSync(resolve(process.cwd(), 'src/background/index.js'), 'utf8');
const cssSrc = readFileSync(resolve(process.cwd(), 'src/side_panel/styles.css'), 'utf8');
const htmlSrc = readFileSync(resolve(process.cwd(), 'side_panel.html'), 'utf8');

function fnBody(src, name) {
  const start = src.indexOf(name);
  return src.slice(start, src.indexOf('\n}\n', start));
}

function makeRangeWithMessage(messageText, selectedText) {
  const msg = document.createElement('div');
  msg.className = 'message assistant';
  msg.textContent = messageText;
  document.body.appendChild(msg);

  const textNode = msg.firstChild;
  const selStart = messageText.indexOf(selectedText);
  const range = document.createRange();
  range.setStart(textNode, selStart);
  range.setEnd(textNode, selStart + selectedText.length);
  return range;
}

describe('extractSelectionContext', () => {
  it('null range → 空上下文、未截断', () => {
    expect(extractSelectionContext(null, 'x')).toEqual({ context: '', truncated: false });
  });

  it('选中节点无 .message 祖先 → 空上下文（降级只发选中片段）', () => {
    const orphan = document.createElement('span');
    orphan.textContent = '游离文本';
    document.body.appendChild(orphan);
    const range = document.createRange();
    range.selectNodeContents(orphan);
    const r = extractSelectionContext(range, '游离文本');
    expect(r.context).toBe('');
    expect(r.truncated).toBe(false);
  });

  it('短消息（预算内）→ 返回整条消息文本、未截断', () => {
    const message = '这是一段简短的回答，其中包含术语熵减。';
    const range = makeRangeWithMessage(message, '熵减');
    const r = extractSelectionContext(range, '熵减');
    expect(r.truncated).toBe(false);
    expect(r.context).toBe(message);
  });

  it('超长消息（超预算）→ 截断且选中片段仍在窗口内', () => {
    const filler = '人工智能机器学习深度学习神经网络'.repeat(400);
    const tail = '这里出现了罕见术语昆布兰斯。';
    const message = filler + tail;
    const range = makeRangeWithMessage(message, '昆布兰斯');
    const r = extractSelectionContext(range, '昆布兰斯');
    expect(r.truncated).toBe(true);
    // 截断后应显著短于原文，但仍包含选中片段
    expect(r.context.length).toBeLessThan(message.length);
    expect(r.context).toContain('昆布兰斯');
  });

  it('渲染后消息含大量空白（表格/多换行）→ 归一化不撑出整屏空白行', () => {
    // 模拟已渲染 Markdown 表格的 textContent：连续空行 + 行首大段缩进
    const message = '✅ 测试任务已执行完毕，结果如下：\n\n\n\n\n\n项目\n        结果\n\n\n\n\n\n开始时间2026';
    const range = makeRangeWithMessage(message, '结果');
    const r = extractSelectionContext(range, '结果');
    expect(r.truncated).toBe(false);
    // 不应残留 3+ 连续换行或 2+ 连续空格/制表符
    expect(r.context).not.toMatch(/\n{3,}/);
    expect(r.context).not.toMatch(/[ \t]{2,}/);
    // 正文内容仍完整保留
    expect(r.context).toContain('项目');
    expect(r.context).toContain('结果');
    expect(r.context).toContain('开始时间2026');
  });
});

describe('buildPopupMessages', () => {
  it('有上下文 → 三段齐全（上下文 + 选中内容 + 用户问题）', () => {
    const msgs = buildPopupMessages('选中片段', ' surrounding context text ', '解释一下', false);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('system');
    expect(msgs[1].role).toBe('user');
    expect(msgs[1].content).toContain('[上下文]');
    expect(msgs[1].content).toContain('surrounding context text');
    expect(msgs[1].content).toContain('选中片段');
    expect(msgs[1].content).toContain('解释一下');
    expect(msgs[1].content.indexOf('[上下文]')).toBeLessThan(msgs[1].content.indexOf('选中片段'));
  });

  it('上下文截断 → 标注已截断', () => {
    const msgs = buildPopupMessages('sel', 'ctx', 'q', true);
    // 截断标记紧跟 [上下文 之后
    expect(msgs[1].content).toMatch(/\[上下文.*截断/);
  });

  it('无上下文 → 不含 [上下文] 段，只保留选中内容与问题', () => {
    const msgs = buildPopupMessages('sel', '', 'q', false);
    expect(msgs[1].content).not.toContain('[上下文]');
    expect(msgs[1].content).toContain('sel');
    expect(msgs[1].content).toContain('q');
  });
});

describe('转入对话：全屏阅读下先退出全屏（接线守卫）', () => {
  const fnStart = modSrc.indexOf('function handleTransferToChat');
  const fnBody = modSrc.slice(fnStart, modSrc.indexOf('\n}\n', fnStart));

  it('模块静态引入全屏开关与退出（message-fullscreen 只依 logger/i18n，不成环）', () => {
    expect(modSrc).toContain("import { isFullscreenActive, closeMessageFullscreen } from './message-fullscreen.js';");
  });

  it('退出全屏在结果早退之后、写入对话流之前', () => {
    expect(fnStart).toBeGreaterThan(-1);
    expect(fnBody).toContain('if (isFullscreenActive()) {');
    expect(fnBody.indexOf('if (!currentResult || !currentQuestion) return;')).toBeLessThan(fnBody.indexOf('if (isFullscreenActive())'));
    expect(fnBody.indexOf('if (isFullscreenActive())')).toBeLessThan(fnBody.indexOf("import('./chat-manager.js')"));
  });

  it('只在转入真正发生时才退全屏：复制/重新生成/关闭三条路径不引入退出', () => {
    for (const name of ['function handleCopy', 'function closePopup', 'function sendRequest']) {
      const start = modSrc.indexOf(name);
      const body = modSrc.slice(start, modSrc.indexOf('\n}\n', start));
      expect(body, `${name} 不应退全屏`).not.toContain('closeMessageFullscreen');
    }
  });
});

describe('自定义问答：先输入再发送（接线守卫）', () => {
  it('导出自定义问答入口，且打开时不立即发起请求（只准备上下文）', () => {
    expect(modSrc).toContain('export function openSelectionCustomAskPopup');
    const start = modSrc.indexOf('function openCustomAsk');
    const body = modSrc.slice(start, modSrc.indexOf('\n}\n', start));
    expect(body).toContain('extractSelectionContext');
    expect(body).not.toContain('chrome.runtime.sendMessage');
    expect(body).toContain('focusInput()');
  });

  it('Enter 发送 / Shift+Enter 换行，并对中文输入法组词回车兜底', () => {
    const start = modSrc.indexOf('function initAskInput');
    const body = modSrc.slice(start, modSrc.indexOf('\n}\n', start));
    expect(body).toContain("e.key !== 'Enter' || e.shiftKey");
    expect(body).toContain('composing');
    expect(body).toContain('submitQuestion');
    expect(modSrc).toContain("input.addEventListener('compositionstart'");
    expect(modSrc).toContain("input.addEventListener('compositionend'");
  });

  it('预置提问与自定义提问共用同一条请求链路（buildPopupMessages 取 currentQuestion）', () => {
    const start = modSrc.indexOf('function sendRequest');
    const body = modSrc.slice(start, modSrc.indexOf('\n}\n', start));
    expect(body).toContain('buildPopupMessages(currentSelectedText, currentContextText, currentQuestion, currentTruncated)');
    expect(modSrc).not.toContain('currentPrompt');
  });

  it('预置提问的浮层在答案出来后露出追问输入框', () => {
    const doneIdx = modSrc.indexOf("message.type === 'SIDEPANEL_POPUP_STREAM_DONE'");
    expect(doneIdx).toBeGreaterThan(-1);
    const tail = modSrc.slice(doneIdx, doneIdx + 1200);
    expect(tail).toContain("if (!isCustomMode) popupEl.classList.add('show-input')");
  });
});

describe('自定义问答：允许使用工具（接线守卫）', () => {
  it('浮层含工具开关且默认关闭，仅在自定义输入区展开时展示', () => {
    expect(modSrc).toContain('class="sap-tools-checkbox"');
    expect(modSrc).toContain('let useTools = false;');
    expect(modSrc).toContain('toolsCheckbox.checked = useTools');
    expect(cssSrc).toContain('.selection-answer-popup.show-input .sap-tools-row');
  });

  it('开关打开时走带工具请求，预置菜单的追问同样生效', () => {
    const body = fnBody(modSrc, 'async function sendRequest');
    expect(body).toContain('const withTools = useTools');
    expect(body).not.toContain('isCustomMode && useTools');
    expect(body).toContain("type: withTools ? 'SIDEPANEL_POPUP_TOOL_ASK' : 'SIDEPANEL_POPUP_ASK'");
    expect(body).toContain('payload.agentToolIds');
    expect(body).toContain('payload.tabId');
    expect(body).toContain('getApiParams()');
    expect(body).toContain("t('sidePanel.popupExecuting')");
  });

  it('打开自定义问答与关闭浮层时复位开关', () => {
    expect(fnBody(modSrc, 'function openCustomAsk')).toContain('useTools = false');
    expect(fnBody(modSrc, 'function closePopup')).toContain('useTools = false');
  });

  it('工具模式不渲染 ReAct 流式过程，只消费浮层专用消息', () => {
    expect(modSrc).toContain("if (!message.type.startsWith('SIDEPANEL_POPUP_')) return;");
  });

  it('后台注册工具版请求、补发浮层终态，空工具降级普通问答', () => {
    const start = bgSrc.indexOf("message.type === 'SIDEPANEL_POPUP_TOOL_ASK'");
    expect(start).toBeGreaterThan(-1);
    const body = bgSrc.slice(start, start + 2400);
    expect(body).toContain('getTools(agentToolIds, agentId, agentSkillIds, null, agentMcpExcludedServerIds)');
    expect(body).toContain('reactLoop(');
    expect(body).toContain("type: 'SIDEPANEL_POPUP_STREAM_DONE'");
    expect(body).toContain('tools.length === 0');
    expect(body).toContain("typePrefix: 'SIDEPANEL_POPUP_'");
    expect(body).toContain('isCancelled(sessionId)');
  });

  it('澄清/风险确认弹窗层级高于划词浮层，确认弹窗不再被内联 z-index 压低', () => {
    const pickZ = (selector) => {
      const start = cssSrc.indexOf(selector);
      expect(start).toBeGreaterThan(-1);
      return Number(cssSrc.slice(start, start + 600).match(/z-index:\s*(\d+)/)[1]);
    };
    const popupZ = pickZ('.selection-answer-popup {');
    const clarifyZ = pickZ('.clarify-overlay {');
    expect(clarifyZ).toBeGreaterThan(popupZ);
    expect(htmlSrc).not.toContain('id="confirmOverlay" style="display: none; z-index');
  });

  it('与澄清/确认弹窗交互时浮层不关闭，避免连带取消后台任务', () => {
    const outside = fnBody(modSrc, 'function handleOutsidePointerDown');
    expect(outside).toContain('MODAL_OVERLAY_SELECTOR');
    expect(outside).toContain('e.target.closest?.(MODAL_OVERLAY_SELECTOR)');
    const esc = fnBody(modSrc, 'function handleEscapeKey');
    expect(esc).toContain('isModalOverlayOpen()');
  });
});

describe('自定义问答：多轮上下文记忆（接线守卫）', () => {
  it('发送时把本浮层历史插到 system 与当前问题之间', () => {
    const body = fnBody(modSrc, 'async function sendRequest');
    expect(body).toContain('messages.splice(1, 0, ...popupHistory');
    expect(body).toContain('pendingUserContent = messages[messages.length - 1].content');
  });

  it('DONE 时成对写入历史并限制条数，失败轮次不写入', () => {
    const doneIdx = modSrc.indexOf("message.type === 'SIDEPANEL_POPUP_STREAM_DONE'");
    expect(doneIdx).toBeGreaterThan(-1);
    const tail = modSrc.slice(doneIdx, doneIdx + 1200);
    expect(tail).toContain("popupHistory.push({ role: 'user'");
    expect(tail).toContain("popupHistory.push({ role: 'assistant'");
    expect(tail).toContain('POPUP_HISTORY_LIMIT');
    const errorIdx = modSrc.indexOf("message.type === 'SIDEPANEL_POPUP_STREAM_ERROR'");
    expect(modSrc.slice(errorIdx, errorIdx + 500)).toContain("pendingUserContent = ''");
  });

  it('重新生成移除上一轮问答对，打开/关闭浮层清空历史', () => {
    expect(fnBody(modSrc, 'function dropLastPopupTurn')).toContain('popupHistory.splice(-2, 2)');
    expect(modSrc).toContain('sendRequest({ regenerate: true })');
    expect(fnBody(modSrc, 'function closePopup')).toContain('resetPopupHistory()');
    expect(fnBody(modSrc, 'function openCustomAsk')).toContain('resetPopupHistory()');
    expect(fnBody(modSrc, 'function openSelectionAnswerPopup')).toContain('resetPopupHistory()');
  });

  it('面板关闭时取消仍在跑的浮层任务，避免后台幽灵执行工具', () => {
    const init = fnBody(modSrc, 'function initSelectionAnswerPopup');
    expect(init).toContain("addEventListener('pagehide'");
    expect(init).toContain('isEphemeralSessionId(currentSessionId)');
    expect(init).toContain("type: 'CANCEL_REACT'");
  });
});
