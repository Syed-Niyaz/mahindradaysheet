@echo off
title Stop Bellary Motors Day Sheet
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\stop_services.ps1"

echo.
echo Press any key to close this window...
pause >nul
