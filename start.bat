@echo off
set "WORKTREE=%~dp0"
set "DATA_DIR=H:\Other\Claude Projects\shiny-enigma\data"

echo Starting Pantry Logger (dev)...
echo Backend  ^-^> http://localhost:8001
echo Frontend ^-^> http://localhost:5173
echo.

start "Pantry - Backend" cmd /k "cd /d "%WORKTREE%" && set DATA_DIR=%DATA_DIR% && uvicorn api.main:app --reload --host 0.0.0.0 --port 8001"
start "Pantry - Frontend" cmd /k "cd /d "%WORKTREE%frontend" && npm run dev -- --host"

echo Both servers launching in separate windows.
echo Close those windows to stop.
pause
