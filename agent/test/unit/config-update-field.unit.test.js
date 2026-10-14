// agent/test/unit/config-update-field.unit.test.js
// 回归：updateConfigField 曾在自己的写锁里再调 saveConfig（同一把锁），
// 形成自锁 → 调用方永久挂起。此前无生产调用方所以从未暴露；记忆 embedding 配置是第一个。
// 必须在全局 5s 超时内完成，否则说明又回到挂起状态。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// config.js 的 AGENT_DIR 在模块加载时求值，HOME 必须先切
const home = mkdtempSync(join(tmpdir(), 'aha-config-'));
process.env.HOME = home;

const { loadConfig, updateConfigField, saveConfig } = await import('../../src/config.js');

const CONFIG_FILE = join(home, '.ai-helper-agent', 'config.json');

after(() => {
  rmSync(home, { recursive: true, force: true });
});

test('updateConfigField 不死锁且落盘', { timeout: 5000 }, async () => {
  loadConfig(); // 首次读取会写出默认 config.json
  const returned = await updateConfigField('memoryEmbedding', { enabled: true, mode: 'local' });
  assert.equal(returned.memoryEmbedding.enabled, true);
  const onDisk = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  assert.equal(onDisk.memoryEmbedding.mode, 'local');
  assert.equal(loadConfig().memoryEmbedding.enabled, true);
});

test('连续两次 updateConfigField 都完成（锁必须正确释放）', { timeout: 5000 }, async () => {
  await updateConfigField('pairCodeTTL', 60);
  await updateConfigField('commandTimeout', 123456);
  const cfg = loadConfig();
  assert.equal(cfg.pairCodeTTL, 60);
  assert.equal(cfg.commandTimeout, 123456);
});

test('updateConfigField 不会整体替换 loadConfig 缓存对象（防串改）', { timeout: 5000 }, async () => {
  const before = loadConfig();
  const portBefore = before.port;
  await updateConfigField('port', 19000);
  assert.equal(before.port, portBefore, '传入 update 前拿到的引用不应被就地改');
  assert.equal(loadConfig().port, 19000);
});

test('未知配置键仍然被拒绝', { timeout: 5000 }, async () => {
  await assert.rejects(() => updateConfigField('nope', 1));
  assert.ok(existsSync(CONFIG_FILE));
});

test('saveConfig 与 updateConfigField 交替不死锁', { timeout: 5000 }, async () => {
  const cfg = loadConfig();
  await saveConfig({ ...cfg, fileMaxSize: 1024 });
  await updateConfigField('fileMaxSize', 2048);
  assert.equal(loadConfig().fileMaxSize, 2048);
});

test('写入失败必须放锁，不能堵死后续全部配置写入', { timeout: 5000 }, async () => {
  const circular = { a: {} };
  circular.a.self = circular;
  await assert.rejects(() => updateConfigField('memoryEmbedding', circular));
  await updateConfigField('pairCodeTTL', 90);
  assert.equal(loadConfig().pairCodeTTL, 90);
});
