# 00 · Overview & Vision

## 1. The problem

Businesses miss calls, pay for staff to answer repetitive enquiries, and can't scale phone support after hours. A hospital's front desk repeats the same visiting-hours answer 200 times a day; a restaurant loses reservations when the line is busy; a school office drowns in admission-season questions.

## 2. The solution

A single platform where any organization can:

1. Connect a phone number (SIP trunk or Twilio).
2. Upload its own knowledge (documents, FAQs, custom answers).
3. Get an **AI voice agent** that answers calls 24/7, speaks naturally, and is grounded in *their* data via **RAG**.
4. Perform actions during the call — book an appointment, take a reservation, register an enquiry.
5. Send the caller a **confirmation over Email and WhatsApp**.
6. Watch everything from a **Nuxt dashboard** — live n8n activity, call logs, recordings, and transcripts.

The reasoning engine is **Google Gemini**; the orchestration brain is **n8n**; the memory is **PostgreSQL + pgvector**.

## 3. Design principles

| Principle | Meaning |
|---|---|
| **Multi-tenant first** | One deployment serves many organizations, each fully isolated. |
| **Sector-agnostic core, sector-specific templates** | The engine doesn't care if you're a clinic or a café; templates specialize behavior. |
| **Everything observable** | Every call, every n8n node run, every LLM decision is logged and visible. |
| **RAG-grounded, not hallucinated** | The agent answers from tenant knowledge; unknowns are escalated, not invented. |
| **Provider-agnostic** | Telephony, STT/TTS, and notification channels are pluggable. |
| **Self-serve** | A non-technical admin can configure their agent entirely from the dashboard. |

## 4. Personas

| Persona | Needs |
|---|---|
| **Platform admin** (you) | Manage tenants, monitor health, control costs. |
| **Tenant admin** (hospital/school/restaurant manager) | Configure the agent, upload knowledge, connect their number, view calls. |
| **Agent operator / staff** | Read transcripts, listen to recordings, handle escalations. |
| **Caller** (end user) | Get answers fast, complete a booking, receive confirmation. |

## 5. Sector use cases

### 🏥 Hospital / Clinic
- Answer FAQs: visiting hours, departments, location, insurance accepted.
- Book / reschedule / cancel appointments.
- Route emergencies to a human immediately (safety rule).
- Confirmation: appointment slip via Email + WhatsApp.
- **Compliance sensitivity: high** (health data — see [`11-security.md`](11-security.md)).

### 🏫 School / College
- Admission enquiries, fee structure, syllabus, term dates.
- Book campus visits / counselor calls.
- Notify parents; capture leads for the admissions team.
- Confirmation: visit slot + brochure link via Email + WhatsApp.

### 🍽️ Restaurant
- Take table reservations (party size, time, seating preference).
- Menu questions, timings, special offers, dietary options.
- Waitlist and modification handling.
- Confirmation: reservation details via WhatsApp + Email.

### 🧩 Generic (any sector)
- A base template with FAQ + "capture a lead / booking + confirm" that any business extends: salons, clinics, gyms, service centers, real-estate, government helpdesks.

## 6. What "done" looks like (MVP)

- [ ] A caller dials a Twilio number and talks to the agent.
- [ ] The agent answers from an uploaded knowledge base (RAG).
- [ ] The call is recorded, transcribed, and stored.
- [ ] A confirmation is sent over Email and WhatsApp.
- [ ] The tenant admin sees the call, recording, and transcript in the Nuxt dashboard.
- [ ] The admin can upload knowledge and add custom Q&A from the dashboard.

See [`12-roadmap.md`](12-roadmap.md) for the full phasing.
