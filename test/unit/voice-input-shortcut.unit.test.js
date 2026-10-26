// @vitest-environment jsdom
// test/unit/voice-input-shortcut.unit.test.js
// 快捷键与三处触发通道的契约：
//   1) Alt+V 判定（matchVoiceShortcut）：修饰键 / 输入法候选期 / 长按重复 的守卫；
//   2) toggleVoiceInput 的 toggle 语义（开始 → 结束）；
//   3) 录音态 Esc 抢占「清空输入框」——handleVoiceEscape 返回 true 表示已消费；
//   4) 页面焦点下按 Alt+V 留下的一次性标记 pendingVoiceStart：15s 内有效、消费后删除、不重复触发。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  matchVoiceShortcut,
  toggleVoiceInput,
  isVoiceRecording,
  handleVoiceEscape,
  abortVoiceInput,
  initVoiceInput,
} from '../../src/side_panel/voice-input.js';
import { t } from '../../src/shared/i18n.js';
import { setupDom, stubChrome, stubMedia, waitFor } from './helpers/voice-harness.js';

const ARMED = { success: true, available: true, language: 'zh', maxRecordingMs: 300000 };

const key = (over = {}) => ({ altKey: true, code: 'KeyV', ...over });

let dom;
let chromeCtx;

beforeEach(() => {
  dom = setupDom();
  stubMedia();
  chromeCtx = stubChrome({ status: ARMED });
});

afterEach(() => {
  abortVoiceInput();
  // voice-input 会缓存 port（同一页面复用）；这里主动断开，让下个用例重建通道
  chromeCtx.port.disconnect();
  vi.useRealTimers();
  document.body.className = '';
});

describe('matchVoiceShortcut：Alt+V 判定与守卫', () => {
  it('裸 Alt+V 命中', () => {
    expect(matchVoiceShortcut(key())).toBe(true);
  });

  it('带 Shift / Ctrl / Meta 不命中（避免与截图快捷键冲突）', () => {
    expect(matchVoiceShortcut(key({ shiftKey: true }))).toBe(false);
    expect(matchVoiceShortcut(key({ ctrlKey: true }))).toBe(false);
    expect(matchVoiceShortcut(key({ metaKey: true }))).toBe(false);
  });

  it('没有 Alt 不命中；其他键位不命中', () => {
    expect(matchVoiceShortcut({ code: 'KeyV' })).toBe(false);
    expect(matchVoiceShortcut(key({ code: 'KeyS' }))).toBe(false);
  });

  it('输入法候选期（isComposing）不命中', () => {
    expect(matchVoiceShortcut(key({ isComposing: true }))).toBe(false);
  });

  it('长按重复（repeat）不命中', () => {
    expect(matchVoiceShortcut(key({ repeat: true }))).toBe(false);
  });

  it('空事件不命中（防御性）', () => {
    expect(matchVoiceShortcut(null)).toBe(false);
    expect(matchVoiceShortcut(undefined)).toBe(false);
  });
});

describe('toggleVoiceInput：开始 / 结束', () => {
  it('未就绪时点击无效（按钮本应隐藏），不会开麦', async () => {
    const ctx = stubChrome({ status: { success: true, available: false } });
    await initVoiceInput({});
    await expect(toggleVoiceInput()).resolves.toBe(false);
    expect(isVoiceRecording()).toBe(false);
    expect(ctx.port.posted.length).toBe(0);
  });

  it('就绪时开始录音：按钮进入录音态、通道收到 start 帧', async () => {
    await initVoiceInput({});
    await expect(toggleVoiceInput()).resolves.toBe(true);
    expect(isVoiceRecording()).toBe(true);
    expect(dom.btn.classList.contains('recording')).toBe(true);
    expect(dom.btn.getAttribute('aria-pressed')).toBe('true');
    const frames = chromeCtx.port.controlFrames();
    expect(frames[0]).toMatchObject({ type: 'start', language: 'zh' });
    expect(dom.bar.classList.contains('show')).toBe(true);
  });

  it('再按一次 = 结束：录音过短（<350ms）不发转写请求，回滚并提示太短', async () => {
    await initVoiceInput({});
    await toggleVoiceInput();
    await expect(toggleVoiceInput()).resolves.toBe(true);
    expect(isVoiceRecording()).toBe(false);
    expect(chromeCtx.port.controlFrames().some((f) => f.type === 'stop')).toBe(false);
    expect(dom.status.textContent).toBe(t('voice.tooShort'));
  });

  it('录音足够长后结束：发 stop 帧，final 事件把文本写进输入框', async () => {
    await initVoiceInput({});
    dom.input.value = '前缀';
    dom.input.setSelectionRange(2, 2);
    await toggleVoiceInput();

    await new Promise((r) => setTimeout(r, 400)); // 越过 MIN_RECORD_MS
    await toggleVoiceInput();
    expect(chromeCtx.port.controlFrames().some((f) => f.type === 'stop')).toBe(true);

    chromeCtx.port.emit({ type: 'final', text: '语音定稿' });
    expect(dom.input.value).toBe('前缀语音定稿');
    expect(isVoiceRecording()).toBe(false);
    expect(dom.status.textContent).toBe(t('voice.done'));
  });
});

describe('Esc：录音中取消（抢占清空输入框）', () => {
  it('录音中返回 true 并回滚草稿', async () => {
    await initVoiceInput({});
    dom.input.value = '原有内容';
    dom.input.setSelectionRange(4, 4);
    await toggleVoiceInput();
    chromeCtx.port.emit({ type: 'partial', text: '半截草稿' });
    expect(dom.input.value).toBe('原有内容半截草稿');

    expect(handleVoiceEscape()).toBe(true);
    expect(isVoiceRecording()).toBe(false);
    expect(dom.input.value).toBe('原有内容');
    expect(chromeCtx.port.controlFrames().some((f) => f.type === 'cancel')).toBe(true);
  });

  it('非录音态返回 false，交回既有的清空输入框逻辑', async () => {
    await initVoiceInput({});
    expect(handleVoiceEscape()).toBe(false);
  });
});

describe('pendingVoiceStart：页面焦点触发的一次性标记', () => {
  it('15s 内的标记被消费一次并自动开录', async () => {
    const store = { pendingVoiceStart: Date.now() };
    stubChrome({ status: ARMED, store });
    dom = setupDom();
    await initVoiceInput({});

    expect(await waitFor(() => isVoiceRecording(), { timeout: 1200 })).toBe(true);
    expect(store.pendingVoiceStart).toBeUndefined();

    // 同一个标记不会被消费第二次
    abortVoiceInput();
    await initVoiceInput({});
    await new Promise((r) => setTimeout(r, 300));
    expect(isVoiceRecording()).toBe(false);
  });

  it('过期标记（>15s）被清掉但不自动开录', async () => {
    const store = { pendingVoiceStart: Date.now() - 16_000 };
    stubChrome({ status: ARMED, store });
    dom = setupDom();
    await initVoiceInput({});
    await new Promise((r) => setTimeout(r, 300));
    expect(isVoiceRecording()).toBe(false);
    expect(store.pendingVoiceStart).toBeUndefined();
  });

  it('未就绪时不消费标记也不开录（按钮本就不可见）', async () => {
    const marker = Date.now() - 1000;
    const store = { pendingVoiceStart: marker };
    stubChrome({ status: { success: true, available: false }, store });
    dom = setupDom();
    await initVoiceInput({});
    await new Promise((r) => setTimeout(r, 300));
    expect(isVoiceRecording()).toBe(false);
    expect(store.pendingVoiceStart).toBe(marker); // 未消费，留给下次就绪时使用
  });
});
