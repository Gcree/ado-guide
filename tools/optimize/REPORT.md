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
