import { workflow, node, trigger, sticky, newCredential, switchCase, embeddings, expr, nodeJson } from '@n8n/workflow-sdk';

const toolWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /voice/tool',
    parameters: { httpMethod: 'POST', path: 'voice-agent/tool', responseMode: 'responseNode', options: {} },
    position: [220, 400]
  },
  output: [{ body: { action: 'search_knowledge', tenantId: '00000000-0000-0000-0000-000000000001', query: 'What are the visiting hours?' } }]
});

const normalizeInput = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Tool Call',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'action', name: 'action', value: expr('{{ $json.body?.action ?? $json.action ?? "search_knowledge" }}'), type: 'string' },
          { id: 'tenantId', name: 'tenantId', value: expr('{{ $json.body?.tenantId ?? $json.tenantId ?? "00000000-0000-0000-0000-000000000001" }}'), type: 'string' },
          { id: 'callId', name: 'callId', value: expr('{{ $json.body?.callId ?? $json.callId ?? "" }}'), type: 'string' },
          { id: 'query', name: 'query', value: expr('{{ $json.body?.query ?? $json.query ?? "" }}'), type: 'string' },
          { id: 'name', name: 'name', value: expr('{{ $json.body?.name ?? $json.name ?? "" }}'), type: 'string' },
          { id: 'phone', name: 'phone', value: expr('{{ $json.body?.phone ?? $json.phone ?? "" }}'), type: 'string' },
          { id: 'email', name: 'email', value: expr('{{ $json.body?.email ?? $json.email ?? "" }}'), type: 'string' },
          { id: 'datetime', name: 'datetime', value: expr('{{ $json.body?.datetime ?? $json.datetime ?? "" }}'), type: 'string' },
          { id: 'partySize', name: 'partySize', value: expr('{{ $json.body?.partySize ?? $json.partySize ?? 0 }}'), type: 'number' },
          { id: 'doctor', name: 'doctor', value: expr('{{ $json.body?.doctor ?? $json.doctor ?? "" }}'), type: 'string' },
          { id: 'notes', name: 'notes', value: expr('{{ $json.body?.notes ?? $json.notes ?? "" }}'), type: 'string' }
        ]
      }
    },
    position: [440, 400]
  },
  output: [{ action: 'search_knowledge', tenantId: '00000000-0000-0000-0000-000000000001', callId: '', query: 'What are the visiting hours?', name: '', phone: '', email: '', datetime: '', partySize: 0, doctor: '', notes: '' }]
});

const routeAction = switchCase({
  version: 3.4,
  config: {
    name: 'Route By Action',
    parameters: {
      mode: 'rules',
      rules: {
        values: [
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), rightValue: 'search_knowledge', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'search_knowledge' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), rightValue: 'check_availability', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'check_availability' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), rightValue: 'book_appointment', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'book_appointment' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), rightValue: 'make_reservation', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'make_reservation' },
          { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.action }}'), rightValue: 'capture_lead', operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: 'capture_lead' }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'transfer_or_unknown' }
    },
    position: [680, 400]
  }
});

// --- Branch 0: search_knowledge (RAG) ---
const geminiEmbeddings = embeddings({
  type: '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini',
  version: 1,
  config: {
    name: 'Gemini Embeddings',
    parameters: { modelName: 'models/gemini-embedding-001' },
    credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account', 'wSi9Z7qXWfRj5Zef') },
    position: [920, 120]
  }
});

const searchKnowledge = node({
  type: '@n8n/n8n-nodes-langchain.vectorStorePGVector',
  version: 1.3,
  config: {
    name: 'Search Knowledge Base',
    parameters: {
      mode: 'load',
      tableName: 'kb_vectors',
      prompt: nodeJson(normalizeInput, 'query'),
      topK: 5,
      includeDocumentMetadata: true,
      options: {
        distanceStrategy: 'cosine',
        columnNames: { values: { idColumnName: 'id', vectorColumnName: 'embedding', contentColumnName: 'text', metadataColumnName: 'metadata' } },
        metadata: { metadataValues: [{ name: 'tenant_id', value: nodeJson(normalizeInput, 'tenantId') }] }
      }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    subnodes: { embedding: geminiEmbeddings },
    position: [920, 40]
  },
  output: [{ document: { pageContent: 'Visiting hours are 10am to 7pm daily.', metadata: { title: 'Visiting Hours' } }, score: 0.91 }]
});

const formatKnowledge = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Format Knowledge Context',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: "const items = $input.all();\n"
        + "const parts = items.map(function(it){ const d = it.json.document || it.json; return (d.pageContent || d.text || ''); }).filter(Boolean);\n"
        + "const sources = items.map(function(it){ const d = it.json.document || it.json; return (d.metadata && d.metadata.title) || null; }).filter(Boolean);\n"
        + "return [{ json: { status: 'ok', action: 'search_knowledge', context: parts.join('\\n---\\n'), matches: parts.length, sources: sources } }];"
    },
    position: [1140, 40]
  },
  output: [{ status: 'ok', action: 'search_knowledge', context: 'Visiting hours are 10am to 7pm daily.', matches: 1, sources: ['Visiting Hours'] }]
});

const respondKnowledge = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Knowledge',
    parameters: { respondWith: 'json', responseBody: expr('{{ { "status": $json.status, "context": $json.context, "matches": $json.matches, "sources": $json.sources } }}'), options: {} },
    position: [1360, 40]
  }
});

// --- Branch 1: check_availability ---
const queryAvailability = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Query Availability',
    parameters: {
      operation: 'executeQuery',
      query: "SELECT id, resource_name, slot FROM availability WHERE tenant_id = $1::uuid AND is_booked = false AND slot > now() ORDER BY slot ASC LIMIT 5",
      options: { queryReplacement: expr('{{ [$json.tenantId] }}') }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [920, 240]
  },
  output: [{ id: 'slot-1', resource_name: 'Dr. Rao', slot: '2026-09-22T10:00:00Z' }]
});

const respondAvailability = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Availability', parameters: { respondWith: 'allIncomingItems', options: {} }, position: [1140, 240] }
});

// --- Branch 2: book_appointment ---
const insertAppointment = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Insert Appointment',
    parameters: {
      operation: 'executeQuery',
      query: "INSERT INTO bookings (tenant_id, call_id, type, customer_name, customer_phone, customer_email, scheduled_for, details) VALUES ($1::uuid, NULLIF($2,'')::uuid, 'appointment', $3, $4, $5, NULLIF($6,'')::timestamptz, $7::jsonb) RETURNING id, status",
      options: { queryReplacement: expr("{{ [$json.tenantId, ($json.callId || ''), $json.name, $json.phone, $json.email, ($json.datetime || ''), JSON.stringify({ doctor: $json.doctor, notes: $json.notes })] }}") }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [920, 400]
  },
  output: [{ id: 'booking-1', status: 'confirmed' }]
});

const respondAppointment = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Appointment', parameters: { respondWith: 'json', responseBody: expr('{{ { "status": "ok", "booking_id": $json.id, "message": "Your appointment is confirmed." } }}'), options: {} }, position: [1140, 400] }
});

// --- Branch 3: make_reservation ---
const insertReservation = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Insert Reservation',
    parameters: {
      operation: 'executeQuery',
      query: "INSERT INTO bookings (tenant_id, call_id, type, customer_name, customer_phone, party_size, scheduled_for, details) VALUES ($1::uuid, NULLIF($2,'')::uuid, 'reservation', $3, $4, $5, NULLIF($6,'')::timestamptz, $7::jsonb) RETURNING id, status",
      options: { queryReplacement: expr("{{ [$json.tenantId, ($json.callId || ''), $json.name, $json.phone, ($json.partySize || null), ($json.datetime || ''), JSON.stringify({ notes: $json.notes })] }}") }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [920, 560]
  },
  output: [{ id: 'reservation-1', status: 'confirmed' }]
});

const respondReservation = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Reservation', parameters: { respondWith: 'json', responseBody: expr('{{ { "status": "ok", "booking_id": $json.id, "message": "Your table reservation is confirmed." } }}'), options: {} }, position: [1140, 560] }
});

// --- Branch 4: capture_lead ---
const insertLead = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Insert Lead',
    parameters: {
      operation: 'executeQuery',
      query: "INSERT INTO leads (tenant_id, call_id, name, phone, email, data) VALUES ($1::uuid, NULLIF($2,'')::uuid, $3, $4, $5, $6::jsonb) RETURNING id, status",
      options: { queryReplacement: expr("{{ [$json.tenantId, ($json.callId || ''), $json.name, $json.phone, $json.email, JSON.stringify({ query: $json.query, notes: $json.notes })] }}") }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [920, 720]
  },
  output: [{ id: 'lead-1', status: 'new' }]
});

const respondLead = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Lead', parameters: { respondWith: 'json', responseBody: expr('{{ { "status": "ok", "lead_id": $json.id, "message": "Thanks, we have noted your details and will get back to you." } }}'), options: {} }, position: [1140, 720] }
});

// --- Branch 5 (fallback): transfer / unknown ---
const buildTransfer = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Build Transfer Response',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 's', name: 'status', value: 'transfer', type: 'string' },
          { id: 'm', name: 'message', value: 'Please hold while I connect you to a team member.', type: 'string' }
        ]
      }
    },
    position: [920, 880]
  },
  output: [{ status: 'transfer', message: 'Please hold while I connect you to a team member.' }]
});

const respondTransfer = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Transfer', parameters: { respondWith: 'json', responseBody: expr('{{ { "status": $json.status, "message": $json.message } }}'), options: {} }, position: [1140, 880] }
});

const note = sticky(
  '## Voice Agent Tool Server (core)\nPOST /webhook/voice-agent/tool with { action, tenantId, callId, ...args }.\nThe voice platform (Gemini Live / VAPI / telephony) calls this per function call. Routed by action: search_knowledge (pgvector RAG), check_availability, book_appointment, make_reservation, capture_lead, or human transfer.',
  [toolWebhook, normalizeInput, routeAction],
  { color: 5 }
);

export default workflow('voice-agent-tool-server', 'Voice Agent 2 — Tool Server (RAG + Actions)')
  .add(toolWebhook)
  .to(normalizeInput)
  .to(routeAction
    .onCase(0, searchKnowledge.to(formatKnowledge).to(respondKnowledge))
    .onCase(1, queryAvailability.to(respondAvailability))
    .onCase(2, insertAppointment.to(respondAppointment))
    .onCase(3, insertReservation.to(respondReservation))
    .onCase(4, insertLead.to(respondLead))
    .onCase(5, buildTransfer.to(respondTransfer)))
  .add(note);
