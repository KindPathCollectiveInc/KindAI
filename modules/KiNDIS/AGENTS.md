# AI Agent Rules for KiNDIS

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KiNDIS — NDIS support coordination and case management module for the KindPath ecosystem.
Manages NDIS participants, case notes, billing items, and compliance audits.
Integrates with the ai-workbench NDIS tooling. KMP 1.0 compliant.

## Port

`7864`

## Structure

```
KiNDIS/
├── server.py           — FastAPI app (KMP 1.0, NDIS domain logic)
├── run.sh
├── requirements.txt
├── static/
│   └── index.html      — NDIS coordination dashboard
└── kindis.db           — SQLite database (gitignored, runtime)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7864`
- **Health check**: `curl http://localhost:7864/api/health`

## KMP Endpoints

- `GET /api/module/identity`
- `GET /api/health`
- `GET/POST /api/participants`
- `GET /api/participants/{id}`
- `POST /api/participants/{id}/consent` — record consent date
- `GET/POST /api/case-notes`
- `GET /api/case-notes/{id}/export` — plain-text export
- `GET/POST /api/billing`
- `GET /api/billing/{participant_id}` — billing items for participant
- `POST /api/audits` — log audit event
- `GET /api/audits` — audit trail

## KCE Events Emitted

- `kindis.participant.registered`
- `kindis.casenote.created`
- `kindis.billing.item_added`
- `kindis.audit.flagged` — when audit type is concern/incident

## Rules

- NDIS participant data is highly sensitive — never log PII to application logs
- Consent must be recorded before creating case notes for a participant
- Case note exports are plain text only — no structured data export without explicit consent
- Audit trail is append-only — never delete audit records
- Refer to `/Users/sam/ai-workbench/ndis/` for NDIS field guide and intake templates
- Load NDIS price guide from `/Users/sam/ai-workbench/ndis/price_guide.json` if present
- Follow NDIS Quality and Safeguards Standards
- Follow KindPath doctrine: benevolence, syntropy, sovereignty

## Security Mandates

- All participant data encrypted at rest (future: SQLCipher)
- No PII or participant data in source control
- `kindis.db` must never be committed

