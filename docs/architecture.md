# 網站架構

## 1. 檔案、建置與執行期

```mermaid
flowchart TB
  subgraph SRC["原始檔（版控）"]
    HTML["index.html 版面模板"]
    CSS["style.css"]
    APP["app.js 所有互動"]
    SONGS["songs.js<br/>SONGS・UT・PEN・BEAT・CLIMAX・LIVES"]
    LYR["song-lyrics.js<br/>逐行歌詞 acts・sing・call"]
    I18N["i18n.js 英日字典"]
    KS["karaoke-sources.js 逐字時間"]
    LOG["CHANGELOG.md"]
  end

  subgraph CI["GitHub Actions：push main"]
    CHK["check-data.mjs"] --> TK["test-karaoke.mjs"] --> RO["romaji.mjs"] --> BLD["build.mjs"]
  end
  SRC --> CI

  subgraph DIST["dist → GitHub Pages：ado.kuti.cc"]
    Z["/ 中文首頁"]
    EN["/en/"]
    JP["/jp/"]
    SP["song/id/ 三種語言<br/>base href・data-song・SEO"]
    LJ["lyrics/index.json<br/>lyrics/id.json"]
    MISC["sitemap・robots・llms.txt<br/>404・CNAME・i18n/en.js ja.js"]
  end
  BLD --> DIST

  subgraph RT["瀏覽器執行期：app.js SPA"]
    ROUTE{"route()<br/>#id@秒 或 data-song"}
    HOME["首頁 #home"]
    SONG["歌曲頁 #song"]
    ROUTE -- 沒有歌 --> HOME
    ROUTE -- 有歌 --> SONG

    subgraph H["首頁"]
      CRATE["唱片架：隨機抽、飛行轉場"]
      SEARCH["搜尋 q／barQ 同步"]
      FILTER["篩選・排序・再看 12 首"]
      SHELF["推薦練習 6 首"]
      RESUME["繼續練 recent"]
      FAQ["常見問題"]
    end
    HOME --- H

    subgraph S["歌曲頁"]
      YT["YouTube 播放器<br/>只建一次，loadVideoById 換片"]
      LINES["歌詞：點句跳轉・自動捲動・卡拉OK"]
      CUE["現在要做的事＋下一個動作"]
      ALERT["大字提醒字卡＋邊框光"]
      TOOLS["練習工具：速度・拍點聲・自動下一首<br/>分享時間・回報錯誤・加到主畫面"]
      IMM["沉浸模式 F"]
      PIP["歌詞小窗 P<br/>Document PiP，不行改 Canvas PiP"]
      LAMP["手燈連動 WebSocket<br/>127.0.0.1:51730"]
    end
    SONG --- S

    LOOP(("rAF frame()"))
    LOOP --> UPD["update()：行・cue・卡拉OK"]
    LOOP --> FX["舞台燈光・彩帶"]
    LOOP --> CLK["拍點聲 WebAudio"]
    LOOP --> LF["lampFrame() 每秒最多 5 則"]
    LOOP --> UP["updatePip()"]
  end
  DIST --> RT

  subgraph EXT["外部服務"]
    YTAPI["YouTube iframe_api・i.ytimg.com"]
    KAPI["lyrics.txw.qzz.io・AMLL・LRCLIB"]
    GH["GitHub API：PenlightSync 最新版"]
    GF["Google 表單"]
    GA["Google Analytics"]
    PS["PenlightSync App → 藍牙手燈"]
  end
  YT <--> YTAPI
  KS --> KAPI
  LAMP <--> PS
  TOOLS --> GF
  ROUTE --> GA
  H --> GH

  ST[("localStorage／sessionStorage<br/>theme・view-opts・mv-rate・list-sort<br/>tool-*・alert-off・recent<br/>install-dismissed・list-shown")]
  RT <--> ST
```

## 2. 打開一首歌的流程

```mermaid
sequenceDiagram
  actor U as 使用者
  participant R as route()
  participant O as openSong()
  participant L as 歌詞載入
  participant P as YouTube 播放器
  participant K as 卡拉OK來源
  participant F as frame() 迴圈

  U->>R: 點歌（#id）或打開 song/id/
  Note over U,P: document click 先在使用者手勢內啟動播放，避免被擋聲音
  R->>O: openSong(s, @秒)
  O->>O: 標題・螢光棒・上下首・連結・remember()
  O->>L: fillSong()：沒載就 fetch lyrics/id.json
  L-->>O: 載好後再 fillSong() 一次
  O->>P: loadVideo()：沒有就 createPlayer，有就 loadVideoById
  P-->>O: 3 秒沒播 → 靜音播放＋提示
  O->>K: loadKaraokeTiming()（換歌時用 seq 丟掉舊結果）
  loop 每一格
    F->>F: update()：目前行、cue、大字提醒
    F->>F: 燈光・彩帶（CLIMAX）・拍點聲・手燈・小窗
  end
  P-->>F: 播完 ended() → 自動下一首（照首頁排序）
  U->>R: 返回 → 首頁：停手燈、暫停、關沉浸、捲回 listY
```

## 3. 測驗模式（拍點挑戰）

藏起歌詞顏色、動作圖示、喊聲標籤和大字提醒，使用者在該應援的地方按空白鍵或點「按這裡」，依時間準不準給分。

### 3-1. 題目怎麼來

```mermaid
flowchart TB
  A["LINES：有 acts 的行"] --> B["連續同一個動作＋標籤的行<br/>合成一段"]
  B --> C{"這段的主動作"}
  C -- "拍手，且有 BEAT 拍點" --> D{"反拍？"}
  D -- 是 --> E["段落裡每小節第 2、4 拍各一題"]
  D -- 否 --> F["段落裡每一拍一題"]
  C -- "其他動作<br/>或拍手但沒有拍點" --> G["段落開頭一題<br/>（大合唱、喊聲、跳、揮手、手勢）"]
  E --> H["題目表 targets<br/>時間・動作・判定窗"]
  F --> H
  G --> H
  H --> I{"有題目嗎？"}
  I -- 沒有 --> J["測驗按鈕停用<br/>（自由搖、應援還在整理的歌）"]
  I -- 有 --> K["可以開始"]
```

### 3-2. 操作流程

```mermaid
flowchart TB
  START(["練習工具 → 測驗模式（或按 Q）"]) --> HIDE["加上 quiz-on：<br/>藏顏色・圖示・喊聲・圖例・大合唱跳轉・大字提醒"]
  HIDE --> RESET["清空成績，從頭播放"]
  RESET --> LOOP

  subgraph LOOP["每一格 frame()"]
    direction TB
    T1{"時間往回跳？"} -- 是 --> T2["跳回點之後的題目改回未作答<br/>可以重練一段"]
    T1 -- 否 --> T3{"往前跳超過 1 秒？"}
    T3 -- 是 --> T4["中間跳過的題目記成「略過」，不算分"]
    T3 -- 否 --> T5["過了判定窗還沒按的題目 → Miss"]
    T2 --> T6
    T4 --> T6
    T5 --> T6["更新 HUD：分數・連擊・進度"]
  end

  TAP(["空白鍵／點「按這裡」"]) --> N{"判定窗內<br/>有最近的未作答題目？"}
  N -- 有 --> J1{"誤差"}
  J1 -- "很準" --> P["Perfect +1"]
  J1 -- "差一點" --> G2["Good +0.6"]
  N -- 沒有 --> X["多按（只記次數，不扣分）"]
  P --> FB["HUD 顯示判定和動作名稱"]
  G2 --> FB
  X --> FB

  LOOP --> END{"最後一題過了 2 秒<br/>或影片播完？"}
  END -- 是 --> RES["結算視窗：等級 S/A/B/C/D・分數<br/>Perfect/Good/Miss・各動作命中率<br/>沒有略過才記最佳成績"]
  RES --> R1["再挑戰 → 回到「清空成績」"]
  RES --> R2["看答案 → 關掉測驗模式"]
  RES --> R3["複製成績"]

  STOP(["再按一次測驗模式、Esc、換歌、回首頁"]) --> OFF["拿掉 quiz-on，顏色和提醒恢復"]
```

- 判定窗以真實時間算（影片時間 ÷ 播放速度），放慢練習時一樣公平。拍手題 Perfect ±0.08 秒、Good ±0.16 秒；段落開頭題比較難抓，放寬成 ±0.15／±0.35 秒。
- 測驗中空白鍵拿來作答，播放／暫停改用 K 或點影片；不會自動跳下一首。
- 最佳成績存在這台裝置（`quiz-best`），記分數和當時的播放速度。
