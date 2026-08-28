@echo off
cd /d "C:\Users\Chouiba\Desktop\folders desktop\CRM"
set PATH=C:\Program Files\nodejs;%PATH%
echo Killing old Electron / Vite...
taskkill /IM electron.exe /F >nul 2>&1
taskkill /IM "LocAgence Pro.exe" /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak >nul
echo.
echo Starting LocAgence Pro (npm run dev)...
echo Keep this window open.
echo.
call "C:\Program Files\nodejs\npm.cmd" run dev
pause
