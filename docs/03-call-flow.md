# 03 · Call Lifecycle (End-to-End)

How a single phone call moves through the system, turn by turn.

---

## 1. Phases of a call

```mermaid
stateDiagram-v2
    [*] --> Ringing
    Ringing --> Greeting: call answered
    Greeting --> Listening: greeting played
    Listening --> Thinking: caller finished speaking (VAD)
    Thinking --> Speaking: reply generated
    Speaking --> Listening: reply played
    Speaking --> ToolAction: function call needed
    ToolAction --> Speaking: action result spoken
    Listening --> Escalating: escalation trigger
    Escalating --> [*]: transferred to human
    Listening --> Wrapup: caller says goodbye / hangup
    Speaking --> Wrapup: task complete
    Wrapup --> [*]: send confirmations, store data
```

---

## 2. Detailed sequence

```mermaid
sequenceDiagram
    autonumber
    participant C as 📞 Caller
    participant TEL as Telephony
    participant VG as Voice Gateway
    participant STT as STT
    participant TTS as TTS
    participant N as n8n (agent flow)
    participant RAG as RAG
    participant G as Gemini
    participant DB as PostgreSQL
    participant OBJ as Recordings

    C->>TEL: dials number
    TEL->>VG: inbound (webhook / SIP)
    VG->>N: POST /webhook/call-start {tenantId, from, callId}
    N->>DB: INSERT call (status=active)
    N->>DB: load tenant config + system prompt + voice
    N-->>VG: greeting text + voice settings
    VG->>TTS: synthesize greeting
    TTS-->>C: "Hello, thanks for calling {clinic}..."

    loop conversation turns
        C->>VG: audio
        VG->>STT: stream audio
        STT-->>VG: partial + final transcript
        VG->>N: POST /webhook/turn {callId, text}
        N->>RAG: retrieve(tenantId, text)
        RAG-->>N: context chunks + citations
        N->>G: generate(system, context, history, tools)
        alt tool call (e.g. book_appointment)
            G-->>N: tool_call{name,args}
            N->>DB: execute action (create booking)
            DB-->>N: result
            N->>G: tool_result
            G-->>N: final reply
        else plain answer
            G-->>N: reply text
        end
        N->>DB: INSERT turn (user text, agent text, latency, tokens)
        N-->>VG: reply text
        VG->>TTS: synthesize
        TTS-->>C: agent speaks
    end

    C->>TEL: hangup
    TEL->>VG: call ended
    VG->>OBJ: upload recording
    VG->>N: POST /webhook/call-end {callId, recordingUrl, duration}
    N->>DB: UPDATE call (status=completed, recording, transcript)
    N->>G: summarize call → intent, outcome, action items
    N->>DB: store summary + booking link
    Note over N: Trigger notification sub-workflow
```

---

## 3. Latency budget (per turn target)

To feel natural, aim for **< 1.5 s** from end-of-speech to start-of-reply-audio.

| Step | Target |
|---|---|
| VAD end-of-speech detection | ~200 ms |
| Final STT transcript | ~150 ms (streaming) |
| RAG retrieval | ~100 ms (pgvector HNSW) |
| Gemini flash first token | ~400–700 ms |
| TTS first audio chunk | ~200 ms |
| **Total to first audio** | **~1.0–1.4 s** |

Techniques: stream everything, start TTS on first sentence of the LLM output, cache tenant config, keep pgvector index warm, use Gemini flash.

---

## 4. Barge-in

If the caller starts speaking while the agent is talking:
1. VAD in the voice gateway detects speech energy.
2. Gateway **stops TTS playback immediately**.
3. Cancels the in-flight Gemini generation for that turn.
4. Starts a fresh STT capture.

This makes the conversation feel human, not like an IVR.

---

## 5. Escalation & safety

| Trigger | Action |
|---|---|
| Caller asks for a human | Transfer to configured number / queue |
| Emergency keywords (hospital template) | Immediate transfer + log priority flag |
| Agent low confidence / no RAG match | Offer callback or human transfer |
| Abuse / out-of-scope | Polite decline, end call, flag |

Escalation is a **first-class function call** the LLM can invoke, plus deterministic keyword rules in n8n as a safety net.

---

## 6. Outbound calls (later phase)

The same pipeline reversed: n8n triggers a call (reminder, follow-up), the voice gateway dials out via the telephony provider, and the agent runs a script (e.g. appointment reminder → confirm/reschedule). Covered in [`12-roadmap.md`](12-roadmap.md).
