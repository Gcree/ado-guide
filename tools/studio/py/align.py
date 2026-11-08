#!/usr/bin/env python3
"""新歌工作站 M3：把「已知的歌詞」對到人聲上，算每一句的開始時間和信心分數。

用法（工作站會自動叫）：
  uv run --project tools/studio/py python tools/studio/py/align.py <vocals.wav> --lines lines.json --out align.json [--model auto]

- lines.json：[{"n": 3, "text": "確かなものは何もない"}, …]（只放要對的句子；（間奏）這種不用放）
- 用 stable-ts 的 align（Whisper）：不是聽寫，是把已知的字對到聲音上，比聽寫準。
- 每句的信心＝那句每個字的機率平均；沒對上的句子 start 是 null。
- 模型：有顯卡用 large-v3（約 3 GB，第一次下載），沒有用 medium；可以用 --model 指定（tiny／base／small／medium／large-v3）。
"""
import argparse
import json
import re
import sys
import time


def clean(text):
    # 漢字後面的讀音標注拿掉：「模(かたど)る」→「模る」；其他括號（例如和聲「(Two-Sided Two-Face)」）也要唱，只拿掉括號
    text = re.sub(r"([一-鿿々〆ヶ])[（(][ぁ-ゖァ-ヺー・]+[）)]", r"\1", text)
    text = re.sub(r"[（()）]", " ", text)
    return re.sub(r"\s+", " ", text.replace("　", " ")).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--lines", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--model", default="auto")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--language", default="ja")
    a = ap.parse_args()

    import stable_whisper
    from common import pick_device

    lines = json.load(open(a.lines, encoding="utf-8"))
    lines = [dict(l, clean=clean(l["text"])) for l in lines]
    lines = [l for l in lines if l["clean"]]
    if not lines:
        sys.exit("沒有要對齊的句子")

    t0 = time.time()
    device = pick_device(a.device)
    name = a.model if a.model != "auto" else ("large-v3" if device == "cuda" else "medium")
    model = stable_whisper.load_model(name, device=device if device != "mps" else "cpu")
    # 一行一句：original_split 讓每一行各自成一段，對回來時一句一段
    text = "\n".join(l["clean"] for l in lines)
    result = model.align(a.audio, text, language=a.language, original_split=True)
    if result is None:
        sys.exit("對齊失敗（可能人聲太小聲或歌詞跟聲音對不起來）")

    segs = [s for s in result.segments if s.text.strip()]
    out = []
    # 正常情況一句一段；段數不一樣時，用文字依序配對
    norm = lambda s: re.sub(r"\s+", "", s)
    j = 0
    for l in lines:
        seg = None
        for k in range(j, min(j + 3, len(segs))):
            st = norm(segs[k].text)
            if st and (st in norm(l["clean"]) or norm(l["clean"]) in st or st[:4] == norm(l["clean"])[:4]):
                seg, j = segs[k], k + 1
                break
        if seg is None:
            out.append({"n": l["n"], "start": None, "end": None, "conf": 0.0})
            continue
        probs = [w.probability for w in (seg.words or []) if w.probability is not None]
        conf = sum(probs) / len(probs) if probs else 0.0
        out.append({"n": l["n"], "start": round(seg.start, 3), "end": round(seg.end, 3), "conf": round(conf, 3), "text": seg.text.strip()})

    res = {"model": name, "device": device, "seconds": round(time.time() - t0, 1), "lines": out}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False)
    found = sum(1 for o in out if o["start"] is not None)
    print(json.dumps({"model": name, "device": device, "seconds": res["seconds"], "aligned": found, "of": len(out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
