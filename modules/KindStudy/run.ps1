$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path venv)) {
    py -m venv venv
}

& .\venv\Scripts\Activate.ps1
pip install -q -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 7871
