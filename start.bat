@echo off
echo ========================================
echo    X.com AI Analyzer - Production Mode
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python from https://python.org/
    pause
    exit /b 1
)

echo Installing dependencies...
cd server
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Node.js dependencies
    pause
    exit /b 1
)

echo.
echo Installing Python dependencies...
pip install chromadb openai
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)

echo.
echo Starting ChromaDB server...
start "ChromaDB" cmd /k "chroma run --host localhost --port 8000"

REM Wait for ChromaDB to start
echo Waiting for ChromaDB to start...
timeout /t 8 /nobreak > nul

echo Starting AI server...
start "X.com AI Server" cmd /k "npm start"

echo.
echo ========================================
echo           SERVICES STARTED!
echo ========================================
echo ChromaDB: http://localhost:8000
echo AI Server: http://localhost:3001
echo.
echo NEXT STEPS:
echo 1. Get your OpenAI API key from https://platform.openai.com/api-keys
echo 2. Load the Chrome extension:
echo    - Open chrome://extensions/
echo    - Enable Developer mode
echo    - Click 'Load unpacked' and select this directory
echo 3. Configure the extension with your API key
echo 4. Start analyzing tweets!
echo.
echo Press any key to open Chrome extensions page...
pause >nul
start chrome://extensions/
