#!/bin/bash
# 點兩下打開新歌工作站（Mac）。用完把這個終端機視窗關掉就好。
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "找不到 Node.js，請先到 https://nodejs.org/ 安裝 LTS 版（或 brew install node），再點一次。"
  read -r -p "按 Enter 關閉…"
  exit 1
fi
command -v git >/dev/null 2>&1 || echo "提醒：找不到 git，存檔可以用，但「同步」和「發布」不能用。"
node tools/studio/server.mjs --open
