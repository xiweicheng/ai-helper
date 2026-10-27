// @vitest-environment jsdom
// test/unit/voice-review-fixes.unit.test.js
// 语音转文字代码评审（H1/M1-M7/M9）的回归守卫。
//
// 这批判定来自对 voice-input.js / background / options / agent 的逐行走查，
// 共同点是「不会立刻报错，只在特定时序下把体验拖坏」：
//   H1 用户接手草稿后，每个 partial 都把累积文本整段再追加一遍 → O(n²) 文本膨胀；
//   M1 cancel / 错误路径不清 60s 兜底定时器 → 下一轮被提前定稿，真实 final 当迟到丢弃；
//   M2 max_duration 被当成硬失败 → 回滚草稿，紧接着 agent 的 offline 定稿无处可去；
//   M3 ScriptProcessor 兜底直连扬声器 → 用户听见自己的回声；
//   M4 程序写草稿不派发事件 → 生成中补一句，按钮仍是「停止」，点下去中断生成；
//   M5 ASR_RESET_STATUS 后不广播 → 面板门控停留在旧状态，🎤 该亮不亮 / 该灭不灭；
//   M6 非法模型包按 id/message 渲染 → agent 返回的是 name/error，界面显示空行；
//   M7 续传只比字节数 → 大小对、内容坏的文件永远被跳过，直到引擎加载才炸；
//   M9 await refreshGating 后不复查 phase → 两路并发各开一次采集，麦克风常亮。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  toggleVoiceInput,
  isVoiceRecording,
  abortVoiceInput,
  initVoiceInput,
  appendOnlyDelta,
} from '../../src/side_panel/voice-input.js';
import { t } from '../../src/shared/i18n.js';
import { setupDom, stubChrome, stubMedia, waitFor } from './helpers/voice-harness.js';

const ARMED = { success: true, available: true, language: 'zh', maxRecordingMs: 300000 };

const ROOT = process.cwd();
const VOICE_INPUT = readFileSync(`${ROOT}/src/side_panel/voice-input.js`, 'utf8');
const BG_INDEX = readFileSync(`${ROOT}/src/background/index.js`, 'utf8');
const PANEL_INDEX = readFileSync(`${ROOT}/src/side_panel/index.js`, 'utf8');
const TOOLBOX_ASR = readFileSync(`${ROOT}/src/options/toolbox-asr.js`, 'utf8');

/**
 * 截取一个顶层函数体：从 `function name(` 到下一个顶层 `function` / `export` 声明
 * @param {string} src
 * @param {string} marker 起始标记（含参数列表，便于区分同名重载）
 * @param {string} endMarker 结束标记
 */
function sliceBetween(src, marker, endMarker) {
  const start = src.indexOf(marker);
  expect(start, `找不到起点：${marker}`).toBeGreaterThan(-1);
  const end = src.indexOf(endMarker, start + marker.length);
  expect(end, `找不到终点：${endMarker}`).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** 录音中的面板：开录 → 采一帧 → 拿到可派发事件的上下文 */
async function startRecordingForTest(ctx) {
  await toggleVoiceInput();
  expect(isVoiceRecording()).toBe(true);
  ctx.media.emitChunk();
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
});

describe('H1：累积型 partial 不得整段重复追加', () => {
  it('未 dirty：partial 是「全集」而不是「增量」，输入框始终只留最后一版', async () => {
    await startRecordingForTest({ media });

    chromeCtx.port.emit({ type: 'partial', text: '你好' });
    expect(dom.input.value).toBe('你好');

    chromeCtx.port.emit({ type: 'partial', text: '你好世界' });
    expect(dom.input.value).toBe('你好世界'); // 旧行为：'你好你好世界'

    // 识别结果回缩（尾字被撤回）也要跟着收，不能留残影
    chromeCtx.port.emit({ type: 'partial', text: '你好' });
    expect(dom.input.value).toBe('你好');
  });

  it('dirty 后只追加「比上一版多出来的尾巴」，不会每 150ms 复制一遍整段', async () => {
    await startRecordingForTest({ media });

    chromeCtx.port.emit({ type: 'partial', text: '你好' });
    expect(dom.input.value).toBe('你好');

    // 用户接手：在草稿尾部补一个自己的字（真机上等于点了下输入框再打字）
    dom.input.value = '你好呀';
    dom.input.setSelectionRange(3, 3);
    dom.input.dispatchEvent(new Event('input')); // → markDirty()

    chromeCtx.port.emit({ type: 'partial', text: '你好世界' });
    // 追加点 = 用户当前光标，不覆盖他刚补的字
    expect(dom.input.value).toBe('你好呀世界');

    chromeCtx.port.emit({ type: 'partial', text: '你好世界啊' });
    expect(dom.input.value).toBe('你好呀世界啊');

    // 三次 partial 的总长度必须在同一量级；旧行为这里是 '你好你好呀世界你好世界啊'
    expect(dom.input.value.length).toBeLessThan(10);
  });

  it('dirty 且这一版发生了改写（非纯追加）：宁可不动，也不重写用户的文本', async () => {
    await startRecordingForTest({ media });

    chromeCtx.port.emit({ type: 'partial', text: '我想订机票' });
    dom.input.value = '我想订机票，';
    dom.input.setSelectionRange(6, 6);
    dom.input.dispatchEvent(new Event('input'));

    chromeCtx.port.emit({ type: 'partial', text: '我要订机票' }); // 不是 '我想订机票' 的前缀
    expect(dom.input.value).toBe('我想订机票，');

    // 之后回到纯追加（相对新版前缀），仍然能接上
    chromeCtx.port.emit({ type: 'partial', text: '我要订机票了' });
    expect(dom.input.value).toBe('我想订机票，了');
  });

  it('appendOnlyDelta：纯追加返回尾巴，改写返回 null，空值不写', () => {
    expect(appendOnlyDelta('你好', '你好世界')).toBe('世界');
    expect(appendOnlyDelta('', '你好')).toBe('你好');
    expect(appendOnlyDelta('你好', '你好')).toBe('');
    expect(appendOnlyDelta('你好', '')).toBe('');
    expect(appendOnlyDelta('你好世界', '你好')).toBe(null);
    expect(appendOnlyDelta('abc', 'abd')).toBe(null);
  });
});

describe('M2：max_duration 是「到上限了」，不是失败', () => {
  it('保留草稿、保持转写态等 agent 的 final，文案不能被「正在转写」盖掉', async () => {
    await startRecordingForTest({ media });

    chromeCtx.port.emit({ type: 'partial', text: '说到一半' });
    expect(dom.input.value).toBe('说到一半');

    chromeCtx.port.emit({ type: 'error', code: 'max_duration' });

    // 只改文案：既不能说「识别失败」，也不能被 finish('stop') 里的「正在转写…」覆盖
    expect(dom.status.textContent).toBe(t('voice.maxDuration'));
    expect(dom.status.textContent).not.toBe(t('voice.failed'));
    // 草稿不能回滚：这些字马上就要被 offline 定稿覆盖
    expect(dom.input.value).toBe('说到一半');
    // 仍在 finalizing：agent 还会补一条 final
    expect(isVoiceRecording()).toBe(true);

    chromeCtx.port.emit({ type: 'final', text: '说到一半的整段定稿' });
    expect(dom.input.value).toBe('说到一半的整段定稿');
    expect(isVoiceRecording()).toBe(false);
  });

  it('真正的硬失败仍然回滚草稿（别把 max_duration 的特殊处理泛化到所有 error）', async () => {
    await startRecordingForTest({ media });

    chromeCtx.port.emit({ type: 'partial', text: '半句话' });
    chromeCtx.port.emit({ type: 'error', code: 'internal' });

    expect(dom.input.value).toBe('');
    expect(dom.status.textContent).toBe(t('voice.failed'));
    expect(isVoiceRecording()).toBe(false);
  });
});

describe('M4：草稿写入要通知下游，但不能冒充用户输入', () => {
  it('写草稿时派发 voice-draft-written，且不派发原生 input 事件', async () => {
    let signal = 0;
    let nativeInput = 0;
    const onSignal = () => { signal += 1; };
    const onInput = () => { nativeInput += 1; };
    document.addEventListener('voice-draft-written', onSignal);
    dom.input.addEventListener('input', onInput);

    try {
      await startRecordingForTest({ media });
      chromeCtx.port.emit({ type: 'partial', text: '一句话' });
      expect(dom.input.value).toBe('一句话');
      expect(signal).toBeGreaterThan(0);
      // 原生 input 会触发侧边栏扫 / @ $ 弹选择器：口述里出现这三个字符就中途弹面板
      expect(nativeInput).toBe(0);
    } finally {
      document.removeEventListener('voice-draft-written', onSignal);
      dom.input.removeEventListener('input', onInput);
    }
  });

  it('侧边栏监听这个信号刷新发送按钮三态', () => {
    expect(PANEL_INDEX).toContain("document.addEventListener('voice-draft-written', updateSendBtnState)");
    // 反向：不能靠原生 input 兜底，那会把选择器问题带回来
    expect(VOICE_INPUT).toContain("new CustomEvent('voice-draft-written')");
  });
});

describe('M9：并发启动只允许开一路采集', () => {
  it('两次 toggle 都卡在 refreshGating：只有一路真的 start', async () => {
    // 先把门控降到 false：否则 startRecording 不会走 await refreshGating() 那条路
    chrome.runtime.sendMessage = async () => ({ success: true, status: { success: true, available: false } });
    await initVoiceInput({});

    // 再换成一个可由测试控制何时 resolve 的状态请求
    const gates = [];
    chrome.runtime.sendMessage = () => new Promise((resolve) => {
      gates.push(() => resolve({ success: true, status: ARMED }));
    });

    const first = toggleVoiceInput();
    const second = toggleVoiceInput();
    await waitFor(() => gates.length === 2);
    expect(gates).toHaveLength(2);

    for (const release of gates) release();
    await Promise.all([first, second]);

    // 第二路必须在写完 phase 之前被挡住。否则它会进到 starting、各自开一套采集，
    // 然后被 startCapture 之后那道复查拦下 —— 而它手里的 stopCapture() 清的是共享的
    // st.ctx / st.stream：结果是界面停在「录音中」，麦克风已经被第二路关掉了。
    const starts = chromeCtx.port.controlFrames().filter((f) => f.type === 'start');
    expect(starts).toHaveLength(1);
    expect(isVoiceRecording()).toBe(true);
    expect(media.tracks[0].stopped).toBe(false);
  });
});

describe('M1 / M3 / M5 / M6：结构契约（这些路径在单测里不好造，用源码断言防回归）', () => {
  it('M1：所有回到 idle 的出口都走 resetToIdle，且它清掉 60s 兜底定时器', () => {
    const body = sliceBetween(VOICE_INPUT, 'function resetToIdle() {', '\n}\n');
    expect(body).toContain('clearTimeout(st.finishWaitTimer)');
    expect(body).toContain("st.phase = 'idle'");

    // 除 resetToIdle 内部那一处，全文不应再有直接写 idle 的地方
    const direct = VOICE_INPUT.match(/st\.phase = 'idle'/g) || [];
    expect(direct).toHaveLength(1);
  });

  it('M3：ScriptProcessor 兜底经 gain(0) 中继，不把麦克风直连扬声器', () => {
    const body = sliceBetween(VOICE_INPUT, 'function startScriptProcessor(ctx, source) {', '\nasync function startCapture() {');
    expect(body).not.toContain('node.connect(ctx.destination)');
    expect(body).toContain('mute.gain.value = 0');
    expect(body).toContain('node.connect(mute)');
    expect(body).toContain('mute.connect(ctx.destination)');
    // 中继节点要记住，否则 stopCapture 断不掉它
    expect(body).toContain('st.mute = mute');
    expect(VOICE_INPUT).toContain('st.mute?.disconnect?.()');
  });

  it('M5：ASR_RESET_STATUS 清缓存后广播 ASR_STATUS_CHANGED（面板靠它重新门控）', () => {
    const branch = sliceBetween(BG_INDEX, "if (message.type === 'ASR_RESET_STATUS') {", '\n  }');
    expect(branch).toContain('clearAsrStatusCache()');
    expect(branch).toContain('ASR_STATUS_CHANGED');
  });

  it('M6：非法模型包按 agent 实际返回的 name / error 渲染', () => {
    expect(TOOLBOX_ASR).toContain('x.name || x.id || x.dir');
    expect(TOOLBOX_ASR).toContain('x.error || x.reason');
  });
});