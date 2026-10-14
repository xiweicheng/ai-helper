// agent/src/memory/vectors.js - 记忆向量的派生缓存
// 原则：global-memory.json 是唯一真源，本文件只缓存派生向量。文件可丢、可坏、可整目录删除，
// 任何异常都必须被吞掉当成空缓存（召回随之回落关键词通道），绝不能把 recall 带崩或带抛。
// 跨模型向量不可比：modelKey（mode|modelName|dimensions）任一变化即整体作废旧向量。

import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { MEMORY_DIR } from '../config.js';

export const VECTORS_FILE = join(MEMORY_DIR, 'memory-vectors.json');

/** 模型标识：mode|model|dimensions。缺字段也拼成稳定串，不留 undefined 参与比较。 */
export function memoryModelKey(cfg = {}) {
  const c = cfg || {};
  return `${c.mode || ''}|${c.modelName || ''}|${Number(c.dimensions) > 0 ? Math.floor(Number(c.dimensions)) : 0}`;
}

/**
 * 余弦相似度。零向量、长度不一致、非有限数一律返回 0（不可比 ≠ 相似）。
 */
export function cosine(a = [], b = []) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (!na || !nb) return 0;
  // 合并开方：分开写 sqrt(na)*sqrt(nb) 会带出浮点误差（sqrt(2)*sqrt(2)=2.0000000000000004），
  // 自相似度算出 0.9999999999999998，阀值比较与展示都会飘。
  const denom = Math.sqrt(na * nb);
  return denom ? dot / denom : 0;
}

/** 只接受「非空 + 全有限数」的向量入库，NaN/Infinity 一旦落盘会污染整个相似度排序 */
function isUsableVector(vec) {
  return Array.isArray(vec) && vec.length > 0 && vec.every((n) => Number.isFinite(n));
}

/**
 * 缓存门面（filePath 可注入，便于单测与临时 HOME 冒烟；进程内可创建多个实例互不干扰）
 */
export function createVectorStoreFacade({ filePath = VECTORS_FILE } = {}) {
  // 串行链：读-改-写不能交叉，否则并发 upsert 会互相覆盖（与 service 的写锁同一思路）
  let chain = Promise.resolve();
  const serialized = (task) => {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  };

  async function readRaw() {
    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.vectors || typeof parsed.vectors !== 'object') {
        return { modelKey: '', vectors: {} };
      }
      return {
        modelKey: typeof parsed.modelKey === 'string' ? parsed.modelKey : '',
        vectors: parsed.vectors
      };
    } catch {
      // 文件缺失 / JSON 损坏 / 权限问题：派生缓存视为空，下次使用时重建
      return { modelKey: '', vectors: {} };
    }
  }

  async function writeRaw(payload) {
    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(payload), 'utf-8');
      return { success: true };
    } catch (err) {
      console.warn('[Memory] vectors write failed:', err?.message);
      return { success: false, error: err?.message || 'vectors_write_failed' };
    }
  }

  return {
    filePath,
    read: () => serialized(readRaw),
    write: (payload) => serialized(() => writeRaw(payload)),

    /** 批量写入向量；modelKey 与已存不同时整体作废 */
    upsertVectors: (entries, modelKey) => serialized(async () => {
      const cur = await readRaw();
      const vectors = cur.modelKey === modelKey ? cur.vectors : {};
      for (const [id, vec] of entries || []) {
        if (isUsableVector(vec)) vectors[id] = vec;
      }
      return writeRaw({ modelKey, vectors });
    }),

    /** 摘除指定 id（记忆删除/淘汰时同步调用，避免留下孤儿向量） */
    dropVectors: (ids) => serialized(async () => {
      const cur = await readRaw();
      let touched = false;
      for (const id of ids || []) {
        if (id in cur.vectors) {
          delete cur.vectors[id];
          touched = true;
        }
      }
      if (!touched) return { success: true, skipped: true };
      return writeRaw(cur);
    }),

    /** 整体作废（reindex 端点用） */
    clear: () => serialized(() => writeRaw({ modelKey: '', vectors: {} })),
  };
}

// ==================== 默认路径便捷出口（进程级单例） ====================

const defaultStore = createVectorStoreFacade();

export const readVectors = () => defaultStore.read();
export const writeVectors = (payload) => defaultStore.write(payload);
export const upsertVectors = (entries, modelKey) => defaultStore.upsertVectors(entries, modelKey);
export const dropVectors = (ids) => defaultStore.dropVectors(ids);
export const clearVectors = () => defaultStore.clear();
