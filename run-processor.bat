@echo off
title Image Processor
color 0A

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed! Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

REM Navigate to the script directory
cd /d "%~dp0"

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo Error installing dependencies!
        pause
        exit /b 1
    )
)

REM Start the application
echo Starting Image Processor...
node index.js

REM If we get here, there was probably an error
echo.
echo Application stopped. Press any key to exit...
pause >nul