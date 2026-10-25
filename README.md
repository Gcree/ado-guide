# Ado 應援預習

非官方粉絲製作的 Ado 演唱會應援預習網站。看著官方 MV，跟著歌詞知道哪裡拍手、哪裡喊、哪裡跟著唱、哪裡安靜聽。不照任何一場的歌單，不會暴雷。

專案儲存庫：<https://github.com/Gcree/ado-guide>

## 1. 專案結構

不需要建置，兩個檔案放在同一個資料夾，用 http(s) 開啟就能用。

```text
index.html          ← 網站本體：版面、樣式與所有互動程式
song-lyrics.js      ← 每首歌的同步日文歌詞、繁中翻譯與逐行應援動作
CHANGELOG.md        ← 更新日誌；網站頁尾的「更新日誌」直接讀這個檔案
README.md           ← 這份說明
開啟網站.command     ← 在自己的 Mac 上看網站時點兩下（開一個本機伺服器）
```

`index.html` 裡的資料表：

| 名稱 | 內容 |
| --- | --- |
| `ACT` | 應援動作的名稱、圖示與說明（大合唱、拍手、揮手、跳躍、喊聲、手勢、安靜聽） |
| `SONGS` | 歌單：歌名、MV、長度、整首應援重點 |
| `UT` | 每首歌在 Uta-Net 的歌詞頁編號（「正版歌詞」連結） |
| `PEN`／`PENC` | 每首歌的螢光棒顏色 |
| `BEAT` | 每首歌的 BPM、第一個小節的時間與拍點是否可靠（燈光與拍點聲用） |
| `CLIMAX` | 副歌高潮噴彩帶的時間 |
| `REPORT` | 回報表單：Google 表單網址與各欄位的 entry 編號，留空時改成複製文字 |

`song-lyrics.js` 每一行是 `{ time, jp, tr, acts, sing, call }`：`time` 是 MV 秒數，`acts` 是這行的動作，`sing` 是觀眾要唱的字，`call` 是喊聲。

## 2. 在自己電腦上看

直接點開 `index.html` 時 YouTube 不允許嵌入播放，MV 不會播。請點兩下 `開啟網站.command`，或在資料夾裡開一個靜態伺服器：

```bash
python3 -m http.server 8000
```

再打開 <http://localhost:8000/>。

## 3. 發佈到 GitHub Pages

到 **Settings** → **Pages**，Source 選 **Deploy from a branch**、分支選 `main`、資料夾選 `/ (root)`。

目前儲存庫是私人的，要開 GitHub Pages 需要付費方案（GitHub Pro），或先把儲存庫改成公開。

## 4. 改版流程

1. 改 `index.html` 或 `song-lyrics.js`。
2. 改了 `song-lyrics.js` 時，把 `index.html` 裡載入它的 `song-lyrics.js?v=…` 換一個新字串，避免手機讀到舊快取。
3. 在 `CHANGELOG.md` 最上面加一段新版本，並把頁尾的版本號（`class="build"`）改成一樣。
4. commit 並推到 `main`。

## 5. 資料來源與致謝

- 原創曲的應援動作：[じゅん🌝ぴ 在 note 的整理](https://note.com/jun1217imokenp/n/nda2715681fcd)（2024 年 4 月）。翻唱曲原文沒寫，標「建議」的是依曲風寫的。
- 網站架構與歌詞檔格式參考 [Vaundy 台北場應援指南](https://vaundy.tiaui.co/)（[GitHub](https://github.com/watain666/Vaundy-Taiwan-2026)），它 fork 自 [SEOUL 응원가이드](https://vaundy-seoul-2026.pages.dev/)。
- MV：Ado 官方 YouTube 頻道。
- 正版歌詞連結：[Uta-Net](https://www.uta-net.com/artist/29298/)。

實際應援以現場氣氛和 Ado 的引導為準。MV、歌詞與圖像的著作權屬於原權利人。
