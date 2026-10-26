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
