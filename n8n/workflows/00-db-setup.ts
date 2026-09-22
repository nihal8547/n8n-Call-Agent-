import { workflow, node, trigger, sticky, newCredential } from '@n8n/workflow-sdk';

const startTrigger = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Run Once To Set Up DB', position: [240, 300] },
  output: [{}]
});

const createSchema = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Create Extensions, Tables & Seed',
    parameters: {
      operation: 'executeQuery',
      query:
        'CREATE EXTENSION IF NOT EXISTS vector;\n'
        + 'CREATE EXTENSION IF NOT EXISTS pgcrypto;\n\n'
        + 'CREATE TABLE IF NOT EXISTS tenants (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  name text NOT NULL,\n'
        + "  sector text NOT NULL DEFAULT 'generic',\n"
        + "  status text NOT NULL DEFAULT 'active',\n"
        + "  settings jsonb NOT NULL DEFAULT '{}'::jsonb,\n"
        + '  created_at timestamptz NOT NULL DEFAULT now()\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS agent_configs (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,\n'
        + "  template text NOT NULL DEFAULT 'generic',\n"
        + "  system_prompt text NOT NULL DEFAULT '',\n"
        + '  greeting text,\n'
        + "  tools jsonb NOT NULL DEFAULT '[]'::jsonb,\n"
        + "  voice jsonb NOT NULL DEFAULT '{}'::jsonb,\n"
        + "  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,\n"
        + "  languages text[] NOT NULL DEFAULT ARRAY['en'],\n"
        + '  updated_at timestamptz NOT NULL DEFAULT now()\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS phone_numbers (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,\n'
        + '  e164 text NOT NULL UNIQUE,\n'
        + "  provider text NOT NULL DEFAULT 'twilio',\n"
        + '  agent_config_id uuid REFERENCES agent_configs(id),\n'
        + '  created_at timestamptz NOT NULL DEFAULT now()\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS documents (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,\n'
        + '  title text NOT NULL,\n'
        + '  source text,\n'
        + "  status text NOT NULL DEFAULT 'pending',\n"
        + '  created_at timestamptz NOT NULL DEFAULT now()\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS calls (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,\n'
        + '  from_number text,\n'
        + '  to_number text,\n'
        + '  provider text,\n'
        + "  status text NOT NULL DEFAULT 'active',\n"
        + '  duration_sec int,\n'
        + '  recording_url text,\n'
        + '  transcript text,\n'
        + '  summary text,\n'
        + '  intent text,\n'
        + '  sentiment text,\n'
        + '  outcome text,\n'
        + '  escalated boolean NOT NULL DEFAULT false,\n'
        + '  started_at timestamptz NOT NULL DEFAULT now(),\n'
        + '  ended_at timestamptz\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS turns (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,\n'
        + '  tenant_id uuid,\n'
        + '  role text NOT NULL,\n'
        + '  content text NOT NULL,\n'
        + '  rag_citations jsonb,\n'
        + '  latency_ms int,\n'
        + '  created_at timestamptz NOT NULL DEFAULT now()\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS bookings (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,\n'
        + '  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,\n'
        + "  type text NOT NULL DEFAULT 'appointment',\n"
        + '  customer_name text,\n'
        + '  customer_phone text,\n'
        + '  customer_email text,\n'
        + '  party_size int,\n'
        + '  scheduled_for timestamptz,\n'
        + "  details jsonb NOT NULL DEFAULT '{}'::jsonb,\n"
        + "  status text NOT NULL DEFAULT 'confirmed',\n"
        + '  created_at timestamptz NOT NULL DEFAULT now()\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS leads (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,\n'
        + '  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,\n'
        + '  name text,\n'
        + '  phone text,\n'
        + '  email text,\n'
        + "  data jsonb NOT NULL DEFAULT '{}'::jsonb,\n"
        + "  status text NOT NULL DEFAULT 'new',\n"
        + '  created_at timestamptz NOT NULL DEFAULT now()\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS availability (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,\n'
        + '  resource_name text,\n'
        + '  slot timestamptz NOT NULL,\n'
        + '  is_booked boolean NOT NULL DEFAULT false\n'
        + ');\n\n'
        + 'CREATE TABLE IF NOT EXISTS notifications (\n'
        + '  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n'
        + '  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,\n'
        + '  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,\n'
        + '  channel text NOT NULL,\n'
        + '  recipient text,\n'
        + "  status text NOT NULL DEFAULT 'queued',\n"
        + '  provider_message_id text,\n'
        + '  error text,\n'
        + '  created_at timestamptz NOT NULL DEFAULT now()\n'
        + ');\n\n'
        + 'CREATE INDEX IF NOT EXISTS calls_tenant_started_idx ON calls (tenant_id, started_at DESC);\n'
        + 'CREATE INDEX IF NOT EXISTS turns_call_idx ON turns (call_id);\n'
        + 'CREATE INDEX IF NOT EXISTS bookings_tenant_idx ON bookings (tenant_id);\n'
        + 'CREATE INDEX IF NOT EXISTS notifications_call_idx ON notifications (call_id);\n\n'
        + "INSERT INTO tenants (id, name, sector) VALUES ('00000000-0000-0000-0000-000000000001', 'Demo Clinic', 'hospital') ON CONFLICT (id) DO NOTHING;\n"
        + "INSERT INTO agent_configs (tenant_id, template, system_prompt, greeting) VALUES ('00000000-0000-0000-0000-000000000001', 'hospital', 'You are the phone assistant for Demo Clinic. Answer only from the knowledge base. Never give medical advice; transfer emergencies to a human.', 'Thank you for calling Demo Clinic, how can I help you today?') ON CONFLICT DO NOTHING;",
      options: { queryBatching: 'transaction' }
    },
    credentials: { postgres: newCredential('Postgres account', 'VMIeqA8K3WV79fDr') }
  },
  output: [{ success: true }]
});

const note = sticky(
  '## DB Setup & Migration\nRun this once. Creates the pgvector extension, all relational tables (tenants, agent_configs, calls, turns, bookings, leads, notifications, etc.) and seeds a demo tenant.\nThe RAG vector table (kb_vectors) is auto-created by the ingestion workflow on first insert.',
  [startTrigger, createSchema],
  { color: 4 }
);

export default workflow('voice-agent-db-setup', 'Voice Agent 0 — DB Setup & Migration')
  .add(startTrigger)
  .to(createSchema)
  .add(note);
