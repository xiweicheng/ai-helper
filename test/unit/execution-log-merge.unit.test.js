// execution-log-merge.unit.test.js —— 日志节点增量更新的合并语义
//
// 背景：后端对超大 observation 只在节点首次出现时发全文，后续状态更新（processing →
// success/failed）改发 4KB 摘要 + observationTruncated，以省掉重复的几十 KB 全局广播。
// 前端合并时必须保留本地全文，否则日志面板里的工具输出会退化成摘要。
import { describe, test, expect } from 'vitest';
import { mergeLogEntry } from '../../src/side_panel/execution-log-render.js';

const FULL = 'x'.repeat(50000);

describe('mergeLogEntry', () => {
  test('后续摘要不覆盖本地全文，但状态与其余字段照常更新', () => {
    const existing = { id: 'n1', status: 'processing', observation: FULL, toolName: 'read_url' };
    const incoming = {
      id: 'n1',
      status: 'success',
      observation: FULL.slice(0, 4096),
      observationTruncated: true,
      duration: 120
    };

    const merged = mergeLogEntry(existing, incoming);
    expect(merged.observation).toBe(FULL);
    expect(merged.status).toBe('success');
    expect(merged.duration).toBe(120);
    expect(merged.toolName).toBe('read_url');
    // 传输标记不能留在节点上被持久化
    expect(merged.observationTruncated).toBeUndefined();
  });

  test('本地没有全文时使用摘要（重开面板等冷启动场景）', () => {
    const merged = mergeLogEntry(
      { id: 'n1', status: 'processing' },
      { id: 'n1', status: 'success', observation: FULL.slice(0, 4096), observationTruncated: true }
    );
    expect(merged.observation).toHaveLength(4096);
  });

  test('新的完整 observation 正常覆盖（无截断标记）', () => {
    const merged = mergeLogEntry(
      { id: 'n1', observation: 'old' },
      { id: 'n1', observation: 'new-full-content' }
    );
    expect(merged.observation).toBe('new-full-content');
  });

  test('subtask 元数据以新值为先、旧值兜底', () => {
    const merged = mergeLogEntry(
      { id: 'n1', subtaskIndex: 2, subtaskId: 's2', subtaskName: '旧名' },
      { id: 'n1', subtaskIndex: 3 }
    );
    expect(merged.subtaskIndex).toBe(3);
    expect(merged.subtaskId).toBe('s2');
    expect(merged.subtaskName).toBe('旧名');
  });
});
