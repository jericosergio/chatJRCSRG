@echo off
setlocal
cd /d "%~dp0"

where bash >nul 2>nul
if errorlevel 1 (
  echo Git Bash not found in PATH.
  echo Install Git for Windows and ensure "bash" is available.
  pause
  exit /b 1
)

bash "%~dp0run-app.sh"
