# 01 · System Architecture

This document is the heart of the plan: the high-level architecture and the diagrams that everything else refers back to.

---

## 1. Logical architecture (layered)

```mermaid
flowchart TB
    subgraph EDGE["☎️  Telephony Edge"]
        SIP[SIP Trunk<br/>Asterisk / FreeSWITCH]
        TW[Twilio Programmable Voice]
        OTHER[Other providers<br/>Plivo / Vonage]
    end

    subgraph VOICE["🎙️  Voice Gateway"]
        MEDIA[Media Server<br/>WebRTC / RTP bridge]
        STT[STT Streaming<br/>Deepgram / Google]
        TTS[TTS Streaming<br/>Google / ElevenLabs]
        VAD[VAD + Barge-in]
    end

    subgraph BRAIN["🧠  Orchestration & AI"]
        N8N[n8n Orchestrator<br/>queue mode]
        AGENT[Agent Runtime<br/>dialog manager]
        GEMINI[Google Gemini<br/>LLM + function calling]
        RAG[RAG Service<br/>retrieval + rerank]
    end

    subgraph DATA["🗄️  Data & State"]
        PG[(PostgreSQL 16)]
        VEC[(pgvector<br/>embeddings)]
        REDIS[(Redis<br/>queue + cache + session)]
        OBJ[(Object Storage<br/>recordings)]
    end

    subgraph APP["🖥️  Application"]
        API[Backend API<br/>Nitro / Node]
        WS[WebSocket Gateway]
        DASH[Nuxt 3 Dashboard]
    end

    subgraph OUT["📤  Outbound Channels"]
        MAIL[Email<br/>SMTP / Resend]
        WA[WhatsApp<br/>Cloud API / Twilio]
    end

    EDGE --> VOICE
    VOICE <-->|events / webhooks| N8N
    N8N --> AGENT
    AGENT --> GEMINI
    AGENT --> RAG
    RAG --> VEC
    N8N --> PG
    N8N --> REDIS
    VOICE --> OBJ
    N8N --> MAIL
    N8N --> WA
    API <--> PG
    API <--> OBJ
    API -->|manage workflows| N8N
    WS <-->|live events| N8N
    DASH <-->|REST| API
    DASH <-->|realtime| WS
```

**Reading it top-down:** audio enters at the telephony edge, is turned into text by the voice gateway, orchestrated by n8n (which calls Gemini and RAG), persisted in PostgreSQL, and the results flow out as confirmations and up into the dashboard.

---

## 2. Component responsibilities

| Component | Responsibility | Tech |
|---|---|---|
| **Telephony edge** | Receive/place PSTN calls, expose SIP/webhooks | Twilio, Asterisk/FreeSWITCH |
| **Voice gateway** | Bidirectional audio ↔ text, VAD, barge-in, recording | Deepgram/Google STT, Google/ElevenLabs TTS, media server |
| **n8n orchestrator** | The workflow brain: routes events, calls services, logs, triggers notifications | n8n (self-hosted) |
| **Agent runtime** | Turn-by-turn dialog: build prompt, call RAG, call Gemini, decide tool calls | Node service (can live inside n8n Code nodes or a sidecar) |
| **Gemini** | Understand intent, generate replies, call functions (booking, escalation) | Google Gemini API |
| **RAG service** | Embed query, retrieve chunks, rerank, assemble context | pgvector + Gemini embeddings |
| **PostgreSQL** | Tenants, users, calls, transcripts, bookings, knowledge metadata | PostgreSQL 16 |
| **pgvector** | Vector similarity search over knowledge chunks | pgvector extension |
| **Redis** | n8n queue, session state, caching, rate limiting | Redis 7 |
| **Object storage** | Call recordings (audio files) | MinIO / S3 |
| **Backend API** | Dashboard's data + control plane | Nitro (Nuxt server) or standalone Node |
| **Nuxt dashboard** | Monitoring, knowledge management, config, playback | Nuxt 3 |
| **Notifications** | Email + WhatsApp confirmations | Resend/SMTP + WhatsApp Cloud API |

---

## 3. Why n8n as the orchestrator?

- **Visual + versioned** workflows the team can inspect and modify.
- Built-in nodes for HTTP, Postgres, Gmail/SMTP, and (via community/HTTP) Gemini, Twilio, WhatsApp.
- **Queue mode** with Redis scales workers horizontally for concurrent calls.
- Every execution is logged → the dashboard reads n8n's execution API for live monitoring.
- The **n8n MCP server** (available in this workspace) lets us build and manage workflows programmatically.

> n8n does *orchestration and side-effects*. The tight real-time audio loop (STT/TTS streaming) runs in the voice gateway for latency; n8n handles per-turn reasoning triggers, logging, bookings, and notifications.

---

## 4. Deployment topology

```mermaid
flowchart TB
    subgraph CLIENT["Clients"]
        PHONE([Phone Network / PSTN])
        BROWSER([Admin Browser])
    end

    subgraph CLOUD["Cloud / Cluster"]
        LB[Ingress / Load Balancer<br/>TLS]

        subgraph SVC["Services"]
            NUXT[Nuxt Dashboard + API]
            N8NMAIN[n8n main]
            N8NW1[n8n worker 1..N]
            VGW[Voice Gateway 1..N]
        end

        subgraph STATE["Stateful"]
            PGX[(PostgreSQL<br/>+ pgvector)]
            RDS[(Redis)]
            MINIO[(MinIO / S3)]
        end
    end

    subgraph EXT["External APIs"]
        TWX[Twilio]
        GEMX[Google Gemini]
        WAX[WhatsApp Cloud API]
        STTX[Deepgram / Google STT-TTS]
    end

    PHONE --> TWX --> VGW
    PHONE -->|SIP| VGW
    BROWSER --> LB --> NUXT
    NUXT --> PGX
    NUXT --> MINIO
    NUXT --> N8NMAIN
    VGW <--> N8NMAIN
    N8NMAIN <--> RDS
    N8NMAIN --- N8NW1
    N8NW1 <--> RDS
    N8NW1 --> PGX
    N8NW1 --> GEMX
    N8NW1 --> WAX
    VGW --> STTX
    VGW --> MINIO
    N8NW1 --> GEMX
```

- **Dev:** single `docker-compose.yml` with all services.
- **Prod:** Kubernetes; n8n workers and voice gateways scale independently; managed Postgres recommended.

---

## 5. Repository / monorepo layout (target)

When code lands, the repo is planned as a monorepo:

```
n8n-Call-Agent-/
├── docs/                     # ← this plan
├── apps/
│   ├── dashboard/            # Nuxt 3 app (UI + Nitro API)
│   └── voice-gateway/        # Node service: STT/TTS/media bridge
├── packages/
│   ├── shared/               # Types, zod schemas, constants
│   ├── rag/                  # Ingestion + retrieval library
│   └── telephony/            # Provider abstraction (Twilio/SIP)
├── n8n/
│   ├── workflows/            # Exported workflow JSON (versioned)
│   └── credentials.example/  # Credential templates (no secrets)
├── db/
│   ├── migrations/           # SQL migrations
│   └── seed/                 # Sector template seeds
├── infra/
│   ├── docker-compose.yml
│   └── k8s/
└── .github/workflows/        # CI
```

---

## 6. Data flow summary (one call)

```mermaid
sequenceDiagram
    autonumber
    participant C as Caller
    participant T as Telephony (Twilio/SIP)
    participant V as Voice Gateway
    participant N as n8n
    participant R as RAG (pgvector)
    participant G as Gemini
    participant D as PostgreSQL
    participant X as Email/WhatsApp

    C->>T: Dials tenant number
    T->>V: Inbound call webhook / SIP INVITE
    V->>N: call.started {tenant, callId}
    N->>D: create call record
    loop Each caller turn
        C->>V: speaks
        V->>V: STT → text (streaming)
        V->>N: turn.transcript {text}
        N->>R: retrieve(tenant, query)
        R-->>N: top-k chunks
        N->>G: prompt(system + context + history)
        G-->>N: reply (+ optional tool call)
        N->>D: log turn + tool result
        N-->>V: reply text
        V->>V: TTS → audio (streaming)
        V->>C: speaks reply
    end
    C->>T: Hangs up
    V->>N: call.ended {recordingUrl, duration}
    N->>D: finalize call + store transcript
    N->>X: send Email + WhatsApp confirmation
    N->>D: log notification status
```

Full detail in [`03-call-flow.md`](03-call-flow.md).
