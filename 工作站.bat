@echo off
rem 點兩下打開新歌工作站（Windows）。第一次會先安裝需要的工具。用完把這個視窗關掉就好。
chcp 65001 >nul
cd /d "%~dp0"
set NEED=
for %%c in (node git uv ffmpeg) do (where %%c >nul 2>nul || set NEED=1)
if not exist "tools\studio\py\.venv" set NEED=1
if defined NEED (
  echo 第一次使用（或少了工具），先安裝需要的東西…
  powershell -NoProfile -ExecutionPolicy Bypass -File "tools\studio\setup\setup-windows.ps1"
  if errorlevel 1 ( pause & exit /b 1 )
  echo.
  echo 安裝好了。請關掉這個視窗，再點一次「工作站.bat」。
  pause
  exit /b 0
)
rem 專案更新後（git pull）Python 套件可能有變：很快，沒變就什麼都不做
uv sync --project tools\studio\py --quiet
node tools\studio\server.mjs --open
pause
