import { workflow, node, trigger, sticky, newCredential, expr } from '@n8n/workflow-sdk';

const CORS = { entries: [{ name: 'Access-Control-Allow-Origin', value: '*' }] };
const PG = { postgres: newCredential('Postgres account', 'VMIeqA8K3WV79fDr') };

// ── Route 1: GET /api/calls ──────────────────────────────
const callsWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'GET /api/calls', parameters: { httpMethod: 'GET', path: 'voice-agent/api/calls', responseMode: 'responseNode', options: {} }, position: [220, 120] },
  output: [{ query: { tenantId: '00000000-0000-0000-0000-000000000001' } }]
});
const queryCalls = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'List Calls',
    parameters: {
      operation: 'executeQuery',
      query: "SELECT id, from_number, status, duration_sec, recording_url, summary, intent, outcome, escalated, started_at, ended_at FROM calls WHERE tenant_id = $1::uuid ORDER BY started_at DESC LIMIT 100",
      options: { queryReplacement: expr('{{ [$json.query?.tenantId || "00000000-0000-0000-0000-000000000001"] }}') }
    },
    credentials: PG,
    position: [460, 120]
  },
  output: [{ id: 'call-1', from_number: '+91900', status: 'completed' }]
});
const respondCalls = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Calls', parameters: { respondWith: 'allIncomingItems', options: { responseHeaders: CORS } }, position: [700, 120] }
});

// ── Route 2: GET /api/call (detail + transcript) ─────────
const callDetailWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'GET /api/call', parameters: { httpMethod: 'GET', path: 'voice-agent/api/call', responseMode: 'responseNode', options: {} }, position: [220, 300] },
  output: [{ query: { callId: 'call-1' } }]
});
const queryCallDetail = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Get Call Detail',
    parameters: {
      operation: 'executeQuery',
      query: "SELECT c.*, COALESCE((SELECT json_agg(t ORDER BY t.created_at) FROM turns t WHERE t.call_id = c.id), '[]'::json) AS turns, COALESCE((SELECT json_agg(b) FROM bookings b WHERE b.call_id = c.id), '[]'::json) AS bookings, COALESCE((SELECT json_agg(n) FROM notifications n WHERE n.call_id = c.id), '[]'::json) AS notifications FROM calls c WHERE c.id = NULLIF($1,'')::uuid",
      options: { queryReplacement: expr('{{ [$json.query?.callId || ""] }}') }
    },
    credentials: PG,
    position: [460, 300]
  },
  output: [{ id: 'call-1', transcript: '...', turns: [] }]
});
const respondCallDetail = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Call Detail', parameters: { respondWith: 'firstIncomingItem', options: { responseHeaders: CORS } }, position: [700, 300] }
});

// ── Route 3: GET /api/stats ──────────────────────────────
const statsWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'GET /api/stats', parameters: { httpMethod: 'GET', path: 'voice-agent/api/stats', responseMode: 'responseNode', options: {} }, position: [220, 480] },
  output: [{ query: { tenantId: '00000000-0000-0000-0000-000000000001' } }]
});
const queryStats = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Get Stats',
    parameters: {
      operation: 'executeQuery',
      query: "SELECT count(*) AS total_calls, count(*) FILTER (WHERE escalated) AS escalated, count(*) FILTER (WHERE status = 'completed') AS completed, COALESCE(avg(duration_sec), 0)::int AS avg_duration_sec, (SELECT count(*) FROM bookings WHERE tenant_id = $1::uuid) AS bookings, (SELECT count(*) FROM leads WHERE tenant_id = $1::uuid) AS leads FROM calls WHERE tenant_id = $1::uuid",
      options: { queryReplacement: expr('{{ [$json.query?.tenantId || "00000000-0000-0000-0000-000000000001"] }}') }
    },
    credentials: PG,
    position: [460, 480]
  },
  output: [{ total_calls: 12, completed: 10, escalated: 1, avg_duration_sec: 95, bookings: 6, leads: 3 }]
});
const respondStats = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Stats', parameters: { respondWith: 'firstIncomingItem', options: { responseHeaders: CORS } }, position: [700, 480] }
});

// ── Route 4: GET /api/notifications ──────────────────────
const notifWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'GET /api/notifications', parameters: { httpMethod: 'GET', path: 'voice-agent/api/notifications', responseMode: 'responseNode', options: {} }, position: [220, 660] },
  output: [{ query: { tenantId: '00000000-0000-0000-0000-000000000001' } }]
});
const queryNotif = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'List Notifications',
    parameters: {
      operation: 'executeQuery',
      query: "SELECT n.id, n.channel, n.recipient, n.status, n.provider_message_id, n.created_at, c.from_number FROM notifications n LEFT JOIN calls c ON c.id = n.call_id WHERE n.tenant_id = $1::uuid ORDER BY n.created_at DESC LIMIT 100",
      options: { queryReplacement: expr('{{ [$json.query?.tenantId || "00000000-0000-0000-0000-000000000001"] }}') }
    },
    credentials: PG,
    position: [460, 660]
  },
  output: [{ id: 'notif-1', channel: 'whatsapp', status: 'sent' }]
});
const respondNotif = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Notifications', parameters: { respondWith: 'allIncomingItems', options: { responseHeaders: CORS } }, position: [700, 660] }
});

// ── Route 5: POST /api/tenant-config (upsert) ────────────
const configWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: { name: 'POST /api/tenant-config', parameters: { httpMethod: 'POST', path: 'voice-agent/api/tenant-config', responseMode: 'responseNode', options: {} }, position: [220, 840] },
  output: [{ body: { tenantId: '00000000-0000-0000-0000-000000000001', template: 'restaurant', systemPrompt: 'You are the host...', greeting: 'Welcome!' } }]
});
const upsertConfig = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Upsert Agent Config',
    parameters: {
      operation: 'executeQuery',
      query: "WITH up AS (UPDATE agent_configs SET template = $2, system_prompt = $3, greeting = $4, updated_at = now() WHERE tenant_id = $1::uuid RETURNING id) INSERT INTO agent_configs (tenant_id, template, system_prompt, greeting) SELECT $1::uuid, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM up) RETURNING id",
      options: { queryReplacement: expr('{{ [$json.body?.tenantId || "00000000-0000-0000-0000-000000000001", $json.body?.template || "generic", $json.body?.systemPrompt || "", $json.body?.greeting || ""] }}') }
    },
    credentials: PG,
    position: [460, 840]
  },
  output: [{ id: 'cfg-1' }]
});
const respondConfig = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Respond Config', parameters: { respondWith: 'json', responseBody: expr('{{ { "status": "saved" } }}'), options: { responseHeaders: CORS } }, position: [700, 840] }
});

const note = sticky(
  '## Dashboard Backend API (for Nuxt)\nJSON endpoints the Nuxt dashboard consumes:\n- GET /webhook/voice-agent/api/calls?tenantId=\n- GET /webhook/voice-agent/api/call?callId=  (detail + transcript + bookings + notifications)\n- GET /webhook/voice-agent/api/stats?tenantId=\n- GET /webhook/voice-agent/api/notifications?tenantId=\n- POST /webhook/voice-agent/api/tenant-config  (upsert agent config)\nAll responses send CORS headers so the Nuxt app can call them directly.',
  [callsWebhook, queryCalls, respondCalls],
  { color: 7 }
);

export default workflow('voice-agent-dashboard-api', 'Voice Agent 4 — Dashboard Backend API')
  .add(callsWebhook).to(queryCalls).to(respondCalls)
  .add(callDetailWebhook).to(queryCallDetail).to(respondCallDetail)
  .add(statsWebhook).to(queryStats).to(respondStats)
  .add(notifWebhook).to(queryNotif).to(respondNotif)
  .add(configWebhook).to(upsertConfig).to(respondConfig)
  .add(note);
