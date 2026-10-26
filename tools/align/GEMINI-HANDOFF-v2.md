# 交接計畫 v2：歌詞時間對齊「修正與收尾」（給 Gemini）

> **暫停中**：使用者決定先做 `tools/GEMINI-OPTIMIZE.md` 的第 1 批。那批審查並 commit 之前，不要開始本檔的任何步驟。

這份接在 `GEMINI-HANDOFF.md`（v1）後面。v1 的步驟 1–7（環境、下載、人聲分離、匯出、對齊、校正頁）已經做完，**這份只處理還沒做完和做錯的部分**。v1 的「禁止事項」全部繼續有效，本檔第 3 節另有補充。

## 0. 為什麼要有 v2（先讀）

Claude 檢查目前的 `REPORT.md` 和 `work/` 後發現三個問題：

1. **報告結論是假的。** `work/corrected/` 是空的（使用者還沒校正），但 `report.mjs` 第 115 行在沒有校正檔時，把「候選時間」當成「最終時間」，所以「最終 vs 自動」永遠是 0.00 秒，才得出「建議全面導入」。這個結論不能用。
2. **有 32 行候選時間是假的。** 三首共 32 行（show 11、odo 10、kokoro 11）的候選時間剛好落在搜尋範圍的起點（`舊時間 − 2.00 秒`），報告裡一整排 `-2.00s` 就是這個。這是 WhisperX 在範圍內找不到好位置時貼著邊界，不是真的偏移。原因是每行範圍 `[time−2, nextTime+2]` 和前一行重疊太多，第一個字容易對到上一行的尾巴。
3. **寫回檢查還有漏洞。** `verify_merge.mjs` 只比 `jp/tr/acts/sing/call` 五個欄位，沒抓到「多出新欄位」和「檔案格式被改動」；歌曲層只比 `title/youtubeId/duration`。

另外，報告記的基準 commit 是 `812f101`，現在 HEAD 是 `7bcbd24`（只改了網站圖示，`song-lyrics.js` 沒變）。報告要改記當下的 HEAD。

---

## 1. 步驟

每一步做完都要跑該步的「驗證指令」，把輸出存起來，最後貼進交回內容。

### 步驟 1：修正比較報告 `report.mjs`

**改的檔案：** `tools/align/report.mjs`、`tools/align/REPORT.md`（重新產出）

要做的事：

- 某首沒有 `work/corrected/<id>.corrected.json` 時：
  - 「最終時間」欄一律顯示 `未校正`，**不能用候選或舊時間代替**。
  - 「最終 vs 舊」「最終 vs 自動」兩欄的統計全部顯示 `—`。
  - 「偏差最大的 10 行」改用 `|候選 − 舊|` 排序，表頭註明「尚未校正」。
- 總結段落：只要有任何一首沒校正，就只能寫「尚未完成人工校正，無法判斷是否全面導入」，**不能出現「建議全面導入」或任何導入建議**。
- 三首都校正完後才計算建議，判斷門檻（照 v1）：
  - 「最終 vs 自動」偏差 > 0.3 秒的行數 < 20%，**而且**
  - 每首平均校正時間 ≤ 10 分鐘
  - 兩個都達到 → 「值得全面導入」；只達到一個 → 「部分導入，需調整」；都沒達到 → 「不建議導入」。
- 每首多一列「貼邊界的候選行數」（步驟 2 的 `boundary` 旗標數量）。
- 報告開頭的 HEAD 改成執行當下 `git rev-parse HEAD` 的結果，不能寫死。

**做完的標準：**

- 現在 `work/corrected/` 是空的，跑完後 `REPORT.md` 裡找不到「建議全面導入」，「最終時間」欄全是 `未校正`。
- 手動做一個假的校正檔測試（放在 scratch 位置、測完刪掉，**不要留在 `work/corrected/`**），確認有校正檔時數字會變。

**驗證指令：**

```bash
node tools/align/report.mjs
grep -c "建議全面導入" tools/align/REPORT.md   # 預期 0
grep -c "未校正" tools/align/REPORT.md          # 預期 > 0
ls tools/align/work/corrected/                  # 預期空的
```

### 步驟 2：修正對齊的假候選 `align.py`

**改的檔案：** `tools/align/align.py`；重新產出 `work/aligned/*.json`，新增 `work/aligned/<id>.meta.json`

要做的事（兩輪對齊）：

1. **第一輪：估整首偏移。** 用現在的方法跑一次，只挑「score ≥ 0.7、而且不貼邊界」的行，算 `cand − old` 的中位數，當作這首的整首偏移 `offset`。可用的行少於 8 行時 `offset = 0`。
2. **第二輪：縮小範圍再對一次。** 每行範圍改成 `[old + offset − 0.75, nextOld + offset + 0.75]`（夾在 0 和曲長之間），用第二輪的結果當最終候選。
3. **新旗標：**
   - 候選距離範圍起點或終點 < 0.10 秒 → `flag: "boundary"`，`cand` 保留但當作不可信。
   - 候選比上一行（非 filler）的候選還早 → `flag: "review"`。
   - 原本的 `review` 規則保留（沒對到、score < 0.5、和舊時間差 > 1.5 秒）。判斷「和舊時間差」時改用 `cand − (old + offset)`。
4. **輸出格式不變**：`work/aligned/<id>.json` 仍是 `[{ i, jp, old, cand, diff, score, flag }]`，`calibrate.html` 才能繼續讀。偏移等額外資訊寫到另一個檔 `work/aligned/<id>.meta.json`：`{ id, offset, usedLines, boundaryCount, reviewCount }`。
5. `calibrate.html` 只改一個地方：`boundary` 行用和 `review` 不同的顏色標示，並在畫面上顯示這首的 `offset`。不要改匯出格式。

**做完的標準：**

- 三首都重新產出 `aligned/<id>.json` 和 `<id>.meta.json`。
- 統計 `cand` 剛好等於 `old − 2.00`（±0.05）的行數：從目前的 32 行降到**三首合計 3 行以下**（第二輪範圍已經不是 −2，剩下的只能是巧合）。
- 所有貼邊界的行都標了 `boundary`，沒有漏標。
- 每首的 `offset` 記進報告；`offset` 絕對值 > 1 秒時，報告要特別提醒「舊時間可能整首偏晚／偏早，請使用者校正時先確認方向」。

**驗證指令：**

```bash
tools/align/.venv/bin/python tools/align/align.py show odo kokoro
cat tools/align/work/aligned/{show,odo,kokoro}.meta.json
node -e 'for (const s of ["show","odo","kokoro"]) { const a=require("./tools/align/work/aligned/"+s+".json"); const c={}; a.forEach(r=>c[r.flag]=(c[r.flag]||0)+1); const m2=a.filter(r=>r.cand!=null&&Math.abs(r.cand-(r.old-2))<0.05).length; console.log(s, JSON.stringify(c), "cand==old-2:", m2); }'
node tools/align/report.mjs
```

### 步驟 3：加強寫回檢查 `verify_merge.mjs`

**改的檔案：** `tools/align/verify_merge.mjs`（只改這個，`merge_times.mjs` 不動，除非下面測試失敗）

在現有檢查之外加上：

1. **欄位集合相同**：三首的每一行，`Object.keys` 排序後要和 HEAD 完全相同（不能多、不能少）。
2. **歌曲層全部相同**：三首除了 `lyrics` 以外的所有欄位，`JSON.stringify` 和 HEAD 相同。
3. **整份檔案格式逐字相同**：把 HEAD 版和目前版的 `song-lyrics.js` 都用正規式把 `"time": <數字>` 換成 `"time": X`，兩份字串必須完全相同。這一條能抓到排版、空白、引號、其他歌被動到。
4. **時間只能是小數兩位以內。**
5. 印出每首改了幾行、最大變動、平均變動。

**做完的標準（要自己做破壞測試，測完還原）：**

先把 `song-lyrics.js` 複製到 scratch 位置備份，然後分別做下面四種故意改壞，每次都要確認 `verify_merge.mjs` **失敗（非零結束）**，再用備份還原：

| 測試 | 怎麼改 | 預期 |
|---|---|---|
| A | 三首其中一行的 `tr` 改一個字 | 失敗 |
| B | 三首其中一行多加 `"acts": []` | 失敗 |
| C | 其他 71 首某行 `time` 改 0.01 | 失敗 |
| D | 只在檔案某處多一個空白 | 失敗 |

最後用沒改過的檔案跑一次：通過（結束狀態 0，`changed 0`）。

**驗證指令：**

```bash
node tools/align/verify_merge.mjs; echo "exit=$?"
git diff --quiet HEAD -- song-lyrics.js && echo "song-lyrics.js 已還原"
```

### 步驟 4：等使用者校正（Gemini 不能代做）

- 告訴使用者怎麼開校正頁：

  ```bash
  python3 -m http.server 8765
  ```

  再開 `http://localhost:8765/tools/align/calibrate.html?song=show`（`odo`、`kokoro` 同理）。
- 提醒使用者：先聽 3–5 行確認整首偏移方向是不是真的（步驟 2 的 `offset`），`boundary` 和 `review` 的行優先看，其他行抽聽即可。
- 等使用者把三個 `<id>.corrected.json` 放進 `work/corrected/`。**不能自己產生校正檔、不能用候選時間自動填一份。**
- 收到後重跑報告：

  ```bash
  node tools/align/report.mjs
  ```

**做完的標準：** `work/corrected/` 有三個檔；`REPORT.md` 三首都有校正分鐘數、三組比較都有數字，總結依步驟 1 的門檻給出建議。

### 步驟 5：寫回三首並全部驗證

**改的檔案：** `song-lyrics.js`（只改三首的 `time`）

```bash
node tools/align/merge_times.mjs --dry-run show tools/align/work/corrected/show.corrected.json
node tools/align/merge_times.mjs --dry-run odo tools/align/work/corrected/odo.corrected.json
node tools/align/merge_times.mjs --dry-run kokoro tools/align/work/corrected/kokoro.corrected.json
```

dry-run 三首都通過、改動行數合理後，才去掉 `--dry-run` 正式寫入。**每寫一首就跑一次 `verify_merge.mjs`**，失敗就用 `git checkout -- song-lyrics.js` 還原再查原因（這是唯一允許的還原指令，只能用在 `song-lyrics.js`）。

**做完的標準：** 第 2 節全部指令通過。

### 步驟 6（先不要做，只寫建議）：擴大到其他歌

只有在步驟 4 的報告結論是「值得全面導入」時，才在 `REPORT.md` 最後加一段「擴大計畫草案」：

- 建議下一批 10 首的清單（依 `song-lyrics.js` 有歌詞、MV 時間點明確的原創曲優先），每首附 YouTube ID 和行數。
- 預估每批的下載、運算和人工校正時間。

**不要開始跑下一批。** 要不要做由使用者和 Claude 審查後決定。

---

## 2. 最終驗證指令（全部跑，輸出原樣貼進交回內容）

```bash
node tools/align/verify_merge.mjs; echo "exit=$?"
node scripts/build.mjs "$TMPDIR/ado-dist"; echo "exit=$?"
ls "$TMPDIR/ado-dist/lyrics/show.json" "$TMPDIR/ado-dist/lyrics/odo.json" "$TMPDIR/ado-dist/lyrics/kokoro.json"
git status --porcelain
git diff --stat
git status --porcelain --ignored | grep -Ei '\.(wav|mp3|m4a|webm|opus|flac)$'
git check-ignore tools/align/work/audio/show.wav
grep -c "建議全面導入" tools/align/REPORT.md
```

預期：

- `verify_merge.mjs`、建置兩個 `exit=0`；三個 `lyrics/*.json` 都存在。
- `git diff --stat` 只有 `.gitignore`、`song-lyrics.js`；新檔只在 `tools/align/`（不含 `work/`、`.venv/`）。
- 音訊只出現在 `!!`（被忽略），沒有 `??` 或已暫存。
- 本機開網站（repo 根目錄 `python3 -m http.server 8000`），打開 `#show`、`#odo`、`#kokoro`，各看兩段副歌：歌詞高亮跟得上歌聲、翻譯在對的那一行、拍手／合唱標記在對的那一行。各截一張圖存到 `tools/align/work/screens/`（不進 git），在交回內容裡列出檔名。

---

## 3. 禁止事項（v1 第 3 節全部有效，以下是補充）

1. **不能偽造校正結果**：不能自己產生、補齊或修改 `work/corrected/` 裡的檔案；不能用候選時間冒充最終時間。
2. **不能改** `song-lyrics.js` 裡任何 `time` 以外的東西，包括空白、排版、欄位順序；不能用 `JSON.stringify` 重寫整份。
3. **不能改** `app.js`（包括 `claps`、`CLIMAX`、`BEAT` 這些時間）、`index.html`、`style.css`、`scripts/`、`.github/`、`CHANGELOG.md`、`README.md`。
4. **不能 commit、push、建立或切換分支、`git reset`、`git stash`**。唯一允許的 git 寫入動作是 `git checkout -- song-lyrics.js` 還原失敗的寫回。
5. 不能對 show／odo／kokoro 以外的歌跑對齊或寫回。
6. 不能刪 `tools/align/work/` 以外的檔案；破壞測試用的備份和假校正檔放 scratch 位置，測完刪掉。
7. 不能升級或改裝 `.venv` 裡的套件版本（需要時先問）；不能用 brew 安裝東西。
8. 不能從歌詞網站抓歌詞；不能換成別的 YouTube 影片版本。
9. 不能加網站新功能，也不能「順手」修網站其他問題；看到問題寫進報告的「問題與限制」就好。

## 4. 遇到這些情況先停下來問使用者

- 同一個錯誤換方法重試一次還是失敗。
- 步驟 2 改完後，`cand == old − 2` 三首合計還有 4 行以上，或 `boundary` 行超過該首非 filler 行的 30%。
- 某首 `offset` 絕對值 > 2 秒（可能下載到不同版本的影片）。
- 破壞測試有任何一項沒失敗。
- 合併時 `jp` 或行數對不上。
- 建置失敗、網站在瀏覽器裡壞掉、或歌詞高亮明顯比歌聲早／晚。
- 覺得需要做禁止清單裡的任何事。

## 5. 交回內容（給 Claude 最後審查用，寫成 `tools/align/HANDBACK.md`）

1. `git status --porcelain` 和 `git diff --stat` 的輸出。
2. 每一步改了哪些檔案、各一句話說明改了什麼。
3. `REPORT.md` 三首的關鍵數字：offset、boundary 行數、review 行數、三組比較的 >0.3 秒比例、校正分鐘數、最終建議。
4. 步驟 3 四個破壞測試的結果（每個附結束狀態）。
5. 第 2 節所有指令的實際輸出（原樣貼上，不要改寫成「通過」）。
6. 三首的截圖檔名。
7. 沒做到、跳過、不確定、或停下來問過使用者的地方。
