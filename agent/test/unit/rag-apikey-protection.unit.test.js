// agent/test/unit/rag-apikey-protection.unit.test.js
// S3 防回归：collections.json 密钥文件权限收紧 + API Key 不明文回传 + 空值编辑保留
// 背景：注册表明文存远端向量服务密钥且 0644 权限；GET 响应原样回传密钥明文
// 运行：node --test agent/test/unit/rag-apikey-protection.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 隔离数据根目录（先于 manager/routes import）
const ragRoot = await mkdtemp(join(tmpdir(), 'rag-apikey-test-'));
process.env.AI_HELPER_RAG_ROOT = ragRoot;
const { RagManager } = await import('../../src/rag/manager.js');
const { sanitizeCollection, resolveTestEmbeddingInput } = await import('../../src/rag/routes.js');

const REMOTE_CFG = {
  mode: 'openai-compat',
  endpoint: 'https://api.example.com/v1',
  apiKey: 'sk-test-secret',
  modelName: 'test-embed',
  dimensions: 8,
};

const createRemoteCollection = (manager, name) =>
  manager.createCollection({ name, embeddingConfig: { ...REMOTE_CFG } });

describe('collections.json 文件权限（S3）', () => {
  test('注册表文件权限收紧为 0600', async () => {
    const manager = new RagManager();
    await manager.createCollection({ name: '权限检查库' });
    const st = await stat(join(ragRoot, 'collections.json'));
    if (process.platform === 'win32') return; // Windows 无 POSIX 权限位
    assert.equal(st.mode & 0o777, 0o600);
  });

  test('历史遗留的宽松权限文件在下次写入后被收紧为 0600', async () => {
    const file = join(ragRoot, 'collections.json');
    await writeFile(file, '{"version":1,"collections":[]}', 'utf-8');
    await chmod(file, 0o644);
    const manager = new RagManager();
    await manager.createCollection({ name: '权限收紧库' });
    const st = await stat(file);
    if (process.platform === 'win32') return;
    assert.equal(st.mode & 0o777, 0o600);
  });
});

describe('响应脱敏 sanitizeCollection（S3）', () => {
  test('apiKey 置空并附 hasApiKey 标记（其余字段保留，不修改原对象）', () => {
    const col = { id: 'kb_demo0001', name: 'demo', embeddingConfig: { ...REMOTE_CFG } };
    const out = sanitizeCollection(col);
    assert.equal(out.embeddingConfig.apiKey, '');
    assert.equal(out.embeddingConfig.hasApiKey, true);
    assert.equal(out.embeddingConfig.endpoint, REMOTE_CFG.endpoint);
    assert.equal(out.embeddingConfig.modelName, REMOTE_CFG.modelName);
    // 原对象不被修改（manager 内部仍需读取真实密钥）
    assert.equal(col.embeddingConfig.apiKey, 'sk-test-secret');
  });

  test('无密钥（本地模式）库 hasApiKey=false', () => {
    const out = sanitizeCollection({ id: 'kb_demo0002', name: 'local', embeddingConfig: { mode: 'local', apiKey: '' } });
    assert.equal(out.embeddingConfig.apiKey, '');
    assert.equal(out.embeddingConfig.hasApiKey, false);
  });
});

describe('updateCollection 空密钥继承（S3）', () => {
  test('提交空 apiKey（前端不回显）时沿用已保存密钥', async () => {
    const manager = new RagManager();
    const col = await createRemoteCollection(manager, '空值继承库');
    await manager.updateCollection(col.id, {
      name: '空值继承库-改名',
      embeddingConfig: { ...REMOTE_CFG, apiKey: '' },
    });
    const after = await manager.getCollection(col.id);
    assert.equal(after.name, '空值继承库-改名');
    assert.equal(after.embeddingConfig.apiKey, 'sk-test-secret');
  });

  test('未提供 apiKey 字段时沿用已保存密钥', async () => {
    const manager = new RagManager();
    const col = await createRemoteCollection(manager, '缺省继承库');
    const { apiKey, ...withoutKey } = REMOTE_CFG;
    await manager.updateCollection(col.id, { embeddingConfig: { ...withoutKey } });
    const after = await manager.getCollection(col.id);
    assert.equal(after.embeddingConfig.apiKey, 'sk-test-secret');
  });

  test('显式提交新 apiKey 时覆盖', async () => {
    const manager = new RagManager();
    const col = await createRemoteCollection(manager, '覆盖密钥库');
    await manager.updateCollection(col.id, { embeddingConfig: { ...REMOTE_CFG, apiKey: 'sk-new-key' } });
    const after = await manager.getCollection(col.id);
    assert.equal(after.embeddingConfig.apiKey, 'sk-new-key');
  });
});

describe('test-embedding 已存密钥复用（S3）', () => {
  test('空 apiKey + collectionId 时复用库中已保存密钥，且控制字段不混入配置', async () => {
    const manager = new RagManager();
    const col = await createRemoteCollection(manager, '密钥复用库');
    const input = await resolveTestEmbeddingInput({ ...REMOTE_CFG, apiKey: '', collectionId: col.id });
    assert.equal(input.apiKey, 'sk-test-secret');
    assert.equal('collectionId' in input, false);
  });

  test('显式提供 apiKey 时优先使用（不查库）', async () => {
    const input = await resolveTestEmbeddingInput({ ...REMOTE_CFG, apiKey: 'sk-typed', collectionId: 'kb_notexist0' });
    assert.equal(input.apiKey, 'sk-typed');
  });
});
