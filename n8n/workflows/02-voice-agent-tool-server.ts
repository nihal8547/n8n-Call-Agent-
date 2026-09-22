import { workflow, node, trigger, sticky, newCredential, switchCase, expr } from '@n8n/workflow-sdk';

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

// --- Branch 0: search_knowledge (RAG, no pgvector) ---
// Gemini embed query (HTTP) -> fetch kb_docs -> cosine similarity in Code.
const embedQueryKB = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: {
    name: 'Embed Query KB',
    parameters: {
      method: 'POST',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googlePalmApi',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ { "model": "models/gemini-embedding-001", "content": { "parts": [ { "text": $json.query } ] } } }}')
    },
    credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 2', 'llfQcbvug44jx5vx') },
    position: [900, 40]
  },
  output: [{ embedding: { values: [0.01, 0.02, 0.03] } }]
});

const fetchKBChunks = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Fetch KB Chunks',
    parameters: {
      operation: 'executeQuery',
      query: 'SELECT id, title, content, embedding FROM kb_docs WHERE tenant_id = $1::uuid',
      options: { queryReplacement: expr('{{ [$("Normalize Tool Call").item.json.tenantId] }}') }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [1100, 40]
  },
  output: [{ id: 'doc-1', title: 'Visiting Hours', content: 'Visiting hours are 10am to 7pm every day.', embedding: [0.01, 0.02, 0.03] }]
});

const formatKnowledge = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Rank KB Chunks',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: "const q = $('Embed Query KB').first().json.embedding.values;\n"
        + "const rows = $input.all();\n"
        + "function cos(a, b) { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / ((Math.sqrt(na) * Math.sqrt(nb)) || 1); }\n"
        + "const scored = rows.map(function (r) { let e = r.json.embedding; if (typeof e === 'string') { e = JSON.parse(e); } return { title: r.json.title, content: r.json.content, score: Number(cos(q, e).toFixed(4)) }; });\n"
        + "scored.sort(function (a, b) { return b.score - a.score; });\n"
        + "const top = scored.slice(0, 3);\n"
        + "return [{ json: { status: 'ok', action: 'search_knowledge', matches: top.length, context: top.map(function (t) { return t.content; }).join('\\n---\\n'), sources: top.map(function (t) { return t.title; }) } }];"
    },
    position: [1300, 120]
  },
  output: [{ status: 'ok', action: 'search_knowledge', context: 'Visiting hours are 10am to 7pm every day.', matches: 1, sources: ['Visiting Hours'] }]
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
  '## Voice Agent Tool Server (core)\nPOST /webhook/voice-agent/tool with { action, tenantId, callId, ...args }.\nThe voice platform (Gemini Live / VAPI / telephony) calls this per function call. Routed by action: search_knowledge (RAG over kb_docs, no pgvector needed), check_availability, book_appointment, make_reservation, capture_lead, or human transfer.',
  [toolWebhook, normalizeInput, routeAction],
  { color: 5 }
);

export default workflow('voice-agent-tool-server', 'Voice Agent 2 — Tool Server (RAG + Actions)')
  .add(toolWebhook)
  .to(normalizeInput)
  .to(routeAction
    .onCase(0, embedQueryKB.to(fetchKBChunks).to(formatKnowledge).to(respondKnowledge))
    .onCase(1, queryAvailability.to(respondAvailability))
    .onCase(2, insertAppointment.to(respondAppointment))
    .onCase(3, insertReservation.to(respondReservation))
    .onCase(4, insertLead.to(respondLead))
    .onCase(5, buildTransfer.to(respondTransfer)))
  .add(note);
