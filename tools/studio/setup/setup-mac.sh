#!/bin/bash
# 新歌工作站：Mac 安裝（第一次，或補裝缺的東西）
# 用 Homebrew 裝 Git、Node.js、FFmpeg、uv，再用 uv 建工作站的 Python 環境（yt-dlp 等）
# 「工作站.command」發現缺東西時會自動叫這支；也可以自己跑：bash tools/studio/setup/setup-mac.sh
cd "$(dirname "$0")/../../.." || exit 1
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if ! command -v brew >/dev/null 2>&1 && [ -x "$b" ]; then eval "$("$b" shellenv)"; fi
done
if ! command -v brew >/dev/null 2>&1; then
  echo "找不到 Homebrew。請先照 https://brew.sh 的說明安裝，再點一次。"
  exit 1
fi
for p in git node ffmpeg uv; do
  if command -v "$p" >/dev/null 2>&1; then echo "OK  $p"; else echo "安裝 $p…"; brew install "$p" || exit 1; fi
done
echo "建立 Python 環境（第一次要下載，請稍等）…"
uv sync --project tools/studio/py || { echo "Python 環境建立失敗，請把上面的訊息貼給 Claude 看。"; exit 1; }
# 之後的人聲分離、自動對時（M3）會用 Apple 晶片的 GPU（MPS）
if [ "$(uname -m)" = "arm64" ]; then echo "OK  Apple 晶片：之後的分析會用 MPS 加速"; fi
echo ""
echo "安裝完成。"
