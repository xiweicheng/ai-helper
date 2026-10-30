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

/** 造一段帧：'s' = 有语音，'-' = 静音 */
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

  test('空数组 / null 不抛异常', () => {
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
    // 13s = 130 帧；回溯窗口是最后 20 帧（索引 110..129），窗口内最低在 115
    const list = frames('s'.repeat(130));
    list[110].rms = 0.0041;
    list[115].rms = 0.0021;
    list[120].rms = 0.004;
    assert.equal(chooseCutIndex(list), 115);
  });

  test('窗口外的更低帧不应被选中（只回溯最近 LOOKBACK_MS）', () => {
    const list = frames('s'.repeat(130));
    list[0].rms = 0;       // 窗口外，整段最低
    list[115].rms = 0.003; // 窗口内最低
    assert.equal(chooseCutIndex(list), 115);
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

  test('回溯窗口不会切出空 head', () => {
    const list = frames('s'.repeat(130));
    for (let i = 0; i < list.length; i++) list[i].rms = 0.05;
    list[0].rms = 0;
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
    assert.equal(FRAME_MS, 100);
    assert.equal(MAX_SENTENCE_MS, 12000);
    assert.equal(LOOKBACK_MS, 2000);
  });
});
