@echo off
title Bellary Motors Day Sheet - Launcher
cd /d "%~dp0"

echo =======================================================
echo  Starting Bellary Motors Day Sheet Application...
echo =======================================================

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Node.js is not found on your system!
    echo Please install Node.js from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start_services.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Launcher encountered an issue.
    pause
)
