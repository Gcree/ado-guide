# 網站優化執行報告

## 第 1 批：修 bug、清掉沒用的程式

### 1. 改動前後狀態比對

**改動前：**

`git status --porcelain`:
```text
 M .gitignore
?? tools/
```

`git diff --stat`:
```text
 .gitignore | 5 +++++
 1 file changed, 5 insertions(+)
```

**改動後：**

`git status --porcelain`:
```text
 M .gitignore
 M app.js
?? tools/
```

`git diff --stat`:
```text
 .gitignore | 8 ++++++++
 app.js     | 7 +++----
 2 files changed, 11 insertions(+), 4 deletions(-)
```

---

### 2. 改動檔案說明

- **`app.js`**：
  - 1-1：在第 96 行 `SONGS.forEach` 加入 `(!s.free && (!s.tips || !s.tips.length))` 判斷，將無 `tips` 且非 `free` 的歌曲（〈Raven Sky〉〈好きでいて〉〈soldier game〉）視為 `hold`，解決首頁篩選漏歌問題。
  - 1-2：刪除〈Stay Gold〉資料定義中重複且被後者覆蓋的前一組 `acts` 與 `tips`，保留後一組，使程式碼乾淨且畫面結果不變。
  - 1-3：刪除 `songCue()` 中最後未被使用的區域變數 `const acts = S.acts.filter(...)`，保留 `return null;`。
- **`.gitignore`**：
  - 加入 `tools/optimize/work/`，避免優化作業產生的暫存檔與截圖納入版本控制。

---

### 3. 驗證指令實際輸出

#### `node --check app.js`
```text
（語法檢查正常，無輸出，exit=0）
```

#### `node scripts/build.mjs "$TMPDIR/ado-after"; echo "exit=$?"`
```text
輸出到 /var/folders/cv/v569dk1s3759nz3c2hp9s3x00000gq/T/ado-after：首頁＋74 首歌頁、73 首歌詞檔、sitemap.xml、404.html
exit=0
```

#### `git diff --stat`
```text
 .gitignore | 8 ++++++++
 app.js     | 7 +++----
 2 files changed, 11 insertions(+), 4 deletions(-)
```

#### `git diff --quiet HEAD -- song-lyrics.js && echo "song-lyrics.js 沒被改"`
```text
song-lyrics.js 沒被改
```

#### 首頁篩選數量（瀏覽器執行）
```js
Object.fromEntries(["all","cheer","loose","cover"].map(f => { document.querySelector(`[data-f="${f}"]`).click(); return [f, document.querySelectorAll("#songList li").length]; }))
```
輸出：
```json
{ "all": 74, "cheer": 33, "loose": 41, "cover": 15 }
```

#### 瀏覽器 Console
```text
無任何錯誤（[]）
```

---

### 4. 破壞測試結果

（第 1 批不適用，於第 3 批執行）

---

### 5. 前／後截圖對照

- `tools/optimize/work/before/home-loose.png`：改動前首頁篩選「沒有固定應援」，列表共 38 首（少 3 首新歌）。
- `tools/optimize/work/after/home-loose.png`：改動後首頁篩選「沒有固定應援」，列表共 41 首（補入 Raven Sky、好きでいて、soldier game，33 + 41 = 74）。
- `tools/optimize/work/before/staygold.png`：改動前〈Stay Gold〉歌曲頁，重點為「副歌的『wow wow』由觀眾唱」，動作圖示為大合唱。
- `tools/optimize/work/after/staygold.png`：改動後〈Stay Gold〉歌曲頁，重點、圖示與內容與改動前完全一致。

---

### 6. 備註與說明

- 無跳過或不確定項目，均依規範與檢查步驟完成。
- 依照交接規則，第 1 批完成後停下來，不繼續執行第 2 批。


---

## 第 2 批：歌曲資料搬出 `app.js`（結構）

### 1. 改動前後狀態比對

**改動前：**

`git status --porcelain`:
```text
（乾淨，無改動）
```

`git diff --stat`:
```text
（無改動）
```

**改動後：**

`git status --porcelain`:
```text
 M README.md
 M app.js
 M index.html
 M scripts/build.mjs
?? songs.js
```

`git diff --stat`:
```text
 README.md         | 30 ++++++++++---------
 app.js            | 90 +------------------------------------------------------
 index.html        |  1 +
 scripts/build.mjs | 13 ++++----
 4 files changed, 24 insertions(+), 110 deletions(-)
```

---

### 2. 改動檔案說明

- **`songs.js`**（新增）：以 UMD 模組格式定義 `{ SONGS, UT, PEN, BEAT, CLIMAX }` 五張資料表，瀏覽器掛在 `window.ADO_SONGS`，Node 支援 `require`。
- **`app.js`**：刪除原有的五張資料表定義，改為自 `window.ADO_SONGS` 取得；保留所有動作資料（`ACT`、`PENC`、`RAINBOW`）與處理邏輯（排序、hold 判定、資料關聯）。
- **`index.html`**：在引用 `app.js` 前加入 `<script src="songs.js?v=dev"></script>`。
- **`scripts/build.mjs`**：改用 `require` 讀取 `songs.js` 的 `SONGS` 歌單資料（移除字串切割脆弱寫法），在建置替換中處理 `songs.js?v=dev` 的 hash，並將 `songs.js` 加進發布複製清單。
- **`README.md`**：更新專案結構說明與資料表說明，標記資料表已獨立至 `songs.js`。

---

### 3. 驗證指令實際輸出

#### `node --check app.js && node --check songs.js`
```text
（語法檢查正常，無輸出，exit=0）
```

#### `node -e 'const d=require("./songs.js"); console.log(d.SONGS.length, Object.keys(d.UT).length, Object.keys(d.PEN).length, Object.keys(d.BEAT).length, Object.keys(d.CLIMAX).length)'`
```text
74 72 58 69 73
```

#### `node scripts/build.mjs "$TMPDIR/ado-after"; echo "exit=$?"`
```text
輸出到 /var/folders/cv/v569dk1s3759nz3c2hp9s3x00000gq/T/ado-after：首頁＋74 首歌頁、73 首歌詞檔、sitemap.xml、404.html
exit=0
```

#### 建置比對指令
```bash
for d in before after; do
  rm -rf "$TMPDIR/cmp-$d"; cp -R "$TMPDIR/ado-$d" "$TMPDIR/cmp-$d"
  rm -f "$TMPDIR/cmp-$d/app.js" "$TMPDIR/cmp-$d/songs.js"
  find "$TMPDIR/cmp-$d" -type f \( -name '*.html' -o -name '*.xml' \) -exec sed -i '' -E 's/\?v=[0-9a-f]{8}//g; s/ data-lyrics="[0-9a-f]+"//; s#<lastmod>[^<]*</lastmod>##' {} +
done
diff -r "$TMPDIR/cmp-before" "$TMPDIR/cmp-after"
```
輸出：
```text
唯一差異為所有 HTML 檔案（首頁及 74 個歌曲頁）增加一行：
> <script src="songs.js"></script>
其餘歌詞 json、sitemap.xml 等無任何差異。
```

#### `git diff --quiet HEAD -- song-lyrics.js && echo "song-lyrics.js 沒被改"`
```text
song-lyrics.js 沒被改
```

#### 直接開原始檔（未建置）瀏覽器執行
```js
Object.fromEntries(["all","cheer","loose","cover"].map(f => { document.querySelector(`[data-f="${f}"]`).click(); return [f, document.querySelectorAll("#songList li").length]; }))
```
輸出：
```json
{ "all": 74, "cheer": 33, "loose": 41, "cover": 15 }
```
Console 錯誤：
```text
無任何錯誤（[]）
```

---

### 4. 破壞測試結果

（第 2 批不適用，於第 3 批執行）

---

### 5. 前／後截圖對照

- `tools/optimize/work/before/b2-home-pc.png` & `tools/optimize/work/after/b2-home-pc.png`：首頁（電腦版 1280×800）改動前後對照。
- `tools/optimize/work/before/b2-home-m.png` & `tools/optimize/work/after/b2-home-m.png`：首頁（手機版 375×812）改動前後對照。
- `tools/optimize/work/before/b2-show-pc.png` & `tools/optimize/work/after/b2-show-pc.png`：〈Show〉歌曲頁（電腦版 1280×800）改動前後對照。
- `tools/optimize/work/before/b2-show-m.png` & `tools/optimize/work/after/b2-show-m.png`：〈Show〉歌曲頁（手機版 375×812）改動前後對照。
- `tools/optimize/work/before/b2-odo-pc.png` & `tools/optimize/work/after/b2-odo-pc.png`：〈Odo〉歌曲頁（電腦版 1280×800）改動前後對照。
- `tools/optimize/work/before/b2-odo-m.png` & `tools/optimize/work/after/b2-odo-m.png`：〈Odo〉歌曲頁（手機版 375×812）改動前後對照。
- `tools/optimize/work/before/b2-ravensky-pc.png` & `tools/optimize/work/after/b2-ravensky-pc.png`：〈Raven Sky〉歌曲頁（電腦版 1280×800）改動前後對照。
- `tools/optimize/work/before/b2-ravensky-m.png` & `tools/optimize/work/after/b2-ravensky-m.png`：〈Raven Sky〉歌曲頁（手機版 375×812）改動前後對照。

---

### 6. 備註與說明

- 全部驗證均如預期通過。
- 依照交接規則，第 2 批完成後停下來，不繼續執行第 3 批。


---

## 第 3 批：資料自動檢查（結構）

### 1. 改動前後狀態比對

**改動前：**

`git status --porcelain`:
```text
（乾淨，無改動）
```

`git diff --stat`:
```text
（無改動）
```

**改動後：**

`git status --porcelain`:
```text
 M .github/workflows/pages.yml
 M README.md
 M songs.js
?? scripts/check-data.mjs
```

`git diff --stat`:
```text
 .github/workflows/pages.yml |  2 ++
 README.md                   | 18 ++++++++++++++----
 songs.js                    |  6 +++---
 3 files changed, 19 insertions(+), 7 deletions(-)
```

---

### 2. 改動檔案說明

- **`scripts/check-data.mjs`**（新增）：自動檢查歌曲與歌詞資料一致性（曲長、YouTube ID、時間序、合法動作名稱、sing 存在性、PEN 顏色、BEAT 與 CLIMAX 數值合理性、tips/free/hold/sug 標記），並對缺項與缺翻譯列出 WARN 提醒。
- **`.github/workflows/pages.yml`**：在 `Build` 步驟前加入 `node scripts/check-data.mjs` 自動把關。
- **`README.md`**：專案結構加入 `check-data.mjs`，並於「在自己電腦上看」補充本地檢查用法與更新改版流程。
- **`songs.js`**：經使用者同意，為〈Raven Sky〉〈好きでいて〉〈soldier game〉顯式加上 `hold: true`，落實資料層標記，以符合 Check 7 的嚴格檢查。

---

### 3. 驗證指令實際輸出

#### `node scripts/check-data.mjs; echo "exit=$?"`
```text
=== 資料檢查提醒 (WARN: 12 則) ===
[WARN] 缺少 UT（歌ネット）編號的歌曲 (2 首): staygold, kanjaa
[WARN] 缺少 BEAT 拍點資料的歌曲 (5 首): value, angelseek, kittocoaster, aishite, kamippoina
[WARN] 缺少 CLIMAX 副歌高潮秒數的歌曲 (1 首): aitakute
[WARN] [freedom] 有 2 / 51 行非括號補位行缺少中文翻譯 tr
[WARN] [giragira] 有 6 / 48 行非括號補位行缺少中文翻譯 tr
[WARN] [aiaia] 有 1 / 67 行非括號補位行缺少中文翻譯 tr
[WARN] [chocolat] 有 1 / 62 行非括號補位行缺少中文翻譯 tr
[WARN] [pierrot] 有 33 / 34 行非括號補位行缺少中文翻譯 tr
[WARN] [aitakute] 沒有逐行歌詞資料
[WARN] [mirror] 有 20 / 58 行非括號補位行缺少中文翻譯 tr
[WARN] [kanjaa] 有 8 / 56 行非括號補位行缺少中文翻譯 tr
[WARN] [villain] 有 4 / 41 行非括號補位行缺少中文翻譯 tr

資料檢查通過：0 個錯誤，12 個提醒。
exit=0
```

#### `git diff --quiet HEAD -- song-lyrics.js && echo "song-lyrics.js 沒被改"`
```text
song-lyrics.js 沒被改
```

---

### 4. 破壞測試結果

| 測試 | 怎麼改 | 實際輸出 | 結束狀態 |
|---|---|---|---|
| A | 某首某行 acts 加一個 `"dance"` | `[ERROR] [show] 第 1 行: acts 包含無效動作 "dance"` | 失敗（exit=1） |
| B | 某首兩行的 time 對調 | `[ERROR] [show] 第 2 行: time (0.47s) 小於前一行時間 (3.88s)，未由小到大排序` | 失敗（exit=1） |
| C | 某行 sing 改成那行沒有的字 | `[ERROR] [show] 第 1 行: sing 字串 "Nah-Nah-Nah-Nah-Nah, Ready for my show" 未出現在日文歌詞 jp: "THIS_IS_NOT_IN_JP" 之中` | 失敗（exit=1） |

測試後已由備份完全還原，`song-lyrics.js` 與 `songs.js` 乾淨未受污染。

---

### 5. 前／後截圖對照

（第 3 批為純腳本與 CI 流程檢查，無畫面改動，不適用截圖）

---

### 6. 備註與說明

- 在執行 Check 7 時，因第 1 批是在 `app.js` 執行期將無 tips 且非 free 視為 hold，但在 `songs.js` 原始資料中〈Raven Sky〉〈好きでいて〉〈soldier game〉尚未顯式寫入 `hold: true`。經停下來詢問使用者，使用者選定「在 `songs.js` 中加上 `hold: true`，落實資料層標記，讓 check-data.mjs 能嚴格把關未來新歌」。
- 依照交接規則，第 3 批完成後停下來，不繼續執行第 4 批。

---

## 第 4 批：手機版 UI

### 1. 改動前後狀態比對

**改動前（在使用者 commit 第 3 批 `d6090a6` 之後）：**

`git status --porcelain`:
```text
(working tree clean)
```

`git diff --stat`:
```text
(0 files changed)
```

**改動後：**

`git status --porcelain`:
```text
 M app.js
 M index.html
 M style.css
```

`git diff --stat`:
```text
 app.js     | 10 +++++++++-
 index.html | 26 +++++++++++++++++---------
 style.css  | 37 +++++++++++++++++++++++++++++--------
 3 files changed, 55 insertions(+), 18 deletions(-)
```

---

### 2. 改動檔案說明

- **`index.html`**：
  - 4-1 & 4-2：首頁 `.tools` 內將「篩選」與「排序」兩個 `.seg` 群組包裹進 `<div class="tools-row">` 容器，便於在手機寬度下維持在同一橫排捲動。
  - 4-3：歌曲頁 `.mvbar` 內螢光棒標籤後新增 `<details class="vopt tips-opt" id="tipsOpt" hidden>`，包含 `<summary aria-label="這首重點">這首重點</summary>` 與 `<ul class="summary" id="tipsSummary"></ul>`。
- **`style.css`**：
  - 4-1：電腦版下 `.tools-row { display: contents; }`，完全不產生額外容器，電腦版排版與改動前 100% 一模一樣。在手機寬度（`≤ 600px`）下：
    - `#homeLegend` 改為單行橫向捲動（`flex-wrap: nowrap; overflow-x: auto;`，隱藏捲軸）。
    - `.tools-row` 並排橫向捲動（`display: flex; flex-wrap: nowrap; overflow-x: auto;`）。
    - 緊湊微調 `.hero`、`.panel` 與大標邊距，達成首頁第一首歌頂端在畫面 50% 以內（初次訪問 42.0%、有 3 首近期歌曲時剛好 50.0%）。
  - 4-2：手機寬度（`≤ 600px`）下 `.tools .seg button` 設為 `min-height: 44px; padding: 0 12px; box-sizing: border-box;`，確保手指觸控目標高度至少 44px。
  - 4-3：`.tips-opt` 在電腦版預設為 `display: none;`；在 `@media (max-width: 900px)` 下非 hidden 時顯示為膠囊按鈕；`.mvbar` 加上 `position: relative; z-index: 6;` 確保重點下拉選單浮層位於歌詞之上。
- **`app.js`**：
  - 4-3：在 `fillSong()` 中以 `hasTips = TAGGED && s.tips && s.tips.length > 0 && !s.hold` 判斷，有應援重點時才顯示 `tipsOpt` 並填入條目內容，否則設為 `hidden`；將 `tipsOpt` 加入全域 `menus` 陣列，享有既有的點選單外自動收合及彈窗防溢出定位邏輯。

---

### 3. 驗證指令實際輸出

#### `git diff --quiet HEAD -- song-lyrics.js && echo "song-lyrics.js 沒被改"`
```text
song-lyrics.js 沒被改
```

#### `node scripts/check-data.mjs; echo "exit=$?"`
```text
=== 資料檢查提醒 (WARN: 12 則) ===
[WARN] 缺少 UT（歌ネット）編號的歌曲 (2 首): staygold, kanjaa
[WARN] 缺少 BEAT 拍點資料的歌曲 (5 首): value, angelseek, kittocoaster, aishite, kamippoina
[WARN] 缺少 CLIMAX 副歌高潮秒數的歌曲 (1 首): aitakute
[WARN] [freedom] 有 2 / 51 行非括號補位行缺少中文翻譯 tr
[WARN] [giragira] 有 6 / 48 行非括號補位行缺少中文翻譯 tr
[WARN] [aiaia] 有 1 / 67 行非括號補位行缺少中文翻譯 tr
[WARN] [chocolat] 有 1 / 62 行非括號補位行缺少中文翻譯 tr
[WARN] [pierrot] 有 33 / 34 行非括號補位行缺少中文翻譯 tr
[WARN] [aitakute] 沒有逐行歌詞資料
[WARN] [mirror] 有 20 / 58 行非括號補位行缺少中文翻譯 tr
[WARN] [kanjaa] 有 8 / 56 行非括號補位行缺少中文翻譯 tr
[WARN] [villain] 有 4 / 41 行非括號補位行缺少中文翻譯 tr

資料檢查通過：0 個錯誤，12 個提醒。
exit=0
```

#### `node scripts/build.mjs "$TMPDIR/ado-batch4-verify"; echo "exit=$?"`
```text
輸出到 /var/folders/cv/v569dk1s3759nz3c2hp9s3x00000gq/T/ado-batch4-verify：首頁＋74 首歌頁、73 首歌詞檔、sitemap.xml、404.html
exit=0
```

#### CDP 畫面實測指標（375×812 手機環境）
```json
{
  "freshHomeMobileMetrics": {
    "firstSongTop": 340.73,
    "firstSongPercentage": "42.0%",
    "scrollWidth": 375,
    "clientWidth": 375,
    "noHorizontalOverflow": true,
    "filterBtnHeight": 44,
    "sortBtnHeight": 44
  },
  "recentHomeMobileMetrics": {
    "firstSongTop": 405.92,
    "firstSongPercentage": "50.0%",
    "scrollWidth": 375,
    "clientWidth": 375,
    "noHorizontalOverflow": true
  },
  "odoMobileMetrics": {
    "tipsOptHidden": false,
    "tipsOptVisible": true,
    "tipsCount": 5,
    "summaryItems": [
      "開頭和 B 段結尾那句由觀眾唱",
      "主歌有幾句和 Ado 一來一往對唱",
      "副歌的「Woah」由觀眾唱",
      "間奏第 3、4 和 7、8 小節跳（依演唱會影像）",
      "最後副歌前拍手"
    ]
  },
  "totMusicaMobileMetrics": {
    "tipsOptHidden": true,
    "tipsOptDisplay": "none"
  },
  "ravenskyMobileMetrics": {
    "tipsOptHidden": true,
    "tipsOptDisplay": "none"
  },
  "desktopMetrics": {
    "desktopTipsOptDisplay": "none",
    "desktopTipsOptHidden": true
  }
}
```

---

### 4. 前／後截圖對照表

所有截圖均已存放於 `tools/optimize/work/before/` 與 `tools/optimize/work/after/`：

| 頁面與尺寸 | 前截圖（`before/`） | 後截圖（`after/`） | 說明 |
|---|---|---|---|
| 首頁 (1280×800) | `b4-home-pc.png` | `b4-home-pc.png` | 電腦版排版與按鈕樣式 100% 一致 |
| 首頁 (375×812) | `b4-home-m.png` | `b4-home-m.png` | `#homeLegend` 單行捲動、篩選排序同排並達 44px 高、第一首歌頂端 ≤ 50% |
| 〈踊〉 (1280×800) | `b4-odo-pc.png` | `b4-odo-pc.png` | 電腦版提示框照常顯示，下方不額外出現「這首重點」按鈕 |
| 〈踊〉 (375×812) | `b4-odo-m.png` | `b4-odo-m.png` | 影片下方播放速度與螢光棒右側新增「這首重點」膠囊按鈕 |
| 〈踊〉 (375×812) 選單展開 | （無） | `b4-odo-tips-m.png` | 點擊「這首重點」彈出 `<details>` 卡片，清晰列出 5 條應援重點 |
| 〈Tot Musica〉 (1280×800) | `b4-totmusica-pc.png` | `b4-totmusica-pc.png` | 電腦版無應援歌曲排版完全一致 |
| 〈Tot Musica〉 (375×812) | `b4-totmusica-m.png` | `b4-totmusica-m.png` | 無固定應援歌曲，不顯示「這首重點」按鈕 |
| 〈Raven Sky〉 (1280×800) | `b4-ravensky-pc.png` | `b4-ravensky-pc.png` | 電腦版 hold 歌曲排版完全一致 |
| 〈Raven Sky〉 (375×812) | `b4-ravensky-m.png` | `b4-ravensky-m.png` | hold 歌曲，不顯示「這首重點」按鈕 |

---

### 5. 備註與說明

- 依照交接規則（`GEMINI-OPTIMIZE.md` 第 4 節標準及第 8 節規則），本批次實作完成後停下來，呈現對照數據與截圖供使用者檢視與確認。
- 未執行任何 `git commit`、`git push` 或分支操作。
- `song-lyrics.js` 零修改。
- 頁面在 375px 寬度下 `scrollWidth === 375`，完全無橫向溢出。

