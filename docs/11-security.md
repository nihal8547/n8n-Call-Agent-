# 11 · Security, Privacy & Compliance

Voice calls carry personal — and sometimes health — data. Security is designed in, not bolted on.

---

## 1. Authentication & authorization

| Concern | Approach |
|---|---|
| User auth | JWT sessions (short-lived access + refresh), Argon2/bcrypt password hashing |
| Roles | `platform_admin`, `tenant_admin`, `operator` — least privilege |
| API | Every request scoped to `tenant_id` from the token; server-side authorization checks |
| DB | Row-Level Security as a hard backstop ([`10-multitenancy.md`](10-multitenancy.md)) |
| Service-to-service | Signed webhooks (HMAC) between gateway ↔ n8n ↔ API |

---

## 2. Secrets management

- Telephony, Gemini, WhatsApp, SMTP credentials stored in **n8n credentials** and/or an app secret store (Vault / cloud KMS / Doppler).
- Per-tenant secrets encrypted at rest (`pgcrypto` or KMS envelope encryption).
- **Never** commit secrets; `n8n/credentials.example/` holds templates only.
- Rotate keys; scope Twilio subaccounts per tenant where possible.

---

## 3. Data protection

| Data | Protection |
|---|---|
| Recordings | Encrypted at rest (S3 SSE); presigned, expiring URLs; per-tenant prefixes |
| Transcripts | Encrypted at rest; access via authorized API only |
| PII | Minimize collection; redact where possible; field-level encryption for sensitive fields |
| In transit | TLS everywhere (HTTPS, WSS, SRTP for media where supported) |

---

## 4. Consent & telephony law

- **Recording consent:** play a disclosure at call start ("this call may be recorded") — configurable, on by default where required.
- **Messaging consent:** capture opt-in before WhatsApp/email; honor STOP/unsubscribe.
- Respect regional rules (India TRAI/DND, GDPR for EU callers, etc.).

---

## 5. Sector-specific compliance

### 🏥 Hospital (health data)
- Treat as **sensitive**: minimize what's stored and messaged.
- **No medical advice** from the agent — scope to logistics (hours, appointments, directions) and escalate clinical questions.
- Emergency detection → immediate human transfer (safety-critical, deterministic rule).
- If operating under HIPAA/similar: BAAs with processors (Twilio, Google), audit logs, access controls, retention limits, breach process. *Confirm the specific regime with legal before go-live.*

### 🏫 School
- Minor's data handling; parental consent flows; limit data shared over messaging.

### 🍽️ Restaurant
- Lower sensitivity; still protect contact details and honor marketing opt-out.

---

## 6. Auditing & monitoring

- `audit_log` table: who accessed which call/recording/transcript and when.
- Anomaly alerts: unusual data export, failed auth spikes, cross-tenant access attempts (should be impossible, but alert if RLS ever denies).
- Structured logs (pino) shipped to a log store; n8n execution logs retained.

---

## 7. AI safety

- **Grounded-only** answers (RAG) + explicit "don't invent" instruction + escalation on low confidence.
- Gemini safety settings enabled; content filtering.
- Prompt-injection defense: treat retrieved documents and caller input as **untrusted**; the system prompt and tool permissions are fixed server-side and cannot be overridden by call content.
- Guardrails per sector (e.g. hospital "no medical advice") enforced in prompt **and** with deterministic checks.

---

## 8. Resilience

- Backups: PITR for PostgreSQL; versioned object storage.
- DR plan; least-privilege IAM; network segmentation (DB not public).
- Dependency scanning + secret scanning in CI.
