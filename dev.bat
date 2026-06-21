@echo off
echo.
echo  Starting AI Content Studio...
echo.

:: Start mock backend in new window
start "Backend :8000" cmd /k "cd /d %~dp0 && python mock_backend.py"

:: Wait a moment for backend to start
timeout /t 2 /nobreak >nul

:: Start Next.js frontend in new window
start "Frontend :3000" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Wait for Next.js to compile then open browser
timeout /t 5 /nobreak >nul
start http://localhost:3000

echo  Done! Two windows opened.
echo  Close both black windows to stop.
