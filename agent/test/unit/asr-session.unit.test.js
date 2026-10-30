// agent/test/unit/asr-session.unit.test.js
// 流式识别会话（/ws/asr/:id）的协议与资源回收回归测试。
// 全部依赖通过 createAsrSessionManager(deps) 注入：不加载 sherpa-onnx-node、不建真连接。
// 覆盖：ready 能力位、partial 节流、endpoint 提交、stop 定稿/回退、cancel、
//      空闲超时、总时长上限、并发 busy、close 释放、异常帧处理。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root;
let sessionMod;
let cfg;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'asr-session-test-'));
  process.env.AI_HELPER_ASR_ROOT = root;
  // config.js 在模块求值时读 env，必须先设再 import
  cfg = await import('../../src/asr/config.js');
  sessionMod = await import('../../src/asr/session.js');
});

after(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

// ==================== 测试替身 ====================

/** 最小 ws 替身：记录发出的 JSON 帧，可主动触发事件 */
function makeWs() {
  const handlers = new Map();
  const sent = [];
  const ws = {
    readyState: 1,
    sent,
    closed: false,
    closeCount: 0,
    send(payload) { sent.push(JSON.parse(payload)); },
    close() {
      ws.closed = true;
      ws.closeCount += 1;
      ws.readyState = 3;
      emit('close');
    },
    on(ev, fn) {
      if (!handlers.has(ev)) handlers.set(ev, []);
      handlers.get(ev).push(fn);
    },
  };
  function emit(ev, ...args) {
    for (const fn of handlers.get(ev) || []) fn(...args);
  }
  ws.emit = emit;
  /** 发一帧控制 JSON */
  ws.control = (obj) => emit('message', Buffer.from(JSON.stringify(obj)), false);
  /** 发一帧二进制 PCM（samples 个采样点） */
  ws.audio = (samples = 160) => emit('message', Buffer.alloc(samples * 2, 0), true);
  /** 发一帧非静音 PCM（正弦，幅度 amp）：触发 RMS「有语音」判定 */
  ws.speech = (samples = 1600, amp = 0.3) => {
    const buf = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
      buf.writeInt16LE(Math.round(Math.sin(i / 8) * amp * 32767), i * 2);
    }
    emit('message', buf, true);
  };
  return ws;
}

/** 假流式识别器：isReady/decode 由 acceptWaveform 驱动，避免 pumpPartial 死循环 */
function makeFakeRecognizer(initial = {}) {
  const state = {
    text: initial.text || '',
    endpoint: false,
    decodeCount: 0,
    resets: 0,
    freed: false,
    pending: false,
    acceptThrows: false,
  };
  const stream = {
    acceptWaveform() {
      if (state.acceptThrows) throw new Error('accept boom');
      state.pending = true;
    },
    free() { state.freed = true; },
  };
  const rec = {
    createStream: () => stream,
    isReady: () => state.pending,
    decode: () => { state.pending = false; state.decodeCount += 1; },
    getResult: () => ({ text: state.text }),
    isEndpoint: () => state.endpoint,
    reset: () => { state.resets += 1; state.text = ''; },
  };
  return { rec, state, stream };
}

const OFFLINE_MODEL = { id: 'offline-x', kind: 'offline' };
const ONLINE_MODEL = { id: 'online-x', kind: 'online' };
const VAD_MODEL = { id: 'vad-x', kind: 'vad' };

/**
 * 建一个管理器；默认注入「流式+定稿都可用」的依赖
 */
function createManager(overrides = {}) {
  const fake = overrides.fake || makeFakeRecognizer();
  const calls = { onError: [], onLog: [], transcribe: [] };
  let clock = overrides.clock || (() => 0);
  const manager = sessionMod.createAsrSessionManager({
    getModels: () => ({ online: ONLINE_MODEL, offline: OFFLINE_MODEL, vad: VAD_MODEL }),
    getIdleUnloadMs: () => 0,
    getOnlineRecognizer: () => fake.rec,
    transcribe: (samples, opts) => {
      calls.transcribe.push({ samples, opts });
      return { text: '定稿文本' };
    },
    maxSessions: 1,
    now: () => clock(),
    onError: (code, err) => calls.onError.push({ code, err }),
    onLog: (code, data) => calls.onLog.push({ code, data }),
    ...overrides.raw,
  });
  return { manager, fake, calls, setClock: (fn) => { clock = fn; } };
}

// ==================== 用例 ====================

/** 等定稿链跑完：finalize 是异步的（生产走 worker 线程），final 帧稍后才到 */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('pcm16ToFloat32', () => {
  test('按 -1..1 归一化，奇数字节丢弃', () => {
    const buf = Buffer.alloc(6);
    buf.writeInt16LE(16384, 0);
    buf.writeInt16LE(-32768, 2);
    buf.writeInt16LE(0, 4);
    const out = sessionMod.pcm16ToFloat32(buf);
    assert.equal(out.length, 3);
    assert.ok(Math.abs(out[0] - 0.5) < 1e-6);
    assert.equal(out[1], -1);
    assert.equal(out[2], 0);
    // 3 字节（1.5 采样）：只取 1 个采样点
    assert.equal(sessionMod.pcm16ToFloat32(Buffer.alloc(3)).length, 1);
  });
});

describe('start / ready', () => {
  test('流式与定稿都可用时 ready 为 draft:true, finalize:true', () => {
    const { manager, fake } = createManager();
    const ws = makeWs();
    manager.attach(ws, 's1');
    ws.control({ type: 'start', language: 'zh' });
    const ready = ws.sent.find((m) => m.type === 'ready');
    assert.ok(ready, '应回 ready 帧');
    assert.equal(ready.draft, true);
    assert.equal(ready.finalize, true);
    assert.equal(manager._sessions.get('s1').language, 'zh');
    assert.equal(fake.state.freed, false);
    manager.release(manager._sessions.get('s1'));
  });

  test('缺流式模型时 ready 为 draft:false（客户端退化为整段定稿）', () => {
    const { manager } = createManager({
      raw: { getModels: () => ({ online: null, offline: OFFLINE_MODEL, vad: null }) },
    });
    const ws = makeWs();
    manager.attach(ws, 's2');
    ws.control({ type: 'start' });
    const ready = ws.sent.find((m) => m.type === 'ready');
    assert.equal(ready.draft, false);
    assert.equal(ready.finalize, true);
    manager.release(manager._sessions.get('s2'));
  });

  test('流式模型加载失败不抛异常，降级为 draft:false 并记录 onError', () => {
    const { manager, calls } = createManager({
      raw: {
        getOnlineRecognizer: () => { throw new Error('native load failed'); },
      },
    });
    const ws = makeWs();
    manager.attach(ws, 's3');
    ws.control({ type: 'start' });
    assert.equal(ws.sent.find((m) => m.type === 'ready').draft, false);
    assert.equal(calls.onError[0].code, 'online_init_failed');
    manager.release(manager._sessions.get('s3'));
  });
});

describe('音频帧 → 草稿', () => {
  test('partial 节流 150ms，同一文本不重复推送', () => {
    let clock = 10_000;
    const { manager, fake } = createManager({ clock: () => clock });
    const ws = makeWs();
    manager.attach(ws, 'p1');
    ws.control({ type: 'start' });

    fake.state.text = '你好';
    ws.audio();
    const first = ws.sent.filter((m) => m.type === 'partial');
    assert.equal(first.length, 1, '首帧应立即推草稿');
    assert.equal(first[0].text, '你好');
    assert.equal(fake.state.decodeCount, 1);

    // 50ms 后再来一帧：节流窗口内不推
    clock += 50;
    fake.state.text = '你好世界';
    ws.audio();
    assert.equal(ws.sent.filter((m) => m.type === 'partial').length, 1, '节流窗口内不推');

    // 越过 150ms：推新草稿
    clock += 150;
    ws.audio();
    const partials = ws.sent.filter((m) => m.type === 'partial');
    assert.equal(partials.length, 2);
    assert.equal(partials[1].text, '你好世界');

    // 文本未变化：即使越过节流窗口也不重复推
    clock += 200;
    ws.audio();
    assert.equal(ws.sent.filter((m) => m.type === 'partial').length, 2, '文本未变不重复推');

    manager.release(manager._sessions.get('p1'));
  });

  test('endpoint：提交为稳定片段并 reset 流，后续草稿基于 committedText 拼接', () => {
    let clock = 10_000;
    const { manager, fake } = createManager({ clock: () => clock });
    const ws = makeWs();
    manager.attach(ws, 'e1');
    ws.control({ type: 'start' });

    fake.state.text = '第一句。';
    fake.state.endpoint = true;
    ws.audio();

    const endpoint = ws.sent.find((m) => m.type === 'endpoint');
    assert.ok(endpoint, '应推 endpoint 帧');
    assert.equal(endpoint.text, '第一句。');
    assert.equal(fake.state.resets, 1, '句尾后应 reset 流');

    // 句尾之后：草稿 = 已提交 + 当前
    fake.state.endpoint = false;
    clock += 200;
    fake.state.text = '第二句';
    ws.audio();
    const last = ws.sent.filter((m) => m.type === 'partial').pop();
    assert.match(last.text, /第一句/);
    assert.match(last.text, /第二句/);

    manager.release(manager._sessions.get('e1'));
  });

  test('超大帧被拒绝（frame_too_large），不进入识别', () => {
    const { manager, calls } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'f1');
    ws.emit('message', Buffer.alloc(321 * 1024, 0), true);
    const err = ws.sent.find((m) => m.type === 'error');
    assert.equal(err.code, 'frame_too_large');
    assert.equal(calls.transcribe.length, 0);
    manager.release(manager._sessions.get('f1'));
  });

  test('acceptWaveform 抛错时降级为「只保留波形」，不影响后续 stop 定稿', async () => {
    const { manager, fake, calls } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'a1');
    ws.control({ type: 'start' });
    fake.state.acceptThrows = true;
    ws.audio(320);
    assert.ok(calls.onError.some((e) => e.code === 'accept_waveform_failed'));
    ws.control({ type: 'stop' });
    await flush();
    assert.equal(calls.transcribe.length, 1, 'stop 仍应走 offline 定稿');
    assert.equal(calls.transcribe[0].samples.length, 320);
  });
});

describe('stop / cancel / release', () => {
  test('stop：优先 offline 定稿，推 final 后释放并关闭连接', async () => {
    const { manager, fake, calls } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'st1');
    ws.control({ type: 'start' });
    fake.state.text = '草稿';
    ws.audio(160);
    ws.control({ type: 'stop' });
    assert.equal(manager.activeCount(), 0, '会话应立刻释放（不等定稿）');
    await flush();

    const final = ws.sent.find((m) => m.type === 'final');
    assert.ok(final, '应推 final 帧');
    assert.equal(final.text, '定稿文本');
    assert.equal(final.fallback, false);
    assert.equal(calls.transcribe[0].samples.length, 160, '应把整段波形交给定稿');
    assert.equal(calls.transcribe[0].opts.offlineModel, OFFLINE_MODEL);
    assert.equal(calls.transcribe[0].opts.vadModel, VAD_MODEL);
    assert.equal(manager.activeCount(), 0, '会话应被释放');
    assert.equal(ws.closed, true, '连接应被关闭');
    assert.equal(fake.state.freed, true, '流应被 free');
  });

  test('stop 后立刻让出并发名额：定稿还在跑也能开下一路', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { manager } = createManager({ raw: { transcribe: () => gate } });
    const ws = makeWs();
    manager.attach(ws, 'st1b');
    ws.control({ type: 'start' });
    ws.audio(160);
    ws.control({ type: 'stop' });

    // 关键：offline 未返回时名额已经还回去了（MAX_SESSIONS 默认 1）
    assert.equal(manager.activeCount(), 0);
    const second = makeWs();
    assert.equal(manager.attach(second, 'st1c'), true, '下一路应立即被接受');

    release({ text: '迟到的定稿' });
    await flush();
    assert.equal(ws.sent.find((m) => m.type === 'final').text, '迟到的定稿');
    assert.equal(ws.closed, true, '定稿完成后才断开');
    manager.release(manager._sessions.get('st1c'));
  });

  test('定稿期间连接已断：final 静默丢弃，不抛异常', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { manager, calls } = createManager({ raw: { transcribe: () => gate } });
    const ws = makeWs();
    manager.attach(ws, 'st1d');
    ws.control({ type: 'start' });
    ws.audio(160);
    ws.control({ type: 'stop' });
    ws.readyState = 3; // 客户端先断开
    release({ text: '没人要了' });
    await flush();
    assert.equal(ws.sent.filter((m) => m.type === 'final').length, 0);
    assert.equal(calls.onError.length, 0, '断连不是错误');
  });

  test('stop 但无 offline 模型：回退为流式草稿（fallback:true）', async () => {
    const { manager, fake } = createManager({
      raw: { getModels: () => ({ online: ONLINE_MODEL, offline: null, vad: null }) },
    });
    const ws = makeWs();
    manager.attach(ws, 'st2');
    ws.control({ type: 'start' });
    fake.state.text = '流式草稿';
    ws.audio();
    ws.control({ type: 'stop' });

    const final = ws.sent.find((m) => m.type === 'final');
    assert.equal(final.fallback, true);
    assert.equal(final.text, '流式草稿');
    assert.equal(manager.activeCount(), 0);
    await flush();
    assert.equal(ws.closed, true);
  });

  test('offline 定稿抛错：记录 onError 并回退流式草稿（不丢用户已识别的文字）', async () => {
    let clock = 10_000;
    const { manager, fake, calls } = createManager({
      clock: () => clock,
      raw: { transcribe: () => { throw new Error('decode failed'); } },
    });
    const ws = makeWs();
    manager.attach(ws, 'st3');
    ws.control({ type: 'start' });
    fake.state.text = '已识别';
    ws.audio();
    ws.control({ type: 'stop' });
    await flush();

    const final = ws.sent.find((m) => m.type === 'final');
    assert.equal(final.fallback, true);
    assert.equal(final.text, '已识别');
    assert.ok(calls.onError.some((e) => e.code === 'offline_finalize_failed'));
    assert.equal(manager.activeCount(), 0);
  });

  test('stop 幂等：重复 stop 不重复定稿', async () => {
    const { manager, calls } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'st4');
    ws.control({ type: 'start' });
    ws.audio();
    ws.control({ type: 'stop' });
    ws.emit('message', Buffer.from(JSON.stringify({ type: 'stop' })), false);
    await flush();
    assert.equal(calls.transcribe.length, 1, '第二个 stop 应被 finishing 挡住');
  });

  test('cancel：直接释放并关闭，不产出 final', () => {
    const { manager, fake } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'c1');
    ws.control({ type: 'start' });
    fake.state.text = '不该出现';
    ws.audio();
    ws.control({ type: 'cancel' });

    assert.equal(ws.sent.filter((m) => m.type === 'final').length, 0, 'cancel 不得推 final');
    assert.equal(manager.activeCount(), 0);
    assert.equal(ws.closed, true);
    assert.equal(fake.state.freed, true);
  });

  test('连接关闭（未 stop）：释放会话并记录 asr_session_closed', () => {
    const { manager, calls } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'cl1');
    ws.audio(80);
    ws.emit('close');
    assert.equal(manager.activeCount(), 0);
    const log = calls.onLog.find((l) => l.code === 'asr_session_closed');
    assert.ok(log, '应记录会话关闭日志（泄漏断言用）');
    assert.equal(log.data.samples, 80);
  });

  test('release 幂等：重复调用不抛异常', () => {
    const { manager } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'r1');
    const session = manager._sessions.get('r1');
    manager.release(session);
    manager.release(session);
    assert.equal(manager.activeCount(), 0);
  });

  test('closeAll：所有会话收到 server_shutdown 并释放', () => {
    const m = sessionMod.createAsrSessionManager({
      getModels: () => ({ online: null, offline: null, vad: null }),
      getOnlineRecognizer: () => { throw new Error('unused'); },
      maxSessions: 5,
      now: () => 0,
    });
    const a = makeWs();
    const b = makeWs();
    m.attach(a, 'x1');
    m.attach(b, 'x2');
    assert.equal(m.activeCount(), 2);
    m.closeAll();
    assert.equal(m.activeCount(), 0);
    assert.equal(a.sent.find((x) => x.type === 'error').code, 'server_shutdown');
    assert.equal(b.sent.find((x) => x.type === 'error').code, 'server_shutdown');
  });
});

describe('资源上限', () => {
  test('并发超限：第二个连接收到 busy 并立即关闭', () => {
    const { manager } = createManager();
    const ws1 = makeWs();
    const ws2 = makeWs();
    assert.equal(manager.attach(ws1, 'b1'), true);
    assert.equal(manager.attach(ws2, 'b2'), false, '超限应拒绝');
    assert.equal(ws2.sent[0].code, 'busy');
    assert.equal(ws2.closed, true);
    assert.equal(manager.activeCount(), 1);
    manager.release(manager._sessions.get('b1'));
  });

  test('空闲超时：发 idle_timeout 错误并释放', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { manager } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'i1');
    assert.equal(manager.activeCount(), 1);

    t.mock.timers.tick(cfg.SESSION_IDLE_MS);
    const err = ws.sent.find((m) => m.type === 'error');
    assert.equal(err.code, 'idle_timeout');
    assert.equal(manager.activeCount(), 0, '会话应被释放');
    assert.equal(ws.closed, true);
  });

  test('每帧都重置空闲计时（持续说话不会被回收）', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { manager } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'i2');

    // 连续 3 个空闲窗口，每个窗口末尾喂一帧
    for (let i = 0; i < 3; i += 1) {
      t.mock.timers.tick(cfg.SESSION_IDLE_MS - 1000);
      ws.audio();
      assert.equal(manager.activeCount(), 1, `第 ${i + 1} 次不应被回收`);
    }
    manager.release(manager._sessions.get('i2'));
  });

  test('总时长上限：发 max_duration、定稿并释放', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { manager } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'm1');

    // 每 20s 喂一帧，避免先命中 30s 空闲回收
    const step = 20_000;
    let elapsed = 0;
    while (elapsed + step <= cfg.MAX_RECORDING_MS) {
      t.mock.timers.tick(step);
      elapsed += step;
      if (elapsed < cfg.MAX_RECORDING_MS) ws.audio(160);
    }

    const err = ws.sent.find((m) => m.type === 'error');
    assert.equal(err.code, 'max_duration');
    assert.equal(manager.activeCount(), 0, '超时也立刻让出名额');
    await flush();
    assert.ok(ws.sent.some((m) => m.type === 'final'), '超时也应定稿');
    assert.equal(manager.activeCount(), 0);
  });
});

// ==================== 句级精修 ====================

/**
 * 每次精修都挂起，由用例手动 resolve：用来验证背压 / 中止 / 降级。
 */
function deferredTranscribe(finalText = '整段。') {
  const waiters = [];
  const fn = (samples, opts) => {
    if (opts && opts.refine) {
      return new Promise((resolve, reject) => waiters.push({ resolve, reject, opts, samples }));
    }
    return { text: finalText, texts: [finalText] };
  };
  return { fn, waiters };
}

/** 喂一句：8 帧语音(0.8s) + 3 帧静音 —— 刚好够 REFINE_MIN_SAMPLES 又过 SILENCE_FRAMES */
function sendSentence(ws) {
  for (let i = 0; i < 8; i++) ws.speech();
  for (let i = 0; i < 3; i++) ws.audio();
}

describe('句级精修', () => {
  test('RMS 静音切句：先发 sentence(draft, refined:null)，精修后同 id 再发一次带 refined', async () => {
    const { manager } = createManager({
      raw: {
        transcribe: (samples, opts) => (opts && opts.refine
          ? { text: '精修结果。', texts: ['精修结果。'] }
          : { text: '整段。', texts: ['整段。'] }),
      },
    });
    const ws = makeWs();
    manager.attach(ws, 'r1');
    ws.control({ type: 'start' });

    sendSentence(ws);
    await flush();

    const sentences = ws.sent.filter((m) => m.type === 'sentence');
    assert.equal(sentences.length, 2, '切句一帧 + 精修回填一帧');
    assert.equal(typeof sentences[0].id, 'number');
    assert.equal(sentences[0].refined, null);
    assert.equal(sentences[1].id, sentences[0].id, '同一 id 发两次');
    assert.equal(sentences[1].refined, '精修结果。');

    manager.release(manager._sessions.get('r1'));
  });

  test('句长不足 0.6s：只发 sentence 草稿帧，不发起精修', async () => {
    let refineCalls = 0;
    const { manager } = createManager({
      raw: {
        transcribe: (samples, opts) => {
          if (opts && opts.refine) refineCalls += 1;
          return { text: 'x', texts: ['x'] };
        },
      },
    });
    const ws = makeWs();
    manager.attach(ws, 'r2');
    ws.control({ type: 'start' });

    for (let i = 0; i < 3; i++) ws.speech(); // 0.3s
    for (let i = 0; i < 3; i++) ws.audio();
    await flush();

    assert.equal(refineCalls, 0, '0.3s 太短，不送精修');
    const sentences = ws.sent.filter((m) => m.type === 'sentence');
    assert.equal(sentences.length, 1, '但草稿句照样要发');
    assert.equal(sentences[0].refined, null);

    manager.release(manager._sessions.get('r2'));
  });

  test('全静音不产生空句', async () => {
    const { manager } = createManager();
    const ws = makeWs();
    manager.attach(ws, 'r3');
    ws.control({ type: 'start' });
    for (let i = 0; i < 6; i++) ws.audio();
    await flush();
    assert.equal(ws.sent.filter((m) => m.type === 'sentence').length, 0);
    manager.release(manager._sessions.get('r3'));
  });

  test('pacing=instant 不逐句精修', async () => {
    let refineCalls = 0;
    const { manager } = createManager({
      raw: {
        getPacing: () => 'instant',
        transcribe: (samples, opts) => {
          if (opts && opts.refine) refineCalls += 1;
          return { text: 'x', texts: ['x'] };
        },
      },
    });
    const ws = makeWs();
    manager.attach(ws, 'r4');
    ws.control({ type: 'start' });
    sendSentence(ws);
    await flush();
    assert.equal(refineCalls, 0);
    assert.equal(ws.sent.find((m) => m.type === 'ready').refine, false);
    manager.release(manager._sessions.get('r4'));
  });

  test('stop 中止排队精修：pending 里返回了也不发 sentence，final 照常带 texts', async () => {
    const { fn, waiters } = deferredTranscribe('整段。');
    const { manager } = createManager({ raw: { transcribe: fn } });
    const ws = makeWs();
    manager.attach(ws, 'r5');
    ws.control({ type: 'start' });
    sendSentence(ws);
    await flush();

    const session = manager._sessions.get('r5');
    assert.equal(waiters.length, 1, '精修已入队');
    ws.control({ type: 'stop' });
    await flush();

    const final = ws.sent.find((m) => m.type === 'final');
    assert.ok(final, '必须有 final');
    assert.equal(final.text, '整段。');
    assert.deepEqual(final.texts, ['整段。']);
    assert.equal(final.segments, 1);

    // 排队中的精修回来：会话已停，不得再补发 sentence
    waiters[0].resolve({ text: '迟到的精修。', texts: ['迟到的精修。'] });
    await flush();
    const sentences = ws.sent.filter((m) => m.type === 'sentence');
    assert.equal(sentences.length, 1, '只有切句那一帧');
    assert.equal(session.refineAborted, true);
  });

  test('背压：待精修超过 3 个时丢弃最旧未开始的，保住最新的', async () => {
    const { fn, waiters } = deferredTranscribe();
    const { manager } = createManager({ raw: { transcribe: fn } });
    const ws = makeWs();
    manager.attach(ws, 'r6');
    ws.control({ type: 'start' });

    for (let s = 0; s < 4; s++) sendSentence(ws);
    await flush();

    assert.equal(waiters.length, 4);
    assert.equal(waiters[0].opts.shouldSkip(), true, '最旧的被标成跳过');
    assert.equal(waiters[1].opts.shouldSkip(), false);
    assert.equal(waiters[3].opts.shouldSkip(), false, '最新的必须保留');

    for (const w of waiters) w.resolve({ text: 'x', texts: ['x'] });
    await flush();
    manager.release(manager._sessions.get('r6'));
  });

  test('连续 3 次精修比句长还慢：发 refine 降级帧且只发一次', async () => {
    let clock = 0;
    const { fn, waiters } = deferredTranscribe();
    const { manager } = createManager({ clock: () => clock, raw: { transcribe: fn } });
    const ws = makeWs();
    manager.attach(ws, 'r7');
    ws.control({ type: 'start' });

    for (let s = 0; s < 3; s++) sendSentence(ws);
    await flush();
    assert.equal(waiters.length, 3);

    clock = 120_000; // 每句 0.8s，实际耗时远超 1.5 倍
    for (const w of waiters) w.resolve({ text: 'x', texts: ['x'] });
    await flush();

    const refineFrames = ws.sent.filter((m) => m.type === 'refine');
    assert.equal(refineFrames.length, 1, '降级只通知一次');
    assert.equal(refineFrames[0].enabled, false);
    assert.equal(refineFrames[0].reason, 'too_slow');

    manager.release(manager._sessions.get('r7'));
  });
});
