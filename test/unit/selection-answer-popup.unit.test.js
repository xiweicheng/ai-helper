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
    expect(fnBody.indexOf('if (!currentResult || !currentPrompt) return;')).toBeLessThan(fnBody.indexOf('if (isFullscreenActive())'));
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
