#!/bin/bash
# 點兩下就能在本機打開網站。YouTube 只允許從 http 網址嵌入播放，直接點開 index.html 不會播。
# 看完把這個終端機視窗關掉就好。
cd "$(dirname "$0")" || exit 1
PORT=8765
(sleep 1; open "http://localhost:$PORT/") &
python3 -m http.server "$PORT" --bind 127.0.0.1
