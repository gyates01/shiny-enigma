@echo off
echo Building frontend...
cd frontend
call npm run build
if %errorlevel% neq 0 (
    echo Frontend build failed.
    pause
    exit /b 1
)
cd ..
echo.
echo Starting Recipe App at http://localhost:8000
echo Press Ctrl+C to stop.
echo.
uvicorn api.main:app --host 0.0.0.0 --port 8000
pause
