@echo off
echo ========================================
echo Start Spell Tower Detection Services
echo ========================================
echo.

:: Start Python detection service (resident memory)
echo [*] Starting Python detection service...
start "Python Service" cmd /k "cd /d %~dp0 && E:\anaconda\python.exe scripts/spell_tower_server.py"

:: Wait for Python service to start
echo [*] Waiting for Python service...
timeout /t 10 /nobreak >nul

:: Start Node.js service
echo [*] Starting Node.js service...
start "Node.js Service" cmd /k "cd /d %~dp0 && node server.js"

echo.
echo ========================================
echo Services started!
echo Python Service: http://localhost:6174
echo Node.js Service: http://localhost:3001
echo ========================================
echo.
pause
