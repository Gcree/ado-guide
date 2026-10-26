# 交接計畫：網站優化（給 Gemini）

Claude 在 2026-10-26 審查了整個網站（HEAD `7bcbd24`，v1.12.1）。這份是審查後要做的優化，分成四批，**一批做完、交回、使用者同意後才做下一批**。

> 順序（使用者 2026-10-26 決定）：**先做這份的第 1 批**，做完交回、審查並 commit 後，才回頭做 `tools/align/GEMINI-HANDOFF-v2.md`（歌詞時間對齊）。第 2 批以後等使用者另外通知。兩件事不要混在同一批改動裡。
>
> 開始前 `git status` 本來就有 `.gitignore`（改過）和 `tools/`（新資料夾）兩筆改動，那是之前留下的，不是你這批要做的，不要動也不要還原。

## 0. 專案背景（先讀）

- 純靜態網站，沒有 npm、沒有打包工具。平常只改 `index.html`、`style.css`、`app.js`、`song-lyrics.js`。
- `scripts/build.mjs` 產生正式網站（每首歌一頁 `song/<id>/`、歌詞拆檔 `lyrics/<id>.json`），GitHub Actions 推到 `main` 就發布。
- 本機預覽：repo 根目錄跑 `python3 -m http.server 8000`，開 `http://localhost:8000/`；看建置後的版本就先 `node scripts/build.mjs "$TMPDIR/ado-dist"` 再到那個資料夾開伺服器。
- 程式註解是**台灣繁體中文、白話**，照現有風格寫；變數命名照現有的短名稱習慣。

### 每批開始前先做「改動前快照」

```bash
git status --porcelain                      # 記下來；這批結束時拿來比
git rev-parse HEAD
node scripts/build.mjs "$TMPDIR/ado-before"
```

並用瀏覽器截「改動前」的圖（每批要截哪些頁見各批說明），存到 `tools/optimize/work/before/`。

---

## 1. 第 1 批：修 bug、清掉沒用的程式（風險低）

**改的檔案：** 只有 `app.js`

| # | 問題 | 要做的事 |
|---|---|---|
| 1-1 | 〈Raven Sky〉〈好きでいて〉〈soldier game〉三首沒有 `acts`／`tips`，也沒有 `free`／`hold`，所以首頁「有應援」和「沒有固定應援」兩個篩選都找不到它們（33 + 38 = 71，少 3 首）。 | 在 `app.js` 第 96 行附近那段 `SONGS.forEach`：沒有 `tips`（或是空的）而且不是 `free` 的歌，視為 `hold`。改完後「有應援」+「沒有固定應援」= 74。 |
| 1-2 | 〈Stay Gold〉那一行 `acts`、`tips` 各寫了兩次，後面那組蓋掉前面那組。 | 刪掉前面那組（`["wave","call"]` 和它的 `tips`），保留後面那組，畫面結果不變。 |
| 1-3 | `songCue()` 最後兩行 `const acts = …; return null;`，`acts` 沒被用到。 | 刪掉 `const acts` 那行，留 `return null;`。 |

**做完的標準：**

- 首頁四個篩選的數量：全部 74、有應援 33、沒有固定應援 41、翻唱 15。
- 〈Stay Gold〉歌曲頁的重點、圖示和改之前一模一樣（前後截圖比對）。
- 瀏覽器 console 沒有錯誤。

**驗證：**

```bash
node --check app.js
node scripts/build.mjs "$TMPDIR/ado-after"; echo "exit=$?"
git diff --stat            # 和開始前比，只多了 app.js（.gitignore 只多 tools/optimize/work/ 那一行）
git diff --quiet HEAD -- song-lyrics.js && echo "song-lyrics.js 沒被改"
```

瀏覽器裡（首頁）跑這段，貼出結果：

```js
Object.fromEntries(["all","cheer","loose","cover"].map(f => { document.querySelector(`[data-f="${f}"]`).click(); return [f, document.querySelectorAll("#songList li").length]; }))
```

截圖：首頁（篩選「沒有固定應援」）、`#staygold`，改動前和改動後各一張。

---

## 2. 第 2 批：歌曲資料搬出 `app.js`（結構）

**為什麼：** 一首歌的資料現在散在 `app.js` 的 `SONGS`、`UT`、`PEN`、`BEAT`、`CLIMAX` 五張表和 `song-lyrics.js`，加新歌要改六個地方，已經有漏（`UT` 缺 staygold、kanjaa；`BEAT` 缺 value、angelseek、kittocoaster、aishite、kamippoina；`CLIMAX` 缺 aitakute；有些可能是故意的，不要自己補）。另外 `scripts/build.mjs` 讀歌單的方法是在 `app.js` 裡找 `const SONGS = [` 到第一個 `];` 的字串，只要哪天 `tips` 文字裡出現 `];` 建置就會壞。

**改的檔案：** 新增 `songs.js`；改 `app.js`、`index.html`、`scripts/build.mjs`、`README.md`（專案結構那一段）

要做的事：

1. 新增 `songs.js`，用和 `song-lyrics.js` 一樣的 UMD 寫法（瀏覽器掛在 `window.ADO_SONGS`，Node 用 `require` 拿得到），內容是 `{ SONGS, UT, PEN, BEAT, CLIMAX }`。**表的內容逐字搬過去，不改任何值**，原本的註解也一起搬。
2. `app.js` 刪掉這五張表，改從 `window.ADO_SONGS` 拿。`ACT`、`PENC`、`RAINBOW` 和所有處理邏輯（例如第 96–99 行的 `forEach`、排序）留在 `app.js`。
3. `index.html` 在 `app.js` 前面加 `<script src="songs.js?v=dev"></script>`。
4. `scripts/build.mjs`：改用 `require` 讀 `songs.js`（拿掉字串切割那段）；`songs.js?v=dev` 和 `app.js` 一樣換成內容的 hash；把 `songs.js` 加進複製清單。
5. README 的專案結構和資料表說明改成新的位置。

**做完的標準：**

- 建置結果和改動前**除了 `?v=` 版本字串、`songs.js` 這個新檔、`app.js` 本身以外完全相同**：74 個歌曲頁、`lyrics/*.json`、`sitemap.xml`（`lastmod` 日期除外）逐字一樣。
- 首頁、`#show`、`#odo`、`#ravensky` 在電腦和手機寬度下都和改動前一樣（前後截圖）。
- 直接開原始檔（不建置，`python3 -m http.server` 開 repo 根目錄）也能正常用。

**驗證：**

```bash
node --check app.js && node --check songs.js
node -e 'const d=require("./songs.js"); console.log(d.SONGS.length, Object.keys(d.UT).length, Object.keys(d.PEN).length, Object.keys(d.BEAT).length, Object.keys(d.CLIMAX).length)'
# 預期：74 72 58 69 73（和改動前 app.js 裡的數量相同）
node scripts/build.mjs "$TMPDIR/ado-after"; echo "exit=$?"
# 把兩份建置結果複製一份，拿掉版本字串和日期後逐檔比對（macOS 的 sed）
for d in before after; do
  rm -rf "$TMPDIR/cmp-$d"; cp -R "$TMPDIR/ado-$d" "$TMPDIR/cmp-$d"
  rm -f "$TMPDIR/cmp-$d/app.js" "$TMPDIR/cmp-$d/songs.js"
  find "$TMPDIR/cmp-$d" -type f \( -name '*.html' -o -name '*.xml' \) -exec sed -i '' -E 's/\?v=[0-9a-f]{8}//g; s/ data-lyrics="[0-9a-f]+"//; s#<lastmod>[^<]*</lastmod>##' {} +
done
diff -r "$TMPDIR/cmp-before" "$TMPDIR/cmp-after" && echo "建置結果相同"
```

`diff` 唯一允許的差異是每個 `index.html` 多了一行 `<script src="songs.js"></script>`；有其他差異就停下來。（這組指令 Claude 已經實測過，抓得到多出來的一行。）

---

## 3. 第 3 批：資料自動檢查（結構）

**為什麼：** 現在資料寫錯只能靠人眼發現。Claude 審查時手動跑了一次檢查（目前全部通過），把它變成固定的腳本，發布前自動擋。

**改的檔案：** 新增 `scripts/check-data.mjs`；改 `.github/workflows/pages.yml`（在 Build 前加一步）；`README.md` 加一小段用法

`scripts/check-data.mjs` 檢查以下項目，任何一項錯就印出「哪首、第幾行、哪裡錯」並以非零狀態結束：

1. `songs.js` 的每首歌在 `song-lyrics.js` 都有一筆，反過來也是；兩邊 `youtubeId`／`yt` 相同；`duration` 和 `len` 差 2 秒內。
2. 每首的歌詞 `time` 由小到大，都在 0 到曲長之間。
3. `acts` 裡只能是 `ACT` 有的名稱（sing、clap、wave、jump、call、gesture、listen）。
4. `sing` 的每個字串都出現在那行的 `jp` 裡。
5. `PEN` 的每個字是 `PENC` 有的顏色、`彩`，或開頭的 `?`。
6. `BEAT` 每筆是 `[BPM, 秒數, 0 或 1]`，BPM 在 60–220；`CLIMAX` 秒數小於曲長。
7. 每首歌要不是 `free`／`hold`／`sug`，就要有 `tips`（第 1 批修的那種漏洞不能再發生）。
8. **只提醒、不讓檢查失敗**（印 `WARN`）：`UT`／`BEAT`／`CLIMAX` 缺的歌；不是括號補位行卻沒有中譯 `tr` 的行數（目前〈夜のピエロ〉34 行裡 33 行沒中譯、〈会いたくて〉沒有逐行歌詞）。

`pages.yml` 在 `Build` 前加：

```yaml
      - name: Check data
        run: node scripts/check-data.mjs
```

**做完的標準（要做破壞測試，測完還原）：** 先把 `song-lyrics.js`、`songs.js` 複製到 scratch 位置備份，分別做下面三種故意改壞，每次都要確認檢查**失敗**，再用備份還原：

| 測試 | 怎麼改 | 預期 |
|---|---|---|
| A | 某首某行 `acts` 加一個 `"dance"` | 失敗 |
| B | 某首兩行的 `time` 對調 | 失敗 |
| C | 某行 `sing` 改成那行沒有的字 | 失敗 |

最後用沒改過的檔案跑：通過（只有 WARN）。

**驗證：**

```bash
node scripts/check-data.mjs; echo "exit=$?"
git diff --quiet HEAD -- song-lyrics.js && echo "song-lyrics.js 沒被改"
```

---

## 4. 第 4 批：手機版 UI（需要使用者看過截圖才算完成）

**改的檔案：** `style.css`、`index.html`、`app.js`（只限下面三項需要的部分）

| # | 問題（Claude 用 375×812 實測） | 要做的事 |
|---|---|---|
| 4-1 | 手機首頁第一首歌在畫面約 70% 高度的位置，上面被標題、說明、圖示說明、搜尋框、兩排按鈕佔掉。 | 手機寬度（≤ 600px）時：圖示說明改成一行可以橫向捲動，或收成「圖示說明」小連結點開才看；「篩選」和「排序」放在同一排。目標：375×812 下第一首歌的頂端在畫面 50% 以內。 |
| 4-2 | 篩選和排序按鈕只有 33px 高，手指不好點。 | 手機寬度時這些按鈕至少 44px 高（可以用 padding 撐，不一定要放大字）。 |
| 4-3 | 手機的歌曲頁把「現在要做的事」整塊藏起來，連帶這首歌的**整首應援重點**（例如〈踊〉的「最後副歌前拍手」）在手機上完全看不到。 | 手機寬度時，在影片下方「速度／螢光棒」那一列旁邊加一個「這首重點」小按鈕，點開用現有的 `<details>` 選單樣式列出 `tips`；沒有 tips 的歌不顯示這個按鈕。不要把整個提示框放回來（v1.12.0 才為了讓歌詞變大而拿掉）。 |

**做完的標準：**

- 375×812 和 1280×800 兩種尺寸下，截首頁、`#odo`、`#totmusica`（沒有應援的歌）、`#ravensky` 改動前後的圖，放進 `tools/optimize/work/after/`，並在報告裡做成「前／後」對照表。
- 電腦版（> 900px）畫面和改動前看起來一樣。
- 頁面沒有橫向捲軸（`document.documentElement.scrollWidth` 等於視窗寬度）。
- 這批**做完先停下來**，把對照截圖給使用者看，使用者說可以才算完成。

---

## 5. 這次不做的事（列給使用者決定，Gemini 不要動）

**內容（要人工確認，AI 不要自己補）：**
- 〈夜のピエロ〉33 行沒有中譯；〈会いたくて〉沒有逐行歌詞。
- `UT` 缺〈Stay Gold〉〈患者A〉的歌ネット編號；`BEAT` 缺 5 首、`CLIMAX` 缺〈会いたくて〉。

**新功能（之後開新對話再評估）：**
- A-B 段落循環（同一段一直重複練）。
- 副歌、間奏的段落標籤，可以直接跳段。

**暫時不建議：**
- 把 `app.js` 拆成很多檔，或導入打包工具：網站很小，拆檔反而多了請求和維護成本，第 2 批把資料搬出去就夠了。
- 建置時不再複製整份 `song-lyrics.js`（531 KB）：它是留給還開著舊版網頁的人，等幾個版本後再拿掉。

---

## 6. 禁止事項

1. **不能改 `song-lyrics.js`**（歌詞、翻譯、應援、時間都不行）。第 3 批破壞測試改完一定要還原，並用 `git diff --quiet HEAD -- song-lyrics.js` 證明。
2. **不能改資料表的值**：`SONGS`、`UT`、`PEN`、`BEAT`、`CLIMAX` 只能原樣搬移；第 1 批的 1-1、1-2 是唯二例外。不能補缺的資料。
3. **不能改網址**：`#<id>`、`#<id>@秒數`、`song/<id>/` 都要照舊（分享連結和 Google 收錄靠這些）。
4. **不能改 localStorage 的名稱**（`recent`、`view-opts`、`mv-rate`、`alert-off`、`tool-*`、`list-sort`），不然使用者存的設定會不見。
5. 不能改顏色、字型、Logo、品牌用字；不能加新的外部 CDN、字型、npm 套件或打包工具。
6. 不能動 `googlea6b361c7e6e7d11c.html`、`build.mjs` 裡的 `GSC_VERIFY`、`app.js` 裡 `REPORT` 的表單網址和 entry 編號。
7. 不能做第 5 節列出的任何事，也不能「順手」改清單以外的東西；看到其他問題寫進報告就好。
8. **不能 commit、push、建立或切換分支、`git reset`、`git stash`。** 還原只能用 `git checkout -- <這批改過的檔案>`。
9. 不能改 `tools/align/` 底下的東西（那是另一份交接）。
10. 不能刪除檔案；暫存、備份和截圖放 `tools/optimize/work/`（不進 git）或 scratch 位置。開始前先在 `.gitignore` 加一行 `tools/optimize/work/`。

## 7. 遇到這些情況先停下來問使用者

- 同一個錯誤換方法重試一次還是失敗。
- 第 2 批的建置比對出現 `songs.js` 那一行以外的差異。
- 破壞測試有任何一項沒有失敗。
- 覺得需要改禁止清單裡的東西，或某項做法和本檔寫的不一樣。
- 網站在瀏覽器裡壞掉、console 出現錯誤、影片或歌詞同步不正常。

## 8. 每批交回內容（寫進 `tools/optimize/REPORT.md`，一批一節）

1. 改動前後的 `git status --porcelain` 和 `git diff --stat`。
2. 每個改動的檔案，各一句話說明改了什麼、為什麼。
3. 該批「驗證」裡所有指令的實際輸出（原樣貼上，不要改寫成「通過」）。
4. 破壞測試結果（第 3 批），每項附結束狀態。
5. 前／後截圖對照（檔名和一句說明）。
6. 沒做到、跳過、不確定、或停下來問過使用者的地方。
