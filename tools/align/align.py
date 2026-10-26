import json
import os
import re
import sys
import numpy as np
import pykakasi
import whisperx

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_DIR = os.path.join(SCRIPT_DIR, "work", "input")
STEMS_DIR = os.path.join(SCRIPT_DIR, "work", "stems", "htdemucs")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "work", "aligned")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# 1. Text Preprocessor setup
kks = pykakasi.kakasi()

def preprocess_text(text: str) -> str:
    # 1.1 Replace 漢字(かな/カナ) with kana inside parenthesis
    text = re.sub(r'[\u4e00-\u9faf\u3400-\u4dbf]+[（(]([\u3040-\u309f\u30a0-\u30ff]+)[）)]', r'\1', text)
    # 1.2 Convert kanji to hiragana
    converted = "".join([item["hira"] for item in kks.convert(text)])
    # 1.3 Keep English/alphanumeric and Japanese kana, strip punctuation and whitespace
    cleaned = re.sub(r'[^\w\u3040-\u309f\u30a0-\u30ff]|[\s_]', '', converted, flags=re.UNICODE)
    return cleaned

def align_song(song_id: str, model_a, metadata, device="cpu"):
    input_file = os.path.join(INPUT_DIR, f"{song_id}.json")
    if not os.path.exists(input_file):
        raise FileNotFoundError(f"Input file not found: {input_file}")

    with open(input_file, "r", encoding="utf-8") as f:
        lines = json.load(f)

    audio_file = os.path.join(STEMS_DIR, song_id, "vocals.wav")
    if not os.path.exists(audio_file):
        raise FileNotFoundError(f"Vocals audio not found: {audio_file}")

    print(f"\n[{song_id}] Loading audio: {audio_file}")
    audio = whisperx.load_audio(audio_file)
    audio_duration = len(audio) / 16000.0
    print(f"[{song_id}] Audio length: {audio_duration:.2f}s, lines: {len(lines)}")

    results = []

    for line in lines:
        idx = line["i"]
        jp = line["jp"]
        old_time = float(line["time"])
        next_time = float(line["nextTime"])
        is_filler = line.get("filler", False)

        if is_filler:
            print(f"  Line {idx:2d}: [SKIP] {jp}", flush=True)
            results.append({
                "i": idx,
                "jp": jp,
                "old": round(old_time, 2),
                "cand": None,
                "diff": None,
                "score": None,
                "flag": "skip"
            })
            continue

        cleaned_text = preprocess_text(jp)
        if not cleaned_text:
            print(f"  Line {idx:2d}: [REVIEW - Empty text] {jp}", flush=True)
            results.append({
                "i": idx,
                "jp": jp,
                "old": round(old_time, 2),
                "cand": None,
                "diff": None,
                "score": None,
                "flag": "review"
            })
            continue

        # Window: [time - 2, nextTime + 2] clamped to [0, audio_duration]
        start_sec = max(0.0, old_time - 2.0)
        end_sec = min(audio_duration, next_time + 2.0)
        if end_sec <= start_sec:
            end_sec = min(audio_duration, start_sec + 2.0)

        segment = [{
            "text": cleaned_text,
            "start": start_sec,
            "end": end_sec
        }]

        cand_time = None
        cand_score = None
        flag = "review"

        try:
            align_res = whisperx.align(
                segment,
                model_a,
                metadata,
                audio,
                device=device,
                return_char_alignments=True
            )

            aligned_items = []
            if "segments" in align_res and align_res["segments"]:
                seg0 = align_res["segments"][0]
                if "chars" in seg0 and seg0["chars"]:
                    aligned_items = [c for c in seg0["chars"] if isinstance(c, dict) and c.get("start") is not None]
                elif "words" in seg0 and seg0["words"]:
                    aligned_items = [w for w in seg0["words"] if isinstance(w, dict) and w.get("start") is not None]

            if aligned_items:
                first_item = aligned_items[0]
                cand_time = round(float(first_item["start"]), 2)
                raw_score = first_item.get("score")
                cand_score = round(float(raw_score), 3) if raw_score is not None else 0.0
                diff = round(cand_time - old_time, 2)

                if cand_score < 0.5 or abs(diff) > 1.5:
                    flag = "review"
                else:
                    flag = "ok"

                print(f"  Line {idx:2d}: [{flag.upper():6s}] cand={cand_time:.2f}s (old={old_time:.2f}s, diff={diff:+.2f}s, score={cand_score:.2f}) text='{cleaned_text[:12]}'", flush=True)
            else:
                diff = None
                flag = "review"
                print(f"  Line {idx:2d}: [REVIEW - No alignment] old={old_time:.2f}s text='{cleaned_text[:12]}'", flush=True)

        except Exception as e:
            diff = None
            flag = "review"
            print(f"  Line {idx:2d}: [ERROR - {e}] old={old_time:.2f}s", flush=True)

        results.append({
            "i": idx,
            "jp": jp,
            "old": round(old_time, 2),
            "cand": cand_time,
            "diff": diff,
            "score": cand_score,
            "flag": flag
        })

    out_path = os.path.join(OUTPUT_DIR, f"{song_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"[{song_id}] Saved {len(results)} lines to {out_path}", flush=True)
    return results

def main():
    songs_to_process = sys.argv[1:] if len(sys.argv) > 1 else ["show", "odo", "kokoro"]
    device = "cpu"

    print("Loading WhisperX Japanese alignment model...")
    model_a, metadata = whisperx.load_align_model(language_code="ja", device=device)
    print("Alignment model ready.")

    for s_id in songs_to_process:
        align_song(s_id, model_a, metadata, device=device)

if __name__ == "__main__":
    main()
