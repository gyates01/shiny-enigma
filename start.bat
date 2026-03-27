@echo off
set "DATA_DIR=H:\Other\Claude Projects\shiny-enigma\data"
cd /d "%~dp0"

echo Starting Pantry Logger (dev)...
echo Backend  -^> http://localhost:8001  (API)
echo Frontend -^> http://localhost:5173  (UI)
echo Press Ctrl+C to stop.
echo.

start /b "" uvicorn api.main:app --reload --host 0.0.0.0 --port 8001
cd frontend
npm run dev -- --host
