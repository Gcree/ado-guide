# 交接計畫：歌詞時間「對齊小型驗證」（給 Gemini）

> 步驟 1–7 已完成。接下來請照 `GEMINI-HANDOFF-v2.md` 做（修正報告、對齊與寫回檢查）。本檔的禁止事項仍然有效。

## 0. 目標與範圍

用 WhisperX 自動產生每行歌詞的**候選開始時間**，再用 WaveSurfer.js 校正頁人工確認，最後**只把 `time` 寫回** `song-lyrics.js`。
這次只做三首，用來判斷值不值得套用到全部 74 首。

| id | 歌名 | YouTube ID（網站正在用的 MV） | 長度 | 行數 | 測試重點 |
|---|---|---|---|---|---|
| `show` | 唱 | `pgXpM4l_MwI` | 190s | 52 | 節奏明確、重複句多 |
| `odo` | 踊 | `YnSW8ian29w` | 209s | 36 | 歌詞密、唱得快 |
| `kokoro` | 心という名の不可解 | `BMb5IetESGE` | 270s | 62 | 慢歌、長音多 |

### 專案背景（先讀）

- 靜態網站，GitHub Pages 發布。`scripts/build.mjs` 只複製固定檔案到 `dist/`，所以 `tools/` 不會被發布。
- 歌詞資料在 `song-lyrics.js`：`SONGS[].lyrics[]`，每行是 `{ time, jp, tr, acts?, sing?, call? }`。
  - `time`：該行開始秒數（小數兩位）。**這次唯一可以改的欄位。**
  - `jp` 整行是全形括號（例如「（間奏）」「（觀眾接唱）」）的行是補位行，不是真的歌詞 → 不對齊，保留原時間。
- 用 Node 讀資料：`require("./song-lyrics.js")` 會回傳 SONGS 陣列。

### 資料夾規劃

```
tools/align/
  GEMINI-HANDOFF.md   ← 本檔
  export_lines.mjs    ← 匯出三首的行資料（唯讀原始檔）
  align.py            ← WhisperX 逐行對齊
  report.mjs          ← 產出比較報告
  calibrate.html      ← WaveSurfer 校正頁
  merge_times.mjs     ← 只寫回 time
  verify_merge.mjs    ← 檢查除了 time 以外全部沒變
  REPORT.md           ← 最終報告（不含音訊）
  .venv/              ← Python 環境（不進 git）
  work/               ← 音訊、人聲、模型輸出、校正結果（不進 git）
```

---

## 1. 步驟

### 步驟 1：前置檢查與 .gitignore

- `git status` 必須是乾淨的；記下 `git rev-parse HEAD` 寫進報告。不要切換或建立分支。
- 在 `.gitignore` 加兩行：
  ```
  tools/align/work/
  tools/align/.venv/
  ```
- 完成標準：`git check-ignore tools/align/work/x.wav tools/align/.venv/x` 兩個路徑都印出來。

### 步驟 2：安裝環境

- 先確認 `ffmpeg -version` 可用；沒有的話**停下來問使用者**，不要自己用 brew 裝。
- Python 3.10 或 3.11 建虛擬環境：`python3 -m venv tools/align/.venv`
- 在 venv 內安裝：`whisperx`、`demucs`、`pykakasi`、`yt-dlp`。
- Mac 用 CPU 跑，`compute_type="int8"`。
- 完成標準：`tools/align/.venv/bin/python -c "import whisperx, demucs, pykakasi"` 不報錯；把各套件版本記進報告。

### 步驟 3：下載音訊（只從網站用的那支 MV）

```
tools/align/.venv/bin/yt-dlp -x --audio-format wav -o "tools/align/work/audio/<id>.%(ext)s" "https://www.youtube.com/watch?v=<YouTube ID>"
```

- 一定用上表的 YouTube ID，不能換成 Topic 音訊版、Lyric Video 或其他剪輯（版本不同時間會差 0.3 秒以上）。
- 完成標準：`work/audio/show.wav`、`odo.wav`、`kokoro.wav` 存在，長度和表中 `duration` 相差 3 秒內（用 `ffprobe` 檢查）。

### 步驟 4：人聲分離

```
tools/align/.venv/bin/python -m demucs --two-stems vocals -n htdemucs -o tools/align/work/stems tools/align/work/audio/<id>.wav
```

- 完成標準：每首都有 `work/stems/htdemucs/<id>/vocals.wav`。

### 步驟 5：匯出行資料 `export_lines.mjs`

- 讀 `song-lyrics.js`（唯讀），每首輸出 `work/input/<id>.json`：`[{ i, time, nextTime, jp, filler }]`
  - `nextTime`：下一行的 `time`，最後一行用 `duration`。
  - `filler`：`jp` 整行是全形括號時為 `true`。
- 完成標準：三個檔案的行數 = 52 / 36 / 62。

### 步驟 6：WhisperX 逐行對齊 `align.py`

- 用 `whisperx.load_align_model(language_code="ja")` 和 `whisperx.align(...)`，輸入人聲 `vocals.wav`。
- **每行當一個 segment**：範圍 `[time - 2, nextTime + 2]`（夾在 0 和曲長之間），避免副歌重複時飄到另一次副歌。
- 文字前處理：
  - `jp` 裡有 `漢字(かな)` 寫法時用括號內的假名；其他漢字用 pykakasi 轉平假名。
  - 去掉標點與空白；英文保留。
  - `filler` 行跳過（`flag: "skip"`）。
- 候選時間 = 該行第一個對到的字的開始時間。
- 可信度：沒對到、或第一個字的 score < 0.5 → `flag: "review"`；另外候選時間和舊時間差超過 1.5 秒也標 `review`。
- 輸出 `work/aligned/<id>.json`：`[{ i, jp, old, cand, diff, score, flag }]`（`diff = cand - old`）。
- 完成標準：三首都有輸出，非 filler 行都有 `cand` 或標了 `review`。

### 步驟 7：WaveSurfer 校正頁 `calibrate.html`

- WaveSurfer.js 用 CDN（unpkg 或 jsdelivr），**鎖定一個確切的 7.x 版本號**，不要寫 `@latest`；需要 Regions 外掛。
- 從 repo 根目錄開本機伺服器：`python3 -m http.server 8765`，用 `http://localhost:8765/tools/align/calibrate.html?song=<id>` 開啟。
- 功能：
  1. 顯示波形，可切換「原音 / 人聲」。
  2. 右側列出每行：日文、舊時間、候選時間、目前採用時間；`review` 行亮色標示。
  3. 點一行 → 從該行前 1 秒開始播放。
  4. 微調按鈕：±0.05s、±0.25s；一鍵「用舊的」「用候選」；也可直接拖動波形上的標記。
  5. 全曲 offset 欄位：一次推移整首。
  6. **計時**：自動記錄實際在操作的分鐘數（閒置超過 60 秒不計），顯示在頁面上並寫進輸出。
  7. 匯出 `<id>.corrected.json`（瀏覽器下載，使用者再放到 `work/corrected/`）：`{ id, minutes, lines: [{ i, jp, time }] }`。
- 人工校正由**使用者本人**操作；Gemini 負責把頁面做好、說明怎麼用，並等使用者給回三個 corrected 檔。
- 完成標準：三首都能載入、播放、跳轉、微調、匯出。

### 步驟 8：比較報告 `report.mjs` → `tools/align/REPORT.md`

每首列出以下數字（三組比較：自動 vs 舊、最終 vs 舊、最終 vs 自動）：

| 指標 | 說明 |
|---|---|
| 對齊行數 / 跳過行數 / 需人工看行數 | |
| 平均絕對時間差、中位數 | 秒，兩位小數 |
| 偏差 > 0.3 秒的行數 | 主要判斷指標 |
| 偏差 > 1 秒的行數 | |
| 自動 vs 舊的中位數（含正負號） | 看有沒有整首系統性偏移 |
| 人工校正分鐘數 | 來自 corrected 檔的 `minutes` |
| 偏差最大的 10 行 | 行號、日文、三種時間 |

報告最後寫：環境版本、HEAD commit、整體建議（例如「最終 vs 自動 > 0.3 秒的行少於兩成、每首校正 10 分鐘內 → 值得全面導入」），並列出問題與限制。

### 步驟 9：寫回 `merge_times.mjs` 與檢查 `verify_merge.mjs`

`merge_times.mjs <id> work/corrected/<id>.corrected.json`：

- 寫回前逐項檢查，**任何一項不符就整首拒絕、不寫任何東西**：
  1. 行數和 `song-lyrics.js` 裡該首完全一樣。
  2. 每行 `jp` 逐字相同。
  3. 時間由小到大（允許相等）、都在 0 到 `duration` 之間。
- 只替換該首區塊內的 `"time": 數字`，依序一行一行換；**不要整份用 JSON.stringify 重寫**，其他歌和格式要原封不動。時間取小數兩位。
- 先加 `--dry-run`：輸出到 `work/song-lyrics.preview.js` 並印出改了幾行；確認沒問題再正式寫入 `song-lyrics.js`。

`verify_merge.mjs`：

- 用 `git show HEAD:song-lyrics.js` 當舊版，和目前的 `song-lyrics.js` 比：
  - 三首以外的 71 首：整首完全相同。
  - 三首：行數相同；每行除了 `time` 之外，`jp`、`tr`、`acts`、`sing`、`call`（含有無該欄位）完全相同。
  - 印出每首改了幾個 `time`、最大變動幾秒。
- 任何不符就以非零狀態結束。

---

## 2. 驗證指令（全部要跑，輸出貼進報告）

```
node tools/align/verify_merge.mjs
node scripts/build.mjs "$TMPDIR/ado-dist"
git status --porcelain
git diff --stat
git status --porcelain --ignored | grep -Ei '\.(wav|mp3|m4a|webm|opus|flac)$'
git check-ignore tools/align/work/audio/show.wav
```

預期結果：

- `verify_merge.mjs` 結束狀態 0。
- 建置成功，`$TMPDIR/ado-dist/lyrics/show.json`、`odo.json`、`kokoro.json` 存在。
- `git diff --stat` 只出現 `.gitignore`、`song-lyrics.js`；新檔只在 `tools/align/` 底下（不含 `work/`、`.venv/`）。
- 音訊檔只能出現在被忽略（`!!`）的清單裡，不能是未追蹤（`??`）或已暫存。
- 最後在瀏覽器開本機網站（`python3 -m http.server` 開 repo 根目錄），打開這三首，確認影片播放時歌詞高亮跟得上、翻譯和應援標記在正確的行上。

---

## 3. 禁止事項

1. **不能改** `tr`、`acts`、`sing`、`call`，也不能新增或刪除這些欄位。
2. **不能改歌詞文字**（`jp`），不能增刪行、調換行序。
3. **不能從歌詞網站抓歌詞**；文字一律以 `song-lyrics.js` 現有內容為準。
4. **音訊不能放進 GitHub**：音訊、人聲檔、模型輸出只放 `tools/align/work/`，不能 `git add`。
5. **沒有使用者同意，不能 commit、不能 push**，也不能切換或建立分支。
6. 不能改 `app.js`、`index.html`、`style.css`、`scripts/build.mjs`、`.github/`、其他 71 首歌的資料。
7. 不能刪除 `tools/align/work/` 以外的任何檔案。驗證做完後，問過使用者再刪 `work/audio/` 和 `work/stems/`。
8. 不要對其他 71 首跑對齊，這次只做三首。

## 4. 遇到這些情況先停下來問使用者

- 同一個安裝或執行錯誤，換方法重試一次後還是失敗。
- 下載的音訊長度和 `duration` 差超過 3 秒。
- 合併時 `jp` 或行數對不上。
- 覺得需要改禁止清單裡的任何東西。
- 建置失敗，或網站在瀏覽器裡壞掉。

## 5. 交回內容（給 Claude 最後審查用）

做完後回報一段簡短摘要，包含：

1. 改動和新增的檔案清單（`git status --porcelain` 的輸出）。
2. `tools/align/REPORT.md` 的路徑和三首的關鍵數字。
3. 第 2 節所有驗證指令的實際輸出。
4. 沒做到、跳過、或不確定的地方。

Claude 會在新對話裡只看這些改動和報告，確認寫回後翻譯、應援沒有錯位，再決定要不要 commit 和推上 GitHub。
