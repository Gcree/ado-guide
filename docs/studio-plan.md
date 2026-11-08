# 新歌工作站（Ado Studio）規劃

> 狀態：M0（本機伺服器、任何瀏覽器存檔、同步、發布）已完成，其餘規劃中。目標是新增歌曲的時候不用每次都透過 Claude：音檔、BPM、拍點、字幕初稿都由工作站自動算好，人只負責「確認和微調」，存檔後就能直接發布。Claude 改成只做「上網找資料、整理別人提供的應援」，產出一份情報包讓工作站匯入。

## 0. 我的看法

方向是對的，而且現在的程式碼已經幫我們鋪好一半的路：

- `tools/timing/` 已經有完整的打點、時間軸、應援標籤、歌曲資料編輯，`lyrics-store.js`、`song-meta-store.js` 也已經是「只改這首歌那幾行」的安全寫入邏輯，而且是 UMD，node 可以直接拿來用。
- `songs.js` 已經有「預測」的位置：`hold`（整理中不顯示）、`sug`（暫定建議）、PEN 開頭 `?`（預測色不顯示）。工作站產生的預測只要照這套規則寫，網站就不會把猜的東西當真的顯示出來。
- `karaoke-sources.js` 已經會去 LRCLIB、QQ、網易雲、AMLL 抓逐行／逐字時間，`scripts/align_live_offsets.py` 已經在用 yt-dlp + ffmpeg 算 MV 和 LIVE 的時間差。

缺的是兩塊：

1. **瀏覽器做不到的事**：下載 YouTube、跑音訊模型（分離人聲、抓拍點、對齊歌詞）。這要一個在自己電腦上跑的小伺服器。
2. **一個整合的介面**：把「匯入 → 分析 → 微調 → 檢查 → 發布」串成一條線，而不是現在散在 3 支腳本和 1 個工作台。

幾個要先講清楚的取捨：

| 議題 | 建議 |
| --- | --- |
| 伺服器用什麼寫 | **Node 管資料、Python 管音訊**。Node 伺服器負責讀寫 `songs.js`、`song-lyrics.js`（沿用現有 store）、跑檢查、git；音訊分析寫成幾支 Python 指令，伺服器呼叫它們、拿回 JSON。這樣寫檔的邏輯只有一份。 |
| 自動對時能多準 | 有人聲分離＋已知歌詞的強制對齊，一般句子誤差大約 0.1–0.3 秒，**Ado 的嘶吼、和聲、極快 rap 段會錯**。所以每句都帶「信心分數」，低分的句子在介面上標紅，人只要檢查這些。 |
| 應援和手燈色 | 新歌不可能自動「知道」，只能預測。預測一律存成 `sug`／`?` 狀態（網站不顯示或標「暫定」），等 Claude 找到現場資料或你確認後才轉正式。 |
| YouTube 下載 | 只在自己電腦上做分析用，音檔、分軌放在 `tools/studio/work/`（不進版控、不發布）。 |
| 發布 | 工作站的「發布」= 跑 `check-data` ＋ `test-karaoke` → 只 commit 歌曲資料檔 → 拉遠端最新 → **直接推 `main`**（約 2 分鐘上線）。 |
| 中文翻譯 | **官方有中文就用官方的**（MV 的 YouTube 字幕由頻道上傳的繁中軌）；沒有才呼叫 `agy` 翻譯。 |
| 平台 | **Windows 先用，之後搬到 Mac mini**：同一份程式，只有安裝腳本分兩版（見第 10 節）。 |

## 1. 整體架構

```mermaid
flowchart LR
  subgraph PC["你的電腦"]
    subgraph UI["瀏覽器：Studio 介面<br/>（重新設計，沿用網站色票與元件）"]
      U1["歌曲清單／匯入"]
      U2["分析結果：波形・拍點格・段落"]
      U3["字幕微調（現有對時工作台全部功能）"]
      U4["應援／手燈／歌曲資料"]
      U5["情報匯入・檢查・發布"]
    end

    subgraph SRV["Node 伺服器 tools/studio/server.mjs"]
      API["HTTP API＋進度推播（SSE）"]
      Q["工作佇列<br/>一次跑一個重工作"]
      STORE["lyrics-store.js<br/>song-meta-store.js<br/>（沿用，只改那首歌的行）"]
      GIT["檢查＋git commit／push"]
    end

    subgraph PY["Python 分析工具 tools/studio/py/"]
      DL["fetch：yt-dlp＋ffmpeg"]
      SEP["separate：人聲分離"]
      BEATPY["beats：BPM・小節・段落"]
      ALIGN["align：歌詞強制對齊"]
      COLOR["colors：MV 主色"]
      OFFSET["offset：LIVE 對 MV 時間差"]
    end

    WORK[("tools/studio/work/&lt;id&gt;/<br/>音檔・分軌・分析 JSON<br/>（gitignore）")]
    REPO[("專案檔案<br/>songs.js・song-lyrics.js<br/>song-lyrics-live.js・i18n.js")]
  end

  UI <--> API
  API --> Q --> PY
  PY <--> WORK
  API --> STORE --> REPO
  API --> GIT
  GIT -- push --> GH["GitHub → Actions → ado.kuti.cc"]

  EXT["外部：YouTube・LRCLIB／QQ／AMLL<br/>Uta-Net"] --> DL
  EXT --> API
  CL["Claude：情報包<br/>research/&lt;id&gt;.json"] -. git pull .-> REPO
```

## 2. 新歌從匯入到上線（總流程）

```mermaid
flowchart TB
  START(["貼上 YouTube 網址"]) --> META["讀影片資訊：標題・長度・上傳日期<br/>（yt-dlp，不下載）"]
  META --> NEW["建立歌曲草稿<br/>id・ja・yt・len・date，hold: true"]
  NEW --> DLA["下載音訊 → work/&lt;id&gt;/audio.m4a"]

  DLA --> P1 & P2 & P3
  subgraph AUTO["自動分析（背景跑，介面看進度）"]
    P1["人聲分離 → vocals.wav／inst.wav"]
    P2["拍點：BPM・第一小節・拍點穩不穩<br/>段落：前奏・主歌・副歌・間奏"]
    P3["歌詞文字：官方 YouTube 字幕<br/>→ karaoke 來源（LRCLIB／QQ／AMLL）<br/>→ 手動貼上"]
    P1 --> AL["強制對齊：每句時間＋信心分數"]
    P3 --> AL
    P2 --> CX["副歌高潮 CLIMAX 候選<br/>＝最後一次副歌開頭"]
    P2 --> PRED["應援預測（規則）"]
    AL --> PRED
    MC["MV 抽格取主色 → 手燈色預測"]
  end
  DLA --> MC

  AL --> REVIEW
  CX --> REVIEW
  PRED --> REVIEW
  MC --> REVIEW

  REVIEW["人工微調<br/>先看紅色（低信心）句子・拍點格對不對"] --> TR["中文翻譯：官方繁中字幕<br/>沒有才呼叫 agy，再人工看過"]
  TR --> SAVE["存檔：寫回 songs.js／song-lyrics.js<br/>預測的部分存成 sug／?"]
  SAVE --> CHK{"check-data<br/>test-karaoke"}
  CHK -- 有錯 --> REVIEW
  CHK -- 通過 --> PUB["commit＋push"] --> LIVE(["約 2 分鐘後網站更新<br/>狀態：暫定建議"])

  LIVE -. 之後 .-> RES["Claude 找到現場資料／粉絲應援<br/>→ 情報包"]
  RES --> MERGE["Studio 匯入情報：逐項比對、勾選採用"]
  MERGE --> SAVE2["存檔：sug → 正式、? 色 → 正式"] --> CHK
```

## 3. 音訊分析管線

每一步的輸出都存成 JSON 快取在 `work/<id>/`，重跑時已經有的就跳過（換了模型或參數才重算）。

```mermaid
flowchart LR
  A["audio.m4a"] --> B["ffmpeg<br/>轉 44.1k 單聲道 wav"]
  B --> C["人聲分離<br/>Demucs htdemucs<br/>（或 audio-separator 的 Roformer 模型）"]
  C --> V["vocals.wav"]
  C --> I["inst.wav"]

  B --> BT["beat_this<br/>拍點＋小節起點"]
  BT --> BPM["BPM＝拍距中位數<br/>firstBar＝第一個小節起點<br/>可靠＝拍距變動 &lt; 門檻"]
  BPM --> BEATOUT[["BEAT: [bpm, firstBar, 0/1]"]]

  B --> SEG["段落切分<br/>librosa 自相似矩陣＋重複偵測<br/>（進階：allin1 直接標 chorus）"]
  SEG --> CLX[["CLIMAX：最後一段副歌開頭<br/>對齊到最近的小節線"]]
  SEG --> SECT[["sections.json<br/>intro／verse／chorus／bridge／outro"]]

  V --> VAD["人聲有無（能量＋VAD）"]
  VAD --> SECT

  I --> ENG["能量曲線・鼓點密度"] --> SECT

  MV["MV 影片（低畫質即可）"] --> FR["ffmpeg 每 2 秒抽一格"]
  FR --> KM["Lab 色彩空間 k-means<br/>對應到 10 種手燈色"] --> PENOUT[["PEN：?色1色2（預測）"]]
```

## 4. 字幕自動對時與翻譯

官方字幕最可靠：Ado 的 MV 常有頻道自己上傳的日文、繁中字幕，日文字幕本身就帶每句時間。所以照下面的順序取，取不到才往下：

```mermaid
flowchart TB
  YT["yt-dlp --list-subs<br/>只認「頻道上傳」的字幕軌<br/>（不收 YouTube 自動翻譯）"] --> HASJA{"有日文字幕？"}
  HASJA -- 有 --> OJ["官方日文：文字＋每句時間<br/>→ 直接當初稿（高信心）"]
  HASJA -- 沒有 --> TXT["歌詞文字：karaoke 來源<br/>或手動貼上"]

  TXT --> A1 & A2
  subgraph SRC1["A. 網路上現成的時間"]
    A1["karaoke-sources.js<br/>LRCLIB・QQ・網易雲・AMLL"] --> A1b["alignToLocalLyrics()<br/>對到我們的句子＋整體偏移"]
  end
  subgraph SRC2["B. 自己對齊"]
    A2["stable-ts（Whisper large-v3）<br/>model.align(vocals.wav, 歌詞, ja)"] --> A2b["每句開始時間<br/>＋每個字的機率"]
  end
  A1b --> CMP{"兩邊差 &lt; 0.3 秒？"}
  A2b --> CMP
  CMP -- 是 --> HI["高信心（綠）"]
  CMP -- 否 --> MID["取 B，標中信心（黃）"]
  A2b -- "字機率很低／只有一邊有" --> LO["低信心（紅）"]

  OJ --> SNAP
  HI & MID & LO --> SNAP["吸附：開始時間往前找<br/>最近的人聲起音（±0.15 秒）"]
  SNAP --> DRAFT[["時間初稿：每句 time＋conf"]]

  YT --> HASZH{"有繁中字幕？<br/>zh-Hant／zh-TW"}
  HASZH -- 有 --> OZ["官方中文：依時間對到每一句的 tr<br/>標記「官方翻譯」"]
  HASZH -- 沒有 --> AGY["呼叫 agy 翻譯<br/>整首一次送，附上已有的官方英文／簡中當參考"]
  AGY --> TRD[["中文初稿：標記「待確認」"]]
  OZ --> TRD2[["中文：官方"]]

  DRAFT --> UI["Studio 時間軸：<br/>紅黃句子、待確認翻譯排前面"]
  TRD --> UI
  TRD2 --> UI
```

> 小提醒：信心分數 `conf` 和「官方／待確認」標記只存在 `work/`，不寫進 `song-lyrics.js`，網站資料格式不用改。

### agy 怎麼接

`agy`（Antigravity CLI）有官方的「不開視窗」模式：`agy -p "<提示>" --output-format json`，跑完就結束、把結果印出來（要先用一般模式登入過一次）。但有兩個坑：

- 有人回報：**不是在真的終端機裡跑時（被別的程式呼叫，正是工作站的情況），`-p` 的輸出會不見**。
- 歌詞很長、有引號和日文，直接放進命令列，在 Windows 的 `cmd.exe` 很容易被拆壞。

所以 `tools/studio/agent-cli.mjs` 這樣接：

```mermaid
flowchart TB
  A["工作站把完整說明寫成檔案<br/>work/&lt;id&gt;/translate/request.md<br/>（歌詞、編號、風格要求、輸出格式）"] --> B["命令列只放一句純英數的話<br/>agy -p &quot;Read the file …/request.md and do exactly what it says&quot;<br/>--output-format json"]
  B --> C{"標準輸出裡<br/>有我們要的 JSON？"}
  C -- 有 --> OK["拿到翻譯"]
  C -- "沒有（輸出不見）" --> D{"它有把結果寫進<br/>result.json？"}
  D -- 有 --> OK
  D -- 沒有 --> M["手動：工作站顯示「複製提示」<br/>你貼進 agy 視窗，再把回答貼回來"]
  OK --> V["檢查句數、編號都對得上<br/>才填進中文欄，標「agy・待確認」"]
```

- 解析很寬鬆：外面包一層 JSON 信封、有 ```json 圍欄、一行一個 JSON（stream-json）都挖得出來。
- 同一套也能接 `gemini -p`、`claude -p`，換工具只改 `tools/studio/config.json`（不進版控）。
- **先在你的 Windows 上試**：`node tools/studio/agent-cli.mjs --probe`。它會拿〈踊〉已經有翻譯的 4 句，請每個裝了的工具翻一次，印出「現有翻譯 vs 工具翻譯」對照、哪種方式拿得到結果（標準輸出或檔案），並把能用的寫進 `config.json`。每次的完整紀錄在 `tools/studio/work/_probe/<工具>/cli.log`。

翻譯的要求（給 agy 的提示）固定在 `tools/studio/prompts/translate.md`，內容會照網站現有翻譯的風格：台灣用語、短句、保留歌詞換行、專有名詞不翻。

## 5. 應援預測規則（初版）

全部都只是「建議」，寫入時一律是 `sug: true`，逐行動作也只填在 Studio 裡讓你確認。

```mermaid
flowchart TB
  S["每一段（sections.json）"] --> Q1{"段落種類"}
  Q1 -- "前奏／間奏<br/>且有鼓" --> CLAP{"BPM ≥ 150？"}
  CLAP -- 是 --> C1["拍手（反拍）"]
  CLAP -- 否 --> C2["拍手（正拍）"]
  Q1 -- "前奏／尾奏<br/>沒鼓、能量低" --> L["安靜聽"]
  Q1 -- 主歌 --> V{"能量"}
  V -- 低 --> L
  V -- 高 --> W["揮手（跟著搖）"]
  Q1 -- 副歌 --> CH["揮手"]
  CH --> H{"短句重複 ≥ 3 次？<br/>（如 うっせぇわ）"}
  H -- 是 --> CALL["喊聲候選：標出那幾個字"]
  Q1 -- "最後一段副歌" --> SING{"是大家會唱的段落？"}
  SING -- 不知道 --> ASK["留給 Claude 查／你決定"]
```

## 6. 你、工作站、Claude 的分工

```mermaid
sequenceDiagram
  actor Y as 你
  participant S as Studio（本機）
  participant G as GitHub
  participant C as Claude

  Y->>S: 貼 YouTube 網址
  S->>S: 下載・分離人聲・拍點・對齊・預測（約 3–10 分鐘）
  S-->>Y: 草稿好了（紅色句子 N 句要看）
  Y->>S: 微調時間・確認拍點格・補翻譯
  Y->>S: 發布
  S->>S: check-data・test-karaoke
  S->>G: commit＋push（狀態：暫定建議）
  G-->>Y: Actions 部署完成，網站更新

  Y->>C: 「幫我查〈新歌〉的應援」
  C->>C: 搜尋 X／note／演唱會心得／粉絲整理
  C->>G: 推 research/歌曲id.json（附來源網址）
  Y->>S: git pull → 情報匯入
  S-->>Y: 和目前資料逐項比對（逐行動作・喊聲・手燈色）
  Y->>S: 勾選採用 → 存檔 → 發布（轉正式）
```

### 情報包格式（Claude 產出，`research/<id>.json`）

讓 Claude 交出來的東西有固定格式，Studio 才能逐項比對、勾選：

```json
{
  "id": "andjuly",
  "updated": "2026-11-07",
  "sources": [
    { "url": "https://…", "who": "整理者名稱", "kind": "note|x|blog|video", "date": "2026-11-01" }
  ],
  "pen": { "colors": ["青", "白"], "src": [0], "sure": true },
  "status": "",
  "tips": ["副歌舉手跟著搖"],
  "lines": [
    { "jp": "歌詞原文（用來對到我們的句子）", "acts": ["call"], "call": "Hey!", "src": [0], "sure": false }
  ],
  "notes": "其他沒辦法結構化的資訊"
}
```

每一項都附 `src`（指向 sources）和 `sure`（是否有多個來源互相印證），之後也可以直接拿來更新 `ADO_SONGS_CREDITS.md`。

## 7. 資料狀態

```mermaid
stateDiagram-v2
  [*] --> 草稿: 貼網址匯入
  草稿: 整理中（hold）<br/>網站不顯示應援
  草稿 --> 暫定建議: 對時完成＋自動預測<br/>發布
  暫定建議: sug：網站標「暫定」<br/>PEN 預測色加 ?
  暫定建議 --> 正式: 情報包有來源<br/>你確認
  暫定建議 --> 自由應援: 查到「沒有固定應援」
  草稿 --> 正式: 已經知道應援的歌
  正式 --> 正式: 之後回報修正
  自由應援 --> 正式: 後來出現固定應援
```

## 8. Studio 介面：新的設計系統「Backstage（後台）」

不沿用對時工作台、也不照搬網站，另外做一套給工作站用。設計稿在 `tools/studio/ui/`（用工作站開 <http://localhost:5178/tools/studio/ui/>），用〈シンカ〉的真實歌詞、BPM、副歌高潮，加上假的波形、段落、信心分數。

**概念**：演唱會後台的控台。長時間盯著看也不累，資訊密但不吵。

| 元素 | 規則 |
| --- | --- |
| 底色 | 霧面石墨，四層：底 → 面板 → 浮起 → 滑過；分隔一律 1px 細線，不用陰影堆層次 |
| 主色 | 只有一個：Ado 藍（深色 `#7088ff`／淺色 `#3a55e0`），用在選取、主要按鈕、已播過的波形 |
| 「現在」 | 舞台燈琥珀：播放指針、目前這句、打點按鈕、處理中的步驟 |
| 訊號 | 綠＝高信心／檢查通過，黃＝中信心／提醒，紅＝要檢查／錯誤 |
| 應援色 | 跟網站同一套意思（大合唱藍、喊聲粉、拍手水藍、揮手黃…），色調配這套底色 |
| 字 | 介面黑體；**歌名和日文歌詞用明朝體**（Windows：Yu Mincho，Mac：Hiragino Mincho）；**所有數字用等寬字**（時間、BPM、小節．拍） |
| 圖示 | 1.5px 線條 SVG，不用 emoji |
| 預測 | 一律畫斜線、半透明；確認後才變實心 |
| 主題 | 深色、淺色都有，跟著系統，右上角可切換 |

**版面**：

- **頂部**：品牌、處理流程（下載 → 分離人聲 → 拍點與段落 → 字幕對齊 → 翻譯 → 應援預測，每步顯示完成／處理中／還沒做）、檢查燈號、同步、發布。
- **左**：貼網址匯入、搜尋；歌曲依「處理中／整理中／暫定建議／正式」分組，處理中的顯示進度條和紅色句數。
- **中上**：MV ＋「現在這句」（明朝體大字、中文、接下來三句）＋ BPM、第一小節、長度、副歌高潮、句數、手燈（預測的加虛線圈）。
- **走帶列**：大的等寬時間碼、小節．拍、速度、循環這句、打點（Space）。
- **時間軸**（多軌，左邊是軌名）：尺規 → 段落色帶（副歌高潮插一支旗）→ 拍點格（小節線較長）→ 人聲波形（已播過的染主色）→ 歌詞塊（上緣顏色＝信心，含中文和時間）→ 應援（預測畫斜線）→ **全曲縮圖**（段落、紅黃句子的位置、目前看的範圍，點一下跳過去）→ 圖例＋「N 句要檢查」「下一個紅色 G」。
- **右**：分頁「句子／歌曲／情報」。句子頁：開始時間（±0.05、±0.2 微調）、對齊信心條和原因、日文、中文（標「官方字幕」或「agy 翻譯・待確認」）、應援動作（1–7 快捷鍵）、合唱詞、喊聲、試聽這句。
- 現有快捷鍵全部保留（空白鍵打點、`[` `]` 微調、Enter 試聽…）。

## 9. 建議用的套件

| 用途 | 套件 | 備註 |
| --- | --- | --- |
| 下載 | `yt-dlp`、`ffmpeg` | 已經在用 |
| Python 環境 | `uv` | 一行裝好、Windows／Mac 都一樣，不用自己管 venv |
| 人聲分離 | `demucs`（htdemucs） | 穩定；想要更乾淨的人聲可以換 `audio-separator` 的 BS-Roformer 模型 |
| 拍點＋小節 | `beat_this`（CPJKU, 2024） | 比 librosa／madmom 準，直接給小節起點，Python 新版本也能裝 |
| 段落 | `librosa`（自相似＋重複） | 進階可試 `allin1`（直接標 verse／chorus），但它在 Windows 上很難裝，列為選配 |
| 歌詞對齊 | `stable-ts`（Whisper large-v3） | `model.align()` 是「已知歌詞對時間」，比單純辨識準；沒有 GPU 時一首約數分鐘 |
| 網路時間 | 現有 `karaoke-sources.js` | 直接在 Node 端呼叫 |
| 主色 | `ffmpeg` 抽格＋`numpy` k-means | 不需要額外模型 |
| LIVE 時間差 | 現有 `align_live_offsets.py` | 改成吃參數、不寫死 ffmpeg 路徑，接進 Studio |
| 伺服器 | Node 內建 `http` | 不加框架，跟專案現在零依賴的風格一致 |

## 10. 兩個平台：先 Windows，之後 Mac mini

程式只有一份（Node 伺服器、Python 分析工具都跨平台），差別只在「怎麼裝」和「用哪種加速」：

```mermaid
flowchart TB
  subgraph WIN["現在：Windows"]
    W1["點兩下 工作站.bat"] --> W2["setup-windows.ps1（第一次）<br/>winget 裝 ffmpeg、uv<br/>uv 裝 Python 套件"]
    W2 --> W3{"有 NVIDIA 顯卡？<br/>nvidia-smi"}
    W3 -- 有 --> W4["PyTorch CUDA 版"]
    W3 -- 沒有 --> W5["PyTorch CPU 版"]
  end
  subgraph MAC["之後：Mac mini（Apple 晶片）"]
    M1["點兩下 工作站.command"] --> M2["setup-mac.command（第一次）<br/>brew 裝 ffmpeg、uv<br/>uv 裝 Python 套件"]
    M2 --> M3["PyTorch MPS（Apple 晶片加速）<br/>Demucs 用 MPS<br/>Whisper 評估 mlx-whisper"]
  end
  W4 & W5 & M3 --> SAME["同一份 tools/studio/<br/>同一份 git 專案"]
  SAME --> CFG["本機差異只放 config.json<br/>（ffmpeg 位置、agy 指令、連接埠）"]
```

- **搬家**：歌曲資料都在 git 裡，Mac mini 上 `git clone` ＋ 跑一次 `setup-mac.command` 就好。`work/` 裡的音檔和分析快取不搬，需要時在新電腦重算（結果一樣）。
- **不寫死路徑**：現在的 `scripts/align_live_offsets.py` 把 ffmpeg 寫死成 Windows 的路徑，M1 會改成自動在 PATH 找（找不到再看 `config.json`）。
- **兩邊都測**：每個階段做完，安裝腳本和分析工具在兩個平台各跑一次。

## 11. 分階段做

```mermaid
flowchart LR
  M0["M0 骨架<br/>Node 伺服器開現有工作台<br/>存檔改走伺服器（任何瀏覽器都能存）"] --> M1["M1 匯入<br/>貼網址 → 草稿歌曲＋下載音訊<br/>Python 環境一鍵安裝"]
  M1 --> M2["M2 拍點與段落<br/>BEAT・CLIMAX 自動算<br/>時間軸加拍點格"]
  M2 --> M3["M3 自動對時<br/>人聲分離＋對齊＋信心分數"]
  M3 --> M4["M4 介面改版<br/>整合工作台、沿用網站設計"]
  M4 --> M5["M5 預測＋情報包＋一鍵發布"]
```

| 階段 | 做完你可以 | 主要檔案 |
| --- | --- | --- |
| M0 ✅ | 點兩下 `工作站.bat`／`工作站.command` 開工作台，任何瀏覽器都能直接存檔；「⟳ 同步」拉 Claude 推的情報包，「🚀 發布」檢查後推上 main | `tools/studio/server.mjs` |
| M1 | 貼網址就多一首整理中的歌，不用手改 `songs.js`；官方字幕自動帶入；兩個平台的安裝腳本 | `py/fetch.py`、`song-meta-store.js` 加「新增歌曲」、`setup-windows.ps1`、`setup-mac.command` |
| M2 | 新歌的 BPM、拍點、副歌高潮不用再請 Claude 算 | `py/beats.py`、`py/sections.py` |
| M3 | 字幕初稿自動出來，只修紅色句子；沒有官方中文時用 agy 翻 | `py/separate.py`、`py/align.py`、`prompts/translate.md` |
| M4 | 一個介面做完全部，舊的 `tools/timing/` 退場 | `tools/studio/ui/` |
| M5 | 匯入 Claude 的情報、勾選採用、按一下就上線 | `research/`、`py/colors.py` |

M0–M2 不需要 GPU、裝起來也輕，建議先做；M3 的模型比較大（Whisper large-v3 約 3 GB），可以等前面順了再加。

## 12. 已決定的事（2026-11-08）

1. **平台**：Windows 先用，之後搬到 Mac mini（Apple 晶片），安裝腳本做兩版。
2. **發布**：直接推 `main`。
3. **翻譯**：官方有中文就用官方的；沒有才呼叫 `agy`（接法見第 4 節）。
4. **情報包**：`research/<id>.json` 進版控（建置不會把它放上網站）。
5. **顯卡**：Windows 那台有 NVIDIA → 安裝腳本裝 PyTorch CUDA 版，人聲分離和 Whisper 對齊都用顯卡（預估一首一兩分鐘，實際看顯卡）。
6. **介面**：另做一套新設計「Backstage」（第 8 節），不沿用對時工作台。

還要確認：

- 在 Windows 上跑 `node tools/studio/agent-cli.mjs --probe`，看 `agy` 是從標準輸出還是檔案拿到結果，或兩個都拿不到。
- 新介面的設計稿看過之後的意見。
