#!/usr/bin/env python3
"""新歌工作站：人聲音量曲線，給「貼齊聲音」用。

用法（工作站會自動叫）：
  uv run --project tools/studio/py python tools/studio/py/vocal_env.py <vocals.wav> --out <vocal-env.json>

每 10 毫秒一個值：30 毫秒視窗的音量（dB），四捨五入到 0.5 dB 後乘 2 存成整數，檔案比較小。
"""
import argparse
import json

import numpy as np
import soundfile as sf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    y, sr = sf.read(a.audio, dtype="float32")
    if y.ndim > 1:
        y = y.mean(axis=1)
    hop, win = int(sr * 0.01), int(sr * 0.03)
    pad = np.pad(y, (0, max(0, win - len(y) % hop)))
    fr = np.lib.stride_tricks.sliding_window_view(pad, win)[::hop]
    db = 20 * np.log10(np.sqrt((fr ** 2).mean(axis=1)) + 1e-5)
    vals = np.round(np.clip(db, -100, 0) * 2).astype(int).tolist()
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump({"hop": 0.01, "scale": 2, "values": vals}, f)
    print(json.dumps({"frames": len(vals)}))


if __name__ == "__main__":
    main()
