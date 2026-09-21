# 02 · Technology Stack

Every choice, its version target, and *why*.

---

## 1. Orchestration — n8n

| | |
|---|---|
| **What** | Self-hosted n8n, **queue mode** (main + workers + Redis) |
| **Version** | Latest stable (1.x) |
| **Why** | Visual, versionable workflows; huge node library; scales via workers; execution logs power the dashboard; programmable via the n8n MCP server. |
| **Key nodes** | Webhook, HTTP Request, Postgres, Redis, Code (JS), IF/Switch, Merge, Gmail/SMTP, Wait, Respond to Webhook |
| **AI in n8n** | Gemini via HTTP Request node or LangChain nodes; RAG via Postgres+pgvector queries |

## 2. LLM — Google Gemini

| | |
|---|---|
| **Models** | `gemini-2.x` flash for low-latency turns; `gemini-2.x` pro for complex reasoning / summarization |
| **Features used** | Streaming, **function calling** (bookings, escalation, lookups), system instructions, safety settings |
| **Embeddings** | Gemini embedding model (e.g. `text-embedding-004` / `gemini-embedding`) for RAG |
| **Why** | Strong multilingual (important for Kerala market — English + Malayalam + Manglish), native function calling, competitive latency and cost, good long-context for RAG. |

> **Latency tip:** use the fastest Gemini "flash" tier for the live conversational loop; reserve "pro" for offline summarization and quality-critical steps.

## 3. Vector store — PostgreSQL + pgvector

| | |
|---|---|
| **What** | `pgvector` extension on the same PostgreSQL instance |
| **Index** | HNSW (or IVFFlat) on embedding column, cosine distance |
| **Why** | One database for both relational data *and* vectors → simpler ops, transactional consistency, per-tenant row isolation via RLS. No separate vector DB to run. |

## 4. Primary database — PostgreSQL 16

| | |
|---|---|
| **Why** | Rock-solid, JSONB for flexible config, Row-Level Security for multi-tenancy, pgvector lives here too. |
| **Extensions** | `pgvector`, `pgcrypto`, `uuid-ossp` |
| Schema | See [`09-database-schema.md`](09-database-schema.md) |

## 5. Dashboard — Nuxt 3

| | |
|---|---|
| **Framework** | Nuxt 3 (Vue 3, Nitro server) |
| **UI** | Nuxt UI + Tailwind CSS (or shadcn-vue) |
| **State** | Pinia |
| **Data** | `useFetch` / `$fetch` to Nitro API; TanStack Query optional |
| **Realtime** | WebSocket (native or Socket.IO) for live call/n8n events |
| **Charts** | Chart.js / ECharts for analytics |
| **Audio** | `<audio>` + WaveSurfer.js for recording playback with waveform |
| **Auth** | Nuxt Auth / Lucia / Supabase-style JWT sessions |
| **Why** | SSR + SPA hybrid, one language (TS) across UI and API via Nitro, fast DX, great for admin dashboards. |

## 6. Telephony

| Provider | Role |
|---|---|
| **Twilio Programmable Voice** | Easiest onboarding, global numbers, Media Streams for live audio, recordings, WhatsApp too. |
| **SIP** (Asterisk / FreeSWITCH, or Twilio SIP Trunking) | For tenants who already own SIP trunks / on-prem PBX or want lower per-minute cost. |
| **Others** (Plivo, Vonage) | Added later through the same abstraction. |

All providers sit behind a **telephony abstraction** ([`06-telephony.md`](06-telephony.md)) so workflows don't care which one is in use.

## 7. Speech (STT / TTS)

| | Choice | Why |
|---|---|---|
| **STT** | Deepgram (streaming) or Google Cloud STT | Low-latency streaming, good accents, word timings for transcript UI. |
| **TTS** | Google Cloud TTS / ElevenLabs | Natural voices, streaming, multilingual (incl. Malayalam). |

> STT/TTS are pluggable. Gemini's own audio capabilities can be evaluated later to collapse the pipeline.

## 8. Notifications

| Channel | Choice |
|---|---|
| **Email** | Resend or SMTP (via n8n Gmail/SMTP node); templated with MJML/Handlebars |
| **WhatsApp** | WhatsApp Cloud API (Meta) preferred; Twilio WhatsApp as fallback; template messages for confirmations |

Detail in [`07-notifications.md`](07-notifications.md).

## 9. Realtime & queue

| | |
|---|---|
| **Redis 7** | n8n queue mode broker, session/dialog state cache, rate limiting |
| **WebSocket** | Dashboard live updates (call in progress, n8n node firing, new transcript lines) |

## 10. Object storage

| | |
|---|---|
| **MinIO** (dev) / **S3** (prod) | Call recordings; presigned URLs for dashboard playback; lifecycle rules for retention. |

## 11. Infrastructure & tooling

| | |
|---|---|
| **Containers** | Docker + Docker Compose (dev) |
| **Orchestration** | Kubernetes (prod), Helm |
| **CI/CD** | GitHub Actions |
| **IaC** | (optional) Terraform for cloud resources |
| **Observability** | n8n execution logs + Prometheus/Grafana + structured app logs (pino) |
| **Language** | TypeScript everywhere (dashboard, gateway, shared packages) |
| **Package mgr** | pnpm workspaces (monorepo) |

---

## 12. Full stack table

| Concern | Technology |
|---|---|
| Workflow engine | n8n (queue mode) |
| LLM | Google Gemini (flash + pro) |
| Embeddings | Gemini embeddings |
| Vector DB | PostgreSQL + pgvector |
| RDBMS | PostgreSQL 16 |
| Cache / queue | Redis 7 |
| Object storage | MinIO / S3 |
| Frontend | Nuxt 3 (Vue 3) |
| UI kit | Nuxt UI + Tailwind |
| State mgmt | Pinia |
| Realtime | WebSocket / Socket.IO |
| Backend API | Nitro (Nuxt server) |
| Voice gateway | Node.js + media server |
| STT | Deepgram / Google STT |
| TTS | Google TTS / ElevenLabs |
| Telephony | Twilio + SIP (Asterisk/FreeSWITCH) |
| Email | Resend / SMTP |
| WhatsApp | WhatsApp Cloud API / Twilio |
| Auth | JWT sessions (Lucia-style) |
| Containers | Docker, Kubernetes |
| CI/CD | GitHub Actions |
| Language | TypeScript |
| Monorepo | pnpm workspaces |
