// checkpoint-single-write.unit.test.js - ReAct checkpoint 单写策略守卫
//
// 背景：checkpoint 是全量现场（上下文消息 + 执行日志，MB 量级），长任务里每 5s 落一次。
// 曾经的「双写」（chrome.storage.local + IndexedDB）等于把同一份数据序列化两遍、写两块盘，
// 其中 storage.local 走 JSON + LevelDB（浏览器进程内执行），是长任务卡顿外溢到其他页面的
// 主要来源之一。现在改为：常规只写 IndexedDB，仅 IDB 写失败才回退 storage.local 兜底。
// 本测试防止「双写」被无意改回来。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const DB = readFileSync(new URL('../../src/storage/db.js', import.meta.url), 'utf8');

function sliceFunction(src, name) {
  const start = src.indexOf(`export async function ${name}(`);
  if (start < 0) return '';
  const rest = src.slice(start + 1);
  const nextExport = rest.indexOf('\nexport ');
  return nextExport < 0 ? rest : rest.slice(0, nextExport);
}

describe('ReAct checkpoint 单写策略', () => {
  const fn = sliceFunction(DB, 'saveReactCheckpoint');

  test('能定位到 saveReactCheckpoint 实现', () => {
    expect(fn).toContain('IndexedDB');
  });

  test('IndexedDB 写入发生在 chrome.storage.local 之前', () => {
    const idbIdx = fn.indexOf("withStore('reactCheckpoints'");
    const localIdx = fn.indexOf('chrome.storage.local.set');
    expect(idbIdx).toBeGreaterThan(-1);
    expect(localIdx).toBeGreaterThan(-1);
    expect(idbIdx).toBeLessThan(localIdx);
  });

  test('chrome.storage.local 只在 IndexedDB 失败时兜底写一次', () => {
    expect(fn).toMatch(/if \(idbOk\) return true;/);
    expect(fn.match(/chrome\.storage\.local\.set/g) || []).toHaveLength(1);
  });
});
