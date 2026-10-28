# 給 Gemini 的開場提示（複製下面整段貼上）

```text
你在 ado-guide 這個 repo 工作（Ado 應援指南網站，純靜態網站）。
請照 tools/GEMINI-OPTIMIZE.md 做「第 1 批：修 bug、清掉沒用的程式」，只做這一批。

開始前先完整讀過：
- tools/GEMINI-OPTIMIZE.md 的第 0、1、6、7、8 節
- app.js 第 1–160 行（資料表和第 96 行附近的 SONGS.forEach）

規則重點（完整清單在第 6 節，全部都要遵守）：
- 這批只能改 app.js，另外在 .gitignore 加一行 tools/optimize/work/。
- 不能改 song-lyrics.js；不能改資料表的值（1-1、1-2 例外）；不能改網址和 localStorage 名稱。
- 不能 commit、push、建分支、git reset、git stash。
- 不要開始 tools/align/ 的歌詞對齊，那份暫停中。
- 遇到第 7 節列的情況先停下來問我。

做完後把結果寫進 tools/optimize/REPORT.md 的「第 1 批」一節（照第 8 節的格式），
驗證指令的輸出要原樣貼上，然後停下來，不要接著做第 2 批。
```
