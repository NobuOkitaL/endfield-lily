@echo off
rem Windows double-click launcher for start.mjs.
rem Usage:  double-click start.cmd, OR run from cmd:  start.cmd backend frontend
setlocal enabledelayedexpansion

set "REPO=%~dp0"
if "%REPO:~-1%"=="\" set "REPO=%REPO:~0,-1%"

where node >nul 2>nul
if errorlevel 1 (
  echo [start.cmd] Node.js 20+ not found. Install from https://nodejs.org/ ^(check "Add to PATH" during install^).
  echo.
  pause
  exit /b 1
)

node "%REPO%\start.mjs" %*
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo [start.cmd] Exited with code %EXITCODE%.
  pause
)
exit /b %EXITCODE%
