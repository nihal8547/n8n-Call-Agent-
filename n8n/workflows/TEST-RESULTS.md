# Live Test Results & Environment Findings

A real end-to-end test was run against the connected n8n instance on 2026-09-22.

## ✅ What passed (proven live)

| Step | Workflow | Result |
|---|---|---|
| Create schema + seed | WF-0 DB Setup | `success: true` — tenants, agent_configs, calls, bookings, availability, notifications created; demo tenant seeded |
| Book an appointment | WF-2 Tool Server (`action: book_appointment`) | Routed correctly → inserted booking row `id 994d798c-…`, `status: "confirmed"` → returned confirmation JSON |
| Read it back | WF-4 Dashboard API (`GET /api/stats`) | Returned `{ "bookings": "1", "appointments": "1" }` |

So the core loop — **request → route by action → Postgres write → confirmation → dashboard read** — works against the real database.

## ⚠️ Environment findings (action needed for full production)

1. **pgvector is NOT installed on the Postgres server.**
   `CREATE EXTENSION vector` failed with *"extension vector is not available"*. This blocks the **RAG vector search** (WF-1 ingestion + WF-2 `search_knowledge`).
   **Fix:** use a pgvector-enabled Postgres (Supabase, Neon, RDS with the extension, or install the `pgvector` package on the server), then re-run WF-0 with the `CREATE EXTENSION vector;` line restored.

2. **Two Postgres credentials existed; only one works.**
   - `VMIeqA8K3WV79fDr` ("Postgres account") → **cannot be decrypted** on this instance ("different encryptionKey"). Broken.
   - `zLgWxPjtKwojUv2o` ("Postgres account 3") → **works**.
   All workflows were switched to the working credential (`Postgres account 3`).

3. **The database already had tables from earlier workflows.**
   `leads` pre-existed with a different schema (no `tenant_id`), so `CREATE TABLE IF NOT EXISTS` skipped it. `bookings` was compatible (booking test passed).
   **Fix:** deploy on a **fresh database/schema** so the full schema (and the `leads`/stats queries) apply cleanly.

4. **Stats query hardened.** Subquery columns are now table-qualified (`b.tenant_id`, `l.tenant_id`, `calls.tenant_id`) to avoid ambiguity with the aggregate outer query.

## To finish the RAG test later

Once pgvector + a clean DB are in place:
1. Re-run WF-0 (with the `CREATE EXTENSION vector;` line).
2. `POST /webhook/voice-agent/ingest` with `{ tenantId, title, text }` → embeds into `kb_vectors`.
3. `POST /webhook/voice-agent/tool` with `{ action: "search_knowledge", tenantId, query }` → returns the grounded context.
