// @vitest-environment jsdom
// test/unit/voice-send-stop.unit.test.js
// 「发送 = 语音收尾」与 worklet 加载路径的守卫。
//
// 三件事，都是真机试出来的：
//   1) 说话识别出文字后按 Enter / 点发送，采集仍在跑 → 已经发出去的消息后面又冒字。
//      发送是终态动作：任何「消费输入框」的路径（发送 / 入队 / 插话）都必须先停录音。
//   2) 停录音后代理端仍可能补一条迟到的 final → 弹一条「已完成」的空条，像又录了一次。
//   3) 控制台两条报错：
//      Failed to load worklet module script ... (Network error)
//      worklet unavailable, fallback to ScriptProcessor
//      真因不是 CSP，是路径多拼了一层：打包后 dist 就是扩展根（manifest.json 在 zip 根），
//      再拼 'dist/' 就落到「根/dist/voice-capture-worklet.js」（不存在），请求 URL 显示为
//      chrome-extension://<id>/dist/voice-capture-worklet.js → ERR_FILE_NOT_FOUND。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  toggleVoiceInput,
  isVoiceRecording,
  abortVoiceInput,
  initVoiceInput,
} from '../../src/side_panel/voice-input.js';
import { t } from '../../src/shared/i18n.js';
import { setupDom, stubChrome, stubMedia, waitFor } from './helpers/voice-harness.js';

const ARMED = { success: true, available: true, language: 'zh', maxRecordingMs: 300000 };

// jsdom 环境下 import.meta.url 不是 file: 协议，readFileSync 不认 URL 对象，用项目根拼接
const ROOT = process.cwd();
const VOICE_INPUT_JS = readFileSync(`${ROOT}/src/side_panel/voice-input.js`, 'utf8');
const CHAT_MANAGER_JS = readFileSync(`${ROOT}/src/side_panel/chat-manager.js`, 'utf8');
const QUEUE_RUNNER_JS = readFileSync(`${ROOT}/src/side_panel/queue-runner.js`, 'utf8');
const STYLES = readFileSync(`${ROOT}/src/side_panel/styles.css`, 'utf8');

/** 截取某个导出函数的函数体（到下一个顶层 export 为止，够用且不引解析器） */
function functionBody(src, name) {
  const marker = `export async function ${name}(`;
  const start = src.indexOf(marker);
  expect(start, `缺少导出函数 ${name}`).toBeGreaterThan(-1);
  const next = src.indexOf('\nexport ', start + marker.length);
  return src.slice(start, next === -1 ? undefined : next);
}

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

describe('发送时语音必须收尾', () => {
  it('录音中 abort（发送走的同一函数）：采集停止、按钮复原、录音条收起', async () => {
    await toggleVoiceInput();
    expect(isVoiceRecording()).toBe(true);
    expect(document.body.classList.contains('voice-recording-active')).toBe(true);

    expect(abortVoiceInput()).toBe(true);

    expect(isVoiceRecording()).toBe(false);
    expect(document.body.classList.contains('voice-recording-active')).toBe(false);
    expect(dom.btn.classList.contains('recording')).toBe(false);
    expect(dom.bar.classList.contains('show')).toBe(false);
    // 告诉代理端别等了（否则它还会把结果往回推）
    expect(chromeCtx.port.controlFrames().some((f) => f.type === 'cancel')).toBe(true);
  });

  it('abort 不回滚已识别文字：这些字正是要发出去的内容', async () => {
    await toggleVoiceInput();
    media.emitChunk();
    chromeCtx.port.emit({ type: 'partial', text: '已经识别的一句' });
    abortVoiceInput();
    expect(dom.input.value).toBe('已经识别的一句');
  });

  it('迟到的 final 被丢弃：不会再弹「已完成」，也不再动输入框', async () => {
    vi.useFakeTimers();
    await toggleVoiceInput();
    media.emitChunk();
    chromeCtx.port.emit({ type: 'partial', text: '草稿' });
    void abortVoiceInput();
    dom.input.value = ''; // 发送后输入框被清空
    dom.status.textContent = '';

    chromeCtx.port.emit({ type: 'final', text: '迟到的结果' });

    expect(dom.input.value).toBe('');
    expect(dom.status.textContent).not.toBe(t('voice.done'));
    expect(isVoiceRecording()).toBe(false);
  });

  it('starting 阶段被 abort：采集就绪后不得把录音重新拉起来，且当场释放麦克风', async () => {
    // getUserMedia 的授权框 / worklet 加载会等几百毫秒，这期间按 Enter 发送就会撞上
    // 「abort 之后 startCapture 才 resolve」的竞态。卡住 getUserMedia 把这个窗口放大。
    let release;
    navigator.mediaDevices.getUserMedia = () => new Promise((r) => { release = r; });
    const tracks = [{ stopped: false, stop() { this.stopped = true; } }];

    const starting = toggleVoiceInput(); // 不 await：停在 'starting'
    await waitFor(() => typeof release === 'function');
    expect(dom.btn.classList.contains('recording')).toBe(true);

    abortVoiceInput(); // 等同于按 Enter 发送
    release({ getTracks: () => tracks });
    await starting;

    expect(isVoiceRecording()).toBe(false);
    expect(document.body.classList.contains('voice-recording-active')).toBe(false);
    // 没发出的 start 帧不能被“补发”，否则代理端会开一个没人用的会话
    expect(chromeCtx.port.controlFrames().some((f) => f.type === 'start')).toBe(false);
    // 刚申请到手的流要当场释放，否则浏览器录音指示一直亮
    expect(tracks[0].stopped).toBe(true);
  });
});

describe('三条消费输入框的路径都接上了收尾', () => {
  it('sendMessage：确认有文字后、非队列派发时 abort', () => {
    const body = functionBody(CHAT_MANAGER_JS, 'sendMessage');
    expect(body).toContain("reason: 'empty'");
    const emptyAt = body.indexOf("reason: 'empty'");
    const abortAt = body.indexOf('abortVoiceInput()');
    expect(abortAt).toBeGreaterThan(emptyAt);
    // 空输入框按 Enter 不该掐掉用户正在录的音
    expect(body).toContain('if (!opts.fromQueue) abortVoiceInput();');
  });

  it('enqueueFromInput：入队同样消费输入框，先收尾再清空', () => {
    const body = functionBody(QUEUE_RUNNER_JS, 'enqueueFromInput');
    expect(body).toContain("error: 'empty'");
    expect(body.indexOf('abortVoiceInput()')).toBeGreaterThan(body.indexOf("error: 'empty'"));
    expect(body.indexOf('abortVoiceInput()')).toBeLessThan(body.indexOf('userInput.value = \'\''));
  });

  it('injectAdHocText：插话送进正在跑的任务，也停录音', () => {
    const body = functionBody(QUEUE_RUNNER_JS, 'injectAdHocText');
    expect(body).toContain('abortVoiceInput()');
  });
});

describe('worklet 加载路径', () => {
  it('按「扩展根 / dist 子目录」两种形态探测，不再写死 dist/', () => {
    expect(VOICE_INPUT_JS).toContain("const WORKLET_PATHS = ['voice-capture-worklet.js', 'dist/voice-capture-worklet.js'];");
    expect(VOICE_INPUT_JS).toContain('await resolveWorkletUrl()');
    // 写死 dist/ 就是这次 ERR_FILE_NOT_FOUND 的成因
    expect(VOICE_INPUT_JS).not.toContain("chrome.runtime.getURL('dist/voice-capture-worklet.js')");
  });

  it('用 fetch 先探测再 addModule（失败的错误日志不能当探测手段）', () => {
    const start = VOICE_INPUT_JS.indexOf('async function resolveWorkletUrl()');
    expect(start).toBeGreaterThan(-1);
    const body = VOICE_INPUT_JS.slice(start, VOICE_INPUT_JS.indexOf('async function startWorklet'));
    expect(body).toContain('await fetch(url)');
    expect(body).toContain('res.ok');
    // 解析结果缓存：一次会话里扩展根不会变，不必每次录音都探一次
    expect(body).toContain('workletUrl');
  });
});

describe('录音中的描边跟随容器圆角', () => {
  it('发光画在 .input-container 上（textarea 自身 border-radius: 0，会成直角光晕）', () => {
    expect(STYLES).toMatch(/body\.voice-recording-active \.input-container\s*\{/);
    expect(STYLES).not.toMatch(/body\.voice-recording-active \.input-wrapper textarea/);
  });

  it('textarea 仍然无圆角（圆角由容器提供，改这里会破坏一体化输入区）', () => {
    const start = STYLES.indexOf('.input-container textarea {');
    expect(start).toBeGreaterThan(-1);
    const body = STYLES.slice(start, STYLES.indexOf('}', start));
    expect(body).toContain('border-radius: 0');
  });
});
