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
echo "建立 Python 環境（第一次要下載 PyTorch 等，約 1–2 GB，請稍等）…"
uv sync --project tools/studio/py || { echo "Python 環境建立失敗，請把上面的訊息貼給 Claude 看。"; exit 1; }
# 人聲分離、自動對時會用 Apple 晶片的 GPU（MPS）：確認 PyTorch 用得到
if [ "$(uv run --project tools/studio/py python -c "import torch; print('yes' if torch.backends.mps.is_available() else 'no')" 2>/dev/null)" = "yes" ]; then
  echo "OK  PyTorch 可以用 Apple 晶片的 GPU（人聲分離、自動對時會加速）"
else
  echo "--  PyTorch 用不到 GPU：人聲分離、自動對時會用 CPU，比較慢"
fi
echo ""
echo "安裝完成。"
