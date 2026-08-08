@echo off
cd /d "%~dp0"
echo === Startup Script ===
echo.
echo Checking dependencies...
call npm install
echo.
echo Starting server in development mode...
call npm run dev
pause
