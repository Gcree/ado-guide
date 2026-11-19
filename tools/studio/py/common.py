"""工作站 Python 工具共用：解碼音訊、選運算裝置、原子寫入 JSON。"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

import numpy as np


def decode(path, sr, channels=1):
    """用 ffmpeg 解成 float32（任何格式都一樣）；回傳 shape (channels, samples)。"""
    ff = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
    if not ff:
        sys.exit("找不到 ffmpeg：請重新執行安裝（工作站.bat／工作站.command 會自動裝）")
    r = subprocess.run([ff, "-v", "error", "-i", path, "-ac", str(channels), "-ar", str(sr), "-f", "f32le", "-"], capture_output=True)
    if r.returncode != 0:
        sys.exit("ffmpeg 解碼失敗：" + r.stderr.decode("utf-8", "replace")[-500:])
    y = np.frombuffer(r.stdout, dtype=np.float32).copy()
    return y.reshape(-1, channels).T


def pick_device(want="auto"):
    """NVIDIA（cuda）→ Apple 晶片（mps）→ CPU。"""
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    import torch
    if want and want != "auto":
        return want
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def write_json_atomic(path, obj, ensure_ascii=False):
    """原子寫入 JSON：拒絕 NaN／Infinity，先寫暫存檔再用 os.replace 取代。"""
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=ensure_ascii, allow_nan=False)
    fd, tmp = tempfile.mkstemp(prefix=".studio-tmp-", suffix=".json", dir=parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
