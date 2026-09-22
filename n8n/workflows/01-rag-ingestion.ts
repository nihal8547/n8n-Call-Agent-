import { workflow, node, trigger, sticky, newCredential, vectorStore, embeddings, documentLoader, textSplitter, expr, nodeJson } from '@n8n/workflow-sdk';

const ingestWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /ingest',
    parameters: { httpMethod: 'POST', path: 'voice-agent/ingest', responseMode: 'responseNode', options: {} },
    position: [240, 300]
  },
  output: [{ body: { tenantId: '00000000-0000-0000-0000-000000000001', title: 'Visiting Hours', text: 'Visiting hours are 10am to 7pm daily.' } }]
});

const normalizeInput = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Ingest Input',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'tenant', name: 'tenantId', value: expr('{{ $json.body?.tenantId ?? $json.tenantId ?? "00000000-0000-0000-0000-000000000001" }}'), type: 'string' },
          { id: 'title', name: 'title', value: expr('{{ $json.body?.title ?? $json.title ?? "Untitled" }}'), type: 'string' },
          { id: 'source', name: 'source', value: expr('{{ $json.body?.source ?? $json.source ?? "dashboard" }}'), type: 'string' },
          { id: 'text', name: 'text', value: expr('{{ $json.body?.text ?? $json.text ?? "" }}'), type: 'string' }
        ]
      }
    },
    position: [460, 300]
  },
  output: [{ tenantId: '00000000-0000-0000-0000-000000000001', title: 'Visiting Hours', source: 'dashboard', text: 'Visiting hours are 10am to 7pm daily.' }]
});

const geminiEmbeddings = embeddings({
  type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini',
  version: 1,
  config: {
    name: 'Gemini Embeddings',
    parameters: { modelName: 'models/gemini-embedding-001' },
    credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account', 'wSi9Z7qXWfRj5Zef') },
    position: [680, 480]
  }
});

const chunkSplitter = textSplitter({
  type: '@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter',
  version: 1,
  config: { name: 'Chunk Splitter', parameters: { chunkSize: 800, chunkOverlap: 120, options: {} }, position: [900, 620] }
});

const dataLoader = documentLoader({
  type: '@n8n/n8n-nodes-langchain.documentDefaultDataLoader',
  version: 1.1,
  config: {
    name: 'Load Knowledge Text',
    parameters: {
      dataType: 'json',
      jsonMode: 'expressionData',
      jsonData: nodeJson(normalizeInput, 'text'),
      textSplittingMode: 'custom',
      options: {
        metadata: {
          metadataValues: [
            { name: 'tenant_id', value: nodeJson(normalizeInput, 'tenantId') },
            { name: 'title', value: nodeJson(normalizeInput, 'title') },
            { name: 'source', value: nodeJson(normalizeInput, 'source') }
          ]
        }
      }
    },
    subnodes: { textSplitter: chunkSplitter },
    position: [680, 620]
  }
});

const storeChunks = vectorStore({
  type: '@n8n/n8n-nodes-langchain.vectorStorePGVector',
  version: 1.3,
  config: {
    name: 'Store Chunks In PGVector',
    parameters: {
      mode: 'insert',
      tableName: 'kb_vectors',
      options: { columnNames: { values: { idColumnName: 'id', vectorColumnName: 'embedding', contentColumnName: 'text', metadataColumnName: 'metadata' } } }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    subnodes: { embedding: geminiEmbeddings, documentLoader: dataLoader },
    position: [680, 300]
  },
  output: [{ inserted: true }]
});

const respondIngest = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Indexed',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ { "status": "indexed", "tenantId": $(\"Normalize Ingest Input\").item.json.tenantId, "title": $(\"Normalize Ingest Input\").item.json.title } }}'),
      options: {}
    },
    position: [960, 300]
  }
});

const note = sticky(
  '## RAG Knowledge Ingestion\nPOST /webhook/voice-agent/ingest with { tenantId, title, source, text }.\nText is chunked, embedded with Gemini and upserted into the pgvector table `kb_vectors`, tagged with tenant_id metadata for multi-tenant isolation.',
  [ingestWebhook, normalizeInput, storeChunks, respondIngest],
  { color: 3 }
);

export default workflow('voice-agent-rag-ingestion', 'Voice Agent 1 — RAG Knowledge Ingestion')
  .add(ingestWebhook)
  .to(normalizeInput)
  .to(storeChunks)
  .to(respondIngest)
  .add(note);
