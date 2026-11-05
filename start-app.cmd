@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\.bin\vite.cmd" (
  echo Project dependencies are missing. Run pnpm install after repairing Node.js/npm.
  exit /b 1
)

if not exist "node_modules\.bin\electron.cmd" (
  echo Electron is missing. Run pnpm install after repairing Node.js/npm.
  exit /b 1
)

call "node_modules\.bin\vite.cmd" build
if errorlevel 1 (
  echo.
  echo Build failed. The application was not started.
  exit /b 1
)

start "" /D "%~dp0" "%~dp0node_modules\.bin\electron.cmd" .
if errorlevel 1 (
  echo Failed to start Electron.
  exit /b 1
)

echo Application launched. This terminal can now be closed.
exit /b 0
