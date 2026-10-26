// @vitest-environment jsdom
// test/unit/voice-recorder-bar.unit.test.js
// 录音条（输入区上方条状控件）的状态机行为：
//   1) 波形柱数量与音量映射（纯 CSS 高度，不引 canvas）；
//   2) 连续静音 2.5s → 条内提示「没有听到声音」，重新出声 → 回到「正在聆听…」；
//   3) 结束且无识别结果 → 回滚草稿 + 条内提示「未识别到语音」（不弹 toast）；
//   4) 麦克风权限被拒 → 条内改为引导文案（含如何开启），并取消本次会话；
//   5) 其他采集失败 → 通用失败文案；
//   6) 录音条按钮（✕ 取消 / ✓ 完成）与计时显示。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toggleVoiceInput,
  isVoiceRecording,
  abortVoiceInput,
  initVoiceInput,
} from '../../src/side_panel/voice-input.js';
import { t } from '../../src/shared/i18n.js';
import { setupDom, stubChrome, stubMedia } from './helpers/voice-harness.js';

const ARMED = { success: true, available: true, language: 'zh', maxRecordingMs: 300000 };

let dom;
let chromeCtx;
let media;

beforeEach(async () => {
  dom = setupDom();
  media = stubMedia();
  chromeCtx = stubChrome({ status: ARMED });
  await initVoiceInput({});
});

afterEach(() => {
  abortVoiceInput();
  chromeCtx.port.disconnect();
  vi.useRealTimers();
});

describe('波形与计时', () => {
  it('初始化即铺好 24 根音量柱', () => {
    expect(dom.wave.children.length).toBe(24);
  });

  it('采集到一帧：最后一根柱子按 RMS 变高，静音时压到 2px 且降低不透明度', async () => {
    await toggleVoiceInput();
    media.emitChunk({ rms: 0.3 });
    const bars = dom.wave.children;
    const last = bars[bars.length - 1];
    expect(parseInt(last.style.height, 10)).toBeGreaterThan(2);
    expect(last.style.opacity).toBe('1');

    media.emitChunk({ rms: 0 });
    expect(bars[bars.length - 1].style.height).toBe('2px');
    expect(bars[bars.length - 1].style.opacity).toBe('0.35');
  });

  it('计时从开始采集算起，按 mm:ss 显示', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    vi.advanceTimersByTime(3200);
    expect(dom.timer.textContent).toBe('00:03');
  });

  it('录音中给 body 加脉冲描边类，结束后移除', async () => {
    await toggleVoiceInput();
    expect(document.body.classList.contains('voice-recording-active')).toBe(true);
    abortVoiceInput();
    expect(document.body.classList.contains('voice-recording-active')).toBe(false);
  });
});

describe('静音 / 无结果提示', () => {
  it('连续静音 2.5s 提示「没有听到声音」，重新出声回到「正在聆听…」', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    expect(dom.status.textContent).toBe(t('voice.listening'));

    media.emitChunk({ rms: 0 });            // 静音起点
    vi.advanceTimersByTime(1000);
    media.emitChunk({ rms: 0 });
    expect(dom.status.textContent).toBe(t('voice.listening')); // 还没到 2.5s

    vi.advanceTimersByTime(1800);           // 累计 2.8s
    media.emitChunk({ rms: 0 });
    expect(dom.status.textContent).toBe(t('voice.noSpeech'));
    expect(dom.status.className).toContain('is-warn');

    media.emitChunk({ rms: 0.5 });          // 重新说话
    expect(dom.status.textContent).toBe(t('voice.listening'));
    expect(dom.status.className).not.toContain('is-warn');
  });

  it('静音期间有声音打断会重置静音计时（不会误报）', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    media.emitChunk({ rms: 0 });
    vi.advanceTimersByTime(2000);
    media.emitChunk({ rms: 0.4 });          // 打断
    vi.advanceTimersByTime(2000);
    media.emitChunk({ rms: 0 });            // 重新开始静音计时
    expect(dom.status.textContent).toBe(t('voice.listening'));
  });

  it('结束但完全没识别到内容：条内提示「未识别到语音」，不动原有文字', async () => {
    vi.useFakeTimers();
    dom.input.value = '原有内容';
    dom.input.setSelectionRange(4, 4);
    await toggleVoiceInput();
    media.emitChunk();

    chromeCtx.port.emit({ type: 'final', text: '' });
    expect(dom.input.value).toBe('原有内容');
    expect(dom.status.textContent).toBe(t('voice.noResult'));
    expect(isVoiceRecording()).toBe(false);
  });

  it('已有流式草稿时 final 为空：保留已识别文字（不丢内容）', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    media.emitChunk();
    chromeCtx.port.emit({ type: 'partial', text: '临时草稿' });

    chromeCtx.port.emit({ type: 'final', text: '' });
    expect(dom.input.value).toBe('临时草稿');
    expect(isVoiceRecording()).toBe(false);
  });

  it('结束且识别为空时不留半截草稿（回滚后 clean）', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    chromeCtx.port.emit({ type: 'final', text: '   ' });
    expect(dom.input.value).toBe('');
    expect(isVoiceRecording()).toBe(false);
  });
});

describe('权限与采集失败的分流', () => {
  it('麦克风权限被拒：条内给引导文案，不进入录音态，取消会话', async () => {
    stubMedia({ failWith: Object.assign(new Error('denied'), { name: 'NotAllowedError' }) });
    dom = setupDom();
    await initVoiceInput({});
    await expect(toggleVoiceInput()).resolves.toBe(false);
    expect(isVoiceRecording()).toBe(false);
    expect(dom.status.textContent).toContain(t('voice.micDenied'));
    expect(dom.status.textContent).toContain(t('voice.micDeniedHelp'));
    expect(dom.status.className).toContain('is-warn');
    expect(chromeCtx.port.controlFrames().some((f) => f.type === 'cancel')).toBe(true);
  });

  it('其他采集错误：通用失败文案', async () => {
    stubMedia({ failWith: Object.assign(new Error('no device'), { name: 'NotFoundError' }) });
    dom = setupDom();
    await initVoiceInput({});
    await expect(toggleVoiceInput()).resolves.toBe(false);
    expect(dom.status.textContent).toBe(t('voice.failed'));
  });

  it('代理端报 busy：提示后直接回滚，不留半截草稿', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    media.emitChunk();
    chromeCtx.port.emit({ type: 'partial', text: '草稿' });
    chromeCtx.port.emit({ type: 'error', code: 'busy' });
    expect(dom.status.textContent).toBe(t('voice.busy'));
    expect(dom.input.value).toBe('');
    expect(isVoiceRecording()).toBe(false);
  });

  it('代理端报 model_missing：提示去配置页导入模型', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    chromeCtx.port.emit({ type: 'error', code: 'model_missing' });
    expect(dom.status.textContent).toContain(t('voice.modelMissing'));
    expect(dom.status.textContent).toContain(t('voice.modelMissingHelp'));
    expect(isVoiceRecording()).toBe(false);
  });

  it('通道断开：立即结束采集，保留已写入的草稿并提示连接中断', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    chromeCtx.port.emit({ type: 'partial', text: '已识别半句' });
    chromeCtx.port.disconnect();

    expect(dom.status.textContent).toBe(t('voice.connectionLost'));
    expect(isVoiceRecording()).toBe(false);
    expect(dom.input.value).toBe('已识别半句'); // 已经看得见的文字不丢
    expect(dom.btn.classList.contains('recording')).toBe(false);

    // 断开后继续收到的事件不应再改动输入框
    chromeCtx.port.emit({ type: 'partial', text: '不应生效' });
    expect(dom.input.value).toBe('已识别半句');
  });
});

describe('录音条按钮', () => {
  it('✕ 取消：回滚草稿并收起录音条', async () => {
    await toggleVoiceInput();
    media.emitChunk();
    chromeCtx.port.emit({ type: 'partial', text: '草稿' });
    dom.cancelBtn.click();
    expect(dom.input.value).toBe('');
    expect(isVoiceRecording()).toBe(false);
    expect(dom.bar.classList.contains('show')).toBe(false);
  });

  it('✓ 完成：等同再点一次 🎤（走 stop 定稿）', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    media.emitChunk();
    chromeCtx.port.emit({ type: 'partial', text: '草稿' });
    vi.advanceTimersByTime(1000);
    dom.doneBtn.click();
    expect(chromeCtx.port.controlFrames().some((f) => f.type === 'stop')).toBe(true);
    expect(dom.status.textContent).toBe(t('voice.transcribing'));
  });
});
