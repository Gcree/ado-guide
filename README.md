# Ado 應援預習

非官方粉絲製作的 Ado 演唱會應援預習網站。看著官方 MV，跟著段落知道哪裡拍手、哪裡喊、哪裡安靜聽。

- `index.html`：網站本體（搭配 `song-lyrics.js`）
- `開啟網站.command`：在自己電腦上看網站時點兩下這個檔案。直接點開 `index.html` 時 YouTube 不允許嵌入播放，MV 不會播
- `song-lyrics.js`：全歌曲同步日文歌詞與繁體中文翻譯資料檔（結構參考 Vaundy 應援站）

## 部署到 GitHub Pages

把 `index.html` 放在 repository 根目錄，到 Settings → Pages，Source 選 `Deploy from a branch`、分支選 `main`、資料夾選 `/ (root)`。
嵌入的 YouTube MV 要用 http(s) 網址開啟才會播放（GitHub Pages 或 `開啟網站.command` 都可以）。

應援資料主要整理自日本粉絲的現場心得；MV、歌詞與圖像的著作權屬於原權利人。
