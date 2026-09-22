import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const PG = { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') };
const GEMINI = { googlePalmApi: newCredential('Google Gemini(PaLM) Api account', 'wSi9Z7qXWfRj5Zef') };
const EMBED_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';

// ── Setup: create the plain-Postgres knowledge table (run once) ──
const setupTrigger = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run Once To Create kb_docs', position: [240, 80] },
  output: [{}]
});
const ensureTable = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Create kb_docs Table',
    parameters: {
      operation: 'executeQuery',
      query: 'CREATE TABLE IF NOT EXISTS kb_docs (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  tenant_id uuid NOT NULL,\n  title text,\n  content text NOT NULL,\n  embedding jsonb NOT NULL,\n  created_at timestamptz NOT NULL DEFAULT now()\n);\nCREATE INDEX IF NOT EXISTS kb_docs_tenant_idx ON kb_docs (tenant_id);'
    },
    credentials: PG,
    position: [460, 80]
  },
  output: [{ success: true }]
});

// ── Ingest route: embed text with Gemini, store as jsonb ──
const ingestWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'POST /ragdemo/ingest', parameters: { httpMethod: 'POST', path: 'ragdemo/ingest', responseMode: 'responseNode', options: {} }, position: [240, 300] },
  output: [{ body: { tenantId: '00000000-0000-0000-0000-000000000001', title: 'Visiting Hours', text: 'Visiting hours are 10am to 7pm every day.' } }]
});
const normalizeIngest = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Ingest',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 't', name: 'tenantId', value: expr('{{ $json.body?.tenantId ?? $json.tenantId ?? "00000000-0000-0000-0000-000000000001" }}'), type: 'string' },
          { id: 'ti', name: 'title', value: expr('{{ $json.body?.title ?? $json.title ?? "Untitled" }}'), type: 'string' },
          { id: 'tx', name: 'text', value: expr('{{ $json.body?.text ?? $json.text ?? "" }}'), type: 'string' }
        ]
      }
    },
    position: [460, 300]
  },
  output: [{ tenantId: '00000000-0000-0000-0000-000000000001', title: 'Visiting Hours', text: 'Visiting hours are 10am to 7pm every day.' }]
});
const embedText = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Embed Text',
    parameters: {
      method: 'POST',
      url: EMBED_URL,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googlePalmApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { "model": "models/gemini-embedding-001", "content": { "parts": [ { "text": $json.text } ] } } }}')
    },
    credentials: GEMINI,
    position: [680, 300]
  },
  output: [{ embedding: { values: [0.01, 0.02, 0.03] } }]
});
const insertDoc = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Store Doc',
    parameters: {
      operation: 'executeQuery',
      query: 'INSERT INTO kb_docs (tenant_id, title, content, embedding) VALUES ($1::uuid, $2, $3, $4::jsonb) RETURNING id',
      options: { queryReplacement: expr('{{ [$("Normalize Ingest").item.json.tenantId, $("Normalize Ingest").item.json.title, $("Normalize Ingest").item.json.text, JSON.stringify($json.embedding.values)] }}') }
    },
    credentials: PG,
    position: [900, 300]
  },
  output: [{ id: 'doc-1' }]
});
const respondIngest = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Indexed', parameters: { respondWith: 'json', responseBody: expr('{{ { "status": "indexed", "id": $json.id, "title": $("Normalize Ingest").item.json.title } }}'), options: {} }, position: [1120, 300] }
});

// ── Search route: embed query, fetch, cosine similarity in Code ──
const searchWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'POST /ragdemo/search', parameters: { httpMethod: 'POST', path: 'ragdemo/search', responseMode: 'responseNode', options: {} }, position: [240, 560] },
  output: [{ body: { tenantId: '00000000-0000-0000-0000-000000000001', query: 'what time can I visit?' } }]
});
const normalizeSearch = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Search',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 't', name: 'tenantId', value: expr('{{ $json.body?.tenantId ?? $json.tenantId ?? "00000000-0000-0000-0000-000000000001" }}'), type: 'string' },
          { id: 'q', name: 'query', value: expr('{{ $json.body?.query ?? $json.query ?? "" }}'), type: 'string' }
        ]
      }
    },
    position: [460, 560]
  },
  output: [{ tenantId: '00000000-0000-0000-0000-000000000001', query: 'what time can I visit?' }]
});
const embedQuery = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Embed Query',
    parameters: {
      method: 'POST',
      url: EMBED_URL,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googlePalmApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { "model": "models/gemini-embedding-001", "content": { "parts": [ { "text": $json.query } ] } } }}')
    },
    credentials: GEMINI,
    position: [680, 560]
  },
  output: [{ embedding: { values: [0.01, 0.02, 0.03] } }]
});
const fetchChunks = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Fetch Chunks',
    parameters: {
      operation: 'executeQuery',
      query: 'SELECT id, title, content, embedding FROM kb_docs WHERE tenant_id = $1::uuid',
      options: { queryReplacement: expr('{{ [$("Normalize Search").item.json.tenantId] }}') }
    },
    credentials: PG,
    position: [900, 560]
  },
  output: [{ id: 'doc-1', title: 'Visiting Hours', content: 'Visiting hours are 10am to 7pm every day.', embedding: [0.01, 0.02, 0.03] }]
});
const rankChunks = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Cosine Similarity Top-K',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: "const q = $('Embed Query').first().json.embedding.values;\n"
        + "const rows = $input.all();\n"
        + "function cos(a, b) { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / ((Math.sqrt(na) * Math.sqrt(nb)) || 1); }\n"
        + "const scored = rows.map(function (r) { let e = r.json.embedding; if (typeof e === 'string') { e = JSON.parse(e); } return { title: r.json.title, content: r.json.content, score: Number(cos(q, e).toFixed(4)) }; });\n"
        + "scored.sort(function (a, b) { return b.score - a.score; });\n"
        + "const top = scored.slice(0, 3);\n"
        + "return [{ json: { status: 'ok', matches: top.length, context: top.map(function (t) { return t.content; }).join('\\n---\\n'), top: top } }];"
    },
    position: [1120, 560]
  },
  output: [{ status: 'ok', matches: 1, context: 'Visiting hours are 10am to 7pm every day.', top: [{ title: 'Visiting Hours', score: 0.87 }] }]
});
const respondSearch = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Search', parameters: { respondWith: 'json', responseBody: expr('{{ { "status": $json.status, "matches": $json.matches, "context": $json.context, "top": $json.top } }}'), options: {} }, position: [1340, 560] }
});

const note = sticky(
  '## RAG Demo — no pgvector needed\nWorks on any plain PostgreSQL (e.g. DigitalOcean). Embeddings from Gemini are stored in a JSONB column; cosine similarity is computed in a Code node.\n1) Run the manual trigger once to create kb_docs.\n2) POST /webhook/ragdemo/ingest { tenantId, title, text }.\n3) POST /webhook/ragdemo/search { tenantId, query } -> returns the most similar content.\nFor production scale, switch to pgvector; this proves the RAG loop without it.',
  [setupTrigger, ensureTable, ingestWebhook, searchWebhook],
  { color: 3 }
);

export default workflow('voice-agent-rag-demo', 'Voice Agent RAG Demo — no pgvector')
  .add(setupTrigger).to(ensureTable)
  .add(ingestWebhook).to(normalizeIngest).to(embedText).to(insertDoc).to(respondIngest)
  .add(searchWebhook).to(normalizeSearch).to(embedQuery).to(fetchChunks).to(rankChunks).to(respondSearch)
  .add(note);
