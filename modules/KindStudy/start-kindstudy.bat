@echo off
cd /d "%~dp0"
start "KindStudy" powershell -NoProfile -ExecutionPolicy Bypass -File ".\run.ps1"
timeout /t 3 /nobreak >nul
start "" http://localhost:7871
