// P3 回归测试：文本导入 / 上传文件导入的大小上限
// 背景：/api/rag/collections/{id}/ingest 的 text 与 file(contentBase64) 路径过去无上限，
// 200MB body 直通后 chunks/embeddings 全量驻留内存（OOM 风险）；URL 导入已有 10MB 上限。
// 上限在 manager 入口做字节级校验，超限在分块/向量化之前快速失败。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as managerModule from '../../src/rag/manager.js';

const { RagManager } = managerModule;
// 以导出常量为准；未导出时回退到文档约定的默认上限，保证各用例可独立表达行为
const TEXT_LIMIT = managerModule.INGEST_MAX_TEXT_BYTES ?? 10 * 1024 * 1024;
const FILE_LIMIT = managerModule.INGEST_MAX_FILE_BYTES ?? 50 * 1024 * 1024;
const asMB = (bytes) => `${Math.round(bytes / (1024 * 1024))}MB`;

/**
 * 最小桩：跳过 _runIngest 互斥包裹，捕获进入 _ingestText 的入参
 */
function makeStub() {
  const seen = [];
  const mgr = Object.create(RagManager.prototype);
  mgr._runIngest = async (_collectionId, fn) => fn();
  mgr._reportProgress = () => {};
  mgr._ingestText = async (_collectionId, input) => {
    seen.push(input);
    return { documentId: 'doc_test', name: input.name, chunkCount: 1 };
  };
  return { mgr, seen };
}

describe('P3: 导入上限常量', () => {
  test('导出文本与文件上限常量', () => {
    assert.ok(Number.isInteger(managerModule.INGEST_MAX_TEXT_BYTES) && managerModule.INGEST_MAX_TEXT_BYTES > 0);
    assert.ok(Number.isInteger(managerModule.INGEST_MAX_FILE_BYTES) && managerModule.INGEST_MAX_FILE_BYTES > 0);
  });
});

describe('P3: 文本导入大小上限', () => {
  test('超过上限拒绝（contentTooLarge），不进入解析/分块', async () => {
    const { mgr, seen } = makeStub();
    const content = 'a'.repeat(TEXT_LIMIT + 1);
    await assert.rejects(
      () => mgr.ingestText('kb1', { content }),
      (err) => {
        assert.equal(err.code, 'contentTooLarge');
        assert.equal(err.params?.limit, asMB(TEXT_LIMIT));
        return true;
      },
    );
    assert.equal(seen.length, 0);
  });

  test('恰好等于上限放行', async () => {
    const { mgr, seen } = makeStub();
    const content = 'a'.repeat(TEXT_LIMIT);
    const res = await mgr.ingestText('kb1', { content });
    assert.equal(res.documentId, 'doc_test');
    assert.equal(seen.length, 1);
  });

  test('多字节字符按 UTF-8 字节数计算', async () => {
    const { mgr } = makeStub();
    // '中' 为 3 字节：字符数未超“字面长度”，字节数已超 → 必须拒绝
    const content = '中'.repeat(Math.ceil(TEXT_LIMIT / 3) + 1);
    await assert.rejects(
      () => mgr.ingestText('kb1', { content }),
      (err) => err.code === 'contentTooLarge',
    );
  });
});

describe('P3: 上传文件大小上限', () => {
  test('base64 解码后超过上限拒绝（fileTooLarge），不落盘解析', async () => {
    const { mgr, seen } = makeStub();
    // 无需真实文件内容：base64 长度预检即应拒绝（解码后 ≈ len*3/4 > 上限）
    const base64 = 'A'.repeat(Math.floor((FILE_LIMIT * 4) / 3) + 8);
    await assert.rejects(
      () => mgr.ingestFile('kb1', { fileName: 'big.pdf', contentBase64: base64 }),
      (err) => {
        assert.equal(err.code, 'fileTooLarge');
        assert.equal(err.params?.limit, asMB(FILE_LIMIT));
        return true;
      },
    );
    assert.equal(seen.length, 0);
  });

  test('恰好等于上限的 base64 放行（进入解析链路）', async () => {
    const { mgr, seen } = makeStub();
    const exact = Math.floor(FILE_LIMIT / 3) * 4; // 解码后恰好 = 上限
    const base64 = 'A'.repeat(exact);
    // .txt 源走文本解析（不依赖可选文档解析依赖），桩 _ingestText 捕获即证明通过大小校验
    await mgr.ingestFile('kb1', { fileName: 'ok.txt', contentBase64: base64 });
    assert.equal(seen.length, 1);
  });
});
