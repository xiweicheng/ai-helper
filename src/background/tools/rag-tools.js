// rag-tools - RAG knowledge base tool definitions (3-in-1)
// Backed by agent /api/rag/* endpoints (vectra index + transformers embedding)
// Dynamically registered only when ragEnabled=true && agent /api/status ragAvailable=true

export const RAG_TOOLS = [
  {
    id: 'knowledge_search',
    category: 'knowledge',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'knowledge_search',
      description: 'Search knowledge bases for relevant information. Use when you need factual grounding or the user asks about specific topics.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          collectionId: { type: 'string', description: 'Knowledge base ID; omit to search all' },
          topK: { type: 'integer', description: 'Number of results to return, default 5' }
        },
        required: ['query']
      }
    }
  },
  {
    id: 'knowledge_ingest',
    category: 'knowledge',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'knowledge_ingest',
      description: 'Ingest a document or text into a knowledge base for future retrieval. Use knowledge_list first to get the collectionId.',
      parameters: {
        type: 'object',
        properties: {
          collectionId: { type: 'string', description: 'Target knowledge base ID (from knowledge_list)' },
          type: { type: 'string', enum: ['text', 'file', 'url'], description: 'Source type: text (raw content), file (local file path), url (web page)' },
          content: { type: 'string', description: 'Raw text, local file path, or URL depending on type' },
          name: { type: 'string', description: 'Optional document name for display' },
          metadata: { type: 'object', description: 'Optional metadata to attach to chunks' }
        },
        required: ['collectionId', 'type', 'content']
      }
    }
  },
  {
    id: 'knowledge_list',
    category: 'knowledge',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'knowledge_list',
      description: 'List available knowledge bases and their document counts',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
];
