# 給 Claude 的工作說明

這是 Ado 應援指南（<https://ado.kuti.cc/>）。專案結構、資料表和改版流程見 `README.md`；新歌工作站的規劃見 `docs/studio-plan.md`。

## 改歌曲資料：一律用工作站命令列

不要手改 `songs.js`、`song-lyrics.js`、`song-lyrics-live.js`、`i18n.js`。用 `tools/studio/cli.mjs`，它跟工作站介面共用同一套寫入規則（只改碰到的那幾行、寫入前檢查、排版不對就拒絕）。

```bash
node tools/studio/cli.mjs help                     # 全部指令
node tools/studio/cli.mjs list --json              # 歌單
node tools/studio/cli.mjs show <id> --json         # 一首歌的全部資料
node tools/studio/cli.mjs lyrics <id> --json       # 逐句（n 從 1 開始）
node tools/studio/cli.mjs fetch <網址> --id <id>   # 匯入新歌（要能連 YouTube，雲端 session 通常不行）
node tools/studio/cli.mjs analyze <id> --json      # 拍點、BPM、副歌高潮建議（要有 work/<id>/ 的音訊）
node tools/studio/cli.mjs align <id> --json        # 自動對時預覽（要音訊；--apply 寫回）
node tools/studio/cli.mjs translate <id> --json    # 用 agy 翻沒有中文的句子（要設定好；--apply 寫回）
```

- 要改之前先 `show`／`lyrics` 看現況；不確定時加 `--dry-run`，確認變更摘要再真的寫。
- 一次改很多句用 `lines <id> --file edits.json`（`[{"n":12,"acts":["clap"],"call":"Hey!"}]`），不要一句一句跑。
- 加 `--json` 拿結構化結果；失敗時 exit code 是 1，`--json` 會回 `{"ok":false,"error":"…"}`。
- 改完跑 `node tools/studio/cli.mjs check`。
- BEAT／CLIMAX 已有人工調過的值時，不要用 `analyze --apply --overwrite` 蓋掉，除非使用者要求；`bench` 的結果（`tools/studio/work/bench.json`）是用來調分析參數的。

## 應援資料的規矩

- 查不到現場資料的應援、手燈色都是**預測**：狀態用 `sug`（暫定建議），手燈色開頭加 `?`（`--pen "?赤白"`）。網站不會把預測當真的顯示。
- 有來源（note、X、演唱會心得、粉絲整理）才能轉正式。來源寫進 `research/<id>.json`（格式見 `docs/studio-plan.md` 第 6 節），之後寫致謝也用得到。
- 中文翻譯：官方有中文字幕就用官方的；台灣用語、短句、像歌詞。在雲端沒有 agy 時，Claude 可以直接翻，用 `lines` 寫進 `tr`，並告訴使用者哪些句子是 Claude 翻的。
- 應援動作只有：sing, call, clap, wave, jump, gesture, listen。手燈色只有：青 水 白 赤 桃 紫 橙 黄 緑 彩。

## 發布

- 在使用者電腦上（工作站所在的地方）：`node tools/studio/cli.mjs publish -m "…"`，會檢查後只 commit 歌曲資料並推上 `main`。
- 在雲端 session：照 session 指定的分支 commit、push，不要推 `main`；使用者合併後網站才會更新。
- commit 訊息照現有習慣：`fix(songs): …`、`feat(songs): …`、`fix(lyrics): …`，中文寫。
- 網站上看得到的改動要寫 `CHANGELOG.md`（規則見 `README.md` 第 5 節）；工作站、工具的改動不用。

## 雲端 session 做不到的事

下載 YouTube（`fetch`）、人聲分離、自動對時要在使用者電腦上跑（需要 yt-dlp、ffmpeg、顯卡）。雲端能做：查資料、整理情報包、用命令列改歌曲資料和歌詞（新歌可以先用 `add` 手動建，再 `lyrics-import`）、跑檢查。
