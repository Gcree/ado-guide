@echo off
rem 點兩下打開新歌工作站（Windows）。用完把這個視窗關掉就好。
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js，請先到 https://nodejs.org/ 安裝 LTS 版，再點一次。
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 echo 提醒：找不到 git，存檔可以用，但「同步」和「發布」不能用。
node tools\studio\server.mjs --open
pause
