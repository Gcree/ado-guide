#!/usr/bin/env python3
"""新歌工作站 M2：從音訊算拍點、BPM、第一小節、段落和副歌高潮候選。

用法（工作站會自動叫，不用自己跑）：
  uv run --project tools/studio/py python tools/studio/py/analyze.py <音訊檔> --out <analysis.json>

做法：
- 拍點：librosa 找每一拍，再用「固定速度的格子」去套（Ado 的歌幾乎都是固定速度）。
  套得多好（多少拍落在格子上、平均差幾毫秒）決定 BPM 可不可靠。
- 兩倍／一半速度很常搞錯（195 被當成 97.5）：看拍與拍中間的重音有多強來判斷，並且一律列出兩倍和一半當備選。
- 小節第一拍：比較四種可能，看哪一種「大鼓的低頻」和「和弦變化」最常落在第一拍；明顯勝出才算知道（barKnown）。
- 段落：每小節的音色＋和聲特徵，找變化最大的地方切開，再把像的段落歸成同一類；
  出現兩次以上、能量最高的那類當副歌。副歌高潮候選＝後半段能量突然跳上去的小節線。
- 另外輸出每 0.05 秒的音量，給時間軸畫波形。
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

import numpy as np
import librosa

SR = 22050
HOP = 512
VERSION = 1
# 起音偵測比實際打下去晚一格（onset_strength 是拿這一格減上一格）：合成測試三首都晚約 25 毫秒，扣掉一格
# 真實歌曲的誤差用 bench 量（tools/studio/cli.mjs bench），需要的話再調
ONSET_LATENCY = HOP / SR


def decode(path):
    """用 ffmpeg 解成單聲道 float32；不靠 librosa 的解碼器，任何格式（m4a、webm、opus）都一樣。"""
    ff = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
    if not ff:
        sys.exit("找不到 ffmpeg：請重新執行安裝（工作站.bat／工作站.command 會自動裝）")
    r = subprocess.run([ff, "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    if r.returncode != 0:
        sys.exit("ffmpeg 解碼失敗：" + r.stderr.decode("utf-8", "replace")[-500:])
    y = np.frombuffer(r.stdout, dtype=np.float32).copy()
    if y.size < SR * 5:
        sys.exit("音訊太短（不到 5 秒）")
    return y


def fit_grid(beats):
    """用固定速度的格子套拍點：beat_k ≈ phase + k × period。回傳 phase、period、落在格子上的比例、平均誤差。

    k（第幾拍）用「相鄰兩拍各自四捨五入」累加，不用「從第一拍算起總共幾拍」：
    起始的 period 有一點點誤差（拍點只準到一格 23 毫秒）時，後者過了上百拍就會差一整拍，整個套歪。
    """
    period = float(np.median(np.diff(beats)))
    for _ in range(4):
        steps = np.maximum(1, np.round(np.diff(beats) / period))
        k = np.r_[0, np.cumsum(steps)]
        A = np.vstack([np.ones_like(k), k]).T
        coef, *_ = np.linalg.lstsq(A, beats, rcond=None)
        res = beats - A @ coef
        mask = np.abs(res) < 0.1 * coef[1]
        if mask.sum() >= 8:
            coef, *_ = np.linalg.lstsq(A[mask], beats[mask], rcond=None)
        if abs(coef[1] - period) < 1e-6:
            break
        period = float(coef[1])
    res = beats - A @ coef
    mask = np.abs(res) < 0.1 * coef[1]
    rms = float(np.sqrt(np.mean(res[mask] ** 2))) if mask.any() else 1.0
    return float(coef[0]), float(coef[1]), float(mask.mean()), rms


def onset_at(env, times):
    """某些時間點附近（±1 格）的最大起音強度。"""
    fr = librosa.time_to_frames(times, sr=SR, hop_length=HOP)
    fr = np.clip(fr, 1, len(env) - 2)
    return np.maximum(np.maximum(env[fr - 1], env[fr]), env[fr + 1])


def nice_bpm(bpm):
    r = round(bpm)
    return float(r) if abs(bpm - r) < 0.15 else round(bpm, 2)


def analyze(path):
    y = decode(path)
    dur = len(y) / SR

    # ── 拍點與 BPM ──
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    _, beat_frames = librosa.beat.beat_track(onset_envelope=env, sr=SR, hop_length=HOP, tightness=120)
    beats = librosa.frames_to_time(beat_frames, sr=SR, hop_length=HOP)
    if len(beats) < 16:
        sys.exit("抓不到足夠的拍點（不到 16 拍）")
    phase, period, inliers, rms = fit_grid(beats)
    phase -= ONSET_LATENCY

    # 兩倍速：拍與拍正中間的重音如果跟拍上差不多強，真正的速度大概是兩倍
    n_beats = int((dur - phase) / period)
    grid = phase + period * np.arange(max(0, int(np.ceil(-phase / period))), n_beats)
    on_beat = onset_at(env, grid).mean()
    off_beat = onset_at(env, grid + period / 2).mean()
    half_ratio = float(off_beat / max(on_beat, 1e-9))
    doubled = False
    if half_ratio > 0.8 and 60 / period * 2 <= 220:
        period /= 2
        doubled = True
        grid = phase + period * np.arange(max(0, int(np.ceil(-phase / period))), int((dur - phase) / period))

    bpm = 60 / period
    alternatives = [nice_bpm(b) for b in (bpm / 2, bpm * 2) if 60 <= b <= 220]
    # 兩倍／一半都像真的：鼓的打法常常分不出來（例如 97.5 和 195），交給人決定
    octave_uncertain = any(70 <= b <= 210 for b in alternatives) and not doubled

    # ── 小節第一拍：大鼓低頻＋和弦變化 ──
    mel = librosa.feature.melspectrogram(y=y, sr=SR, hop_length=HOP, n_mels=64, fmax=8000)
    low_bins = librosa.mel_frequencies(n_mels=64, fmax=8000) < 160
    low_env = librosa.onset.onset_strength(S=librosa.power_to_db(mel[low_bins]), sr=SR, hop_length=HOP)
    chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP)
    reliable = inliers >= 0.85 and rms < 0.03

    def make_grid(per):
        return phase + per * np.arange(max(0, int(np.ceil(-phase / per))), int((dur - phase) / per))

    def downbeat(g, per):
        """四種可能的第一拍，各算「大鼓低頻＋和弦變化」平均落在第一拍有多強，回傳第一小節時間和勝出幅度。"""
        low = onset_at(low_env, g + ONSET_LATENCY)
        frames = librosa.time_to_frames(g + ONSET_LATENCY, sr=SR, hop_length=HOP)
        # 第 i 欄＝第 i 拍到第 i+1 拍之間（pad=False：不要在最前面多塞一段，否則全部錯一拍）
        idx = np.r_[np.clip(frames, 0, chroma.shape[1] - 1), chroma.shape[1]]
        cs = librosa.util.sync(chroma, idx, aggregate=np.mean, pad=False)
        cs = cs / (np.linalg.norm(cs, axis=0, keepdims=True) + 1e-9)
        change = np.r_[0, 1 - np.sum(cs[:, 1:] * cs[:, :-1], axis=0)][: len(g)]
        z = lambda v: (v - v.mean()) / (v.std() + 1e-9)
        sb = z(low[: len(change)]) + z(change)
        sc = [float(sb[o::4].mean()) for o in range(4)]
        order = np.argsort(sc)[::-1]
        best = int(order[0])
        return float((g[0] + best * per) % (4 * per)), float(sc[order[0]] - sc[order[1]]), sc

    first_bar, margin, scores = downbeat(grid, period)
    bar = period * 4
    bar_known = bool(reliable and margin > 0.35)
    alts = []
    for b in alternatives:
        per = 60 / b
        fb, mg, _ = downbeat(make_grid(per), per)
        alts.append({"bpm": b, "firstBar": round(fb, 3), "barKnown": bool(reliable and mg > 0.35), "downbeatMargin": round(mg, 3)})

    # 兩倍／一半都說得通時：選「小節第一拍最明顯」的那個速度（對的速度下，和弦變化會整齊落在小節開頭）
    octave_pick = None
    if octave_uncertain and alts:
        top = max(alts, key=lambda a: a["downbeatMargin"])
        if top["downbeatMargin"] > 1.3 * margin:
            alts = [x for x in alts if x is not top] + [{"bpm": nice_bpm(bpm), "firstBar": round(first_bar, 3), "barKnown": bar_known, "downbeatMargin": round(margin, 3)}]
            period = 60 / top["bpm"]
            bpm = top["bpm"]
            grid = make_grid(period)
            first_bar, bar_known = top["firstBar"], top["barKnown"]
            margin = top["downbeatMargin"]
            bar = period * 4
            octave_pick = "downbeat"

    # ── 每小節的特徵、能量 ──
    bar_times = np.arange(first_bar, dur, bar)
    bar_frames = np.clip(librosa.time_to_frames(bar_times, sr=SR, hop_length=HOP), 0, chroma.shape[1] - 1)
    rms_fr = librosa.feature.rms(y=y, hop_length=HOP)[0]
    loud = librosa.amplitude_to_db(rms_fr, ref=np.max)
    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(mel), n_mfcc=13)
    feats = np.vstack([chroma, mfcc[1:] / 50])
    # 第 i 欄＝第 i 小節（同樣 pad=False）
    bidx = np.r_[bar_frames, chroma.shape[1]]
    bf = librosa.util.sync(feats, bidx, aggregate=np.mean, pad=False)
    be = librosa.util.sync(loud[np.newaxis, : chroma.shape[1]], bidx, aggregate=np.mean, pad=False)[0]
    nb = bf.shape[1]

    # 段落：自相似矩陣＋棋盤格核心找變化點（最短 4 小節）
    X = (bf - bf.mean(axis=1, keepdims=True)) / (bf.std(axis=1, keepdims=True) + 1e-9)
    Xn = X / (np.linalg.norm(X, axis=0, keepdims=True) + 1e-9)
    ssm = Xn.T @ Xn
    w = 4
    kern = np.kron(np.array([[1, -1], [-1, 1]]), np.ones((w, w)))
    nov = np.zeros(nb)
    for i in range(w, nb - w):
        nov[i] = np.sum(ssm[i - w:i + w, i - w:i + w] * kern)
    nov = np.maximum(nov, 0)
    peaks = []
    thr = np.percentile(nov, 70) if nb > 8 else np.inf
    for i in np.argsort(nov)[::-1]:
        if nov[i] < thr:
            break
        if all(abs(i - p) >= 4 for p in peaks):
            peaks.append(int(i))
    bounds = sorted(set([0] + peaks + [nb]))
    segs = [(a, b) for a, b in zip(bounds[:-1], bounds[1:]) if b > a]

    # 像的段落歸成同一類
    labels, cents = [], []
    for a, b in segs:
        v = Xn[:, a:b].mean(axis=1)
        v = v / (np.linalg.norm(v) + 1e-9)
        sims = [float(v @ c) for c in cents]
        if sims and max(sims) > 0.8:
            labels.append(int(np.argmax(sims)))
        else:
            cents.append(v)
            labels.append(len(cents) - 1)
    seg_energy = [float(be[a:b].mean()) for a, b in segs]
    counts = {l: labels.count(l) for l in set(labels)}
    rep = [l for l in counts if counts[l] >= 2]
    pool = rep or list(counts)
    chorus = max(pool, key=lambda l: np.mean([e for e, ll in zip(seg_energy, labels) if ll == l]))
    sections = [
        {"start": round(float(bar_times[a]), 2), "end": round(float(bar_times[b]) if b < nb else dur, 2),
         "label": chr(65 + l), "chorus": l == chorus, "energy": round(e, 1)}
        for (a, b), l, e in zip(segs, labels, seg_energy)
    ]

    # 副歌高潮候選（後半段）：能量跳上去的小節線、副歌段落的開頭
    cands = []
    for i in range(4, nb - 4):
        t = float(bar_times[i])
        if t < 0.5 * dur:
            continue
        jump = float(be[i:i + 8].mean() - be[max(0, i - 4):i].mean())
        if jump > 1.5:
            cands.append({"t": round(t, 2), "score": round(jump, 2), "why": "能量跳升"})
    for s in sections:
        if s["chorus"] and s["start"] >= 0.5 * dur:
            cands.append({"t": s["start"], "score": 3.0, "why": "副歌段落開頭"})
    cands.sort(key=lambda c: -c["score"])
    merged = []
    for c in cands:
        if not any(abs(c["t"] - m["t"]) < 3 for m in merged):
            merged.append(c)

    # 波形：每 0.05 秒的音量（0–100）
    hop_env = int(SR * 0.05)
    frames_env = librosa.feature.rms(y=y, frame_length=hop_env * 2, hop_length=hop_env)[0]
    envelope = np.round(100 * frames_env / (frames_env.max() + 1e-9)).astype(int).tolist()

    return {
        "engine": "librosa", "engineVersion": librosa.__version__, "version": VERSION,
        "duration": round(dur, 2),
        "bpm": nice_bpm(bpm), "firstBar": round(float(first_bar), 3), "barKnown": bar_known,
        "beat": {"reliable": bool(reliable), "inliers": round(inliers, 3), "rmsMs": round(rms * 1000, 1),
                 "halfRatio": round(half_ratio, 2), "doubled": doubled, "alternatives": alts, "octaveUncertain": bool(octave_uncertain), "octavePick": octave_pick,
                 "downbeatScores": [round(s, 3) for s in scores], "downbeatMargin": round(margin, 3)},
        "beats": [round(float(t), 3) for t in grid],
        "sections": sections,
        "climaxAudio": merged[:5],
        "envelope": {"hop": 0.05, "values": envelope},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out")
    a = ap.parse_args()
    res = analyze(a.audio)
    text = json.dumps(res, ensure_ascii=False)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
        print(json.dumps({k: res[k] for k in ("bpm", "firstBar", "barKnown", "beat")}, ensure_ascii=False))
    else:
        print(text)


if __name__ == "__main__":
    main()
