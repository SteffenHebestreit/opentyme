@echo off
:: =============================================================================
:: OpenTYME - Hosts File Setup Script (Windows Batch)
:: =============================================================================
:: This script will launch the PowerShell setup script with Administrator rights.
:: Simply double-click this file to run.
:: =============================================================================

echo.
echo ==========================================
echo   OpenTYME - Local Domain Setup
echo ==========================================
echo.

:: Check if already running as admin
net session >nul 2>&1
if %errorLevel% == 0 (
    echo Running with Administrator privileges...
    echo.
    goto :RunScript
) else (
    echo This script requires Administrator privileges.
    echo Requesting elevation...
    goto :Elevate
)

:Elevate
:: Self-elevate to admin
powershell -Command "Start-Process '%~f0' -Verb RunAs"
exit /b

:RunScript
:: Get the directory where this script is located
cd /d "%~dp0"

:: Run the PowerShell script
powershell -ExecutionPolicy Bypass -File "%~dp0setup-hosts.ps1"

echo.
echo Press any key to close...
pause >nul
