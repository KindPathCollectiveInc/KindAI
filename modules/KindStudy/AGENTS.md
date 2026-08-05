# AI Agent Rules for KindStudy

## Session Init Protocol

Before reading code or making changes, run:
```bash
cat ~/.kindpath/HANDOVER.md
python3 ~/.kindpath/kp_memory.py dump --domain gotcha
python3 ~/.kindpath/kp_memory.py dump
```

---

## What This Is

KindStudy — personal learning and study management module for the KindPath ecosystem.
Manages courses, study sessions, spaced-repetition flashcards (SM-2 algorithm),
reading lists, and assignments, and syncs assessment due dates from the
student's own CSU (Interact2/D2L Brightspace) calendar feed. KMP 1.0 compliant.

## Port

`7871`

## Structure

```
KindStudy/
├── server.py           — FastAPI app (KMP 1.0, SM-2 flashcard engine, CSU sync)
├── run.sh              — Start script
├── requirements.txt
├── .env.example         — Copy to .env; holds CSU_ICS_FEED_URL
├── static/
│   └── index.html      — Study dashboard with due cards, sessions, courses
└── data/
    └── kindstudy.db    — SQLite database (gitignored, runtime)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7871`
- **Health check**: `curl http://localhost:7871/api/health`
- **CSU setup**: copy `.env.example` to `.env`, set `CSU_ICS_FEED_URL` to the
  personal feed URL from Interact2 → Calendar → Subscribe. Auto-syncs every
  6h in the background; trigger manually with `POST /api/csu/sync`.

## KMP Endpoints

- `GET /api/module/identity`
- `GET /api/health`
- `GET/POST /api/courses`
- `POST /api/sessions/start` — begin timed study session
- `POST /api/sessions/{id}/end` — end session (calculates duration)
- `GET /api/sessions` — session history
- `GET/POST /api/flashcards`
- `GET /api/flashcards/due` — cards due for review today (SM-2)
- `POST /api/flashcards/{id}/review` — submit review quality (0–5), updates ease factor + interval
- `GET/POST /api/reading`
- `PUT /api/reading/{id}/status` — update status (unread/reading/done)
- `GET/POST /api/assignments` — filter by `course_id` and/or `status`; sorted by due date
- `PUT /api/assignments/{id}` — update status/grade/content/due_date
- `GET /api/csu/status` — last sync time, counts, error, whether configured
- `POST /api/csu/sync` — trigger an immediate CSU calendar sync (400 if not configured)

## KCE Events Emitted

- `kindstudy.session.started`
- `kindstudy.session.completed` — includes duration_min
- `kindstudy.flashcard.reviewed` — includes quality score
- `kindstudy.assignment.completed`
- `kindstudy.csu.synced` — includes created/updated/skipped counts

## CSU Feed Sync

- Source: the student's personal Interact2 (D2L Brightspace) calendar `.ics`
  feed — the one sanctioned, documented export the LMS provides. Never
  reverse-engineer the CSU mobile app's private backend to get this data.
- The feed URL contains an auth token; it lives only in `.env`
  (`CSU_ICS_FEED_URL`, gitignored) and is never logged or committed.
- Interact2 mixes lecture/workshop/timetable noise into the same feed. Only
  `VEVENT`s whose `SUMMARY` ends in "Due" (D2L's own convention, e.g.
  "Assessment item 1 - Essay - Due") are imported as assignments — everything
  else is skipped.
- Imports are idempotent: each event's `UID` is stored as `assignments.external_uid`
  (unique index) so re-syncing updates existing rows instead of duplicating them.
  `assignments.source` is `'csu'` for synced rows, `'manual'` for user-entered ones.
- `LOCATION` on the event maps to a course name (auto-created if new);
  `DESCRIPTION` becomes the assignment's `content` (the task brief).

## SM-2 Algorithm Note

The flashcard review engine implements SM-2:
- `quality` 0–5 (0=blackout, 3=correct-with-effort, 5=perfect)
- `ef` (ease factor) starts at 2.5, adjusted per review
- `interval` in days; next_review = today + interval
- Quality < 3 resets interval to 1 day

## Rules

- Never modify the SM-2 core without updating the algorithm comment in `server.py`
- `kindstudy.db` must never be committed
- Follow KindPath doctrine: benevolence, syntropy, sovereignty

## Security Mandates

- The only outbound call this module makes is to the user's own CSU
  Interact2 calendar feed URL, which the user supplies via `.env`. No other
  third-party APIs, no telemetry, no data leaves the machine otherwise.
- The CSU feed token and any future integration credentials (e.g. Outlook)
  live only in `.env` — never hardcode them, never commit them, never log
  the feed URL or its response bodies.
- No PII in source control

