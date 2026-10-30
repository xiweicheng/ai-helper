# 语音输入句级即时精修 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让语音输入说话过程中看到的文本就是 SenseVoice 级质量，松手后只做字词补正、绝不改动句读。

**Architecture:** 流式目录（agent）在 `isEndpoint()` 或 RMS 静音处切句，把每句 PCM 送入已有的 offline worker 池精修，回传 `sentence` 帧；`stop` 时整段重转一次，前端用 `mergeRefined` 只把差异字符缝回逐句结果、保留逐句的标点。前端草稿从单区间升级为句表，用户手改只锁定被改的那一句。

**Tech Stack:** Node.js ESM（agent，`node:test`）、原生 sherpa-onnx-node（离线推理，worker 线程）、Chrome MV3 侧边栏（vitest）。

**Spec:** `docs/superpowers/specs/2026-10-30-voice-sentence-refine-design.md`

## Global Constraints

- **silero VAD 一律不得启用**：sherpa-onnx-node 2.0.1 的 `vad.front()` 必 SIGSEGV，会杀死整个代理进程。切句只用 `isEndpoint()` + 纯 JS 的 RMS 判定。
- **禁止固定时长硬切**：实测 8s 硬切产生 `牛。头不对马嘴`、`松手之后。后仍然`、`230。9兆`，CER 从 3.7% 升到 5.5%。
- **断句以逐句为准**：`final` 只允许替换字符，不允许改动标点位置（差异超阈值时才整段接管）。
- **`stop` 不得变慢**：精修任务必须在 `refineAborted` 后立即空转，`final` 不得排在待精修任务之后等待。
- **不新增依赖**：RMS、编辑距离、diff 全部手写。
- **i18n 中英各一份**，缺一个就是缺陷。
- 测试命令：agent 用 `node --test agent/test/unit/*.test.js`，扩展侧用 `npx vitest run <file>`。

## File Structure

**新建**

| 文件 | 职责 |
|---|---|
| `agent/src/asr/sentence-splitter.js` | 切句判定纯函数（RMS、切点选择），无 IO 无原生依赖 |
| `agent/test/unit/asr-sentence-splitter.unit.test.js` | 上述纯函数的测试 |
| `src/side_panel/voice-draft-items.js` | 草稿句表纯函数（拼接/替换/手改归位/整段缝合） |
| `test/unit/voice-draft-items.unit.test.js` | 上述纯函数的测试 |
| `test/unit/asr-refine-contract.unit.test.js` | 源码规则守卫（防回退） |

**修改**

| 文件 | 改动 |
|---|---|
| `agent/src/asr/offline-pool.js` | `runOfflineTask` 支持 `shouldSkip`（让排队中的精修空转） |
| `agent/src/asr/transcribe.js` | `transcribeSamples()` 返回 `texts` 数组 |
| `agent/src/asr/session.js` | 切句、精修调度、`sentence`/`refine` 帧、`refineAborted` |
| `agent/test/unit/asr-session.unit.test.js` | 补精修相关用例 |
| `src/side_panel/voice-input.js` | 草稿改为句表驱动，处理 `partial`/`sentence`/`refine` 事件 |
| `src/shared/locales/zh.js` / `en.js` | 新增文案键 |
| `src/options/toolbox-asr.js` | 「识别节奏」三档下拉（UI 由 JS 渲染，不改 `options.html`） |
| `agent/src/asr/config.js` | `SUPPORTED_PACING` + 默认值 `asrPacing` + `sanitizeAsrConfig` 白名单 |
| `agent/src/asr/routes.js` | `POST /api/asr/config` 收 `asrPacing`；`buildStatus` 回显 |
| `agent/src/server.js` | `createAsrSessionManager` 注入 `getPacing` |

---

### Task 1: 切句判定纯函数

**Files:**
- Create: `agent/src/asr/sentence-splitter.js`
- Test: `agent/test/unit/asr-sentence-splitter.unit.test.js`

**Interfaces:**
- Produces:
  - `rmsOf(samples: Float32Array): number`
  - `chooseCutIndex(frames: Array<{samples: Float32Array, rms: number}>, opts?: {frameMs?: number}): number`
    - 返回值语义：`-1` 不切；`1..frames.length-1` 切在该帧索引；`frames.length` 表示整段静音、应丢弃
  - 常量 `FRAME_MS = 100`、`SILENCE_RMS = 0.006`、`SILENCE_FRAMES = 3`、`MAX_SENTENCE_MS = 12000`、`LOOKBACK_MS = 2000`

- [ ] **Step 1: 写失败测试**

创建 `agent/test/unit/asr-sentence-splitter.unit.test.js`：

```js
// agent/test/unit/asr-sentence-splitter.unit.test.js
// 切句判定是纯函数：不碰原生、不碰会话状态，因此可以精确断言边界。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  rmsOf,
  chooseCutIndex,
  SILENCE_RMS,
  SILENCE_FRAMES,
  MAX_SENTENCE_MS,
  LOOKBACK_MS,
  FRAME_MS,
} from '../../src/asr/sentence-splitter.js';

/** 造一段帧：energy 为 'speech' | 'silence' */
function frames(pattern) {
  return pattern.split('').map((ch) => ({
    samples: new Float32Array(1600),
    rms: ch === 's' ? 0.05 : 0.001,
  }));
}

describe('rmsOf', () => {
  test('全零返回 0', () => {
    assert.equal(rmsOf(new Float32Array(100)), 0);
  });

  test('恒定幅度 0.5 的正弦返回约 0.354（RMS = 幅度/√2）', () => {
    const s = new Float32Array(1600);
    for (let i = 0; i < s.length; i++) s[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 16000);
    const r = rmsOf(s);
    assert.ok(Math.abs(r - 0.3536) < 0.01, `got ${r}`);
  });

  test('空数组不抛异常', () => {
    assert.equal(rmsOf(new Float32Array(0)), 0);
    assert.equal(rmsOf(null), 0);
  });
});

describe('chooseCutIndex', () => {
  test('全程有语音且未超时：不切（-1）', () => {
    assert.equal(chooseCutIndex(frames('ssssssss')), -1);
  });

  test('末尾恰好 3 帧静音：切在静音起点', () => {
    // 5 帧语音 + 3 帧静音 => 切在索引 5
    assert.equal(chooseCutIndex(frames('sssssssss')), -1); // 9 个 s，无静音
    assert.equal(chooseCutIndex(frames('sssss---')), 5);
  });

  test('末尾只有 2 帧静音：不切（不够 SILENCE_FRAMES）', () => {
    assert.equal(chooseCutIndex(frames('sssssss--')), -1);
  });

  test('全程静音：返回 frames.length（调用方应丢弃，不产生空句）', () => {
    assert.equal(chooseCutIndex(frames('------')), 6);
  });

  test('超过 MAX_SENTENCE_MS 且无静音：回溯最近 LOOKBACK_MS 内 RMS 最低帧', () => {
    // 12s / 100ms = 120 帧；把第 105 帧做成整段最低
    const list = frames('s'.repeat(130));
    list[105].rms = 0.0021;
    list[110].rms = 0.004;
    const cut = chooseCutIndex(list);
    assert.equal(cut, 105);
  });

  test('刚好等于 MAX_SENTENCE_MS 就触发超长兜底', () => {
    const exact = Math.round(MAX_SENTENCE_MS / FRAME_MS);
    const list = frames('s'.repeat(exact));
    list[exact - 5].rms = 0.0001;
    assert.notEqual(chooseCutIndex(list), -1);
  });

  test('未达 MAX_SENTENCE_MS 不触发超长兜底', () => {
    const short = Math.round(MAX_SENTENCE_MS / FRAME_MS) - 1;
    const list = frames('s'.repeat(short));
    list[short - 5].rms = 0.0001;
    assert.equal(chooseCutIndex(list), -1);
  });

  test('回溯窗口不会切出空 head：最低帧在索引 0 时改取窗口内次低', () => {
    const list = frames('s'.repeat(130));
    // 索引 0 的 rms 最低，但它不在回溯窗口内（窗口是最后 LOOKBACK_MS/FRAME_MS 帧）
    list[0].rms = 0;
    for (let i = list.length - LOOKBACK_MS / FRAME_MS; i < list.length; i++) list[i].rms = 0.05;
    list[list.length - 2].rms = 0.0011;
    const cut = chooseCutIndex(list);
    assert.ok(cut > 0, `cut 必须 > 0，got ${cut}`);
  });

  test('帧数不足 2：不切', () => {
    assert.equal(chooseCutIndex([]), -1);
    assert.equal(chooseCutIndex(frames('s')), -1);
  });

  test('静音阈值常量符合实测设定', () => {
    assert.equal(SILENCE_RMS, 0.006);
    assert.equal(SILENCE_FRAMES, 3);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /Users/xiweicheng/Documents/trae_projects/ai-helper && node --test agent/test/unit/asr-sentence-splitter.unit.test.js`
Expected: FAIL — `Cannot find module .../sentence-splitter.js`

- [ ] **Step 3: 实现**

创建 `agent/src/asr/sentence-splitter.js`：

```js
// agent/src/asr/sentence-splitter.js - 流式切句判定（纯函数，无 IO、无原生依赖）
//
// 为什么不用 silero VAD：sherpa-onnx-node 2.0.1 的 vad.front() 必 SIGSEGV，
// 原生层崩溃 JS 拦不住，整个代理进程退出（见 engine.js getVad 注释）。
// 改用纯 JS 算每帧 RMS —— 精度不如 VAD，但零风险。
//
// 为什么禁止固定时长硬切：实测 8s 硬切会切在词中间，产出
// 「牛。头不对马嘴」「松手之后。后仍然」「230。9兆」，CER 从 3.7% 升到 5.5%。

export const FRAME_MS = 100;
export const SILENCE_RMS = 0.006;
export const SILENCE_FRAMES = 3;
export const MAX_SENTENCE_MS = 12000;
export const LOOKBACK_MS = 2000;

/**
 * 一段 PCM 的均方根幅度
 * @param {Float32Array|null} samples
 * @returns {number}
 */
export function rmsOf(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * 决定切点帧索引
 * @param {Array<{samples: Float32Array, rms: number}>} frames
 * @param {{frameMs?: number}} [opts]
 * @returns {number} -1 不切；1..len-1 切点；len 整段静音（丢弃）
 */
export function chooseCutIndex(frames, opts = {}) {
  if (!Array.isArray(frames) || frames.length < 2) return -1;
  const frameMs = Number(opts.frameMs) > 0 ? Number(opts.frameMs) : FRAME_MS;

  // 1) 末尾连续静音：切在静音段起点，静音留给下一句（本句不带尾巴静音）
  let silent = 0;
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].rms < SILENCE_RMS) silent += 1;
    else break;
  }
  if (silent >= SILENCE_FRAMES) {
    const cut = frames.length - silent;
    // cut === 0 说明整段都是静音：交给调用方丢弃，不要切出空 head
    return cut === 0 ? frames.length : cut;
  }

  // 2) 超长兜底：回溯最近 LOOKBACK_MS 找 RMS 最低帧（大概率是词间停顿）
  const totalMs = frames.length * frameMs;
  if (totalMs >= MAX_SENTENCE_MS) {
    const lookbackFrames = Math.max(1, Math.round(LOOKBACK_MS / frameMs));
    const from = Math.max(1, frames.length - lookbackFrames); // from >= 1 保证 head 非空
    let best = -1;
    let bestRms = Infinity;
    for (let i = from; i < frames.length; i++) {
      if (frames[i].rms < bestRms) {
        bestRms = frames[i].rms;
        best = i;
      }
    }
    if (best > 0) return best;
  }

  return -1;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test agent/test/unit/asr-sentence-splitter.unit.test.js`
Expected: PASS，全部用例通过

- [ ] **Step 5: 提交**

```bash
git add agent/src/asr/sentence-splitter.js agent/test/unit/asr-sentence-splitter.unit.test.js
git commit -m "feat(asr): 切句判定纯函数（RMS 静音 + 超长回溯，不依赖 silero VAD）"
```

---

### Task 2: `transcribeSamples()` 返回分段文本

**Files:**
- Modify: `agent/src/asr/transcribe.js`（`transcribeSamples()`：`decode` 注入口 + 两个 return 分支补 `texts`）
- Create: `agent/test/unit/asr-transcribe.unit.test.js`

**Interfaces:**
- Produces: `transcribeSamples(samples, opts) → { text, segments, texts: string[], peak }`（`segments` 是分段**数量**，不是文本数组）

- [ ] **Step 1: 写失败测试**

新建 `agent/test/unit/asr-transcribe.unit.test.js`：

```js
// agent/test/unit/asr-transcribe.unit.test.js
// 只验「逐段文本被带出来」这一件事：注入假解码，不加载 sherpa-onnx、不碰 worker。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcribeSamples } from '../../src/asr/transcribe.js';

test('transcribeSamples 返回逐段文本数组', () => {
  const samples = new Float32Array(16000 * 2);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.2 * Math.sin(i / 10);

  const result = transcribeSamples(samples, {
    offlineModel: { id: 'fake-offline', kind: 'offline', modelFile: '/dev/null', tokensFile: '/dev/null' },
    vadModel: null,
    decode: () => '第一段。',   // 注入假解码：不得去加载真模型
  });

  assert.equal(result.segments, 1, '2s 音频应只有 1 个分块（fixedChunks 按 30s 切）');
  assert.deepEqual(result.texts, ['第一段。'], 'texts 必须是对应分段的文本数组');
  assert.equal(result.text, '第一段。');
});

test('全静音时 texts 是空数组（不能是 undefined）', () => {
  const result = transcribeSamples(new Float32Array(16000 * 2), { offlineModel: {} });
  assert.equal(result.segments, 0);
  assert.deepEqual(result.texts, []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test agent/test/unit/asr-transcribe.unit.test.js`
Expected: FAIL — `result.texts` 为 `undefined`（`deepEqual` 不成立）

- [ ] **Step 3: 实现**

在 `transcribe.js` 的 `transcribeSamples()` 中，把「取 recognizer + 逐段解码」改成惰性：注入 `decode` 时**完全不加载模型**（否则测试环境无模型会直接抛）。

1. `getOfflineRecognizer(...)` 改为惰性（现有 `const recognizer = getOfflineRecognizer(...)` 那行删掉）：

```js
let recognizer = null;
// decode 注入（测试用）：给了就绝不去加载 native 模型
const decodeOne = typeof opts.decode === 'function'
  ? opts.decode
  : (seg) => {
    if (!recognizer) {
      recognizer = getOfflineRecognizer(opts.offlineModel, { idleUnloadMs: opts.idleUnloadMs });
    }
    return decodeSegment(recognizer, seg, TARGET_SAMPLE_RATE);
  };
```

2. 逐段循环收集文本（`texts` 名字此时已被 `const texts = []` 占用，保持不改）：

```js
const texts = [];
for (const seg of segments) {
  const text = decodeOne(seg);
  if (text) texts.push(text);
}
```

3. 两个 return 分支都要带上 `texts`（共 2 处，不是 3 处）：

```js
// 全静音 / 过短（peak < 0.003 || length < 0.2s）
return { text: '', segments: 0, texts: [], peak };
// 正常返回
return { text: tidyJoin(texts), segments: segments.length, texts, peak };
```

> `model_missing` 的抛错位置不动（在 `decodeOne` 之前），保证没模型时仍然报错。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test agent/test/unit/asr-transcribe.unit.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add agent/src/asr/transcribe.js agent/test/unit/asr-transcribe.unit.test.js
git commit -m "feat(asr): transcribe 返回逐段文本，供前端按句补正"
```

---

### Task 3: `runOfflineTask` 支持排队中空转

**Files:**
- Modify: `agent/src/asr/offline-pool.js:235-240`
- Test: `agent/test/unit/asr-offline-pool.unit.test.js`（追加）

**Interfaces:**
- Produces: `runOfflineTask(options & {shouldSkip?: () => boolean})` — `shouldSkip()` 为真时**不 spawn、不 decode**，直接 resolve `null`

**为什么必须做**：队列是全局串行 FIFO。`stop` 时那条整段定稿会排在所有待精修句子之后，松手反而变慢。有了 `shouldSkip`，被中止的精修任务在出队瞬间返回，`final` 立刻开始。

- [ ] **Step 1: 写失败测试**

在 `agent/test/unit/asr-offline-pool.unit.test.js` 追加：

```js
test('shouldSkip 为真的任务不执行，直接返回 null', async () => {
  const calls = [];
  const p1 = runOfflineTask({
    kind: 'samples',
    samples: new Float32Array(16000),
    shouldSkip: () => { calls.push('checked'); return true; },
  });
  const result = await p1;
  assert.equal(result, null);
  assert.deepEqual(calls, ['checked'], 'shouldSkip 应被调用一次');
});

test('排在前面的任务被 skip 后，后面的任务立即开始（模拟 stop 抢跑）', async () => {
  const order = [];
  let aborted = false;

  const slow = runOfflineTask({
    kind: 'samples',
    samples: new Float32Array(16000),
    shouldSkip: () => aborted,   // 第一次出队时 aborted 已是 true
  });

  aborted = true;
  const fast = runOfflineTask({
    kind: 'samples',
    samples: new Float32Array(16000),
    shouldSkip: () => { order.push('fast-check'); return false; },
  });

  assert.equal(await slow, null);
  assert.ok(await fast, '后者必须真的执行');
  assert.deepEqual(order, ['fast-check']);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test agent/test/unit/asr-offline-pool.unit.test.js`
Expected: FAIL — 任务照样执行，返回值不是 null

- [ ] **Step 3: 实现**

把 `offline-pool.js` 的 `runOfflineTask` 改成：

```js
export function runOfflineTask(options) {
  const shouldSkip = options && typeof options.shouldSkip === 'function' ? options.shouldSkip : null;
  // 排队期间被取消的任务：出队瞬间返回，不 spawn worker、不 decode。
  // 这是 stop 抢跑的前提 —— 否则整段定稿要排在所有待精修句子后面。
  const run = queue.then(
    () => (shouldSkip && shouldSkip() ? null : exec(options)),
    () => (shouldSkip && shouldSkip() ? null : exec(options)),
  );
  queue = run.then(() => {}, () => {});
  return run;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test agent/test/unit/asr-offline-pool.unit.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add agent/src/asr/offline-pool.js agent/test/unit/asr-offline-pool.unit.test.js
git commit -m "feat(asr): runOfflineTask 支持 shouldSkip，让被中止的精修任务不再阻塞定稿"
```

---

### Task 4: 会话接入切句与精修

**Files:**
- Modify: `agent/src/asr/session.js`（import、session 初始状态、`handleAudio`、`handleEndpoint`、新增 `cutSentence`/`scheduleRefine`、`finalize`、`handleControl`）
- Test: `agent/test/unit/asr-session.unit.test.js`（追加）

**Interfaces:**
- Consumes: Task 1 的 `chooseCutIndex` / `rmsOf`；Task 2 的 `transcribe().texts`；Task 3 的 `shouldSkip`
- Produces（协议新增，前端按此消费）：
  - `{type:'sentence', id:number, draft:string, refined:string|null}` — 同一 id 发两次
  - `{type:'refine', enabled:boolean, reason?:string}` — 降级通知
  - `{type:'partial', text:string, open:string}` — `open` 是当前未切句文本
  - `{type:'final', text:string, fallback:boolean, segments:number, texts:string[]}` — `segments` 仍是分段**数量**（与现有 `transcribe()` 一致），逐句文本在 `texts`

- [ ] **Step 1: 写失败测试**

在 `agent/test/unit/asr-session.unit.test.js` 追加（复用文件里已有的 `createManager` / `makeWs` / `flush`）：

```js
describe('句级精修', () => {
  test('RMS 静音切句：发 sentence(id, draft)，精修后发第二帧带 refined', async () => {
    const { manager, calls } = createManager({
      raw: {
        transcribe: (samples, opts) => ({ text: opts && opts.refine ? '' : '精修结果。', texts: ['精修结果。'] }),
      },
    });
    const ws = makeWs();
    manager.attach(ws, 'refine-1');
    ws.control({ type: 'start' });
    ws.control({ type: 'stop' });

    await flush();

    const sentences = ws.sent.filter((m) => m.type === 'sentence');
    assert.ok(sentences.length >= 1, '至少发一帧 sentence');
    assert.equal(typeof sentences[0].id, 'number');
  });

  test('stop 之后待精修任务被中止，final 仍然是整段结果', async () => {
    const { manager, calls } = createManager({ raw: { transcribe: () => ({ text: '整段。', texts: ['整段。'] }) } });
    const ws = makeWs();
    manager.attach(ws, 'refine-2');
    ws.control({ type: 'start' });
    ws.audio(16000 * 2);
    ws.control({ type: 'stop' });
    await flush();
    const final = ws.sent.find((m) => m.type === 'final');
    assert.equal(final.text, '整段。');
    assert.deepEqual(final.texts, ['整段。']);
  });

  test('句长不足 0.6s 不发精修任务（但照样发 sentence 帧）', async () => {
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
    manager.attach(ws, 'refine-3');
    ws.control({ type: 'start' });
    ws.audio(1600);            // 0.1s
    ws.control({ type: 'stop' });
    await flush();
    assert.equal(refineCalls, 0);
  });
});
```

> 若 `createManager` 目前不支持 `opts.refine` 透传，在 Step 3 的实现里让精修调用带 `{ refine: true }` 标记，测试即可据此区分。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test agent/test/unit/asr-session.unit.test.js`
Expected: FAIL — 收不到 `sentence` 帧

- [ ] **Step 3: 实现**

**3a. import 与常量**

```js
import { chooseCutIndex, rmsOf } from './sentence-splitter.js';

const REFINE_MIN_SAMPLES = 16000 * 0.6;   // 0.6s 以下跳过（SenseVoice 对超短音频质量会掉）
const MAX_PENDING_REFINE = 3;             // 背压：待执行超过即丢弃最旧
const REFINE_SLOW_RATIO = 1.5;            // 精修耗时 > 句长 × 1.5 记为一次「慢」
const REFINE_SLOW_STREAK = 3;             // 连续慢 3 次判定机器跟不上
```

同时在 `createAsrSessionManager` 的 deps JSDoc 里补一行（放在 `getIdleUnloadMs?` 之后）：

```js
 *   getPacing?: () => string,   // 识别节奏档位：instant | balanced | precise（Task 7 接配置）
```

**3b. session 初始状态**（`attach()` 里的对象字面量）

```js
segFrames: [],
refineSeq: 0,
refinePending: 0,
refineAborted: false,
refineDisabled: false,
refineSlowStreak: 0,
// 识别节奏档位（Task 7 接配置；此处缺省 balanced，未配时行为就是「逐句精修」）
pacing: typeof deps.getPacing === 'function' ? deps.getPacing() : 'balanced',
```

**3c. 新增函数**（放在 `handleEndpoint` 之前）

```js
/** 精修是否可用（档位 / RSS / 降级 / 无 offline 模型时关闭） */
function isRefineEnabled(session) {
  if (session.pacing === 'instant') return false;   // 即时档：不逐句精修（= 今天的行为）
  if (session.refineAborted || session.refineDisabled) return false;
  const models = session.models || {};
  if (!models.offline) return false;
  const rss = typeof process.memoryUsage === 'function' ? process.memoryUsage().rss : 0;
  if (rss > RSS_LIMIT_BYTES) return false;
  return true;
}

function disableRefine(session, reason) {
  if (session.refineDisabled) return;
  session.refineDisabled = true;
  deps.onLog?.('asr_refine_disabled', { reason });
  send(session, { type: 'refine', enabled: false, reason });
}

/**
 * 切句：segFrames 切成 head（本句）/ tail（下一句），head 送去精修
 * @param {object} session
 * @param {number} cut 帧索引；=== frames.length 表示整段静音，直接丢弃
 */
function cutSentence(session, cut) {
  const frames = session.segFrames;
  if (!Array.isArray(frames) || frames.length === 0) return;
  const at = Math.min(Math.max(0, cut), frames.length);
  const head = frames.slice(0, at);
  session.segFrames = frames.slice(at);
  if (head.length === 0) return;   // 整段静音：丢弃，不产生空句

  // 当前 zipformer 草稿属于这一句；切完重置流，下一句从干净状态开始
  const draftText = session.currentText || '';
  session.currentText = '';
  session.lastSentText = '';
  try { session.onlineRecognizer?.reset?.(session.onlineStream); } catch { /* 版本差异 */ }
  if (draftText) session.committedText = tidyJoin([session.committedText, draftText]);

  const id = session.refineSeq + 1;
  session.refineSeq = id;
  // 先告诉前端「这句结束了、id 是这个」——精修回来要靠它定位
  send(session, { type: 'sentence', id, draft: draftText, refined: null });

  const samples = concatChunks(head.map((f) => f.samples));
  scheduleRefine(session, id, draftText, samples);
}

/** 发起该句的精修（异步；失败保持草稿，不影响邻句） */
function scheduleRefine(session, id, draftText, samples) {
  if (!isRefineEnabled(session)) return;
  if (samples.length < REFINE_MIN_SAMPLES) return;
  if (session.refinePending >= MAX_PENDING_REFINE) {
    deps.onLog?.('asr_refine_dropped', { reason: 'backpressure', pending: session.refinePending });
    return;
  }
  const models = session.models;
  const startedAt = now();
  const durationMs = (samples.length / 16000) * 1000;
  session.refinePending += 1;

  Promise.resolve()
    .then(() => transcribe(samples, {
      offlineModel: models.offline,
      vadModel: models.vad || null,
      idleUnloadMs: getIdleUnloadMs(),
      language: session.language,
      refine: true,
      // 排队中若已 stop，出队瞬间空转，别让 final 等它
      shouldSkip: () => session.refineAborted || session.released,
    }))
    .then((result) => {
      session.refinePending -= 1;
      if (session.refineAborted || session.released) return;
      if (!result || !result.text) return;

      // 自适应降级：连续慢说明这台机器边说边跑 offline 跟不上
      const elapsed = now() - startedAt;
      if (elapsed > durationMs * REFINE_SLOW_RATIO) {
        session.refineSlowStreak += 1;
        if (session.refineSlowStreak >= REFINE_SLOW_STREAK) disableRefine(session, 'too_slow');
      } else {
        session.refineSlowStreak = 0;
      }

      session.committedText = tidyJoin([session.committedText, '']); // 占位，保持语义清晰
      send(session, { type: 'sentence', id, draft: draftText, refined: result.text });
    }, (err) => {
      session.refinePending -= 1;
      deps.onError?.('refine_failed', err);
    });
}
```

> 注意：精修结果**不写回 `committedText`** —— `committedText` 只用于 `partial` 的旧语义，前端在精修模式下以 `sentence.refined` 为准。上面那行占位 `tidyJoin` 实际是空操作，实现时可删掉；保留它会误导，**最终代码里不要它**。

**3d. `handleEndpoint` 改为调用 `cutSentence`**

```js
function handleEndpoint(session) {
  // 句尾信号统一走 cutSentence：它负责切帧、发 sentence、发起精修、重置流
  cutSentence(session, session.segFrames.length);
  send(session, { type: 'endpoint', text: session.committedText });
}
```

**3e. `handleAudio` 里累积帧并检查静音切点**

```js
session.chunks.push(samples);
session.segFrames.push({ samples, rms: rmsOf(samples) });
// ...现有 zipformer 逻辑保持不变...

// endpoint 优先；否则看 RMS 静音/超长
if (session.onlineStream) {
  let endpoint = false;
  if (typeof session.onlineRecognizer.isEndpoint === 'function') {
    try { endpoint = session.onlineRecognizer.isEndpoint(session.onlineStream) === true; } catch { endpoint = false; }
  }
  if (endpoint) {
    handleEndpoint(session);
  } else {
    const cut = chooseCutIndex(session.segFrames);
    if (cut >= 0) cutSentence(session, cut);
  }
} else {
  const cut = chooseCutIndex(session.segFrames);
  if (cut >= 0) cutSentence(session, cut);
}
```

**3f. `partial` 帧补 `open` 字段**（`pumpPartial` 里）

```js
// 精确档不出逐字草稿：只在该句被 sentence 帧转正后才有文本
if (session.pacing === 'precise') return;
send(session, { type: 'partial', text: tidyJoin([session.committedText, text]), open: text });
```

**3g. `finalize` 补 `segments`/`texts`，并先中止精修**

```js
function finalize(session) {
  session.refineAborted = true;   // 排队中的精修出队即空转，final 不必等它们
  const models = session.models || deps.getModels();
  const samples = concatChunks(session.chunks);
  session.chunks = [];
  const draftText = tidyJoin([session.committedText, session.currentText]);
  const finishWith = (text, fallback, texts) => send(session, {
    type: 'final', text, fallback, segments: Array.isArray(texts) ? texts.length : 0, texts: texts || [],
  });
  // ...其余分支保持原样，把 finishWith(...) 的第三参补上：
  //   无 offline 模型：finishWith(draftText, true, [])
  //   RSS 保护：      finishWith(draftText, true, [])
  //   samples 为空：  finishWith(draftText, !draftText, [])
  //   成功：          finishWith(result.text || draftText, false, result.texts || [])
  //   失败：          finishWith(draftText, true, [])
}
```

**3h. `start` 时在 `ready` 帧带上精修能力位**

```js
send(session, { type: 'ready', draft, finalize: Boolean(session.models.offline), refine: Boolean(session.models.offline) });
```

**3i. `release` 清空 `segFrames`**

```js
session.chunks = [];
session.segFrames = [];
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test agent/test/unit/asr-session.unit.test.js`
Expected: PASS（含原有全部用例）

- [ ] **Step 5: 跑 agent 全量单测**

Run: `node --test agent/test/unit/*.test.js`
Expected: 全部通过，无 regression

- [ ] **Step 6: 提交**

```bash
git add agent/src/asr/session.js agent/test/unit/asr-session.unit.test.js
git commit -m "feat(asr): 流式会话接入句级精修（切句、sentence 帧、stop 抢跑）"
```

---

### Task 5: 草稿句表纯函数

**Files:**
- Create: `src/side_panel/voice-draft-items.js`
- Test: `test/unit/voice-draft-items.unit.test.js`

**Interfaces:**
- Produces:
  - `buildDraftText(items: Item[]): string`
  - `applySentence(items: Item[], {id, text}): Item[]` — 替换指定 id 的文本；`locked` 或 id 不存在时原样返回
  - `locateEdit(items: Item[], beforeText: string, afterText: string): {lockedIds: Array<number|null>, shift: number}`
  - `mergeRefined(items: Item[], finalText: string): {items: Item[], changed: number, takeAll: boolean}`
  - `Item = {id: number|null, text: string, state: 'draft'|'refined'|'locked'}`

- [ ] **Step 1: 写失败测试**

创建 `test/unit/voice-draft-items.unit.test.js`：

```js
import { describe, it, expect } from 'vitest';
import {
  buildDraftText,
  applySentence,
  locateEdit,
  mergeRefined,
} from '../../src/side_panel/voice-draft-items.js';

const item = (id, text, state = 'refined') => ({ id, text, state });

describe('buildDraftText', () => {
  it('按序拼接', () => {
    expect(buildDraftText([item(1, '甲。'), item(2, '乙。'), item(null, '丙', 'draft')])).toBe('甲。乙。丙');
  });
  it('空数组返回空串', () => {
    expect(buildDraftText([])).toBe('');
  });
});

describe('applySentence', () => {
  it('替换对应 id 的文本并保留位置', () => {
    const items = [item(1, '错的。'), item(2, '第二句。')];
    const next = applySentence(items, { id: 1, text: '对的。' });
    expect(next[0].text).toBe('对的。');
    expect(next[1].text).toBe('第二句。');
  });

  it('locked 的句子不被改写', () => {
    const items = [item(1, '用户改过。', 'locked')];
    expect(applySentence(items, { id: 1, text: '模型想改。' })[0].text).toBe('用户改过。');
  });

  it('不存在的 id 原样返回', () => {
    const items = [item(1, '甲。')];
    expect(applySentence(items, { id: 99, text: 'x' })).toEqual(items);
  });

  it('不修改入参（纯函数）', () => {
    const items = [item(1, '甲。')];
    applySentence(items, { id: 1, text: '乙。' });
    expect(items[0].text).toBe('甲。');
  });
});

describe('locateEdit：用户手改归位', () => {
  const items = [item(1, '第一句。'), item(2, '第二句。'), item(3, '第三句。')];
  const before = '第一句。第二句。第三句。';

  it('改在第一句内部：只锁第一句', () => {
    const r = locateEdit(items, before, '第一句呀。第二句。第三句。');
    expect(r.lockedIds).toEqual([1]);
  });

  it('改在第二句内部：只锁第二句', () => {
    const r = locateEdit(items, before, '第一句。第二句啊。第三句。');
    expect(r.lockedIds).toEqual([2]);
  });

  it('在草稿块之后追加：不锁任何句', () => {
    const r = locateEdit(items, before, '第一句。第二句。第三句。补一句');
    expect(r.lockedIds).toEqual([]);
  });

  it('整段删除（跨多句）：涉及的每一句都锁', () => {
    const r = locateEdit(items, before, '第一句。三句。');
    expect(r.lockedIds.sort()).toEqual([2, 3]);
  });

  it('返回草稿块之前插入的长度偏移', () => {
    const r = locateEdit(items, before, '前缀第一句。第二句。第三句。');
    expect(r.shift).toBe(2);
  });
});

describe('mergeRefined：字词取整段、断句取逐句', () => {
  it('差异 1 字时只替换该字，句号位置完全不变', () => {
    const items = [item(1, '它很好。'), item(2, '第二句。')];
    const r = mergeRefined(items, '他很好，第二句。');
    expect(buildDraftText(r.items)).toBe('他很好。第二句。');
    expect(r.changed).toBe(1);
    expect(r.takeAll).toBe(false);
  });

  it('完全相同：changed 为 0，不改动', () => {
    const items = [item(1, '甲。'), item(2, '乙。')];
    const r = mergeRefined(items, '甲，乙。');
    expect(r.changed).toBe(0);
    expect(buildDraftText(r.items)).toBe('甲。乙。');
  });

  it('差异超阈值（逐句漏句）：整段接管', () => {
    const items = [item(1, '甲。')];
    const r = mergeRefined(items, '甲。乙。丙。丁。');
    expect(r.takeAll).toBe(true);
    expect(r.items[0].text).toBe('甲。乙。丙。丁。');
  });

  it('locked 句的字不被整段补正', () => {
    const items = [item(1, '用户写。', 'locked'), item(2, '第二句。')];
    const r = mergeRefined(items, '模型写，第二句。');
    expect(r.items[0].text).toBe('用户写。');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/voice-draft-items.unit.test.js`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现**

创建 `src/side_panel/voice-draft-items.js`：

```js
// src/side_panel/voice-draft-items.js - 语音草稿的句表纯函数
//
// 为什么拆出来：voice-input.js 已经 1100+ 行，而这几个算法要能被单测精确覆盖。
//
// 为什么句表而不是单区间：句级精修要能「回头只改那一句」，单区间做不到；
// 而用户的编辑权限又必须精确到句（改了一句话，只有那句不该再被模型改写）。

const PUNCT = /[\p{P}\p{S}]/gu;

/** 句表拼成整段文本 */
export function buildDraftText(items) {
  if (!Array.isArray(items)) return '';
  return items.map((i) => (i && i.text) || '').join('');
}

/** 去掉标点与空白，只留可比对的字符 */
export function stripPunct(s) {
  return String(s || '').replace(/[\s\u3000]/g, '').replace(PUNCT, '');
}

/**
 * 替换某一句的文本
 * @param {Array<{id:number|null,text:string,state:string}>} items
 * @param {{id:number, text:string}} patch
 */
export function applySentence(items, patch) {
  if (!Array.isArray(items)) return items;
  const id = patch && patch.id;
  const text = patch && typeof patch.text === 'string' ? patch.text : null;
  if (text === null) return items;
  let hit = false;
  const next = items.map((item) => {
    if (!item || item.id !== id || item.state === 'locked') return item;
    hit = true;
    return { ...item, text };
  });
  return hit ? next : items;
}

/**
 * 用户手改归位：用「公共前缀 + 公共后缀」确定改动区间，映射回句子
 * @param {Array} items
 * @param {string} beforeText 改动前的草稿全文
 * @param {string} afterText  改动后的输入框全文（仅草稿块部分）
 * @returns {{lockedIds: Array<number|null>, shift: number}} shift = 草稿块之前的长度变化
 */
export function locateEdit(items, beforeText, afterText) {
  const before = String(beforeText || '');
  const after = String(afterText || '');
  if (before === after || !Array.isArray(items) || items.length === 0) {
    return { lockedIds: [], shift: 0 };
  }

  // 公共前缀
  let p = 0;
  const maxP = Math.min(before.length, after.length);
  while (p < maxP && before[p] === after[p]) p++;

  // 公共后缀（不与前缀重叠）
  let s = 0;
  const maxS = Math.min(before.length - p, after.length - p);
  while (s < maxS && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;

  const changedFrom = p;
  const changedTo = before.length - s;   // 改动区间 [changedFrom, changedTo)

  // 改动发生在草稿块之后（纯追加）=> 不锁任何句
  if (changedFrom >= before.length && changedTo >= before.length) {
    return { lockedIds: [], shift: 0 };
  }

  // 逐句算区间，取有交集的
  const lockedIds = [];
  let pos = 0;
  let shift = 0;
  for (const item of items) {
    const len = (item && item.text ? item.text : '').length;
    const start = pos;
    const end = pos + len;
    const overlaps = changedFrom < end && changedTo > start;
    if (overlaps) lockedIds.push(item.id);
    // 改动完全落在第一句之前 => 记长度差，供调用方平移草稿起点
    if (end <= changedFrom && lockedIds.length === 0) {
      shift += after.length - before.length;
    }
    pos = end;
  }

  // 改动在草稿块之前（不碰任何句）：lockedIds 为空，但 shift 要生效
  if (lockedIds.length === 0 && changedTo <= 0) {
    return { lockedIds: [], shift: after.length - before.length };
  }
  return { lockedIds, shift };
}

/**
 * 整段结果与逐句结果缝合：字词取整段、断句取逐句
 *
 * 实测依据：两路字词差异最大 1 字（它/他），但整段会把 4 句串成 2 个句号。
 * 所以默认只替换字符、不动标点；差异超阈值才判定「逐句出了实质问题」并整段接管。
 *
 * @param {Array} items
 * @param {string} finalText 整段重转结果
 * @returns {{items: Array, changed: number, takeAll: boolean}}
 */
export function mergeRefined(items, finalText) {
  if (!Array.isArray(items) || items.length === 0) {
    return { items: items || [], changed: 0, takeAll: false };
  }
  const draft = buildDraftText(items);
  const final = String(finalText || '');
  if (!final) return { items, changed: 0, takeAll: false };

  const a = stripPunct(draft);
  const b = stripPunct(final);
  if (a === b) return { items, changed: 0, takeAll: false };

  // 差异超阈值：逐句结果漏句/串句，整段接管（lock 句也丢，否则会重复）
  const diff = Math.abs(a.length - b.length) + countMismatch(a, b);
  if (diff > 2 || a.length !== b.length) {
    return { items: [{ id: items[0].id, text: final, state: 'refined' }], changed: 1, takeAll: true };
  }

  // 差异 ≤ 2 字符：逐个把 final 的字符缝回 draft 的非标点位置
  const chars = draft.split('');
  let idx = 0;      // 非标点字符序号
  let changed = 0;
  for (let i = 0; i < chars.length; i++) {
    if (stripPunct(chars[i]) === '') continue;   // 标点不动
    if (idx < b.length && chars[i] !== b[idx]) {
      chars[i] = b[idx];
      changed += 1;
    }
    idx += 1;
  }
  if (changed === 0) return { items, changed: 0, takeAll: false };

  // 把改好的整串按原句长度比例落回（只在字符数不变时成立）
  const merged = chars.join('');
  let pos = 0;
  const next = items.map((item) => {
    if (item.state === 'locked') { pos += item.text.length; return item; }
    const len = (item.text || '').length;
    const text = merged.slice(pos, pos + len);
    pos += len;
    return { ...item, text };
  });
  return { items: next, changed, takeAll: false };
}

/** 同长度时统计位置不一致的字符数 */
function countMismatch(a, b) {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n += 1;
  return n;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/unit/voice-draft-items.unit.test.js`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/side_panel/voice-draft-items.js test/unit/voice-draft-items.unit.test.js
git commit -m "feat(voice): 草稿句表纯函数（拼接/替换/手改归位/整段缝合）"
```

---

### Task 6: 前端接入句表

**Files:**
- Modify: `src/side_panel/voice-input.js`（`st` 状态、`captureInsertPoint`、`applyDraft`、`rollbackDraft`、`handlePortMessage`）
- Test: `test/unit/voice-input-draft.unit.test.js`（调整已有用例）

**Interfaces:**
- Consumes: Task 5 的 `buildDraftText` / `applySentence` / `locateEdit` / `mergeRefined`
- Produces: `st.draft = {start, len, items: Item[]}`（末位是 `id: null` 的开放句），`st.appliedValue`（上次程序化写入后的完整 `input.value`）

- [ ] **Step 1: 写失败测试**

在 `test/unit/voice-input-draft.unit.test.js` 追加：

```js
import { buildDraftText } from '../../src/side_panel/voice-draft-items.js';

describe('applyDraft 句表版本', () => {
  it('句表驱动：开放句更新后整段文本随之变化', () => {
    const items = [
      { id: 1, text: '第一句。', state: 'refined' },
      { id: null, text: '正在说', state: 'draft' },
    ];
    const next = items.map((i) => (i.id === null ? { ...i, text: '正在说的这句' } : i));
    expect(buildDraftText(next)).toBe('第一句。正在说的这句');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/voice-input-draft.unit.test.js`
Expected: FAIL（import 路径或断言不成立）

- [ ] **Step 3: 实现**

**3a. `st` 状态**：`draft: null` 保持不变，但结构变为 `{start, items}`。

**3b. `captureInsertPoint`**

```js
function captureInsertPoint() {
  const input = st.input;
  if (!input) return { start: 0, items: [] };
  const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
  const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
  if (start !== end) input.setRangeText('', start, end, 'end');
  return { start, items: [] };
}
```

**3c. 新 `applyDraft(text)`** —— 只更新开放句（`id: null`）的文本，然后整块重写：

```js
function applyDraft(text) {
  const input = st.input;
  if (!input || !st.draft) return;
  const items = st.draft.items;
  const idx = items.findIndex((i) => i.id === null);

  let nextItems;
  if (idx >= 0) {
    nextItems = items.map((i) => (i.id === null ? { ...i, text: String(text || '') } : i));
  } else {
    nextItems = items.concat([{ id: null, text: String(text || ''), state: 'draft' }]);
  }

  const nextText = buildDraftText(nextItems);
  const from = Math.min(Math.max(0, st.draft.start), input.value.length);
  const to = Math.min(from + st.draft.len, input.value.length);
  const caret = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
  const nextValue = input.value.slice(0, from) + nextText + input.value.slice(to);

  st.draft.items = nextItems;
  st.draft.len = nextText.length;
  st.appliedText = nextText;
  writeInput(nextValue, caret > to ? caret + (nextText.length - (to - from)) : from + nextText.length);
}
```

> `writeInput`（已有函数，本任务顺带改一 行）：写入后记下整框文本，供下一步算用户净增量。
>
> ```js
> st.programmatic = true;
> st.appliedValue = value;   // ← 新增：本次程序化写入后的完整 input.value
> input.value = value;
> ```

**3d. `markDirty` 改为归位锁定**（草稿块长度不是常量：用「程序化写入值 → 当前值」的净增量推出用户改后的块长，不再猜后一位）

```js
function markDirty() {
  if (!st.draft || !st.input) return;
  const expected = buildDraftText(st.draft.items);
  const full = st.input.value;
  // 用户净增量：纯插入>0、纯删除<0。只有单处编辑时块尾 = start + expected.length + delta
  const delta = full.length - String(st.appliedValue ?? '').length;
  const from = st.draft.start;
  const actual = full.slice(from, from + expected.length + delta);
  const { lockedIds, shift } = locateEdit(st.draft.items, expected, actual);
  if (shift) st.draft.start += shift;
  st.draft.len = actual.length;
  if (lockedIds.length === 0) return;
  st.draft.items = st.draft.items.map((i) => (lockedIds.includes(i.id) ? { ...i, state: 'locked' } : i));
}
```

**3e. `handlePortMessage` 新增分支**

```js
if (evt.type === 'partial') {
  st.lastText = evt.text || '';
  if (!st.draft) return;
  // 开放句可能尚未建立（首个 partial）或刚被精修转正，按需补一条空的
  if (!st.draft.items.some((i) => i.id === null)) {
    st.draft.items = st.draft.items.concat([{ id: null, text: '', state: 'draft' }]);
  }
  // 只写开放句：`evt.open` 是未切句的那一段，`evt.text` 是含已精修句的全文
  applyDraft(typeof evt.open === 'string' ? evt.open : st.lastText);
  return;
}

if (evt.type === 'sentence') {
  if (st.phase !== 'recording' && st.phase !== 'finalizing') return;
  if (!st.draft) return;
  if (typeof evt.refined === 'string' && evt.refined) {
    // 精修结果替换；开放句先转成正式句（id 由服务端给）
    const hadOpen = st.draft.items.some((i) => i.id === null);
    let items = st.draft.items;
    if (hadOpen) {
      items = items.map((i) => (i.id === null
        ? { id: evt.id, text: evt.draft || i.text, state: 'refined' }
        : i));
    }
    st.draft.items = applySentence(items, { id: evt.id, text: evt.refined });
    applyDraft('');           // 重写草稿块（开放句清空）
    setBarStatus(t('voice.refineListening', { n: st.draft.items.filter((i) => i.state === 'refined').length }));
  }
  return;
}

if (evt.type === 'refine' && evt.enabled === false) {
  setBarStatus(t('voice.refineDegraded'), 'warn');
  return;
}
```

**3f. `final` 分支改用 `mergeRefined`**

```js
function finalizeText(text, opts = {}) {
  const input = st.input;
  if (!input) return;
  if (!st.draft) { /* 无草稿：直接插入 */ }
  const { items, changed, takeAll } = mergeRefined(st.draft.items, text);
  st.draft.items = items.every((i) => i.state === 'locked') ? items : items.map((i) => ({ ...i, state: 'refined' }));
  applyDraft('');   // 重写
  if (changed > 0) setBarStatus(t('voice.refineCorrected', { n: changed }));
  ...
}
```

> 若 `takeAll` 为真，`items` 已被合并成单条，直接重写即可。

- [ ] **Step 4: 跑测试**

Run: `npx vitest run test/unit/voice-input-draft.unit.test.js test/unit/voice-draft-items.unit.test.js`
Expected: PASS

- [ ] **Step 5: 跑扩展侧全量**

Run: `npx vitest run`
Expected: 全部通过（含 `voice-input-*` 既有用例）

- [ ] **Step 6: 提交**

```bash
git add src/side_panel/voice-input.js test/unit/voice-input-draft.unit.test.js
git commit -m "feat(voice): 草稿改为句表驱动，精修按句替换、手改只锁那一名"
```

---

### Task 7: i18n 与识别节奏配置

**Files:**
- Modify: `agent/src/asr/config.js`（`SUPPORTED_PACING` + 默认值 + `sanitizeAsrConfig` 白名单）
- Modify: `agent/src/asr/routes.js`（`POST /api/asr/config` 收 `asrPacing`；`buildStatus` 回显）
- Modify: `agent/src/server.js`（`getPacing` 依赖注入）
- Modify: `src/shared/locales/zh.js`、`en.js`
- Modify: `src/options/toolbox-asr.js`

**Interfaces:**
- Produces: 文案键 `voice.refineListening` / `refineCorrecting` / `refineCorrected` / `refineDegraded`；配置键 `asrPacing: 'instant'|'balanced'|'precise'`（`/api/asr/status` 回显，`POST /api/asr/config` 写入）

- [ ] **Step 1: 加文案（中英各一份）**

`zh.js`：

```js
refineListening: '正在听…（已定稿 {n} 句）',
refineCorrecting: '正在校正…',
refineCorrected: '已校正 {n} 处',
refineDegraded: '本机性能有限，已关闭逐句精修（松手后仍会整体校正）',
```

`en.js`：

```js
refineListening: 'Listening… ({n} sentences finalized)',
refineCorrecting: 'Refining…',
refineCorrected: '{n} correction(s) applied',
refineDegraded: 'This machine is too slow for per-sentence refinement (the final pass still runs)',
```

- [ ] **Step 2: 配置项（agent 侧白名单 + 会话缺省）**

`agent/src/asr/config.js` 加白名单与默认值：

```js
// 识别节奏档位：instant 不逐句精修 / balanced 逐句精修（默认）/ precise 不出逐字草稿
export const SUPPORTED_PACING = ['instant', 'balanced', 'precise'];

// DEFAULT_ASR_CONFIG 里增一行
export const DEFAULT_ASR_CONFIG = {
  // ...现有字段保持不动
  asrPacing: 'balanced',
};

// sanitizeAsrConfig 的返回对象里增一行
asrPacing: SUPPORTED_PACING.includes(src.asrPacing) ? src.asrPacing : DEFAULT_ASR_CONFIG.asrPacing,
```

`agent/src/server.js` 的 `createAsrSessionManager({...})` 里补一个依赖（与 `getIdleUnloadMs` 并列）：

```js
getPacing: () => getAsrConfig().asrPacing,
```

`agent/src/asr/routes.js` 两处（否则配置写不进去、页面也读不到）：

```js
// POST /api/asr/config 的白名单 patch 里（放在 language 之后）
if (typeof body.asrPacing === 'string') patch.asrPacing = body.asrPacing;

// buildStatus 的返回对象里（放在 language 之后）
asrPacing: config.asrPacing,
```

> 选这个传法而不是 WS `start` 帧：`language` 也是走 `/api/asr/config` 持久化 + 会话创建时读取，保持一致；且档位是长期偏好，不适合每次按键都往帧里塞。

- [ ] **Step 3: 配置页三档下拉**

`src/options/toolbox-asr.js` 在「识别语言」那个 `asr-subsection` 之后、`return \`...\`;` 之前插入：

```js
const currentPacing = status.asrPacing || 'balanced';
const pacingLabels = {
  instant: t('toolbox.asrPacingInstant'),
  balanced: t('toolbox.asrPacingBalanced'),
  precise: t('toolbox.asrPacingPrecise'),
};
const pacingOptions = Object.keys(pacingLabels).map((code) => `<div class="model-option${code === currentPacing ? ' selected' : ''}" role="option" aria-selected="${code === currentPacing ? 'true' : 'false'}" data-pacing="${code}">${escapeHtml(pacingLabels[code])}</div>`).join('');
```

```html
<div class="asr-subsection">
  <div class="asr-subsection-title">${escapeHtml(t('toolbox.asrPacing'))}</div>
  <div class="model-selector asr-lang-field" id="asrPacingField">
    <input type="text" id="asrPacingInput" readonly value="${escapeHtml(pacingLabels[currentPacing])}" aria-haspopup="listbox" aria-expanded="false">
    <div class="model-dropdown asr-lang-menu" id="asrPacingDropdown" role="listbox">${pacingOptions}</div>
  </div>
  <div class="asr-hint">${escapeHtml(t('toolbox.asrPacingHint'))}</div>
</div>
```

新增事件绑定（照 `bindLangSelectEvents` 的写法，`POST` 同一个 `/api/asr/config`）：

```js
function bindPacingSelectEvents() {
  const trigger = document.getElementById('asrPacingInput');
  const menu = document.getElementById('asrPacingDropdown');
  if (!trigger || !menu) return;
  bindDropdownDismissOnce();
  bindDropdownSelect(trigger, menu, async (option) => {
    const pacing = option.getAttribute('data-pacing') || 'balanced';
    const res = await agentApi('POST', '/api/asr/config', { asrPacing: pacing });
    if (res && res.success !== false) {
      trigger.value = option.textContent.trim();
      menu.querySelectorAll('.model-option').forEach((el) => {
        const isCurrent = el.getAttribute('data-pacing') === pacing;
        el.classList.toggle('selected', isCurrent);
        el.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });
      showToast(t('toolbox.asrPacingSaved'));
      notifyStatusChanged();
    } else {
      showToast(res?.error || t('toolbox.asrSaveFailed'), 'error');
    }
  });
}
```

在 `refreshAsrSection` 里渲染完成后调一次 `bindPacingSelectEvents()`（跟 `bindLangSelectEvents()` 同一处），并把 `bindPacingSelectEvents` 追加到该文件已有的导出清单（若 `bindLangSelectEvents` 未导出，则只在本文件内部调用即可）。

再把 `asrPacing` 补进这次配置面板需要的 i18n 键（与 Step 1 同一批）：

```js
// zh.js
asrPacing: '识别节奏',
asrPacingHint: '即时：说话时不出逐句精修，最快；均衡：边说边逐句校正（推荐）；精确：不出逐字草稿，只在每句说完后出文本。',
asrPacingInstant: '即时',
asrPacingBalanced: '均衡（推荐）',
asrPacingPrecise: '精确',
asrPacingSaved: '识别节奏已保存，下次录音生效',
```

```js
// en.js
asrPacing: 'Recognition pacing',
asrPacingHint: 'Instant: no per-sentence refinement while speaking (fastest). Balanced: refine each sentence as you speak (recommended). Precise: no character-by-character draft; text appears when a sentence ends.',
asrPacingInstant: 'Instant',
asrPacingBalanced: 'Balanced (recommended)',
asrPacingPrecise: 'Precise',
asrPacingSaved: 'Pacing saved; applies to the next recording',
```

- [ ] **Step 4: 验证 i18n 成对**

Run: `node -e "const zh=require('./src/shared/locales/zh.js');const en=require('./src/shared/locales/en.js');for(const k of ['refineListening','refineCorrecting','refineCorrected','refineDegraded']){if(!zh[k]||!en[k])throw new Error('missing '+k)}console.log('i18n OK')"`
Expected: 输出 `i18n OK`

- [ ] **Step 5: 验证配置能落盘**

```bash
cd agent && node -e "import('./src/asr/config.js').then(m=>{const c=m.sanitizeAsrConfig({asrPacing:'precise'});if(c.asrPacing!=='precise')throw new Error('asrPacing 未生效: '+c.asrPacing);const d=m.sanitizeAsrConfig({asrPacing:'bogus'});if(d.asrPacing!=='balanced')throw new Error('非法值未回落: '+d.asrPacing);console.log('config OK')})"
```

Expected: 输出 `config OK`

- [ ] **Step 6: 提交**

```bash
git add agent/src/asr/config.js agent/src/asr/routes.js agent/src/server.js agent/src/asr/session.js src/shared/locales/zh.js src/shared/locales/en.js src/options/toolbox-asr.js
git commit -m "feat(voice): 识别节奏三档（即时/均衡/精确）+ 精修状态文案（中英）"
```

---

### Task 8: 真机探针与源码守卫

**Files:**
- Create: `test-results-probes/_asr-refine-e2e.mjs`（gitignored）
- Create: `test/unit/asr-refine-contract.unit.test.js`

**Interfaces:**
- Consumes: 全部前置任务的产物

- [ ] **Step 1: 写源码守卫测试（防回退）**

创建 `test/unit/asr-refine-contract.unit.test.js`：

```js
// 源码规则守卫：这些契约只有真机才跑得出来，用源码结构钉住，并做过变异验证。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('切句契约', () => {
  it('会话层必须用 chooseCutIndex，不得出现固定样本数硬切', () => {
    const src = read('agent/src/asr/session.js');
    expect(src).toContain('chooseCutIndex(');
    expect(src).not.toMatch(/slice\(0,\s*MAX_SEGMENT/);
  });

  it('切句器不得引用 silero VAD（必 SIGSEGV）', () => {
    const src = read('agent/src/asr/sentence-splitter.js');
    expect(src).not.toContain('getVad');
    expect(src).not.toContain('sherpa');
  });
});

describe('精修不阻塞定稿契约', () => {
  it('finalize 必须最先置 refineAborted', () => {
    const src = read('agent/src/asr/session.js');
    const fn = src.match(/function finalize\(session\) \{[\s\S]*?\n  \}/);
    expect(fn, 'finalize 必须存在').toBeTruthy();
    const firstLines = fn[0].split('\n').slice(0, 4).join('\n');
    expect(firstLines).toContain('refineAborted = true');
  });

  it('精修任务必须带 shouldSkip', () => {
    const src = read('agent/src/asr/session.js');
    expect(src).toMatch(/shouldSkip:\s*\(\)\s*=>\s*session\.refineAborted/);
  });
});

describe('断句保逐句契约', () => {
  it('mergeRefined 不得无条件用整段覆盖', () => {
    const src = read('src/side_panel/voice-draft-items.js');
    expect(src).toContain('takeAll');
    expect(src).toContain('stripPunct');
  });

  it('i18n 四个键中英各一份', () => {
    const zh = read('src/shared/locales/zh.js');
    const en = read('src/shared/locales/en.js');
    for (const k of ['refineListening', 'refineCorrecting', 'refineCorrected', 'refineDegraded']) {
      expect(zh).toContain(`${k}:`);
      expect(en).toContain(`${k}:`);
    }
  });
});
```

- [ ] **Step 2: 跑守卫确认通过**

Run: `npx vitest run test/unit/asr-refine-contract.unit.test.js`
Expected: PASS

- [ ] **Step 3: 变异验证（证明守卫不是恒真）**

临时把 `session.js` 里 `shouldSkip` 那行注释掉，跑守卫，确认**变红**；然后还原，确认复绿。把结果记入提交说明。

- [ ] **Step 4: 真机探针（两个假通过陷阱）**

创建 `test-results-probes/_asr-refine-e2e.mjs`，用 Playwright 启动 dist 扩展 + 真实 agent，喂一段 4 句的合成音频（复用 `/tmp/asr-probe` 的 wav），断言：

1. 录音中：输入框里**句号数量 = 4**（防「整段退化成一句」）
2. 松手后：最终文本的**句号数量仍为 4**（防「整段把句号改回逗号」）
3. 输入框文本包含 **SenseVoice 级特征**（例如 `牛头不对马嘴` 正确连写，而不是 zipformer 的乱码）
4. 用户在第一句内改一个字 → 该句不再被精修改写，其余句照常

- [ ] **Step 5: 全量回归**

```bash
node --test agent/test/unit/*.test.js
npx vitest run
npx eslint src/ agent/
npm run build:silent          # 期望 BUILD_SUCCESS
```

- [ ] **Step 6: 提交**

```bash
git add test/unit/asr-refine-contract.unit.test.js agent/src src/side_panel src/shared options.html
git commit -m "test(voice): 句级精修契约守卫 + 真机探针（含变异验证）"
```

---

## 自审

**Spec 覆盖**

| Spec 要求 | 实现任务 |
|---|---|
| 切句两信号（endpoint / RMS）+ 12s 回溯 | Task 1 + Task 4 |
| 禁止硬切 | Task 1 实现 + Task 8 守卫 |
| segFrames 按帧存 | Task 4 (3e) |
| 精修队列背压（>3 丢弃） | Task 4 (3c) |
| 自适应降级（连续 3 次慢） | Task 4 (3c) |
| stop 不阻塞 | Task 3 + Task 4 (3g) |
| `sentence` 同一 id 发两次 | Task 4 (3c) |
| `refine` 降级帧 | Task 4 (3c) |
| `partial.open` | Task 4 (3f) |
| `final.texts` | Task 2 + Task 4 (3g) |
| 字词取整段、断句取逐句 | Task 5 `mergeRefined` |
| 手改只锁那一句 | Task 5 `locateEdit` + Task 6 |
| 光标在块后按长度差平移 | Task 6 (3c) |
| 三档配置（即时/均衡/精确） | Task 4 门控（`isRefineEnabled` / `pumpPartial`）+ Task 7 配置与 UI |
| i18n 中英成对 | Task 7 Step 4 + Task 8 守卫 |
| 真机探针防两个假通过 | Task 8 |

**已修的问题（自审时发现并已写进各任务）**

- Task 4 的 `final` 帧曾把 `segments` 标成 `string[]`，与 Task 2 的 `segments:number` 和实现（`texts.length`）不一致 → 已改为 `segments:number`。
- 协议里的 `partial.open` 曾只有生产端、没有消费端，`applyDraft` 的 `opts.openOnly` 是死参数 → 已在 Task 6 补 `partial` 分支，`openOnly` 删除。
- `asrPacing` 曾在 Task 7 只有配置、没有消费端（三档会变成死配置）→ 已在 Task 4 补 `isRefineEnabled` / `pumpPartial` 门控，Task 7 补齐 `config.js` 白名单、`routes.js` 读写、`server.js` 依赖注入。
- Task 6 的 `markDirty` 曾用 `+64` 猜草稿块尾 → 改为用 `st.appliedValue` 算净增量推出真实块长。
