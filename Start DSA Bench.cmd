@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.18 or newer is required. Install Node.js, then open this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing DSA Bench dependencies...
  if exist package-lock.json (
    call npm ci
    if errorlevel 1 call npm install
  ) else (
    call npm install
  )
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"
if errorlevel 1 pause
