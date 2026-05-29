"""
KindCode — IDE backend server.
FastAPI at port 7876. Serves file system API, WebSocket terminal, and the
built React frontend. This is the backend half of the KindCode standalone IDE.
"""
import asyncio
import json
import os
import subprocess
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="KindCode", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
STATIC_APP_DIR = BASE_DIR / "static" / "app"

# ── Serve built React app ──────────────────────────────────────────────────

@app.get("/app", include_in_schema=False)
async def serve_app_root():
    return FileResponse(STATIC_APP_DIR / "index.html")

@app.get("/app/{path:path}", include_in_schema=False)
async def serve_app(path: str):
    target = STATIC_APP_DIR / path
    if target.exists() and target.is_file():
        return FileResponse(target)
    return FileResponse(STATIC_APP_DIR / "index.html")


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "KindCode"}


# ── File System API ────────────────────────────────────────────────────────

def is_safe_path(path: str) -> bool:
    """Block traversal outside allowed paths."""
    resolved = Path(path).resolve()
    home = Path.home().resolve()
    return str(resolved).startswith(str(home))

@app.get("/api/files")
async def list_files(path: str = str(Path.home())):
    """List directory contents."""
    if not is_safe_path(path):
        return JSONResponse({"error": "Path not allowed"}, status_code=403)
    p = Path(path)
    if not p.exists() or not p.is_dir():
        return JSONResponse({"error": "Not a directory"}, status_code=400)
    items = []
    try:
        for child in sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name)):
            if child.name.startswith("."):
                continue
            items.append({
                "name": child.name,
                "path": str(child),
                "type": "directory" if child.is_dir() else "file",
                "size": child.stat().st_size if child.is_file() else None,
            })
    except PermissionError:
        return JSONResponse({"error": "Permission denied"}, status_code=403)
    return {"path": str(p), "items": items}


@app.get("/api/file")
async def read_file_api(path: str):
    """Read a file's contents."""
    if not is_safe_path(path):
        return JSONResponse({"error": "Path not allowed"}, status_code=403)
    p = Path(path)
    if not p.exists() or not p.is_file():
        return JSONResponse({"error": "File not found"}, status_code=404)
    try:
        content = p.read_text(encoding="utf-8", errors="replace")
        return {"path": str(p), "content": content}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


class FileWriteRequest(BaseModel):
    path: str
    content: str

@app.post("/api/file")
async def write_file_api(req: FileWriteRequest):
    """Write content to a file."""
    if not is_safe_path(req.path):
        return JSONResponse({"error": "Path not allowed"}, status_code=403)
    p = Path(req.path)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(req.content, encoding="utf-8")
        return {"ok": True, "path": str(p)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


class NewFileRequest(BaseModel):
    path: str
    is_dir: bool = False

@app.post("/api/files/create")
async def create_file_api(req: NewFileRequest):
    """Create a new file or directory."""
    if not is_safe_path(req.path):
        return JSONResponse({"error": "Path not allowed"}, status_code=403)
    p = Path(req.path)
    try:
        if req.is_dir:
            p.mkdir(parents=True, exist_ok=True)
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            if not p.exists():
                p.touch()
        return {"ok": True, "path": str(p)}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.delete("/api/file")
async def delete_file_api(path: str):
    """Delete a file (not directory)."""
    if not is_safe_path(path):
        return JSONResponse({"error": "Path not allowed"}, status_code=403)
    p = Path(path)
    if not p.exists():
        return JSONResponse({"error": "Not found"}, status_code=404)
    if p.is_dir():
        return JSONResponse({"error": "Use /api/files/delete for directories"}, status_code=400)
    p.unlink()
    return {"ok": True}


# ── WebSocket Terminal ─────────────────────────────────────────────────────

@app.websocket("/ws/terminal")
async def terminal_ws(websocket: WebSocket):
    """
    WebSocket-backed pseudo-terminal. Shells into the user's default shell.
    Each message from the client is a command string to execute.
    Output is streamed back line by line.
    """
    await websocket.accept()
    shell = os.environ.get("SHELL", "/bin/zsh")
    cwd = str(Path.home())

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                cmd = msg.get("cmd", "")
                run_cwd = msg.get("cwd", cwd)
            except json.JSONDecodeError:
                cmd = data
                run_cwd = cwd

            if not cmd.strip():
                continue

            try:
                proc = await asyncio.create_subprocess_shell(
                    cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    shell=True,
                    executable=shell,
                    cwd=run_cwd,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=30)
                output = stdout.decode("utf-8", errors="replace")
                await websocket.send_text(json.dumps({
                    "type": "output",
                    "data": output,
                    "exit_code": proc.returncode,
                }))
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "data": "Command timed out (30s limit)",
                }))
            except Exception as e:
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "data": str(e),
                }))
    except WebSocketDisconnect:
        pass


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=7876, reload=False)
