import subprocess
import os
import sys
import json
import numpy as np

sys.stdout.reconfigure(encoding="utf-8")

FFMPEG = r"C:\Users\gary2\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"

SONGS_TO_ALIGN = [
    {"id": "show", "name": "唱", "mv": "pgXpM4l_MwI", "live": "Igr6jQJEoNs"},
    {"id": "usseewa", "name": "うっせぇわ", "mv": "Qp3b-RXtz4w", "live": "8dnjqzodjgo"},
    {"id": "odo", "name": "踊", "mv": "YnSW8ian29w", "live": "YGx5fcgEuwA"},
    {"id": "shinjidai", "name": "新時代", "mv": "1FliVTcX8bQ", "live": "v79I6c7fWtA"},
    {"id": "rule", "name": "ルル", "mv": "0Z_YqhYHhpg", "live": "prIfzzEGEcw"},
    {"id": "giragira", "name": "ギラギラ", "mv": "sOiMD45QGLs", "live": "GQrEitDFQos"},
    {"id": "kokoro", "name": "心という名の不可解", "mv": "BMb5IetESGE", "live": "H-UbEcmIKSc"},
    {"id": "aiaia", "name": "アイ・アイ・ア", "mv": "_8CNByAq1n4", "live": "K9xb-JrhG50"},
    {"id": "rockstar", "name": "ロックスター", "mv": "hRJpiCZlLX8", "live": "NVutx0Olj8E"},
    {"id": "monstruo", "name": "モンストロ", "mv": "4IKHox-DKrM", "live": "bVdCJluq0RE"},
    {"id": "kaze", "name": "風のゆくえ", "mv": "YO-rXgQKlF8", "live": "iDvuZ7mRiJ0"},
    {"id": "sakura", "name": "桜日和とタイムマシン", "mv": "nIWZfhpnq6M", "live": "Vrr2gFTYMGQ"},
    {"id": "unravel", "name": "unravel", "mv": "eZuDklxsaRg", "live": "khplMpm4ctc"},
    {"id": "hibana", "name": "ヒバナ", "mv": "EFsSYiNl2AQ", "live": "JsZASL6V0QU"},
    {"id": "kira", "name": "綺羅", "mv": "qpcz3-iDUP8", "live": "Cjtt_BlQ6Us"}
]

def download_audio_head(yt_id, out_name):
    url = f"https://www.youtube.com/watch?v={yt_id}"
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-f", "ba",
        "--no-playlist",
        "--quiet", "--no-warnings",
        "-o", out_name,
        url
    ]
    subprocess.run(cmd, check=True)

def load_audio_pcm(filepath, duration=50, sr=16000):
    cmd = [
        FFMPEG, "-y", "-ss", "0", "-t", str(duration),
        "-i", filepath,
        "-ac", "1", "-ar", str(sr),
        "-f", "s16le", "-"
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    raw, _ = proc.communicate()
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    max_val = np.max(np.abs(samples)) or 1.0
    return samples / max_val, sr

def envelope(sig, window=160):
    sq = sig ** 2
    kern = np.ones(window) / window
    return np.sqrt(np.convolve(sq, kern, mode='same'))

def calculate_offset(mv_file, live_file):
    mv_sig, _ = load_audio_pcm(mv_file, duration=25)
    live_sig, _ = load_audio_pcm(live_file, duration=75)

    mv_env = envelope(mv_sig)[::16]  # 1kHz downsampled envelope
    live_env = envelope(live_sig)[::16]

    corr = np.correlate(live_env, mv_env, mode='valid')
    best_lag_samples = np.argmax(corr)
    offset_sec = best_lag_samples / 1000.0
    return round(offset_sec, 2)

def main():
    print("=== 開始自動計算 15 首官方 LIVE 映像之時間偏移量 (Offset) ===\n")
    results = {}
    if os.path.exists("live_offsets_calibrated.json"):
        try:
            with open("live_offsets_calibrated.json", "r", encoding="utf-8") as f:
                results = json.load(f)
        except Exception:
            results = {}
    
    for i, item in enumerate(SONGS_TO_ALIGN):
        sid = item["id"]
        name = item["name"]
        mv_yt = item["mv"]
        live_yt = item["live"]
        
        if sid in results and results[sid] != 0.0:
            print(f"[{i+1}/{len(SONGS_TO_ALIGN)}] 《{name}》 已有紀錄: {results[sid]:+.2f} 秒，跳過。")
            continue

        print(f"[{i+1}/{len(SONGS_TO_ALIGN)}] 正在分析 《{name}》 ({sid})...")
        mv_file = f"temp_{sid}_mv.webm"
        live_file = f"temp_{sid}_live.webm"
        
        try:
            download_audio_head(mv_yt, mv_file)
            download_audio_head(live_yt, live_file)
            
            offset = calculate_offset(mv_file, live_file)
            results[sid] = offset
            print(f"  ✓ 檢測完成！現場版時間偏移量: {offset:+.2f} 秒\n")
        except Exception as e:
            print(f"  ⚠ 分析失敗: {e}，預設為 0.00 秒\n")
            results[sid] = 0.0
        finally:
            if os.path.exists(mv_file): os.remove(mv_file)
            if os.path.exists(live_file): os.remove(live_file)
            
        with open("live_offsets_calibrated.json", "w", encoding="utf-8") as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
            
    print("==========================================")
    print("所有 Live 偏移量已計算完成：")
    for k, v in results.items():
        print(f"  - {k}: {v:+.2f}s")
    print("==========================================")

if __name__ == "__main__":
    main()
