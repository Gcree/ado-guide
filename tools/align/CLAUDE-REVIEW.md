# 給 Claude 的提示（Gemini 做完後，開新對話貼上）

Claude 的額度只用在兩件事：**最後審查**和**緊急狀況**。這段期間不要在舊對話追加新功能；真的要改網站，也開新對話。

---

## A. 最後審查（Gemini 交回 `tools/align/HANDBACK.md` 之後）

開一個新的 Claude Code 對話（工作目錄 `ado-guide`），貼上：

```text
請審查 Gemini 做的歌詞時間對齊，只看這次的改動和報告，不用讀其他歷史。
範圍：git diff（song-lyrics.js、.gitignore）、tools/align/ 底下的檔案、
tools/align/HANDBACK.md、tools/align/REPORT.md、tools/align/GEMINI-HANDOFF-v2.md（規格）。

要確認：
1. song-lyrics.js 只有 show、odo、kokoro 三首的 time 變了；其他 71 首、
   以及三首的 jp、tr、acts、sing、call 和排版完全沒變。自己跑一次
   node tools/align/verify_merge.mjs，並自己用 git diff 抽看，不要只相信報告。
2. 翻譯、應援沒有錯位：時間由小到大、沒有兩行時間互換；有 acts／sing／call 的行，
   新時間仍落在那句歌詞被唱的位置。開本機網站，三首各看兩段副歌，截圖給我看。
3. app.js 裡這三首的 claps、CLIMAX、BEAT 時間沒動；如果歌詞整首往前或往後移，
   告訴我這些固定時間會不會因此對不上（只報告，不要改）。
4. REPORT.md 的數字是真的：corrected 檔確實是我校正的那三個、沒有用候選時間冒充，
   結論符合規格裡的門檻。
5. 音訊、人聲檔沒有被 git 追蹤或暫存。
6. node scripts/build.mjs 能建置成功。

最後用一句話告訴我：可以 commit 並推上 GitHub，還是要先修什麼。
沒有我同意不要 commit 或 push。
```

審查通過、你同意後，Claude 才做：更新 `CHANGELOG.md` 和版本號、commit、push。

---

## A2. 網站優化每一批的審查（Gemini 照 `tools/GEMINI-OPTIMIZE.md` 交回一批之後）

開新對話，貼上：

```text
請審查 Gemini 照 tools/GEMINI-OPTIMIZE.md 做的第 ___ 批，只看這次的 git diff
和 tools/optimize/REPORT.md 的這一節，不用讀其他歷史。
要確認：
1. 只改了該批允許的檔案；song-lyrics.js 沒被動（git diff --quiet HEAD -- song-lyrics.js）。
2. 資料表的值沒被改（第 1 批的 1-1、1-2 除外）；網址和 localStorage 名稱沒變。
3. 自己跑一次該批的驗證指令，不要只相信報告。
4. 開本機網站，用手機和電腦寬度各看首頁和一首歌，截圖給我看。
最後用一句話告訴我：可以 commit，還是要先修什麼。沒有我同意不要 commit 或 push。
```

---

## B. 緊急狀況（Gemini 卡住，或網站被改壞）

開新對話，貼上：

```text
Gemini 照 tools/align/GEMINI-HANDOFF-v2.md 做到步驟 ___ 卡住了（或：網站壞了）。
狀況：＿＿＿（貼上錯誤訊息或描述看到的畫面）
請先只看 git status、git diff 和 tools/align/ 底下的檔案判斷原因，
修好讓 Gemini 能繼續做下一步就好，不要順便加功能，也不要 commit。
如果網站壞了，先確認是不是 song-lyrics.js 被改壞，必要時用
git checkout -- song-lyrics.js 還原，並告訴我還原了什麼。
```
