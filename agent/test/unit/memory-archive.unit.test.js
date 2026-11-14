// 淘汰归档：按月 JSONL 追加 + 总量裁剪。纯 fs 行为，不依赖 memory service。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  archiveFilePath, appendArchive, pruneArchive, ARCHIVE_MAX_FILES,
} from '../../src/memory/archive.js';

const NOW = new Date(2026, 10, 14, 10, 0, 0).getTime();
const MONTH = new Date(2026, 10, 1).getTime();

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-archive-test-'));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

function record(id, content, value) {
  return { memory: { id, type: 'fact', content, tags: [], importance: 1 }, value };
}

describe('归档文件命名', () => {
  it('按月切片', () => {
    assert.equal(archiveFilePath('/tmp/x', NOW), '/tmp/x/memory-archive-2026-11.jsonl');
  });
});

describe('appendArchive', () => {
  it('建目录并一行一条写入，保留原条目字段并附加归档元信息', () => withDir(async (dir) => {
    const archiveDir = join(dir, 'archive');
    const r = await appendArchive([record('fact_1', '低价值 A', 3.456), record('fact_2', '低价值 B', 0)], {
      dir: archiveDir, reason: 'compact', now: NOW,
    });
    assert.equal(r.archived, 2);
    assert.equal(r.filePath, join(archiveDir, 'memory-archive-2026-11.jsonl'));

    const lines = readFileSync(r.filePath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]);
    assert.equal(first.id, 'fact_1');
    assert.equal(first.content, '低价值 A');
    assert.equal(first.archiveReason, 'compact');
    assert.equal(first.archiveValue, 3.46);
    assert.equal(first.archivedAt, new Date(NOW).toISOString());
  }));

  it('多次淘汰追加到同一个月文件，不覆盖历史', () => withDir(async (dir) => {
    const archiveDir = join(dir, 'archive');
    await appendArchive([record('fact_1', 'A', 1)], { dir: archiveDir, now: NOW });
    await appendArchive([record('fact_2', 'B', 1)], { dir: archiveDir, now: NOW });
    const lines = readFileSync(archiveFilePath(archiveDir, NOW), 'utf8').trim().split('\n');
    assert.deepEqual(lines.map((l) => JSON.parse(l).id), ['fact_1', 'fact_2']);
  }));

  it('上次崩溃留下半行时补换行，坏行不会吞掉后续记录', () => withDir(async (dir) => {
    const archiveDir = join(dir, 'archive');
    mkdirSync(archiveDir);
    const file = archiveFilePath(archiveDir, NOW);
    writeFileSync(file, '{"id":"broken"', 'utf8');   // 模拟写入中断
    await appendArchive([record('fact_1', 'A', 1)], { dir: archiveDir, now: NOW });

    const lines = readFileSync(file, 'utf8').split('\n');
    assert.equal(lines[0], '{"id":"broken"');        // 残行原样保留，便于人工排查
    assert.equal(JSON.parse(lines[1]).id, 'fact_1');
  }));

  it('单月文件达到上限后月内切片，序号连续且记录不丢', () => withDir(async (dir) => {
    const archiveDir = join(dir, 'archive');
    const rec = (id) => ({ memory: { id, type: 'fact', content: 'x'.repeat(60) }, value: 1 });
    const opts = { dir: archiveDir, now: NOW, maxFileBytes: 500 };
    await appendArchive([rec('fact_1')], opts);
    await appendArchive([rec('fact_2')], opts);
    await appendArchive([rec('fact_3')], opts);

    const base = archiveFilePath(archiveDir, NOW);
    const seg2 = base.replace('.jsonl', '-2.jsonl');
    assert.equal(existsSync(base), true);
    assert.equal(existsSync(seg2), true);
    assert.deepEqual(
      readFileSync(base, 'utf8').trim().split('\n').map((l) => JSON.parse(l).id),
      ['fact_1', 'fact_2'],
    );
    assert.deepEqual(
      readFileSync(seg2, 'utf8').trim().split('\n').map((l) => JSON.parse(l).id),
      ['fact_3'],
    );
  }));

  it('空列表不创建文件', () => withDir(async (dir) => {
    const archiveDir = join(dir, 'archive');
    const r = await appendArchive([], { dir: archiveDir, now: NOW });
    assert.equal(r.archived, 0);
    assert.equal(existsSync(archiveDir), false);
  }));
});

describe('pruneArchive', () => {
  it('文件数超限时从最旧删起，最新文件永远保留', () => withDir(async (dir) => {
    const archiveDir = join(dir, 'archive');
    mkdirSync(archiveDir);
    // 造 ARCHIVE_MAX_FILES + 1 个月的文件
    for (let i = 0; i < ARCHIVE_MAX_FILES + 1; i++) {
      const t = new Date(2025, i, 1).getTime();
      writeFileSync(archiveFilePath(archiveDir, t), '{}\n', 'utf8');
    }
    const r = await pruneArchive({ dir: archiveDir });
    assert.deepEqual(r.removed, ['memory-archive-2025-01.jsonl']);
  }));

  it('总量超限时继续删旧文件，但绝不删最新一个', () => withDir(async (dir) => {
    const archiveDir = join(dir, 'archive');
    mkdirSync(archiveDir);
    const old = archiveFilePath(archiveDir, new Date(2025, 0, 1).getTime());
    const latest = archiveFilePath(archiveDir, NOW);
    writeFileSync(old, 'x'.repeat(100), 'utf8');
    writeFileSync(latest, 'y'.repeat(100), 'utf8');

    // 上限比单个最新文件还小：只能删旧文件，最新文件必须留下
    const r = await pruneArchive({ dir: archiveDir, maxBytes: 50 });
    assert.deepEqual(r.removed, ['memory-archive-2025-01.jsonl']);
    assert.equal(existsSync(latest), true);
  }));

  it('分段号按数值排序，-2 比 -10 旧，裁剪从 -2 开始', () => withDir(async (dir) => {
    const archiveDir = join(dir, 'archive');
    mkdirSync(archiveDir);
    writeFileSync(join(archiveDir, 'memory-archive-2026-11.jsonl'), '{}\n', 'utf8');
    writeFileSync(join(archiveDir, 'memory-archive-2026-11-2.jsonl'), '{}\n', 'utf8');
    writeFileSync(join(archiveDir, 'memory-archive-2026-11-10.jsonl'), '{}\n', 'utf8');

    const r = await pruneArchive({ dir: archiveDir, maxFiles: 1 });
    assert.deepEqual(r.removed, ['memory-archive-2026-11.jsonl', 'memory-archive-2026-11-2.jsonl']);
    assert.equal(existsSync(join(archiveDir, 'memory-archive-2026-11-10.jsonl')), true);
  }));

  it('目录不存在时静默返回', () => withDir(async (dir) => {
    const r = await pruneArchive({ dir: join(dir, 'nope') });
    assert.deepEqual(r.removed, []);
  }));
});
