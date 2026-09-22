# n8n Workflows

These are the live n8n workflows for the AI Voice Call Agent platform, built with the n8n Workflow SDK and deployed to the connected n8n instance. The `.ts` files here are the versioned source (used to build/update the workflows programmatically).

## Deployed workflows

| # | Workflow | ID | Trigger | Purpose |
|---|---|---|---|---|
| 0 | Voice Agent 0 — DB Setup & Migration | `TIuITA8UsoXaaupJ` | Manual | Creates pgvector extension + all tables, seeds a demo tenant. **Run once first.** |
| 1 | Voice Agent 1 — RAG Knowledge Ingestion | `u5aO5X5DJCIojNlx` | `POST /webhook/voice-agent/ingest` | Chunk + embed (Gemini) tenant knowledge into pgvector `kb_vectors`. |
| 2 | Voice Agent 2 — Tool Server (RAG + Actions) | `mUq6wlPiRelNM0vq` | `POST /webhook/voice-agent/tool` | Core: routes function calls to RAG search, availability, booking, reservation, lead, transfer. |
| 3 | Voice Agent 3 — Call End + Confirmations | `8E2ozDroQ7kPAStQ` | `POST /webhook/voice-agent/call-end` | Save call, Gemini summary, WhatsApp + Email confirmation, log notifications. |
| 4 | Voice Agent 4 — Dashboard Backend API | `EP01Gx1vNPUPwdm0` | Multiple `GET/POST /webhook/voice-agent/api/*` | JSON API for the Nuxt dashboard. |

## Connected credentials used

| Service | Credential name | ID |
|---|---|---|
| PostgreSQL (+pgvector) | Postgres account | `VMIeqA8K3WV79fDr` |
| Gemini (embeddings) | Google Gemini(PaLM) Api account | `wSi9Z7qXWfRj5Zef` |
| Gemini (chat/summary) | Google Gemini(PaLM) Api account 2 | `llfQcbvug44jx5vx` |
| WhatsApp Business Cloud | WhatsApp account | `GGoypCaIsy19GNNX` |

## Setup order

1. **Run WF-0** (manual) once to create the schema.
2. **WF-1 / WF-2 / WF-4** are published (active). Send knowledge via WF-1, then the voice platform calls WF-2 per turn.
3. **WF-3** is published with the **Email node disabled**. To enable email:
   - Connect a **Gmail** (or SMTP) credential in n8n, assign it to the "Send Email Confirmation" node, and re-enable that node + "Log Email Notification".
   - Set the **WhatsApp phone number ID** (Meta) on the "Send WhatsApp Confirmation" node (currently a placeholder).

## Endpoints (production webhook base = your n8n URL + `/webhook`)

```
POST /webhook/voice-agent/ingest        { tenantId, title, source, text }
POST /webhook/voice-agent/tool          { action, tenantId, callId, ...args }
POST /webhook/voice-agent/call-end      { tenantId, transcript, recordingUrl, durationSec, customerName, customerPhone, customerEmail }
GET  /webhook/voice-agent/api/calls?tenantId=
GET  /webhook/voice-agent/api/call?callId=
GET  /webhook/voice-agent/api/stats?tenantId=
GET  /webhook/voice-agent/api/notifications?tenantId=
POST /webhook/voice-agent/api/tenant-config   { tenantId, template, systemPrompt, greeting }
```

`action` values for the tool server: `search_knowledge`, `check_availability`, `book_appointment`, `make_reservation`, `capture_lead`, and anything else → human transfer.

## How the telephony layer connects

n8n is the **orchestration + tool server**. The live audio (STT/TTS, SIP/Twilio) runs in the voice gateway (see [`../../docs/06-telephony.md`](../../docs/06-telephony.md)), which calls these webhooks: `/tool` per function-call during the conversation, and `/call-end` when the call finishes.

## Rebuilding / editing

Each `.ts` file is n8n Workflow SDK code. Validate with the n8n MCP `validate_workflow`, then `create_workflow_from_code` (new) or `update_workflow` (edit) — see the workflow IDs above.
