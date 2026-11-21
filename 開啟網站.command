#!/bin/bash
# 點兩下就能在本機打開網站。YouTube 只允許從 http 網址嵌入播放，直接點開 index.html 不會播。
# 看完把這個終端機視窗關掉就好。
cd "$(dirname "$0")" || exit 1
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do
  if [ -x "$b" ]; then eval "$("$b" shellenv)"; break; fi
done
if ! command -v python3 >/dev/null 2>&1; then
  echo "找不到 python3。請先安裝 Python 3 或點開「工作站.command」。"
  read -r -p "按 Enter 關閉…"
  exit 1
fi
PORT=8765
if curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then
  echo "本機網站已經在跑了：http://localhost:$PORT/"
  open "http://localhost:$PORT/"
  exit 0
fi
# 本機的 index.html 固定載 style.css?v=dev2、app.js?v=dev2，瀏覽器會沿用舊檔；一律回 no-store，改完重新整理就看得到
python3 -c '
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
class NoStore(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), NoStore).serve_forever()
' "$PORT" &
PID=$!
trap 'kill "$PID" 2>/dev/null' EXIT INT TERM
ready=0
for _ in $(seq 1 50); do
  if ! kill -0 "$PID" 2>/dev/null; then break; fi
  if curl -sf "http://127.0.0.1:$PORT/" >/dev/null 2>&1; then ready=1; break; fi
  sleep 0.1
done
if [ "$ready" = 1 ]; then
  open "http://localhost:$PORT/"
  wait "$PID" || read -r -p "按 Enter 關閉…"
else
  echo "無法在連接埠 $PORT 啟動本機網站（可能被其他程式占用了）。"
  wait "$PID" 2>/dev/null
  read -r -p "按 Enter 關閉…"
  exit 1
fi
