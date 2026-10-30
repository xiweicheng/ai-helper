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
    decode: () => '第一段。', // 注入假解码：不得去加载真模型
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

test('没有 offline 模型仍然抛 model_missing（不能因为注入参数而吞掉）', () => {
  const samples = new Float32Array(16000 * 2).fill(0.2);
  assert.throws(
    () => transcribeSamples(samples, { offlineModel: null }),
    (err) => err.code === 'model_missing',
  );
});
