// agent/src/rag/store/vectra.js - VectraStore 适配器（对照 vectra@0.15.0 真实 API，已实测验证）
// 关键约束：
//   1. createIndex 对已存在索引会抛错 → ensureCreated 先判 isIndexCreated
//   2. 无批量 upsert API → beginUpdate/endUpdate 事务包裹逐条 upsertItem（否则每条一次落盘）
//   3. 无按元数据删除 API → listItemsByMetadata + deleteItems 两步
//   4. queryItems 为位置参数签名 (vector, query, topK, filter?, isBm25?)；query 仅 BM25 路径使用
//   5. metadata 中记录 documentId/startPos/endPos，为 BM25 混合检索预留（原始文档备份见 documents/）

import { LocalIndex } from 'vectra';
import { join } from 'path';
import { RAG_ROOT } from '../config.js';

export class VectraStore {
  /**
   * @param {string} collectionId - 知识库 ID（目录名）
   */
  constructor(collectionId) {
    this.folderPath = join(RAG_ROOT, collectionId);
    this.index = new LocalIndex(this.folderPath);
  }

  /**
   * 确保索引已创建（幂等）
   */
  async ensureCreated() {
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex({ version: 1, deleteIfExists: false });
    }
  }

  /**
   * 事务批量写入一个文档的全部分块
   * @param {string} documentId
   * @param {Array<{text: string, startPos: number, endPos: number}>} chunks
   * @param {number[][]} embeddings - 与 chunks 一一对应
   * @param {object} metadata - 附加到每个分块的元数据（documentName 等）
   */
  async upsertChunks(documentId, chunks, embeddings, metadata = {}) {
    await this.ensureCreated();
    await this.index.beginUpdate();
    try {
      for (let i = 0; i < chunks.length; i++) {
        await this.index.upsertItem({
          id: `${documentId}_chunk_${i}`,
          vector: embeddings[i],
          metadata: {
            documentId,
            chunkIndex: i,
            totalChunks: chunks.length,
            text: chunks[i].text,
            startPos: chunks[i].startPos,
            endPos: chunks[i].endPos,
            ...metadata,
          },
        });
      }
      await this.index.endUpdate();
    } catch (err) {
      this.index.cancelUpdate();
      throw err;
    }
  }

  /**
   * 向量检索
   * @param {number[]} queryVector
   * @param {string} [queryText] - 仅 BM25 路径使用
   * @param {{topK?: number, filter?: object, isBm25?: boolean}} [options]
   * @returns {Promise<Array<{id: string, content: string, metadata: object, score: number}>>}
   */
  async search(queryVector, queryText = '', { topK = 5, filter, isBm25 = false } = {}) {
    const results = await this.index.queryItems(queryVector, queryText, topK, filter, isBm25);
    // 统一返回结构 + 空值兜底；score 为归一化余弦相似度（[-1,1]），不做截断
    return (results || []).map(r => ({
      id: r.item?.id,
      content: r.item?.metadata?.text || '',
      metadata: r.item?.metadata || {},
      score: r.score ?? 0,
    }));
  }

  /**
   * 列出一个文档的所有分块（按 chunkIndex 排序）
   * @param {string} documentId
   */
  async listDocumentChunks(documentId) {
    const items = await this.index.listItemsByMetadata({ documentId });
    return items
      .map(i => ({ id: i.id, metadata: i.metadata, score: 0 }))
      .sort((a, b) => (a.metadata?.chunkIndex ?? 0) - (b.metadata?.chunkIndex ?? 0));
  }

  /**
   * 删除一个文档的所有分块
   * @param {string} documentId
   * @returns {Promise<number>} 删除的分块数
   */
  async removeDocument(documentId) {
    const items = await this.index.listItemsByMetadata({ documentId });
    if (items.length === 0) return 0;
    await this.index.deleteItems(items.map(i => i.id));
    return items.length;
  }

  /**
   * 获取全部条目（id + metadata，不含向量）
   * 用于统计与文档聚合；超过 10 万分块的大库建议外接方案
   */
  async listAllItems() {
    const items = await this.index.listItems();
    return items.map(i => ({ id: i.id, metadata: i.metadata }));
  }

  /**
   * 清空索引并重建（模型变更后强制重建时使用；调用方已确认需要）
   */
  async recreate() {
    await this.index.createIndex({ version: 1, deleteIfExists: true });
  }
}
