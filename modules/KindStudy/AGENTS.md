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
reading lists, and assignments. KMP 1.0 compliant.

## Port

`7871`

## Structure

```
KindStudy/
├── server.py           — FastAPI app (KMP 1.0, SM-2 flashcard engine)
├── run.sh              — Start script
├── requirements.txt
├── static/
│   └── index.html      — Study dashboard with due cards, sessions, courses
└── kindstudy.db        — SQLite database (gitignored, runtime)
```

## Operational Commands

- **Run**: `./run.sh`  or  `uvicorn server:app --port 7871`
- **Health check**: `curl http://localhost:7871/api/health`

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
- `GET/POST /api/reading-list`
- `PUT /api/reading-list/{id}` — update status (to-read/reading/done)
- `GET/POST /api/assignments`
- `PUT /api/assignments/{id}` — update status/grade

## KCE Events Emitted

- `kindstudy.session.started`
- `kindstudy.session.completed` — includes duration_min
- `kindstudy.flashcard.reviewed` — includes quality score
- `kindstudy.assignment.completed`

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

- No external API calls — local only
- No PII in source control

