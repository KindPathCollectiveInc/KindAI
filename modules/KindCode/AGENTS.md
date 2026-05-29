# AI Agent Rules for KindCode

## What This Is

KindCode — standalone IDE / coding workspace for the KindPath ecosystem.
Python FastAPI backend at port 7876, Electron + React frontend.

## Operational Commands

- **Backend**: `python server.py` (or `./run.sh`)
- **Frontend dev**: `cd app && npm run dev` (port 5175)
- **Build**: `cd app && npm run build`
- **Package**: `cd app && npm run dist`

## Structure

```
KindCode/
├── server.py           — FastAPI backend: file system API + WebSocket terminal
├── requirements.txt    — Python deps
├── run.sh              — Launch script
├── static/app/         — Built React frontend (served by FastAPI)
└── app/                — React + Electron source
    ├── electron-main.cjs
    ├── src/
    │   ├── App.tsx
    │   └── components/  — Editor, FileTree, Terminal, AISession
    └── package.json
```

## Security Mandates

- File API enforces path safety — only paths under $HOME are accessible
- No API keys in source
- WebSocket terminal is local-only (127.0.0.1)
