// queue-attachment-store.unit.test.js - 排队条目的图片/文件持久化
//
// 这层的存在意义只有一个：让"带着图片/文件排队"的条目在面板重载、插件崩溃之后
// 依然能把附件取回来。因此重点验证"存进去 → 换一个实例读出来"的往返完整性，
// 以及各种失败路径都必须明确返回 ok:false（绝不假装成功）。
import { describe, test, expect, beforeEach } from 'vitest';
import * as attachments from '../../src/side_panel/queue-attachment-store.js';

/** 内存适配器：模拟 IndexedDB 的读写语义，并保留 disk 以便"换实例再读" */
function makeMemoryAdapter() {
  const records = new Map();
  return {
    records,
    async put(record) {
      records.set(record.id, JSON.parse(JSON.stringify(record)));
    },
    async get(id) {
      return records.has(id) ? JSON.parse(JSON.stringify(records.get(id))) : null;
    },
    async remove(id) {
      records.delete(id);
    },
    async removeBySession(sessionId) {
      for (const [key, value] of [...records.entries()]) {
        if (value.sessionId === sessionId) records.delete(key);
      }
    },
    async allKeys() {
      return [...records.keys()];
    },
  };
}

const imageA = { originalUrl: 'data:image/png;base64,AAAA', compressedUrl: 'data:image/png;base64,AA' };
const fileA = { name: '需求.md', size: 12, type: 'text/markdown', dataUrl: 'data:text/plain;base64,BBBB', text: '# 需求', status: 'done' };

let adapter;

beforeEach(() => {
  attachments.__resetForTest();
  adapter = makeMemoryAdapter();
  attachments.__setAdapterForTest(adapter);
});

describe('附件摘要', () => {
  test('没有附件时摘要为 null', () => {
    expect(attachments.summarizeAttachments({})).toBeNull();
    expect(attachments.summarizeAttachments(null)).toBeNull();
  });

  test('图片与文件分别计数，文件名保留用于 chip 提示', () => {
    const summary = attachments.summarizeAttachments({ attachedImages: [imageA, imageA], attachedFiles: [fileA] });
    expect(summary).toEqual({ imageCount: 2, fileCount: 1, fileNames: ['需求.md'] });
  });

  test('hasHeavyContext 只认图片/文件', () => {
    expect(attachments.hasHeavyContext({ attachedImages: [imageA] })).toBe(true);
    expect(attachments.hasHeavyContext({ attachedFiles: [fileA] })).toBe(true);
    expect(attachments.hasHeavyContext({ quotedContextText: '选中文字' })).toBe(false);
    expect(attachments.hasHeavyContext(null)).toBe(false);
  });

  test('bytesOf 按字符数估算，能反映嵌套结构体量', () => {
    expect(attachments.bytesOf('abcd')).toBe(4);
    expect(attachments.bytesOf([{ a: 'xx' }, { b: 'yyy' }])).toBe(5);
    expect(attachments.bytesOf(null)).toBe(0);
  });
});

describe('存取往返', () => {
  test('存进去的内容换一个实例读出来完全一致（模拟面板重载）', async () => {
    const saved = await attachments.saveAttachments('item-1', 's1', { images: [imageA], files: [fileA] });
    expect(saved.ok).toBe(true);

    // 模拟面板重载：清掉模块内缓存，只剩底层存储
    attachments.__resetForTest();
    attachments.__setAdapterForTest(adapter);

    const loaded = await attachments.loadAttachments('item-1');
    expect(loaded).not.toBeNull();
    expect(loaded.images).toEqual([imageA]);
    expect(loaded.files).toEqual([fileA]);
    expect(loaded.files[0].text).toBe('# 需求');
  });

  test('空附件视为成功但跳过写入', async () => {
    const res = await attachments.saveAttachments('item-2', 's1', { images: [], files: [] });
    expect(res).toEqual({ ok: true, skipped: true });
    expect(adapter.records.size).toBe(0);
  });

  test('读不到记录返回 null（面板重载后条目已被清理）', async () => {
    expect(await attachments.loadAttachments('missing')).toBeNull();
    expect(await attachments.loadAttachments('')).toBeNull();
  });

  test('底层抛错时读操作退化为 null，绝不向上冒泡', async () => {
    attachments.__setAdapterForTest({
      ...makeMemoryAdapter(),
      async get() { throw new Error('idb broken'); },
    });
    expect(await attachments.loadAttachments('item-3')).toBeNull();
  });
});

describe('失败必须如实上报', () => {
  test('写入失败返回 ok:false + idb_error（调用方据此降级并提示用户）', async () => {
    attachments.__setAdapterForTest({
      ...makeMemoryAdapter(),
      async put() { throw new Error('quota exceeded'); },
    });
    const res = await attachments.saveAttachments('item-4', 's1', { images: [imageA] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('idb_error');
  });

  test('超过上限时拒绝落盘并说明原因', async () => {
    const huge = { originalUrl: 'x'.repeat(attachments.MAX_ATTACHMENT_BYTES + 1) };
    const res = await attachments.saveAttachments('item-5', 's1', { images: [huge] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('too_large');
    expect(adapter.records.size).toBe(0);
  });

  test('缺少条目 id 直接拒绝', async () => {
    const res = await attachments.saveAttachments('', 's1', { images: [imageA] });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('missing_id');
  });
});

describe('清理', () => {
  test('按条目删除，重复删除不报错', async () => {
    await attachments.saveAttachments('item-6', 's1', { images: [imageA] });
    expect(await attachments.deleteAttachments('item-6')).toBe(true);
    expect(await attachments.loadAttachments('item-6')).toBeNull();
    expect(await attachments.deleteAttachments('item-6')).toBe(true);
  });

  test('按会话批量删除', async () => {
    await attachments.saveAttachments('a1', 's1', { images: [imageA] });
    await attachments.saveAttachments('a2', 's1', { files: [fileA] });
    await attachments.saveAttachments('b1', 's2', { images: [imageA] });

    await attachments.deleteSessionAttachments('s1');

    expect(await attachments.loadAttachments('a1')).toBeNull();
    expect(await attachments.loadAttachments('a2')).toBeNull();
    expect(await attachments.loadAttachments('b1')).not.toBeNull();
  });

  test('孤儿清理只删没有归属的记录，队列里还在的条目一律保留', async () => {
    await attachments.saveAttachments('alive-1', 's1', { images: [imageA] });
    await attachments.saveAttachments('alive-2', 's2', { files: [fileA] });
    await attachments.saveAttachments('orphan-1', 's3', { images: [imageA] });

    const removed = await attachments.pruneOrphans(new Set(['alive-1', 'alive-2']));

    expect(removed).toBe(1);
    expect(await attachments.loadAttachments('alive-1')).not.toBeNull();
    expect(await attachments.loadAttachments('alive-2')).not.toBeNull();
    expect(await attachments.loadAttachments('orphan-1')).toBeNull();
  });

  test('清理过程出错时不影响主流程（返回 0）', async () => {
    attachments.__setAdapterForTest({
      ...makeMemoryAdapter(),
      async allKeys() { throw new Error('idb broken'); },
    });
    expect(await attachments.pruneOrphans(new Set())).toBe(0);
  });
});
