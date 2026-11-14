// 记忆导入导出的纯逻辑：导出载荷白名单、导入解析、追加去重。
// 下载/选文件这类 DOM 动作不在本文件覆盖范围（与 todo-io 的测试分层一致）。
import { describe, it, expect } from 'vitest';
import {
  MEMORY_EXPORT_VERSION,
  buildMemoryExportPayload,
  buildMemoryExportFile,
  parseMemoryImport,
  parseMemoryImportText,
  diffMemoryImport,
  memoryExportFileName,
} from '../../src/options/memory-io.js';

const NOW = new Date(2026, 10, 14, 9, 30, 0).getTime();

const FACT = {
  id: 'fact_1', type: 'fact', category: 'preference', content: '偏好 pnpm 而非 npm',
  tags: ['偏好', '工具链'], importance: 9, accessCount: 3,
  lastAccessAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z',
  value: '42.10',
};
const SUMMARY = {
  id: 'sum_1', type: 'summary', category: 'auto', title: '记忆下推联调',
  content: '完成记忆逻辑下推 agent 端的联调', tags: [], importance: null,
  accessCount: 0, lastAccessAt: null, createdAt: '2026-10-10T00:00:00.000Z', value: '5.00',
};

describe('记忆导出文件名', () => {
  it('只到天，固定 json 后缀', () => {
    expect(memoryExportFileName(NOW)).toBe('ai-helper-memory-2026-11-14.json');
  });
});

describe('记忆导出载荷', () => {
  it('带 kind/version/exportedAt 与分类计数', () => {
    const payload = buildMemoryExportPayload([FACT, SUMMARY], { now: NOW });
    expect(payload.kind).toBe('memory');
    expect(payload.version).toBe(MEMORY_EXPORT_VERSION);
    expect(payload.exportedAt).toBe(new Date(NOW).toISOString());
    expect(payload.counts).toEqual({ total: 2, facts: 1, summaries: 1 });
  });

  it('只导出白名单字段：派生字段 value 不落盘，null 字段省略，内容原样保留', () => {
    const [fact, summary] = buildMemoryExportPayload([FACT, SUMMARY], { now: NOW }).entries;
    expect(fact).toEqual({
      id: 'fact_1', type: 'fact', category: 'preference', content: '偏好 pnpm 而非 npm',
      tags: ['偏好', '工具链'], importance: 9, accessCount: 3,
      lastAccessAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z',
    });
    expect(fact).not.toHaveProperty('value');
    // importance/lastAccessAt 为 null：不把 null 写进备份文件
    expect(summary).not.toHaveProperty('importance');
    expect(summary).not.toHaveProperty('lastAccessAt');
    expect(summary.title).toBe('记忆下推联调');
  });

  it('tags 是拷贝，改导出结果不会污染源数据', () => {
    const payload = buildMemoryExportPayload([FACT], { now: NOW });
    payload.entries[0].tags.push('新增');
    expect(FACT.tags).toEqual(['偏好', '工具链']);
  });

  it('空库 / 脏值不炸，计为 0', () => {
    const payload = buildMemoryExportPayload(null, { now: NOW });
    expect(payload.entries).toEqual([]);
    expect(payload.counts.total).toBe(0);
  });

  it('导出文件是 JSON 类型，内容能被自己的导入解析器认回来', async () => {
    const { filename, blob } = buildMemoryExportFile([FACT], { now: NOW });
    expect(filename).toBe('ai-helper-memory-2026-11-14.json');
    expect(blob.type).toContain('application/json');
    const parsed = parseMemoryImport(JSON.parse(await blob.text()));
    expect(parsed.ok).toBe(true);
    expect(parsed.entries).toHaveLength(1);
  });
});

describe('记忆导入解析', () => {
  it('接受导出文件与裸数组', () => {
    expect(parseMemoryImport({ kind: 'memory', entries: [{ content: 'a' }] }))
      .toEqual({ ok: true, entries: [{ content: 'a' }] });
    expect(parseMemoryImport([{ content: 'a' }]))
      .toEqual({ ok: true, entries: [{ content: 'a' }] });
  });

  it('kind 不是 memory 时拒绝（别把别的功能导出文件误当记忆）', () => {
    expect(parseMemoryImport({ kind: 'todos', entries: [] })).toEqual({ ok: false, reason: 'format' });
  });

  it('没有 entries 的结构一律判格式错', () => {
    expect(parseMemoryImport({})).toEqual({ ok: false, reason: 'format' });
    expect(parseMemoryImport(null)).toEqual({ ok: false, reason: 'format' });
    expect(parseMemoryImport('[]')).toEqual({ ok: false, reason: 'format' });
  });
});

describe('记忆导入文本解析（导出 JSON / 归档 JSONL）', () => {
  it('整份 JSON 导出文件仍走原解析', () => {
    const text = JSON.stringify({ kind: 'memory', entries: [{ type: 'fact', content: 'A' }] });
    expect(parseMemoryImportText(text)).toEqual({
      ok: true, entries: [{ type: 'fact', content: 'A' }],
    });
  });

  it('归档 JSONL 逐行解析；崩溃留下的坏行跳过，不影响其他记录', () => {
    const text = [
      JSON.stringify({ id: 'fact_1', type: 'fact', content: 'A', archiveReason: 'compact', archiveValue: 3 }),
      '{"id":"broken"',
      '',
      JSON.stringify({ id: 'fact_2', type: 'fact', content: 'B' }),
    ].join('\n');
    const parsed = parseMemoryImportText(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.entries.map((e) => e.id)).toEqual(['fact_1', 'fact_2']);
    expect(parsed.invalidLines).toBe(1);
  });

  it('归档行可直接导入：archive* 字段被归一化忽略', () => {
    const text = `${JSON.stringify({
      id: 'fact_1', type: 'fact', content: '旧记忆', archiveReason: 'compact',
      archiveValue: 2.5, archivedAt: '2026-11-14T00:00:00.000Z',
    })}\n`;
    const parsed = parseMemoryImportText(text);
    const diff = diffMemoryImport([], parsed.entries);
    expect(diff.accepted).toEqual([{ type: 'fact', content: '旧记忆', tags: [] }]);
  });

  it('空文件 / 全坏行 / 非记忆 JSON 判格式错', () => {
    expect(parseMemoryImportText('').ok).toBe(false);
    expect(parseMemoryImportText('not json\nstill not').ok).toBe(false);
    expect(parseMemoryImportText('{"kind":"todos","entries":[]}').ok).toBe(false);
  });
});

describe('记忆导入去重与归一化', () => {
  it('库内已存在（同 type+内容）跳过，文件内自重复也只收一条', () => {
    const existing = [{ type: 'fact', content: '偏好 pnpm 而非 npm' }];
    const incoming = [
      { type: 'fact', content: ' 偏好 pnpm 而非 npm ' },   // 与库内重复（trim 后相同）
      { type: 'fact', content: '新记忆 A' },
      { type: 'fact', content: '新记忆 A' },               // 文件内重复
      { type: 'summary', content: '新记忆 A' },            // 类型不同，不算重复
    ];
    const diff = diffMemoryImport(existing, incoming);
    expect(diff.accepted.map((e) => `${e.type}:${e.content}`))
      .toEqual(['fact:新记忆 A', 'summary:新记忆 A']);
    // 跳过 2：与库内重复 1 + 文件内自重复 1
    expect(diff.skippedDuplicate).toBe(2);
    expect(diff.skipped).toBe(2);
  });

  it('非法条目单独计数：未知类型、空内容、非对象', () => {
    const diff = diffMemoryImport([], [
      { type: 'note', content: 'x' },
      { type: 'fact', content: '   ' },
      { type: 'fact' },
      null,
      'oops',
    ]);
    expect(diff.accepted).toEqual([]);
    expect(diff.skippedInvalid).toBe(5);
    expect(diff.skipped).toBe(5);
  });

  it('归一化：内容 trim、重要度钳制取整、标签去空、title 只给摘要、不还原 id/时间戳', () => {
    const diff = diffMemoryImport([], [
      {
        id: 'fact_old', type: 'fact', content: '  内容  ', tags: [' a ', '', null],
        importance: 99, createdAt: '2020-01-01T00:00:00.000Z', accessCount: 88,
      },
      { type: 'summary', title: ' 标题 ', content: '摘要内容', importance: 0 },
      { type: 'fact', title: '事实不该有标题', content: '事实内容', category: 'preference' },
    ]);
    const [fact, summary, plainFact] = diff.accepted;
    expect(fact).toEqual({ type: 'fact', content: '内容', tags: ['a'], importance: 10 });
    expect(summary).toEqual({ type: 'summary', content: '摘要内容', tags: [], title: '标题', importance: 1 });
    expect(plainFact).not.toHaveProperty('title');
    expect(plainFact.category).toBe('preference');
    expect(fact).not.toHaveProperty('id');
    expect(fact).not.toHaveProperty('createdAt');
    expect(fact).not.toHaveProperty('accessCount');
  });

  it('导出→导入全链路：空库接收全部条目', async () => {
    const { blob } = buildMemoryExportFile([FACT, SUMMARY], { now: NOW });
    const parsed = parseMemoryImport(JSON.parse(await blob.text()));
    const diff = diffMemoryImport([], parsed.entries);
    expect(diff.accepted).toHaveLength(2);
    expect(diff.skipped).toBe(0);
    expect(diff.accepted[0]).toEqual({
      type: 'fact', content: '偏好 pnpm 而非 npm', tags: ['偏好', '工具链'],
      importance: 9, category: 'preference',
    });
  });
});
