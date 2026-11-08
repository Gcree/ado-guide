#!/usr/bin/env python3
"""新歌工作站 M3：用 Demucs（htdemucs）把人聲分出來，給字幕對齊用。

用法（工作站會自動叫）：
  uv run --project tools/studio/py python tools/studio/py/separate.py <音訊檔> --out <vocals.wav> [--device auto]

- 第一次會下載模型（約 80 MB，dl.fbaipublicfiles.com）。
- 有 NVIDIA 顯卡用 cuda，Apple 晶片用 mps，否則 CPU（一首歌大約幾分鐘）。
- 存成 44.1 kHz 單聲道 16 位元 wav（對齊、畫波形都夠用，檔案小）。
"""
import argparse
import json
import sys
import time

import numpy as np
import soundfile as sf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out", required=True)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--model", default="htdemucs")
    a = ap.parse_args()

    import torch
    from demucs.apply import apply_model
    from demucs.pretrained import get_model
    from common import decode, pick_device

    t0 = time.time()
    device = pick_device(a.device)
    model = get_model(a.model)
    model.eval()
    wav = torch.from_numpy(decode(a.audio, model.samplerate, channels=2))
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        try:
            out = apply_model(model, ((wav - mean) / std)[None], device=device, split=True, overlap=0.25, progress=False)[0]
        except RuntimeError as e:
            if device == "cpu":
                raise
            print(f"{device} 失敗，改用 CPU：{e}", file=sys.stderr)
            device = "cpu"
            out = apply_model(model, ((wav - mean) / std)[None], device="cpu", split=True, overlap=0.25, progress=False)[0]
    out = out * std + mean
    vocals = out[model.sources.index("vocals")].mean(0).cpu().numpy()
    peak = float(np.abs(vocals).max()) or 1.0
    sf.write(a.out, (vocals / max(peak, 1.0)).astype(np.float32), model.samplerate, subtype="PCM_16")
    print(json.dumps({"vocals": a.out, "device": device, "seconds": round(time.time() - t0, 1), "model": a.model}))


if __name__ == "__main__":
    main()
