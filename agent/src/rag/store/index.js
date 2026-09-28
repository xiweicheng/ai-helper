// agent/src/rag/store/index.js - VectorStore 统一接口
// 当前仅 Vectra 适配器；外接后端（Qdrant 等）在 Phase 2 通过 RAGAdapter 提供

export { VectraStore } from './vectra.js';

/**
 * 从知识库 ID 创建向量存储实例
 * @param {string} collectionId
 * @returns {import('./vectra.js').VectraStore}
 */
export async function createVectorStore(collectionId) {
  const { VectraStore } = await import('./vectra.js');
  return new VectraStore(collectionId);
}
