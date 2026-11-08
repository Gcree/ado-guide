#!/bin/bash
# 點兩下打開新歌工作站（Mac）。第一次會先安裝需要的工具。用完把這個終端機視窗關掉就好。
cd "$(dirname "$0")" || exit 1
# 從 Finder 點開時不會載入 .zprofile：補上 Homebrew 的路徑
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$b" ]; then eval "$("$b" shellenv)"; break; fi
done
need=0
for c in node git uv ffmpeg; do command -v "$c" >/dev/null 2>&1 || need=1; done
[ -d tools/studio/py/.venv ] || need=1
if [ "$need" = 1 ]; then
  echo "第一次使用（或少了工具），先安裝需要的東西…"
  bash tools/studio/setup/setup-mac.sh || { read -r -p "按 Enter 關閉…"; exit 1; }
fi
# 專案更新後（git pull）Python 套件可能有變：很快，沒變就什麼都不做
uv sync --project tools/studio/py --quiet
node tools/studio/server.mjs --open
