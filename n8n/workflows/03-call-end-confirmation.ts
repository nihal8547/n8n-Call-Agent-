import { workflow, node, trigger, sticky, newCredential, languageModel, placeholder, expr } from '@n8n/workflow-sdk';

const callEndWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'POST /call-end',
    parameters: { httpMethod: 'POST', path: 'voice-agent/call-end', responseMode: 'responseNode', options: {} },
    position: [220, 400]
  },
  output: [{ body: { tenantId: '00000000-0000-0000-0000-000000000001', from: '+919000000000', transcript: 'Caller booked an appointment for Monday 10am.', customerName: 'Anu', customerPhone: '919000000000', customerEmail: 'anu@example.com' } }]
});

const normalizeCall = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: {
    name: 'Normalize Call End',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'tenantId', name: 'tenantId', value: expr('{{ $json.body?.tenantId ?? $json.tenantId ?? "00000000-0000-0000-0000-000000000001" }}'), type: 'string' },
          { id: 'from', name: 'from', value: expr('{{ $json.body?.from ?? $json.from ?? "" }}'), type: 'string' },
          { id: 'to', name: 'to', value: expr('{{ $json.body?.to ?? $json.to ?? "" }}'), type: 'string' },
          { id: 'provider', name: 'provider', value: expr('{{ $json.body?.provider ?? $json.provider ?? "twilio" }}'), type: 'string' },
          { id: 'durationSec', name: 'durationSec', value: expr('{{ $json.body?.durationSec ?? $json.durationSec ?? 0 }}'), type: 'number' },
          { id: 'recordingUrl', name: 'recordingUrl', value: expr('{{ $json.body?.recordingUrl ?? $json.recordingUrl ?? "" }}'), type: 'string' },
          { id: 'transcript', name: 'transcript', value: expr('{{ $json.body?.transcript ?? $json.transcript ?? "" }}'), type: 'string' },
          { id: 'customerName', name: 'customerName', value: expr('{{ $json.body?.customerName ?? $json.customerName ?? "there" }}'), type: 'string' },
          { id: 'customerPhone', name: 'customerPhone', value: expr('{{ $json.body?.customerPhone ?? $json.customerPhone ?? "" }}'), type: 'string' },
          { id: 'customerEmail', name: 'customerEmail', value: expr('{{ $json.body?.customerEmail ?? $json.customerEmail ?? "" }}'), type: 'string' }
        ]
      }
    },
    position: [440, 400]
  },
  output: [{ tenantId: '00000000-0000-0000-0000-000000000001', from: '+919000000000', to: '', provider: 'twilio', durationSec: 0, recordingUrl: '', transcript: 'Caller booked an appointment for Monday 10am.', customerName: 'Anu', customerPhone: '919000000000', customerEmail: 'anu@example.com' }]
});

const saveCall = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Save Call',
    parameters: {
      operation: 'executeQuery',
      query: "INSERT INTO calls (tenant_id, from_number, to_number, provider, status, duration_sec, recording_url, transcript, ended_at) VALUES ($1::uuid, $2, $3, $4, 'completed', $5, $6, $7, now()) RETURNING id",
      options: { queryReplacement: expr("{{ [$json.tenantId, $json.from, $json.to, $json.provider, $json.durationSec, $json.recordingUrl, $json.transcript] }}") }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [660, 400]
  },
  output: [{ id: 'call-1' }]
});

const geminiChat = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.1,
  config: {
    name: 'Gemini Summary Model',
    parameters: { modelName: 'models/gemini-2.5-flash', options: { temperature: 0.2 } },
    credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account 2', 'llfQcbvug44jx5vx') },
    position: [880, 560]
  }
});

const summarizeCall = node({
  type: '@n8n/n8n-nodes-langchain.agent',
  version: 3.1,
  config: {
    name: 'Summarize Call',
    parameters: {
      promptType: 'define',
      text: expr('Summarize this phone call transcript in 2 short sentences and state the caller intent and outcome.\n\nTranscript:\n{{ $(\"Normalize Call End\").item.json.transcript }}'),
      options: { systemMessage: 'You are a call analyst. Return a concise plain-text summary only.', enableStreaming: false }
    },
    subnodes: { model: geminiChat },
    position: [880, 400]
  },
  output: [{ output: 'Caller booked an appointment for Monday 10am. Intent: appointment booking. Outcome: confirmed.' }]
});

const updateSummary = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Update Call Summary',
    parameters: {
      operation: 'executeQuery',
      query: "UPDATE calls SET summary = $1 WHERE id = $2::uuid RETURNING id, summary",
      options: { queryReplacement: expr('{{ [$json.output, $("Save Call").item.json.id] }}') }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [1100, 400]
  },
  output: [{ id: 'call-1', summary: 'Caller booked an appointment for Monday 10am.' }]
});

const sendWhatsApp = node({
  type: 'n8n-nodes-base.whatsApp',
  version: 1.1,
  config: {
    name: 'Send WhatsApp Confirmation',
    parameters: {
      resource: 'message',
      operation: 'send',
      phoneNumberId: placeholder('Your WhatsApp Business phone number ID (from Meta)'),
      recipientPhoneNumber: expr('{{ $("Normalize Call End").item.json.customerPhone }}'),
      messageType: 'text',
      textBody: expr('Hi {{ $("Normalize Call End").item.json.customerName }}, thank you for calling. Confirmation: {{ $("Summarize Call").item.json.output }}')
    },
    credentials: { whatsAppApi: newCredential('WhatsApp account', 'GGoypCaIsy19GNNX') },
    onError: 'continueRegularOutput',
    position: [1320, 320]
  },
  output: [{ messages: [{ id: 'wamid.ABC' }] }]
});

const logWhatsApp = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Log WhatsApp Notification',
    parameters: {
      operation: 'executeQuery',
      query: "INSERT INTO notifications (tenant_id, call_id, channel, recipient, status, provider_message_id) VALUES ($1::uuid, NULLIF($2,'')::uuid, 'whatsapp', $3, 'sent', $4) RETURNING id",
      options: { queryReplacement: expr('{{ [$("Normalize Call End").item.json.tenantId, $("Save Call").item.json.id, $("Normalize Call End").item.json.customerPhone, ($json.messages && $json.messages[0] ? $json.messages[0].id : "")] }}') }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [1540, 320]
  },
  output: [{ id: 'notif-1' }]
});

const respondDone = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Done',
    parameters: { respondWith: 'json', responseBody: expr('{{ { "status": "ok", "call_id": $("Save Call").item.json.id, "summary": $("Summarize Call").item.json.output } }}'), options: {} },
    position: [1760, 320]
  }
});

const sendEmail = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Send Email Confirmation',
    parameters: {
      resource: 'message',
      operation: 'send',
      sendTo: expr('{{ $("Normalize Call End").item.json.customerEmail }}'),
      subject: 'Your confirmation',
      emailType: 'text',
      message: expr('Hi {{ $("Normalize Call End").item.json.customerName }},\n\nThank you for calling. Here is your confirmation:\n{{ $("Summarize Call").item.json.output }}\n\nRegards.'),
      options: {}
    },
    credentials: { gmailOAuth2: newCredential('Gmail') },
    onError: 'continueRegularOutput',
    position: [1320, 560]
  },
  output: [{ id: 'email-1' }]
});

const logEmail = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: {
    name: 'Log Email Notification',
    parameters: {
      operation: 'executeQuery',
      query: "INSERT INTO notifications (tenant_id, call_id, channel, recipient, status, provider_message_id) VALUES ($1::uuid, NULLIF($2,'')::uuid, 'email', $3, 'sent', $4) RETURNING id",
      options: { queryReplacement: expr('{{ [$("Normalize Call End").item.json.tenantId, $("Save Call").item.json.id, $("Normalize Call End").item.json.customerEmail, ($json.id || "")] }}') }
    },
    credentials: { postgres: newCredential('Postgres account 3', 'zLgWxPjtKwojUv2o') },
    position: [1540, 560]
  },
  output: [{ id: 'notif-2' }]
});

const note = sticky(
  '## Call End + Confirmations\nPOST /webhook/voice-agent/call-end with { tenantId, transcript, recordingUrl, durationSec, customerName, customerPhone, customerEmail }.\nSaves the call, summarizes it with Gemini, then sends confirmation over WhatsApp (connected) and Email (connect a Gmail/SMTP credential + set the WhatsApp phone number ID). Every send is logged in notifications.',
  [callEndWebhook, normalizeCall, saveCall, summarizeCall],
  { color: 6 }
);

export default workflow('voice-agent-call-end', 'Voice Agent 3 — Call End + Confirmations')
  .add(callEndWebhook)
  .to(normalizeCall)
  .to(saveCall)
  .to(summarizeCall)
  .to(updateSummary)
  .to(sendWhatsApp)
  .to(logWhatsApp)
  .to(respondDone)
  .add(updateSummary)
  .to(sendEmail)
  .to(logEmail)
  .add(note);
