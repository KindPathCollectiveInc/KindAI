"""
KindLife — Unified Life Overview and Bundle Orchestration

Port: 7873

What this is:
  The integration layer. KindLife aggregates health, wellbeing, work, home,
  and care signals from across the active KindPath modules and surfaces them
  as a unified life picture.

  No domain data of its own. KindLife reads from the other modules via HTTP
  and synthesises a daily/weekly overview for the person whose life this is.

  It also maintains the personal bundle configuration — which modules are
  active, what doctrine overlay is in use, what the current life context is.

  This is the module the person wakes up to. The dashboard should answer:
  "How am I doing? What needs my attention today? What's working?"

Aggregated from:
  - KindHealth (7869) — mood, energy, medication, sleep
  - KindHome (7866) — tasks due today, overdue bills
  - KindWork (7867) — active applications, hours this week
  - KindCare (7865) — next visit, active goals
  - KiNDIS (7864) — pending case notes (practitioner view)
  - KindStudy (7871) — due flashcards, sessions this week
  - KindBiz (7868) — overdue invoices, pipeline

KMP endpoints: /api/module/identity + /api/health
KCE events: kindlife.overview.generated

Run: python server.py
"""

from __future__ import annotations
import asyncio, json
from datetime import datetime, date
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

# ── Config ────────────────────────────────────────────────────────────────────

PORT = 7873
MODULE_ID = "kindlife"
MODULE_NAME = "KindLife"
MODULE_VERSION = "0.1.0"
KCE_URL = "http://localhost:7870"

# Module endpoints to aggregate
MODULE_ENDPOINTS = {
    "kindhealth":       "http://localhost:7869",
    "kindhome":         "http://localhost:7866",
    "kindwork":         "http://localhost:7867",
    "kindcare":         "http://localhost:7865",
    "kindis":           "http://localhost:7864",
    "kindstudy":        "http://localhost:7871",
    "kindbiz":          "http://localhost:7868",
    "kindcreate":       "http://localhost:7863",
    "kindsocials":      "http://localhost:7862",
    "kindfluence":      "http://localhost:7861",
    "kindsearch":       "http://localhost:7872",
    "kindata":          "http://localhost:7874",
}

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(title=MODULE_NAME, version=MODULE_VERSION)
STATIC_DIR = Path(__file__).parent / "static"
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── KCE ──────────────────────────────────────────────────────────────────────

async def _emit_event(event_type: str, data: dict):
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            await client.post(f"{KCE_URL}/events", json={
                "source": MODULE_ID, "type": event_type, "payload": data,
            })
    except Exception:
        pass

@app.get("/api/module/identity")
async def module_identity():
    return {
        "id": MODULE_ID,
        "name": MODULE_NAME,
        "description": "Unified life overview. Aggregates all active KindPath modules into a daily picture.",
        "version": MODULE_VERSION,
        "port": PORT,
        "capabilities": ["life_overview", "daily_summary", "module_aggregation",
                         "bundle_config", "wellbeing_snapshot"],
        "kmpVersion": "1.0",
    }

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "role": "aggregator", "modules_tracked": len(MODULE_ENDPOINTS)}

async def _register_with_kce():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            identity = await module_identity()
            identity["baseUrl"] = f"http://localhost:{PORT}"
            await client.post(f"{KCE_URL}/modules", json=identity)
    except Exception as e:
        print(f"[KMP] KCE not available ({e}) — running standalone")

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    await _register_with_kce()
    yield

app.router.lifespan_context = lifespan

# ── Aggregation Helpers ───────────────────────────────────────────────────────

async def _fetch(client: httpx.AsyncClient, url: str, default: Any = None) -> Any:
    try:
        r = await client.get(url, timeout=3)
        if r.status_code == 200:
            return r.json()
    except Exception:
        pass
    return default

# ── Life Overview ─────────────────────────────────────────────────────────────

@app.get("/api/overview")
async def get_overview():
    """
    Aggregated daily life overview — the first thing you see when you wake up.
    Pulls lightweight snapshots from all active modules.
    """
    today = date.today().isoformat()

    async with httpx.AsyncClient(timeout=5) as client:
        (health, home, work, care, study, biz) = await asyncio.gather(
            _fetch(client, "http://localhost:7869/api/health"),
            _fetch(client, "http://localhost:7866/api/health"),
            _fetch(client, "http://localhost:7867/api/health"),
            _fetch(client, "http://localhost:7865/api/health"),
            _fetch(client, "http://localhost:7871/api/health"),
            _fetch(client, "http://localhost:7868/api/health"),
        )

    # Build attention items — things that need action today
    attention = []
    if home and home.get("overdue_bills", 0) > 0:
        attention.append({"area": "home", "message": f"{home['overdue_bills']} overdue bill(s)", "urgency": "high"})
    if home and home.get("pending_tasks", 0) > 5:
        attention.append({"area": "home", "message": f"{home['pending_tasks']} pending tasks", "urgency": "medium"})
    if work and work.get("active_applications", 0) > 0:
        attention.append({"area": "work", "message": f"{work['active_applications']} active application(s)", "urgency": "low"})
    if biz and biz.get("overdue_invoices", 0) > 0:
        attention.append({"area": "biz", "message": f"{biz['overdue_invoices']} overdue invoice(s)", "urgency": "high"})
    if study and study.get("sessions", 0) == 0:
        attention.append({"area": "study", "message": "No study sessions this week", "urgency": "low"})

    overview = {
        "date": today,
        "generated_at": datetime.utcnow().isoformat(),
        "attention": attention,
        "modules": {
            "health":  health   or {"status": "offline"},
            "home":    home     or {"status": "offline"},
            "work":    work     or {"status": "offline"},
            "care":    care     or {"status": "offline"},
            "study":   study    or {"status": "offline"},
            "biz":     biz      or {"status": "offline"},
        },
    }
    await _emit_event("kindlife.overview.generated", {"date": today})
    return overview

@app.get("/api/modules/status")
async def module_status():
    """Ping all tracked modules and return their health status."""
    async with httpx.AsyncClient(timeout=3) as client:
        tasks = {name: _fetch(client, f"{url}/api/health") for name, url in MODULE_ENDPOINTS.items()}
        results = await asyncio.gather(*tasks.values())
    status = {}
    for name, result in zip(tasks.keys(), results):
        status[name] = {
            "online": result is not None,
            "health": result or {"status": "offline"},
        }
    return status

@app.get("/api/bundles/active")
async def get_active_bundle():
    """Proxy to KCE bundle state."""
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{KCE_URL}/bundles/active")
            return r.json()
    except Exception:
        return {"note": "KCE not available"}

# ── Dashboard ─────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def dashboard():
    html = (STATIC_DIR / "index.html").read_text() if (STATIC_DIR / "index.html").exists() else "<h1>KindLife</h1>"
    return HTMLResponse(html)

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=PORT, reload=False)
