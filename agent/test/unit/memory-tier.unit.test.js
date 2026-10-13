// agent/test/unit/memory-tier.unit.test.js
// 召回通道分级决策：纯函数、无 IO。核心不变量是「默认必须落到 none」——none 的行为要与今天逐字一致。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveMemoryTier, isVectorTier, MEMORY_VECTOR_THRESHOLD } from '../../src/memory/tier.js';
import { DEFAULT_SEARCH_CONFIG } from '../../src/rag/config.js';

const remote = { enabled: true, mode: 'openai-compat', apiKey: 'sk', modelName: 'm', dimensions: 0 };
const local = { enabled: true, mode: 'local', apiKey: '', modelName: 'bge', dimensions: 512 };

test('未启用 → none', () => {
  assert.equal(resolveMemoryTier({ ...remote, enabled: false }, true), 'none');
});

test('enabled 只认真 true：字符串/数字等假值一律 none', () => {
  assert.equal(resolveMemoryTier({ ...remote, enabled: 'true' }, true), 'none');
  assert.equal(resolveMemoryTier({ ...remote, enabled: 1 }, true), 'none');
  assert.equal(resolveMemoryTier({ ...remote, enabled: undefined }, true), 'none');
});

test('远端缺 key 或缺 model → none', () => {
  assert.equal(resolveMemoryTier({ ...remote, apiKey: '' }, true), 'none');
  assert.equal(resolveMemoryTier({ ...remote, modelName: '  ' }, true), 'none');
  assert.equal(resolveMemoryTier({ ...remote, apiKey: '   ' }, true), 'none');
});

test('远端齐备 → remote（不依赖 RAG 是否安装）', () => {
  assert.equal(resolveMemoryTier(remote, false), 'remote');
});

test('local 且 RAG 可用 → local；不可用则静默降 none', () => {
  assert.equal(resolveMemoryTier(local, true), 'local');
  assert.equal(resolveMemoryTier(local, false), 'none');
});

test('未知 mode → none', () => {
  assert.equal(resolveMemoryTier({ enabled: true, mode: 'magic', apiKey: 'k', modelName: 'm' }, true), 'none');
});

test('无参 / 传 null 不抛，一律 none（缺配置不能误开通向量通道）', () => {
  assert.equal(resolveMemoryTier(), 'none');
  assert.equal(resolveMemoryTier(null), 'none');
  assert.equal(resolveMemoryTier(local), 'none');          // ragAvailable 缺省按不可用
});

test('isVectorTier 只对 remote/local 为真', () => {
  assert.deepEqual(['none', 'remote', 'local'].map(isVectorTier), [false, true, true]);
  assert.equal(isVectorTier('magic'), false);
  assert.equal(isVectorTier(undefined), false);
});

test('向量阈值与 RAG 默认检索阈值同源（不复制常量，避免两处漂移）', () => {
  assert.equal(MEMORY_VECTOR_THRESHOLD, DEFAULT_SEARCH_CONFIG.threshold);
  assert.equal(MEMORY_VECTOR_THRESHOLD, 0.3);
});
