(() => {
  // ── 動作 ──
  const ACT = {
    sing:    { name: "大合唱",   icon: "i-sing",    how: "跟著一起唱" },
    clap:    { name: "拍手",     icon: "i-clap",    how: "跟著節拍拍手" },
    wave:    { name: "舉手揮動", icon: "i-wave",    how: "舉手左右揮" },
    jump:    { name: "跳躍",     icon: "i-jump",    how: "跟著節奏跳" },
    call:    { name: "喊聲",     icon: "i-call",    how: "跟著喊短句" },
    gesture: { name: "手勢",     icon: "i-gesture", how: "跟 Ado 做同樣的動作" },
    listen:  { name: "安靜聽",   icon: "i-listen",  how: "留給 Ado 唱" }
  };

  // ── 歌曲資料（MV 為 Ado 官方頻道；len 為 MV 長度） ──
  // 原創曲的 acts／tips／free 依 じゅん🌝ぴ 的 note（2024-04-26）整理；逐行動作在 song-lyrics.js。翻唱曲原文沒寫，標 sug 的是依曲風的建議（目前不顯示，見下方 hold）。
  const SONGS = [
    { id: "show", ja: "唱", zh: "唱", en: "Show", date: "2023-09-06", yt: "pgXpM4l_MwI", len: "3:10", acts: ["sing", "clap"], tips: ["開頭和每次副歌開頭的英文句由觀眾唱", "主歌和副歌有好幾句是 Ado 起頭、觀眾接", "主歌後半、副歌後半、最後副歌三個地方拍手", "最後副歌喊「Clap Clap Clap」時拍三下"], claps: 180.94 },
    { id: "usseewa", ja: "うっせぇわ", zh: "吵死了", date: "2020-10-23", yt: "Qp3b-RXtz4w", len: "3:23", acts: ["call", "sing"], tips: ["間奏喊「ハイ！ハイ！」", "副歌第二次重複歌名那句由觀眾唱"] },
    { id: "readymade", ja: "レディメイド", zh: "Readymade", date: "2020-12-24", yt: "jg09lNupc1s", len: "4:03", acts: ["call", "sing"], tips: ["間奏喊「ハイ！ハイ！」", "副歌裡成對的短問句由觀眾回唱"] },
    { id: "freedom", ja: "FREEDOM", zh: "FREEDOM", date: "2022-10-24", yt: "hgyGhu49sGc", len: "3:02", acts: ["clap", "call", "sing"], tips: ["曲前可能先帶一段「パン パン パパン パン」的拍手，聽到這個節奏就是 FREEDOM", "間奏喊「ハイ！ハイ！」", "副歌以外想拍就跟著拍", "副歌前和 C 段最後，Ado 起頭後觀眾接「1,2,3,4」", "C 段跟著拍手，「Wow wow」和 Ado 一來一往"] },
    { id: "rule", ja: "ルル", zh: "RuLe", date: "2024-07-05", yt: "0Z_YqhYHhpg", len: "3:19", acts: ["sing"], tips: ["副歌連續三次的「サヨナラ」由觀眾唱"] },
    { id: "ashura", ja: "阿修羅ちゃん", zh: "阿修羅醬", date: "2021-10-28", yt: "cyq5-StPISU", len: "3:19", acts: ["wave", "call", "sing"], tips: ["間奏跟著 Ado 舉手，喊「ハイ！ハイ！」", "副歌跟著 Ado 的手臂左右揮，從左邊開始", "副歌裡 Ado 唱「アンダスタン」後，觀眾重複一次"] },
    { id: "mondaisaku", ja: "アタシは問題作", zh: "我是問題作", date: "2023-02-20", yt: "lZGo8jcEW2M", len: "3:15", acts: ["sing"], tips: ["副歌裡重複歌名的問句由觀眾唱", "副歌另外兩處重複的台詞也由觀眾唱，有時 Ado 會自己唱"] },
    { id: "gyakkou", ja: "逆光", zh: "逆光", date: "2022-07-06", yt: "gt-v_YCkaMY", len: "4:10", acts: ["clap", "call", "gesture"], tips: ["曲前可能先帶一段「パパン パン パパン パン」的拍手，聽到這個節奏就是逆光", "前奏先在第 2、4 拍的反拍拍手，之後改拍正拍", "間奏喊「ハイ！ハイ！」", "副歌指定的句子跟著轉手 3 次", "C 段整段拍手"] },
    { id: "odo", ja: "踊", zh: "踊", date: "2021-04-27", yt: "YnSW8ian29w", len: "3:29", acts: ["sing", "call", "jump", "clap"], tips: ["開頭和 B 段結尾那句由觀眾唱", "主歌有幾句和 Ado 一來一往對唱", "副歌的「Woah」由觀眾唱", "間奏第 3、4 和 7、8 小節跳（依演唱會影像）", "最後副歌前拍手"] },
    { id: "shinjidai", ja: "新時代", zh: "新時代", date: "2022-06-15", yt: "1FliVTcX8bQ", len: "3:58", acts: ["clap", "call", "sing"], tips: ["開頭清唱結束、鼓聲進來時拍手", "間奏喊「ハイ！ハイ！」", "副歌前那句英文由觀眾唱"] },
    { id: "giragira", ja: "ギラギラ", zh: "閃閃發光", date: "2021-02-14", yt: "sOiMD45QGLs", len: "4:37", acts: ["sing"], tips: ["副歌開頭的兩個疊字詞由觀眾唱", "副歌中間的三句英文由觀眾唱"] },
    { id: "kurakura", ja: "クラクラ", zh: "暈眩", date: "2023-10-07", yt: "W_fHWaoQwkw", len: "3:11", acts: ["sing"], tips: ["A 段括號裡的英文由觀眾唱", "副歌 Ado 起頭後，觀眾接下一句", "副歌的歌名由觀眾唱", "最後副歌有一長句由觀眾唱"] },
    { id: "saikyo", ja: "私は最強", zh: "我是最強", date: "2022-06-22", yt: "sk1Z-Hqwwog", len: "4:30", acts: ["clap", "call"], tips: ["開頭的副歌拍手，依場次有時不拍", "間奏喊「ハイ！ハイ！」"] },
    { id: "aiaia", ja: "アイ・アイ・ア", zh: "AiAiA", date: "2026-03-20", yt: "_8CNByAq1n4", len: "4:20", acts: ["sing"], tips: ["副歌 Ado 唱完歌名，觀眾重複一次", "最後副歌連續四次的歌名也由觀眾重複"] },
    { id: "rockstar", ja: "ロックスター", zh: "搖滾巨星", date: "2025-04-09", yt: "hRJpiCZlLX8", len: "3:51", acts: ["clap", "sing", "call"], tips: ["前奏和間奏照固定節奏踏腳、拍手", "Ado 給信號後一起唱", "官方推薦這樣做到曲子結束；作者建議只有間奏照官方做，其他時候拍手就好", "最後副歌前喊「Hey」"] },
    { id: "staygold", ja: "Stay Gold", zh: "Stay Gold", date: "2026-07-31", yt: "Tmz3mpOq8aE", len: "3:55", acts: ["wave", "call"], tips: ["副歌加「wow」", "跟著節拍搖螢光棒"], live: true, acts: ["sing"], tips: ["副歌的「wow wow」由觀眾唱"] },
    { id: "episodex", ja: "Episode X", zh: "Episode X", date: "2024-12-06", yt: "9dKZeL2UbUM", len: "3:46", acts: ["sing"], tips: ["第二段 A 段的三個單字由觀眾唱"] },
    { id: "totmusica", ja: "Tot Musica", zh: "Tot Musica", date: "2022-08-17", yt: "V9_ZpqfqHFI", len: "3:22", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kira", ja: "綺羅", zh: "KIRA", date: "2026-04-27", yt: "qpcz3-iDUP8", len: "3:19", acts: ["call", "sing"], tips: ["間奏喊「ハイ！ハイ！」", "副歌前那一長句由觀眾唱"] },
    { id: "monstruo", ja: "モンストロ", zh: "Monstruo", date: "2026-08-07", yt: "4IKHox-DKrM", len: "3:14", acts: ["sing"], tips: ["副歌的英文短句由觀眾唱", "第二段 Ado 唱完日文後，觀眾接英文"] },
    { id: "ibara", ja: "いばら", zh: "荊棘", date: "2023-05-09", yt: "oy2WTnhVT2w", len: "4:20", acts: ["call"], tips: ["第二次副歌前和最後副歌前，Ado 問準備好了沒，用歡呼回應"] },
    { id: "rebellion", ja: "リベリオン", zh: "叛逆", date: "2022-09-19", yt: "0Y8e0LJf0i0", len: "2:59", acts: ["clap", "sing", "gesture"], tips: ["前奏一路拍手，拍到「Yeah」為止", "A 段的「Wowow」由觀眾唱", "副歌跟著 Ado 轉手臂", "副歌的「Shake it out out!」由觀眾唱", "副歌結尾的英文段和最後副歌後半那句，想唱再唱"] },
    { id: "chocolat", ja: "ショコラカタブラ", zh: "Chocolat Cadabra", date: "2024-01-31", yt: "c5j7lpWprro", len: "3:21", acts: ["clap", "sing"], tips: ["開頭和副歌前，括號裡的短句拍手", "副歌的歌名由觀眾唱"] },
    { id: "shoka", ja: "初夏", zh: "初夏", date: "2024-10-14", yt: "GORsp0gc2Nc", len: "3:56", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    // 以下：free＝粉絲說沒有固定應援；sug＝查不到現場資料，依曲風寫的建議
    { id: "pierrot", ja: "夜のピエロ", zh: "夜之小丑", date: "2021-06-14", yt: "cSgZxz3le7s", len: "3:20", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "aitakute", ja: "会いたくて", zh: "好想見你", date: "2021-08-12", yt: "jTVSU-Lr1ew", len: "4:48", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "akuruhi", ja: "永遠のあくる日", zh: "永遠的翌日", date: "2022-03-14", yt: "ZHAnZTVF_10", len: "4:07", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kokoro", ja: "心という名の不可解", zh: "名為心的不可解", date: "2022-01-17", yt: "BMb5IetESGE", len: "4:30", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "utakata", ja: "ウタカタララバイ", zh: "泡影搖籃曲", date: "2022-08-06", yt: "hyV1AJiFNyo", len: "3:13", acts: ["call", "sing"], tips: ["副歌有兩個地方跟著喊", "第二段饒舌段喊「Hey」", "結尾那句英文由觀眾唱"] },
    { id: "sekai", ja: "世界のつづき", zh: "世界的延續", date: "2022-08-10", yt: "b3GCfyNKeLs", len: "4:55", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kaze", ja: "風のゆくえ", zh: "風的去向", date: "2022-08-24", yt: "YO-rXgQKlF8", len: "4:47", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "missing", ja: "行方知れず", zh: "下落不明", date: "2022-10-10", yt: "VQtmqpSE64w", len: "3:16", acts: ["call"], tips: ["間奏喊「ハイ！ハイ！」"] },
    { id: "himawari", ja: "向日葵", zh: "向日葵", date: "2023-07-11", yt: "aOKa-5AHCtU", len: "4:19", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "dignity", ja: "DIGNITY", zh: "DIGNITY", date: "2023-09-28", yt: "Q9X0J_tLHwY", len: "4:13", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "radio", ja: "オールナイトレディオ", zh: "All Night Radio", date: "2023-11-11", yt: "lfw8W3uWO7s", len: "3:35", acts: ["sing", "wave"], tips: ["開頭和最後副歌前，觀眾喊那串數字", "副歌跟著 Ado 的手臂左右揮，從左邊開始"] },
    { id: "unravel", ja: "unravel", zh: "unravel", date: "2023-11-15", yt: "eZuDklxsaRg", len: "4:01", acts: ["listen", "wave"], tips: ["以聽為主，副歌可以舉手"], sug: true, cover: true },
    { id: "hotaru", ja: "夜明けと蛍", zh: "黎明與螢火蟲", date: "2023-12-12", yt: "1T6b26DTQy4", len: "5:09", acts: ["listen"], tips: ["抒情歌，安靜聽"], sug: true, cover: true },
    { id: "value", ja: "Value", zh: "Value", date: "2024-02-23", yt: "5iAQF_q6FSk", len: "3:13", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "mirror", ja: "MIRROR", zh: "MIRROR", date: "2024-05-31", yt: "zsBBWBEZkFQ", len: "3:00", acts: ["sing"], tips: ["第二次副歌和最後副歌後半，「NE! NE! NE!」和「もう一回！」由觀眾唱"] },
    { id: "sakura", ja: "桜日和とタイムマシン with 初音ミク", zh: "櫻花晴日與時光機", date: "2024-10-24", yt: "nIWZfhpnq6M", len: "5:30", acts: ["call"], tips: ["間奏喊「ハイ！ハイ！」"] },
    { id: "elf", ja: "エルフ", zh: "精靈", date: "2025-01-24", yt: "SbxR25brgoE", len: "4:23", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "hanataba", ja: "わたしに花束", zh: "給我的花束", date: "2025-04-06", yt: "_RAffg8JQ6g", len: "3:47", acts: ["call"], tips: ["間奏喊「ハイ！ハイ！」"] },
    { id: "kazetowatashi", ja: "風と私の物語", zh: "風與我的故事", date: "2025-09-26", yt: "oAuKa5NOzWE", len: "5:53", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "magic", ja: "MAGIC", zh: "MAGIC", date: "2025-10-31", yt: "l0WArCNh6G0", len: "2:52", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "angelseek", ja: "エンゼルシーク", zh: "Angelseek", date: "2026-02-09", yt: "aGSmxr-dUq0", len: "3:50", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "vivarium", ja: "ビバリウム", zh: "Vivarium", date: "2026-02-28", yt: "YvYii6dluM8", len: "4:32", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "haruni", ja: "春に舞う", zh: "於春日起舞", date: "2026-05-25", yt: "xIYfDbkq-SM", len: "3:59", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kagakushu", ja: "過学習", zh: "過度學習", date: "2022-03-06", yt: "55W2LxbQoHc", len: "3:35", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "hanabi", ja: "花火", zh: "花火", date: "2022-01-26", yt: "5_-TcIOxm60", len: "3:36", acts: ["clap"], tips: ["副歌和間奏以外一直拍手", "B 段第一句先停拍，下一句再接著拍"] },
    { id: "domestic", ja: "ドメスティックでバイオレンス", zh: "Domestic de Violence", date: "2022-03-26", yt: "iRMYLKIWyUk", len: "2:37", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "luckybruto", ja: "ラッキー・ブルート", zh: "Lucky Bruto", date: "2022-05-08", yt: "u-G_zzhLSy8", len: "3:28", acts: ["sing"], tips: ["副歌裡的「ヘイミスター」由觀眾唱", "結尾的「ダダダン」「バババン」由觀眾唱"] },
    { id: "motherland", ja: "マザーランド", zh: "Motherland", date: "2022-05-08", yt: "_wZfYtYwxro", len: "4:21", acts: ["clap"], tips: ["副歌和 C 段以外一直拍手，樂團會帶", "安靜下來的那段副歌，改在第 2、4 拍的反拍拍手"] },
    { id: "nukegara", ja: "抜け空", zh: "空殼", date: "2024-12-30", yt: "JpnqXqy-XMg", len: "3:09", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "zero", ja: "0", zh: "0", date: "2025-10-24", yt: "8vm3Tkv43jw", len: "3:01", acts: ["clap"], tips: ["B 段整段拍手"] },
    { id: "hellosignals", ja: "Hello Signals", zh: "Hello Signals", date: "2025-04-09", yt: "IH-u0Mk_xEY", len: "3:19", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kittocoaster", ja: "きっとコースター", zh: "一定是雲霄飛車", date: "2024-06-18", yt: "nV5SHldicJY", len: "3:02", acts: ["sing"], tips: ["副歌那句疊字由觀眾唱"] },
    { id: "lovemeforever", ja: "Love me forever!", zh: "Love me forever!", date: "2026-07-03", yt: "WSuAVkaSC38", len: "4:10", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kanjaa", ja: "患者A", zh: "患者A", date: "2026-10-24", yt: "JO66tA5Yngs", len: "4:49", hold: true, acts: ["call", "gesture"], tips: ["跟著喊『あっかんべー』並做吐舌手勢", "間奏與結尾跟著節拍拍手"] },
    { id: "ravensky", ja: "Raven Sky", zh: "Raven Sky", date: "2026-10-16", yt: "7DBSMzbPQzc", len: "4:12" },
    { id: "sukideite", ja: "好きでいて", zh: "請一直喜歡我", date: "2026-09-07", yt: "iTNwVheLpj8", len: "4:07" },
    { id: "soldiergame", ja: "soldier game", zh: "soldier game", date: "2026-01-13", yt: "J3hzdBkd6bg", len: "3:42" },
    // 翻唱
    { id: "ponpokorin", ja: "おどるポンポコリン", zh: "跳舞的嘭嘭可琳", date: "2026-01-11", yt: "TZYqDl19qLQ", len: "1:25", acts: ["clap"], tips: ["跟著節拍拍手"], sug: true, cover: true },
    { id: "catseye", ja: "CAT'S EYE", zh: "貓眼", date: "2025-12-26", yt: "8-Qekf_GBow", len: "3:05", acts: ["wave"], tips: ["跟著節拍搖螢光棒"], sug: true, cover: true },
    { id: "kitaro", ja: "ゲゲゲの鬼太郎", zh: "鬼太郎", date: "2025-05-15", yt: "6Qd16SxUjj4", len: "2:15", acts: ["clap"], tips: ["跟著節拍拍手"], sug: true, cover: true },
    { id: "charles", ja: "シャルル", zh: "夏爾", date: "2025-04-16", yt: "trIiMhTDKxo", len: "3:45", acts: ["wave"], tips: ["副歌舉手跟著搖"], sug: true, cover: true },
    { id: "jikkai", ja: "十戒（1984）", zh: "十戒", date: "2025-05-01", yt: "BFVn0ZQwGpk", len: "3:33", acts: ["wave"], tips: ["跟著節拍搖螢光棒"], sug: true, cover: true },
    { id: "aishite", ja: "愛して愛して愛して", zh: "愛我愛我愛我", date: "2024-06-07", yt: "HmkbBdD8044", len: "4:16", acts: ["clap", "wave"], tips: ["跟著節拍拍手，副歌舉手"], sug: true, cover: true, live: true },
    { id: "kazarijanai", ja: "飾りじゃないのよ涙は", zh: "眼淚不是裝飾品", date: "2023-12-12", yt: "Mtfkq7doqWw", len: "4:13", acts: ["wave"], tips: ["跟著節奏輕輕搖"], sug: true, cover: true },
    { id: "kamippoina", ja: "神っぽいな", zh: "像神一樣呢", date: "2022-07-24", yt: "7i_nc5GGIsI", len: "3:25", acts: ["wave"], tips: ["跟著節拍搖螢光棒"], sug: true, cover: true },
    { id: "kawaikute", ja: "可愛くてごめん", zh: "可愛真是抱歉", date: "2023-12-12", yt: "axOhZD3boe8", len: "3:40", acts: ["clap"], tips: ["跟著節拍拍手"], sug: true, cover: true },
    { id: "tsumitobatsu", ja: "罪と罰", zh: "罪與罰", date: "2022-07-24", yt: "x1UsJ2Znjk0", len: "4:50", acts: ["listen"], tips: ["以聽為主"], sug: true, cover: true },
    { id: "dryflower", ja: "ドライフラワー", zh: "乾燥花", date: "2023-12-12", yt: "qhmrt3ZNgcs", len: "4:49", acts: ["listen"], tips: ["抒情歌，安靜聽"], sug: true, cover: true },
    { id: "villain", ja: "ヴィラン", zh: "Villain", date: "2023-12-12", yt: "r_wO7xKI-tw", len: "3:20", acts: ["wave"], tips: ["副歌舉手跟著搖"], sug: true, cover: true },
    { id: "burikino", ja: "ブリキノダンス", zh: "鐵皮之舞", date: "2023-11-29", yt: "iL7uoLCbJoc", len: "3:22", acts: ["clap", "wave"], tips: ["跟著節拍拍手、搖螢光棒"], sug: true, cover: true }
  ];
  // 正版歌詞：歌ネット（uta-net.com）的歌曲頁編號
  const UT = {"show":343570,"usseewa":292534,"readymade":295824,"freedom":313113,"rule":356726,"ashura":309074,"mondaisaku":332973,"gyakkou":321128,"odo":301298,"shinjidai":319758,"giragira":297951,"kurakura":344008,"saikyo":320568,"aiaia":389756,"rockstar":371304,"episodex":364731,"totmusica":322907,"kira":392133,"monstruo":397076,"ibara":336879,"rebellion":324691,"chocolat":349160,"shoka":361947,"pierrot":303332,"aitakute":306065,"akuruhi":315407,"kokoro":313110,"utakata":322805,"sekai":322906,"kaze":322905,"missing":326032,"himawari":340373,"dignity":343573,"radio":344727,"unravel":350288,"hotaru":350286,"value":350381,"mirror":355040,"sakura":362390,"elf":367139,"hanataba":369630,"kazetowatashi":380660,"magic":381653,"angelseek":386914,"vivarium":388255,"haruni":392755,"kagakushu":313108,"hanabi":313112,"domestic":313114,"luckybruto":313111,"motherland":313109,"nukegara":357493,"zero":357492,"hellosignals":371303,"kittocoaster":363098,"lovemeforever":395819,"ravensky":400798,"sukideite":398715,"soldiergame":386267,"ponpokorin":385914,"catseye":380030,"kitaro":374762,"charles":371560,"jikkai":373551,"aishite":350293,"kazarijanai":350294,"kamippoina":350289,"kawaikute":350291,"tsumitobatsu":350292,"dryflower":350295,"villain":350290,"burikino":350287};
  // hold：應援和螢光棒顏色還沒有可靠來源（例如剛出的新歌），資料先留著、畫面不顯示，確認後拿掉 hold；sug 的建議也一樣先不顯示
  SONGS.forEach(s => { if (s.sug) s.hold = true; if (s.hold) { s.acts = []; s.tips = []; } });
  SONGS.forEach(s => { s.ut = UT[s.id] ? `https://www.uta-net.com/song/${UT[s.id]}/` : `https://www.uta-net.com/artist/29298/`; s.acts = s.acts || []; s.tips = s.tips || []; s.dur = s.len.split(":").reduce((a, b) => a * 60 + +b, 0); });
  // 推出順序：MV 在 YouTube 公開的日期（日本時間）；編號照這個順序
  SONGS.sort((a, b) => a.date.localeCompare(b.date)).forEach((s, i) => s.no = i + 1);
  // 歌詞：正式網站由 scripts/build.mjs 拆成每首一個檔（lyrics/<id>.json），<html data-lyrics> 是版本；
  // 先讀小小的 lyrics/index.json（每首的應援數量），打開哪首才載那首。直接開原始檔時沒有拆，改讀整份 song-lyrics.js
  // 應援數量：歌詞裡有動作的行數（「安靜聽」不算）；index.json 裡沒有的歌就是沒有逐行歌詞
  const LYV = document.documentElement.dataset.lyrics, LY = {}, lyWait = {};
  let lyReady = false;
  const loadScript = src => new Promise(res => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = el.onerror = res;
    document.head.appendChild(el);
  });
  const getJSON = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const lyLoaded = (LYV
    ? getJSON(`lyrics/index.json?v=${LYV}`)
    : loadScript("song-lyrics.js").then(() => {
        const idx = {};
        (window.SONG_LYRICS || []).forEach(b => { LY[b.id] = b; if (b.lyrics && b.lyrics.length) idx[b.id] = b.lyrics.filter(l => (l.acts || []).some(a => a !== "listen")).length; });
        return idx;
      })
  ).then(idx => {
    lyReady = true;
    SONGS.forEach(s => { s.lines = !!idx && s.id in idx; s.cheer = s.lines && !s.hold ? idx[s.id] : 0; });
  });
  // 這首的歌詞載好了沒（拆檔時打開才載）；網址一開始就指向的歌，和 index.json 一起先載
  const lyHave = s => lyReady && (!s.lines || !!LY[s.id]);
  const fetchLy = id => lyWait[id] = lyWait[id] || getJSON(`lyrics/${id}.json?v=${LYV}`).then(b => { if (b) LY[id] = b; });
  function loadLyrics(s) {
    if (!LYV || lyHave(s)) return Promise.resolve();
    return fetchLy(s.id).then(() => { if (!LY[s.id]) s.lines = false; });
  }
  const firstSong = (location.hash.slice(1) || document.documentElement.dataset.song || "").split("@")[0];
  if (LYV && SONGS.some(s => s.id === firstSong)) fetchLy(firstSong);
  const BY = Object.fromEntries(SONGS.map(s => [s.id, s]));
  // 螢光棒顏色：依 じゅん🌝ぴ 的 note；彩＝カラフル，開頭 ? 是原文的預測（不顯示，當作沒寫）；沒寫的歌用藍（原文：迷ったら青）
  const PEN = { usseewa: "青赤", readymade: "赤桃水", giragira: "白", odo: "赤青", pierrot: "水紫", aitakute: "桃", ashura: "赤橙", kokoro: "白水", hanabi: "彩", kagakushu: "白水", akuruhi: "白水", domestic: "赤桃青", motherland: "青水白", luckybruto: "青赤", shinjidai: "彩桃", saikyo: "彩橙", gyakkou: "赤", utakata: "緑青赤", sekai: "黄", totmusica: "紫青", kaze: "青水", rebellion: "赤青", missing: "白水", freedom: "白青", mondaisaku: "緑彩", ibara: "水白青", himawari: "黄橙緑水", show: "橙黄", dignity: "青水", kurakura: "水桃", radio: "橙黄緑", chocolat: "赤白", value: "水白", mirror: "青桃", kittocoaster: "水桃", rule: "青水赤", nukegara: "水白", zero: "白", hellosignals: "水桃", shoka: "赤青", sakura: "桃", episodex: "青水白", elf: "緑橙黄", hanataba: "水黄", rockstar: "赤黄", staygold: "赤青紫", kazetowatashi: "青水", magic: "紫桃赤", angelseek: "水白", vivarium: "青", aiaia: "赤橙黄", kira: "青橙", haruni: "桃", sukideite: "?黄", monstruo: "橙赤黄水", lovemeforever: "紫水白", kanjaa: "?桃白", ravensky: "?橙赤紫" };
  const PENC = { 青: ["藍", "#5d9dfe"], 水: ["水藍", "#5fd4ff"], 白: ["白", "#f2efe8"], 赤: ["紅", "#ff4a5a"], 桃: ["粉紅", "#ff7ab8"], 紫: ["紫", "#a374ff"], 橙: ["橘", "#ff9a3c"], 黄: ["黃", "#ffd84a"], 緑: ["綠", "#4ee08a"] };
  const RAINBOW = [..."赤橙黄緑水青紫"];
  // 拍點：[BPM, 第一個小節第一拍的秒數, 小節第一拍可信]。從 MV 音訊分析：BPM 以 songbpm.com 為起點微調，再找拍子位置和和聲換的那一拍；
  // 拍點不清楚的歌不列，燈光改成每句歌詞開頭亮一下
  const BEAT = { aiaia: [138, 1.685, 0], aitakute: [160, 0.97, 1], akuruhi: [147, 0.671, 0], ashura: [156, 1.522, 1], burikino: [172, 0.695, 1], catseye: [145, 0.635, 1], charles: [148, 1.306, 0], chocolat: [137, 0.033, 1], dignity: [154, 0.447, 1], domestic: [116, 0.726, 1], dryflower: [148, 0.473, 1], elf: [160, 1.47, 1], episodex: [174, 0.152, 1], freedom: [178, 0.203, 1], giragira: [96, 2.05, 1], gyakkou: [145, 0.366, 0], hanabi: [100, 0.95, 1], hanataba: [93.5, 2.005, 0], haruni: [145, 1.055, 1], hellosignals: [170, 0.595, 0], himawari: [95, 0.773, 1], hotaru: [80, 1.79, 0], ibara: [165, 1.064, 1], jikkai: [149, 0.58, 1], kagakushu: [100, 2.11, 1], kanjaa: [120, 0.056, 0], kawaikute: [160, 0.5, 1], kazarijanai: [178, 1.001, 1], kaze: [140, 1.686, 1], kazetowatashi: [172, 0.533, 0], kira: [155, 0.362, 1], kitaro: [110.98, 1.646, 0], kokoro: [152, 1.525, 1], kurakura: [94, 1.977, 1], lovemeforever: [135, 0.418, 1], luckybruto: [99, 2.172, 0], magic: [133, 0.853, 1], mirror: [114, 1.208, 1], missing: [137.98, 0.393, 1], mondaisaku: [150, 0.42, 1], monstruo: [130, 0.172, 1], motherland: [130, 0.262, 1], nukegara: [132, 0.461, 1], odo: [128, 1.858, 1], pierrot: [120, 0.68, 0], ponpokorin: [140, 0.496, 1], radio: [118, 1.084, 1], ravensky: [162, 0.997, 1], readymade: [97.51, 1.216, 0], rebellion: [178, 0.344, 1], rockstar: [105, 1.643, 0], rule: [132, 0.107, 1], saikyo: [96, 2.17, 0], sakura: [174, 0.152, 1], sekai: [76, 0.39, 1], shinjidai: [175, 1.208, 1], shoka: [94, 0.59, 0], show: [132, 0.747, 1], soldiergame: [132, 0.631, 1], staygold: [140, 1.564, 1], sukideite: [164, 0.379, 1], totmusica: [130, 0.32, 1], tsumitobatsu: [118.5, 1.827, 0], unravel: [135, 0.396, 1], usseewa: [178, 0.505, 1], utakata: [178, 0.874, 1], villain: [102, 1.654, 1], vivarium: [97.5, 0.981, 0], zero: [171, 0.017, 1] };
  function penOf(s) {
    const pen = !s.hold && PEN[s.id] && PEN[s.id][0] !== "?" && PEN[s.id], keys = [...(pen || "青")];
    return { keys, none: !pen, cols: keys.flatMap(k => (k === "彩" ? RAINBOW : [k]).map(c => PENC[c][1])) };
  }

  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = a => `<svg class="a-${a}" role="img" aria-label="${ACT[a].name}"><use href="#${ACT[a].icon}"/></svg>`;
  // 一行的主色：第一個不是「安靜聽」的動作
  const mainAct = acts => acts.find(a => a !== "listen") || (acts.length ? "listen" : "");
  // 歌詞行的底色：有要唱的字時整行不染色，只染那幾個字；其他行用第一個不是「唱」的動作
  const lineAct = l => l.sing.length ? "sing" : mainAct(l.acts.filter(a => a !== "sing")) || mainAct(l.acts);
  // 提醒文字：有標籤用標籤，有要唱的字就寫出來
  const cueLabel = l => l.call || (l.sing.length ? `唱「${l.sing.join("」「")}」` : l.acts.map(a => ACT[a].name).join("、"));
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── 首頁 ──
  const list = document.getElementById("songList"), q = document.getElementById("q"), countEl = document.getElementById("songCount");
  let filter = "all", sort = store.get("list-sort") === "cheer" ? "cheer" : "date";
  // 目前排序下的歌曲順序；切換上一首、下一首也照這個
  const ordered = () => sort === "cheer" ? [...SONGS].sort((a, b) => b.cheer - a.cheer || a.no - b.no) : SONGS;
  // free：粉絲說沒有固定應援；hold（含 sug）：還查不到可靠的應援資料
  function renderList() {
    const term = q.value.trim().toLowerCase();
    const rows = ordered().filter(s => {
      if (term && ![s.ja, s.zh, s.en || ""].some(x => x.toLowerCase().includes(term))) return false;
      if (filter === "cheer") return s.tips.length > 0 && !s.free && !s.hold;
      if (filter === "loose") return !!(s.free || s.hold);
      if (filter === "cover") return !!s.cover;
      return true;
    });
    list.innerHTML = rows.map(s => `
      <li><a class="song" href="#${s.id}">
        <span class="no">${String(s.no).padStart(2, "0")}</span>
        <div class="name"><span class="ja" lang="ja">${esc(s.ja)}</span>
          <div class="sub">${s.zh !== s.ja ? `<span class="zh">${esc(s.zh)}</span>` : ""}${s.cover ? '<span class="zh">翻唱</span>' : ""}${penDots(s)}<span>${s.len}</span>${lyReady && !s.lines ? '<span class="tagx">只有重點</span>' : ""}</div></div>
        <div class="acts">${s.acts.filter(a => a !== "listen").map(icon).join("")}${sort === "cheer" && s.cheer ? `<span class="cnt">${s.cheer} 句</span>` : ""}</div>
      </a></li>`).join("");
    countEl.textContent = rows.length ? (rows.length < SONGS.length ? `${rows.length} / ` : "共 ") + `${SONGS.length} 首` : "找不到符合的歌曲";
    document.getElementById("fdesc").textContent = FDESC[filter] || "";
  }
  const FDESC = { cheer: "粉絲整理過固定應援的歌。", loose: "粉絲說沒有固定應援，或還查不到可靠的應援資料。跟著節奏自由搖就好。", cover: "Ado 翻唱別人的歌。" };
  // 螢光棒顏色的小圓點
  const penDots = s => `<span class="dots" aria-label="螢光棒：${penOf(s).keys.map(k => k === "彩" ? "彩色" : PENC[k][0]).join("、")}">${penOf(s).keys.map(k => k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`).join("")}</span>`;
  q.addEventListener("input", renderList);
  document.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => {
    filter = b.dataset.f;
    document.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderList();
  }));
  document.querySelectorAll("[data-sort]").forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.sort === sort);
    b.addEventListener("click", () => {
      sort = b.dataset.sort; store.set("list-sort", sort === "cheer" ? "cheer" : null);
      document.querySelectorAll("[data-sort]").forEach(x => x.setAttribute("aria-pressed", x === b));
      renderList();
    });
  });
  renderList();
  lyLoaded.then(renderList);
  // 最近看過：最多 3 首，記在這台裝置
  const recentEl = document.getElementById("recent"), recentList = document.getElementById("recentList");
  const recentIds = () => { try { return JSON.parse(store.get("recent") || "[]").filter(id => BY[id]); } catch (e) { return []; } };
  function renderRecent() {
    const ids = recentIds();
    recentEl.hidden = !ids.length;
    recentList.innerHTML = ids.map(id => `<a href="#${id}">${penDots(BY[id])}${esc(BY[id].ja)}</a>`).join("");
  }
  const remember = id => store.set("recent", JSON.stringify([id, ...recentIds().filter(x => x !== id)].slice(0, 3)));
  // 圖示說明：只列清單裡用得到的動作
  const usedActs = new Set(SONGS.flatMap(s => s.acts.filter(a => a !== "listen")));
  document.getElementById("homeLegend").innerHTML = Object.keys(ACT).filter(a => usedActs.has(a))
    .map(a => `<span class="a-${a}">${icon(a)}${ACT[a].name}</span>`).join("");

  // ── 歌曲頁 ──
  const homeV = document.getElementById("home"), songV = document.getElementById("song");
  const box = document.getElementById("lines"), legend = document.getElementById("legend");
  const PAGE_SONG = document.documentElement.dataset.song || "", PAGE_TITLE = document.title;
  let S = null, LINES = [], TAGGED = false, lineEls = [], curLine = -1, curKey = "";

  // 歌詞捲動：自己做 0.26 秒先快後慢的動畫，把目前這行放到框的正中央；新的一行來了就從現在位置接著捲，不會疊在一起
  // 歌詞在唱到的那一刻亮起，不提前（提前會覺得歌詞比音樂快）
  const sc = document.getElementById("lyScroll");
  let glideId = null, holdUntil = 0;
  function glide(to) {
    if (glideId !== null) cancelAnimationFrame(glideId);
    glideId = null;
    if (reduce) { sc.scrollTop = to; return; }
    const from = sc.scrollTop, d = to - from, t0 = performance.now();
    const step = ms => { const k = Math.min(1, (ms - t0) / 260); sc.scrollTop = from + d * (1 - Math.pow(1 - k, 3)); glideId = k < 1 ? requestAnimationFrame(step) : null; };
    glideId = requestAnimationFrame(step);
  }
  function centerLine(el) {
    if (!el || !el.offsetParent || performance.now() < holdUntil) return;
    const r = el.getBoundingClientRect(), b = sc.getBoundingClientRect();
    const to = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, sc.scrollTop + r.top - b.top - (sc.clientHeight - r.height) / 2));
    if (Math.abs(to - sc.scrollTop) >= 4) glide(to);
  }
  // 自己滑歌詞時，自動捲動先停 3 秒，不跟手指搶
  ["wheel", "touchmove"].forEach(ev => sc.addEventListener(ev, () => {
    holdUntil = performance.now() + 3000;
    if (glideId !== null) { cancelAnimationFrame(glideId); glideId = null; }
  }, { passive: true }));
  // 底部留半個框的空白，最後幾行也能捲到中間
  const padEnd = () => { sc.style.paddingBottom = LINES.length ? Math.round(sc.clientHeight / 2) + "px" : ""; };
  addEventListener("resize", padEnd);

  const getBuiltinSong = id => LY[id] || null;
  // 內建歌詞：動作只看每行的 acts，依 じゅん🌝ぴ 的 note 整理
  function parseBuiltin(builtin) {
    const lines = (builtin.lyrics || []).map(item => ({
      t: +item.time || 0,
      ja: String(item.jp || "").trim() || null,
      zh: String(item.tr || "").trim() || null,
      acts: S.hold ? [] : (item.acts || []).filter(a => ACT[a] && a !== "listen"),
      sing: S.hold ? [] : item.sing || [],
      call: S.hold ? null : item.call || null
    }));
    return lines.sort((a, b) => a.t - b.t);
  }
  function loadSongData() {
    const builtin = getBuiltinSong(S.id);
    LINES = builtin && builtin.lyrics ? parseBuiltin(builtin) : [];
    TAGGED = LINES.some(l => l.acts.length);
  }
  function lineAt(t) { let k = -1; LINES.forEach((l, i) => { if (t >= l.t) k = i; }); return k; }

  // 假名：歌詞裡寫「漢字(かな)」就會標在漢字上方；每個字包成 .k 給卡拉OK用
  // sung 是觀眾要唱的字，取最後一次出現的位置（Ado 先唱、觀眾接時，觀眾在後面）
  function jaHTML(txt, sung = []) {
    const out = [], re = /([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g, hit = new Set();
    sung.forEach(w => { const i = txt.lastIndexOf(w); if (i >= 0) for (let j = i; j < i + w.length; j++) hit.add(j); });
    const k = (i, html) => out.push(`<span class="k${hit.has(i) ? " sung" : ""}">${html}</span>`);
    const chars = (str, at) => { for (const c of str) { k(at, esc(c)); at += c.length; } };
    let last = 0, m;
    while ((m = re.exec(txt))) { chars(txt.slice(last, m.index), last); k(m.index, `<ruby>${esc(m[1])}<rt>${esc(m[2])}</rt></ruby>`); last = re.lastIndex; }
    chars(txt.slice(last), last);
    return out.join("");
  }
  function renderLines() {
    box.innerHTML = "";
    if (!lyHave(S)) { box.innerHTML = '<div class="empty"><span>正在載入歌詞…</span></div>'; legend.innerHTML = ""; singJump.hidden = true; return; }
    if (!LINES.length) {
      box.innerHTML = `<div class="empty"><b>這首還沒有逐行時間軸</b>${S.tips.length ? `<ul class="summary">${S.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul><span>先邊看 MV 邊照上面的重點練。</span>` : "<span>應援還在整理，先看 MV 熟悉旋律，副歌跟著現場氣氛就好。</span>"}<span>歌詞請看<a href="${S.ut}" target="_blank" rel="noopener">歌ネット的正版歌詞頁</a>。</span></div>`;
      legend.innerHTML = ""; SING = []; singJump.hidden = true; sc.scrollTop = 0; padEnd(); return;
    }
    LINES.forEach((l, i) => {
      const el = document.createElement("div");
      const m = lineAct(l);
      el.className = "ln" + (m ? " a-" + m : "") + (l.acts.includes("sing") ? " sing" : ""); el.tabIndex = 0;
      const ja = l.ja ? jaHTML(l.ja, l.sing) : `<span class="ph">日文歌詞（${fmt(l.t)}）</span>`;
      const zh = l.zh ? esc(l.zh) : (l.ja ? "" : `<span class="ph">中譯</span>`);
      // 喊聲標籤只放在同一句喊聲的第一行
      const call = l.call && !(i && LINES[i - 1].call === l.call) ? `<span class="call">${esc(l.call)}</span>` : "";
      el.innerHTML = `<div class="ja" lang="ja">${ja}</div>${zh ? `<div class="zh">${zh}</div>` : ""}<div class="acts">${l.acts.map(icon).join("")}</div>${call}`;
      el.addEventListener("click", () => seek(l.t));
      el.addEventListener("keydown", e => { if (e.key === "Enter") seek(l.t); });
      box.appendChild(el);
    });
    lineEls = [...box.querySelectorAll(".ln")]; curLine = -1;
    const used = new Set(LINES.flatMap(l => l.acts));
    focusAct = "";
    legend.innerHTML = Object.keys(ACT).filter(a => used.has(a)).map(a => `<button class="a-${a}" data-act="${a}" aria-pressed="false" title="只亮出要${ACT[a].name}的句子"><i></i>${ACT[a].name}</button>`).join("");
    SING = LINES.filter((l, i) => l.acts.includes("sing") && !(i && LINES[i - 1].acts.includes("sing"))).map(l => l.t);
    singJump.hidden = !SING.length;
    sc.scrollTop = 0; holdUntil = 0; padEnd();
  }

  // 圖例：再點一次取消
  let focusAct = "";
  legend.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    focusAct = focusAct === b.dataset.act ? "" : b.dataset.act;
    legend.querySelectorAll("[data-act]").forEach(x => x.setAttribute("aria-pressed", x.dataset.act === focusAct));
    lineEls.forEach((el, i) => el.classList.toggle("dim", !!focusAct && !LINES[i].acts.includes(focusAct)));
  });

  // 播放：同 Vaundy 版，YouTube 播放器只建立一次，換歌用 cueVideoById 換影片
  // 直接點開檔案（file://）時瀏覽器不送來源網址，YouTube 會拒絕嵌入，所以改顯示提示
  let player = null, ready = false, vid = "", slowTimer = 0, START = 0, muteTimer = 0;
  const vstatus = document.getElementById("vstatus"), vmsg = document.getElementById("vmsg");
  // 長度以 YouTube 回報的為準，還沒載好才用資料裡的長度
  const DUR = () => { try { const d = ready && vid === S.yt && player.getDuration(); if (d) return d; } catch (e) {} return S ? S.dur : 1; };
  function videoMsg(text) { vstatus.hidden = !text; if (text) vmsg.textContent = text; }
  const now = () => { try { return ready && player.getCurrentTime() || 0; } catch (e) { return 0; } };
  const isPlaying = () => { try { return ready && [1, 3].includes(player.getPlayerState()); } catch (e) { return false; } };
  function pause() { if (ready) player.pauseVideo(); }
  function seek(t) { if (!ready) return; player.seekTo(Math.max(0, Math.min(DUR(), t)), true); player.playVideo(); }

  // 播放速度：放慢練應援時間點，記在這台裝置
  let RATE = [.5, .75].includes(+store.get("mv-rate")) ? +store.get("mv-rate") : 1;
  const rateSel = document.getElementById("rateSel");
  rateSel.value = String(RATE);
  const applyRate = () => { try { player.setPlaybackRate(RATE); } catch (e) {} };
  rateSel.addEventListener("change", () => { RATE = +rateSel.value; store.set("mv-rate", RATE === 1 ? null : String(RATE)); if (ready) applyRate(); });

  // 跳到大合唱：每段連續 sing 行的第一行
  const singJump = document.getElementById("singJump"), singPrev = document.getElementById("singPrev"), singNext = document.getElementById("singNext");
  let SING = [];
  const singAt = (dir, t) => dir < 0 ? SING.filter(x => x < t - 1.5).pop() : SING.find(x => x > t + .5);
  singPrev.addEventListener("click", () => { const t = singAt(-1, now()); if (t != null) seek(t); });
  singNext.addEventListener("click", () => { const t = singAt(1, now()); if (t != null) seek(t); });

  function loadVideo() {
    if (!S || songV.hidden || !window.YT || !YT.Player) return;
    if (!player) {
      vid = S.yt;
      player = new YT.Player("ytp", {
        videoId: vid,
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1, autoplay: 1, start: START },
        events: {
          onReady: () => { ready = true; clearTimeout(slowTimer); videoMsg(""); applyRate(); START = 0; loadVideo(); },
          // 換影片後 YouTube 會把速度重設成 1，播放或載入完成時再套一次
          onStateChange: e => { if (e.data === 1 || e.data === 5) applyRate(); if (e.data === 0) ended(); },
          onError: () => videoMsg("無法播放影片，請到 YouTube 觀看。")
        }
      });
      return;
    }
    if (!ready) return;
    // 打開歌曲就自動播放
    if (vid !== S.yt) { vid = S.yt; player.loadVideoById({ videoId: S.yt, startSeconds: START }); }
    else { if (START) seek(START); player.playVideo(); }
    START = 0;
    ensurePlaying();
  }
  // 瀏覽器不讓有聲音的影片自己播時（直接打開網址、還沒點過畫面，iPhone 常見），改成靜音播放並提醒
  function ensurePlaying() {
    clearTimeout(muteTimer);
    muteTimer = setTimeout(() => {
      if (!ready || songV.hidden) return;
      const st = player.getPlayerState();
      if (st === 1 || st === 2 || st === 3) return;  // 在播、使用者自己暫停了、或還在緩衝
      player.mute(); player.playVideo();
      toast("瀏覽器不讓影片自動出聲，先靜音播放；點影片的喇叭開聲音");
    }, 3000);
  }
  if (location.protocol === "file:") {
    videoMsg("直接點開檔案時 YouTube 不允許嵌入播放。請改用資料夾裡的「開啟網站.command」，或放上 GitHub Pages 再看。");
  } else {
    slowTimer = setTimeout(() => { if (!ready) videoMsg("影片連線延遲，請到 YouTube 觀看。"); }, 8000);
    window.onYouTubeIframeAPIReady = loadVideo;
    const yts = document.createElement("script");
    yts.src = "https://www.youtube.com/iframe_api";
    yts.onerror = () => videoMsg("無法載入 YouTube 播放器，請到 YouTube 觀看。");
    document.head.appendChild(yts);
  }

  function openSong(s, t = 0) {
    S = s; curKey = null; hideAlert(); START = t; remember(s.id);
    // 在這首自己的頁面（song/<id>/）時保留建置時寫好的完整標題，給搜尋引擎看
    document.title = s.id === PAGE_SONG ? PAGE_TITLE : `${s.ja}｜Ado 應援預習`;
    const sub = s.zh !== s.ja ? s.zh : s.en;
    document.getElementById("sTitle").innerHTML = esc(s.ja) + (sub ? `<span lang="zh-Hant-TW">${esc(sub)}</span>` : "");
    ["ytLink", "ytLink2"].forEach(id => document.getElementById(id).href = `https://www.youtube.com/watch?v=${s.yt}`);
    document.getElementById("lyLink").href = s.ut;
    const p = penOf(s);
    document.getElementById("pen").innerHTML = "螢光棒" + p.keys.map(k => k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`).join("")
      + `<b>${p.keys.map(k => k === "彩" ? "彩色" : PENC[k][0]).join("、")}${p.none ? "（沒指定）" : ""}</b>`;
    const seq = ordered(), at = seq.indexOf(s);
    [["prevSong", seq[at - 1], "上一首"], ["nextSong", seq[at + 1], "下一首"]].forEach(([id, x, word]) => {
      const a = document.getElementById(id);
      if (x) { a.href = "#" + x.id; a.setAttribute("aria-label", `${word}：${x.ja}`); } else a.removeAttribute("href");
    });
    fillSong();
    document.getElementById("tool-click").disabled = !BEAT[s.id];
    loadVideo();
  }
  // 歌詞相關的部分：歌詞檔載好後會再跑一次
  function fillSong() {
    const s = S;
    if (lyReady && !lyHave(s)) loadLyrics(s).then(() => { if (S === s && !songV.hidden) fillSong(); });
    loadSongData();
    renderLines();
    document.getElementById("cueSummary").innerHTML = TAGGED ? s.tips.map(t => `<li>${esc(t)}</li>`).join("") : "";
    document.getElementById("cueIcon").innerHTML = `<use href="#${ACT[s.acts[0] || "listen"].icon}"/>`;
    cueBox.className = "cue";
    document.getElementById("cueName").textContent = "按播放開始";
    document.getElementById("cueHow").textContent = !lyHave(s) ? "" : LINES.length ? "播放後，這裡會顯示現在要做的動作。" : "這首還沒有逐行時間軸，不會跳提示，照歌詞欄的重點練。";
    document.getElementById("cueNext").innerHTML = "";
  }
  lyLoaded.then(() => { if (S && !songV.hidden) fillSong(); });

  // 現在動作：以目前這一行為準。沒有動作的行不提示（聽 Ado 唱）
  // 整首沒有逐行標記的歌（自由搖、應援還在整理），整首用同一個提示，不跳字卡
  function songCue() {
    if (S.free) return { acts: [], name: "自由跟著節奏", how: "沒有固定應援，跟著現場氣氛就好。" };
    if (S.hold) return { acts: [], name: "應援還在整理", how: "先熟悉旋律，跟著現場氣氛就好。" };
    const acts = S.acts.filter(a => a !== "listen");
    return null;
  }
  function cueAt(t) {
    const li = lineAt(t), l = LINES[li];
    if (!l) return null;
    if (!TAGGED) { const c = songCue(); if (c) return { key: "song", ...c, whole: true, beat: c.acts.length > 0 }; }
    if (!l.acts.length) return { key: li, acts: [], name: "", how: "", listen: true };
    return { key: li, acts: l.acts, name: cueLabel(l), how: l.acts.map(a => ACT[a].how).join("，"), claps: S.claps, beat: true };
  }
  function nextChange(t) {
    const li = lineAt(t), cur = LINES[li], sig = l => l.acts.join(",") + cueLabel(l);
    for (let i = li + 1; i < LINES.length; i++) {
      if (!cur || sig(LINES[i]) !== sig(cur)) { const l = LINES[i]; if (!l.acts.length) continue; return { t: l.t, acts: l.acts, name: cueLabel(l) }; }
    }
    return null;
  }

  // 拍點：x 是第幾拍（含小數）、f 是這拍過了多少、bar 是小節裡的第幾拍、down 是小節第一拍；這首沒有拍點資料回 null
  function beatAt(t) {
    const bt = S && BEAT[S.id]; if (!bt) return null;
    const P = 60 / bt[0], x = (t - bt[1]) / P, k = Math.floor(x), bar = ((k % 4) + 4) % 4;
    return { P, x, k, f: x - k, bar, known: !!bt[2], down: !!bt[2] && bar === 0 };
  }
  // 拍子剛到時是 1，很快退到 0
  const beatPulse = b => Math.exp(-b.f * b.P / Math.min(.16, b.P * .35));

  // 大字提醒：字卡＋四周邊框光，不蓋住 MV 和歌詞
  // 動作前一小節邊框先微亮預告（不倒數），動作開始那拍整個亮；字卡內容跟著拍子動
  const al = document.getElementById("alert"), alIcon = document.getElementById("alIcon"), alName = document.getElementById("alName"),
        alBody = document.getElementById("alBody"), alHow = document.getElementById("alHow"), cueFrame = document.getElementById("cueFrame"), alertSw = document.getElementById("alertSw");
  const screenEl = document.getElementById("screen");
  let alertOn = store.get("alert-off") !== "1", alKey = "", alKind = "", alDots = [], alWords = [], alSing = [];
  // 大字提醒開關：電腦在提示框裡，手機在練習工具選單裡
  const alertBtns = [alertSw, document.getElementById("alertTool")];
  const paintAlert = () => alertBtns.forEach(b => b.setAttribute("aria-pressed", alertOn));
  paintAlert();
  alertBtns.forEach(b => b.addEventListener("click", () => { alertOn = !alertOn; paintAlert(); store.set("alert-off", alertOn ? "0" : "1"); }));
  const dotsHTML = (n, first) => `<div class="dots">${Array.from({ length: n }, (_, i) => `<i${first && !i ? ' class="first"' : ""}></i>`).join("")}</div>`;
  // 字卡內容：大合唱寫出要唱的字，喊聲寫出要喊的話，拍手是每拍亮的圓點，揮手是擺動的螢光棒，跳躍是彈起的圖示
  function cardFor(cue, l) {
    const act = l.sing.length ? "sing" : l.call ? (l.acts.includes("call") ? "call" : mainAct(l.acts)) : mainAct(l.acts);
    const extra = l.acts.filter(a => a !== act).map(a => ACT[a].name);
    const head = { act, name: ACT[act].name + (extra.length ? `<em>＋${extra.join("、")}</em>` : "") };
    // 整句都要唱（沒標要唱哪幾個字）時，整句放大
    const words = l.sing.length ? l.sing : act === "sing" && l.ja && !l.call ? [l.ja] : null;
    if (words) return { ...head, kind: "sing", words, body: `<div class="words">${words.map(w => jaHTML(w)).join("　")}</div>`, how: "" };
    if (l.call) return { ...head, kind: "big", body: `<div class="big">${esc(l.call)}</div>`, how: "" };
    if (act === "clap") return { ...head, kind: "dots", body: dotsHTML(4, true), how: ACT.clap.how };
    if (act === "wave") return { ...head, kind: "swing", body: '<svg class="swing" viewBox="0 0 132 72"><path class="arc" d="M14 54a54 54 0 0 1 104 0"/><g class="stick"><line x1="66" y1="70" x2="66" y2="16"/></g></svg>', how: ACT.wave.how };
    if (act === "jump") return { ...head, kind: "hop", body: `<svg class="hop"><use href="#i-jump"/></svg>`, how: ACT.jump.how };
    return { ...head, kind: "big", body: `<div class="big">${esc(ACT[act].how)}</div>`, how: "" };
  }
  function showCard(key, c) {
    if (key === alKey) return;
    alKey = key; alKind = c.kind; alSing = c.words || [];
    al.className = `alert show a-${c.act}`;
    alIcon.innerHTML = `<use href="#${ACT[c.act].icon}"/>`;
    alName.innerHTML = c.name; alBody.innerHTML = c.body; alHow.textContent = c.how;
    alDots = [...alBody.querySelectorAll(".dots i")];
    alWords = [...alBody.querySelectorAll(".k")];
    placeCard();
  }
  function placeCard() {
    const r = screenEl.getBoundingClientRect(), c = cueBox.getBoundingClientRect();
    al.style.setProperty("--al-left", Math.round(r.left + r.width / 2) + "px");
    al.style.setProperty("--al-max", Math.round(r.width - 16) + "px");
    const top = c.height ? c.top : r.bottom + 8;
    al.style.setProperty("--al-top", Math.round(Math.max(8, Math.min(top, innerHeight - al.offsetHeight - 12))) + "px");
  }
  addEventListener("resize", () => { if (alKey) placeCard(); });
  function hideAlert() { if (alKey) { al.className = "alert"; alKey = ""; } cueFrame.style.opacity = 0; }
  function alerts(t, playing, cue) {
    if (!alertOn || !playing || !cue) return hideAlert();
    const b = beatAt(t), pulse = b && !reduce ? beatPulse(b) * (b.known && !b.down ? .6 : 1) : 0;
    const pen = penOf(S).cols;
    cueFrame.style.setProperty("--c1", pen[0]); cueFrame.style.setProperty("--c2", pen[1 % pen.length]);
    al.style.setProperty("--pulse", pulse.toFixed(3));
    // 「唱」最後的 Clap Clap Clap：三下圓點
    if (cue.claps && t >= cue.claps && t < cue.claps + 2.2) {
      showCard("claps3", { act: "clap", name: "拍三下", kind: "claps3", body: dotsHTML(3), how: "啪、啪、啪" });
      const d = t - cue.claps; alDots.forEach((x, j) => x.classList.toggle("on", d > j * .55 && d < j * .55 + .3));
      cueFrame.style.opacity = .8;
      return;
    }
    const l = LINES[cue.key];
    if (cue.listen || cue.whole || !l) {
      if (alKey) { al.className = "alert"; alKey = ""; }
      // 預告：下一個動作前一小節（沒有拍點資料時 2 秒），邊框慢慢亮起
      const nx = nextChange(t), lead = b ? b.P * 4 : 2, left = nx ? nx.t - t : Infinity;
      cueFrame.style.opacity = left > 0 && left < lead ? (.15 + .35 * (1 - left / lead)).toFixed(2) : 0;
      return;
    }
    showCard("l" + cue.key, cardFor(cue, l));
    cueFrame.style.opacity = (.6 + .4 * pulse).toFixed(2);
    if (alKind === "sing") {
      // 唱到的字亮起：要唱的字在這行的位置，照這行的進度換算
      const end = LINES[cue.key + 1] ? LINES[cue.key + 1].t : DUR(), frac = Math.max(0, Math.min(1, (t - l.t) / Math.max(.5, (end - l.t) * .9)));
      const at = Math.min(...alSing.map(w => l.ja.lastIndexOf(w)).filter(i => i >= 0), l.ja.length), len = Math.max(1, l.ja.length - at);
      const lit = Math.round(Math.max(0, Math.min(1, (frac * l.ja.length - at) / len)) * alWords.length);
      alWords.forEach((k, i) => k.classList.toggle("lit", i < lit));
    } else if (alKind === "dots") {
      const on = b ? (b.known ? b.bar : ((b.k % 4) + 4) % 4) : Math.floor((t - l.t) * 2) % 4;
      alDots.forEach((x, j) => x.classList.toggle("on", j === on && (!b || b.f < .5)));
    } else if (alKind === "swing" && !reduce) {
      al.style.setProperty("--ang", (Math.cos(Math.PI * (b ? b.x : (t - l.t) * 2)) * 28).toFixed(1) + "deg");
    }
  }

  // 畫面更新
  const cueBox = document.querySelector(".cue"), cueIcon = document.getElementById("cueIcon"), cueName = document.getElementById("cueName"), cueHow = document.getElementById("cueHow"), cueNext = document.getElementById("cueNext");
  function update() {
    if (!S || songV.hidden) return null;
    const t = now(), playing = isPlaying();
    if (SING.length) { singPrev.disabled = singAt(-1, t) == null; singNext.disabled = singAt(1, t) == null; }
    const started = playing || t > 0, cue = cueAt(t);
    cueBox.classList.toggle("playing", playing); cueBox.classList.toggle("alerting", playing && alertOn);
    if (started && cue) {
      const key = cue.name + cue.acts.join();
      if (key !== curKey) {
        cueIcon.innerHTML = cue.acts.length ? `<use href="#${ACT[cue.acts[0]].icon}"/>` : "";
        cueBox.className = "cue" + (cue.listen ? " idle" : cue.acts.length ? " a-" + mainAct(cue.acts) : "") + (playing ? " playing" : "") + (playing && alertOn ? " alerting" : "");
        cueName.textContent = cue.name; cueHow.textContent = cue.how; curKey = key;
      }
      const nx = nextChange(t);
      cueNext.innerHTML = nx ? (nx.t - t <= 5 ? `${Math.ceil(nx.t - t)} 秒後` : `下一個 ${fmt(nx.t)}`) + `<b class="a-${mainAct(nx.acts)}">${esc(nx.name)}</b>` : "";
    } else if (started) {
      // 第一句之前的前奏：先空著，顯示下一個動作；整首沒有時間軸的新歌：不要一直停在「按播放開始」
      const key = LINES.length ? "intro" : "free";
      if (key !== curKey) {
        cueIcon.innerHTML = "";
        cueBox.className = "cue idle" + (playing ? " playing" : "") + (playing && alertOn ? " alerting" : "");
        cueName.textContent = LINES.length ? "" : "自由跟著節奏"; cueHow.textContent = LINES.length ? "" : "應援還在整理，跟著現場氣氛就好"; curKey = key;
      }
      const nx = LINES.length && nextChange(t);
      cueNext.innerHTML = nx ? (nx.t - t <= 5 ? `${Math.ceil(nx.t - t)} 秒後` : `下一個 ${fmt(nx.t)}`) + `<b class="a-${mainAct(nx.acts)}">${esc(nx.name)}</b>` : "";
    }
    const li = lineAt(t);
    if (started && li !== curLine && lineEls.length) {
      lineEls.forEach((e, i) => { e.classList.toggle("now", i === li); e.classList.toggle("past", i < li); });
      if (li >= 0 && OPT.scroll) centerLine(lineEls[li]);
      curLine = li;
    }
    if (OPT.karaoke && li >= 0 && lineEls[li]) {
      const ks = lineEls[li].querySelectorAll(".k");
      if (ks.length) {
        const end = LINES[li + 1] ? LINES[li + 1].t : DUR(), frac = Math.max(0, Math.min(1, (t - LINES[li].t) / Math.max(.5, (end - LINES[li].t) * .9)));
        const lit = Math.round(frac * ks.length); ks.forEach((k, i) => k.classList.toggle("lit", i < lit));
      }
    }
    alerts(t, playing, cue);
    return cue;
  }

  // 語言切換
  // 歌詞顯示選項：預設值 → 記在這台裝置
  const OPT = { ja: true, kana: true, zh: true, karaoke: false, sing: false, scroll: true, size: "m" };
  try { Object.assign(OPT, JSON.parse(store.get("view-opts") || "{}")); } catch (e) {}
  function applyOpts() {
    box.classList.toggle("hide-ja", !OPT.ja); box.classList.toggle("hide-kana", !OPT.kana); box.classList.toggle("hide-zh", !OPT.zh);
    box.classList.toggle("karaoke", OPT.karaoke); box.classList.toggle("only-sing", OPT.sing);
    box.classList.toggle("size-s", OPT.size === "s"); box.classList.toggle("size-l", OPT.size === "l");
    document.querySelectorAll("[data-opt]").forEach(b => b.setAttribute("aria-pressed", !!OPT[b.dataset.opt]));
    document.querySelectorAll("[data-size]").forEach(b => b.setAttribute("aria-pressed", b.dataset.size === OPT.size));
    singOnly.setAttribute("aria-pressed", OPT.sing);
  }
  const singOnly = document.getElementById("singOnly");
  const setOpt = (k, v) => { OPT[k] = v; store.set("view-opts", JSON.stringify(OPT)); applyOpts(); holdUntil = 0; if (OPT.scroll && lineEls[curLine]) centerLine(lineEls[curLine]); };
  singOnly.addEventListener("click", () => setOpt("sing", !OPT.sing));
  document.querySelectorAll("[data-size]").forEach(b => b.addEventListener("click", () => setOpt("size", b.dataset.size)));
  document.querySelectorAll("[data-opt]").forEach(b => b.addEventListener("click", () => setOpt(b.dataset.opt, !OPT[b.dataset.opt])));
  applyOpts();
  // 點選單外面就收起來
  const menus = [document.getElementById("vopt"), document.getElementById("tools")];
  document.addEventListener("click", e => menus.forEach(m => { if (m.open && !m.contains(e.target)) m.open = false; }));
  // 窄螢幕上按鈕換行到左邊時選單往右展開，下面放不下時往上展開，才不會跑出畫面
  menus.forEach(m => m.addEventListener("toggle", () => {
    const box = m.querySelector(".view-opts");
    box.classList.remove("to-right", "to-up");
    box.style.maxHeight = "";
    if (!m.open) return;
    const r = box.getBoundingClientRect(), below = innerHeight - r.top - 8, above = m.getBoundingClientRect().top - 14;
    if (r.left < 8) box.classList.add("to-right");
    if (r.height > below) {
      if (above > below) box.classList.add("to-up");
      if (r.height > Math.max(above, below)) box.style.maxHeight = Math.max(above, below) + "px";
    }
  }));

  // ── 練習工具 ──
  const toast = (() => { const el = document.getElementById("toast"); let t = 0; return msg => { el.textContent = msg; el.classList.add("show"); clearTimeout(t); t = setTimeout(() => el.classList.remove("show"), 2600); }; })();
  const TOOL = { click: store.get("tool-click") === "1", autonext: store.get("tool-autonext") === "1" };
  const paintTools = () => document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", TOOL[b.dataset.tool]));
  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.tool; TOOL[k] = !TOOL[k]; store.set("tool-" + k, TOOL[k] ? "1" : null); paintTools();
    if (k === "click" && TOOL.click) clickCtx();
  }));
  paintTools();
  // 上次就開著拍點聲：瀏覽器要等使用者點一下或按鍵才肯出聲，第一次互動時把聲音準備好
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => { if (TOOL.click) clickCtx(); }, true));

  // 播完自動下一首：照首頁目前的排序
  function ended() {
    if (!TOOL.autonext || !S) return;
    const seq = ordered(), nx = seq[seq.indexOf(S) + 1];
    if (nx) location.hash = nx.id;
  }

  // 拍點聲：在拍子上響一聲「喀」，小節第一拍高一點；聲音提前排好，不會跟著畫面掉格
  let actx = null, lastClick = null;
  function clickCtx() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) { actx = null; }
    return actx;
  }
  function tick(at, strong) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = strong ? 1760 : 1320;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(strong ? .32 : .2, at + .002); g.gain.exponentialRampToValueAtTime(.0001, at + .05);
    o.connect(g).connect(actx.destination); o.start(at); o.stop(at + .06);
  }
  function clicks(t, playing) {
    if (!TOOL.click || !playing || !actx) { lastClick = null; return; }
    const b = beatAt(t); if (!b) return;
    // 下一拍在 0.12 秒內就先排進去（影片時間換成真實時間要除以速度）
    const wait = (1 - b.f) * b.P / RATE;
    if (wait < .12 && lastClick !== b.k + 1) {
      lastClick = b.k + 1;
      const bar = (((b.k + 1) % 4) + 4) % 4;
      tick(actx.currentTime + wait, b.known && bar === 0);
    }
  }

  // 分享目前時間：網址後面加 @秒數，打開就從那裡開始
  document.getElementById("shareBtn").addEventListener("click", async () => {
    if (!S) return;
    // 正式網站（有每首歌的獨立頁）分享那首的頁面，連結預覽才會是那首歌；本機預覽沒有獨立頁，用 # 網址
    const t = Math.floor(now()), at = t ? `#${S.id}@${t}` : "";
    const url = location.hostname.endsWith("github.io") ? new URL(`song/${S.id}/`, document.baseURI).href + at : `${location.origin}${location.pathname}${at || "#" + S.id}`;
    document.getElementById("tools").open = false;
    const text = `${S.ja}${t ? " " + fmt(t) : ""}｜Ado 應援預習`;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title: text, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast(`已複製連結${t ? "（從 " + fmt(t) + " 開始）" : ""}`); }
    catch (e) { prompt("複製這個連結：", url); }
  });

  // 回報錯誤／意見回饋：開啟預先填好的 Google 表單（表單「Ado 應援預習｜回報與意見回饋」，帳號 kuti36.work）
  // entry 是各題的編號；form 留空時改成複製文字
  const REPORT = { form: "https://docs.google.com/forms/d/e/1FAIpQLSd7f7-x0jHfDrObA4cD7D6HiAyZ2CN2BOiP1gTIffZYKW3XPg/viewform", entry: { song: "1258710218", time: "504224952", line: "1328755778", kind: "792721747", note: "1740176641" } };
  const dlg = document.getElementById("reportDlg"), rpKind = document.getElementById("rpKind"), rpNote = document.getElementById("rpNote");
  let rpData = null;
  // 歌曲頁的「回報錯誤」帶入歌曲、時間和這一句；頁尾的「意見回饋」不指定歌曲
  function openReport(onSong) {
    document.getElementById("tools").open = false;
    document.getElementById("reportH").textContent = onSong ? "回報錯誤" : "意見回饋";
    document.getElementById("rpWhere").hidden = !onSong;
    if (onSong) {
      pause();
      const t = now(), l = LINES[lineAt(t)];
      rpData = { song: `${S.ja}（${S.id}）`, time: fmt(t) + `（${t.toFixed(1)} 秒）`, line: l ? (l.ja || l.zh || "") : "（還沒開始）" };
    } else {
      rpData = { song: "", time: "", line: "" };
      rpKind.value = "功能建議";
    }
    document.getElementById("rpSong").textContent = rpData.song;
    document.getElementById("rpTime").textContent = rpData.time;
    document.getElementById("rpLine").textContent = rpData.line;
    rpNote.value = "";
    document.getElementById("rpHint").textContent = REPORT.form ? "按送出會開啟 Google 表單，上面的內容已經幫你填好。" : "回報表單還沒開放，按送出會把內容複製起來。";
    document.getElementById("rpSend").textContent = REPORT.form ? "開啟表單" : "複製內容";
    dlg.showModal();
  }
  document.getElementById("reportBtn").addEventListener("click", () => { if (S) openReport(true); });
  document.getElementById("feedbackBtn").addEventListener("click", () => openReport(false));
  dlg.addEventListener("close", async () => {
    if (dlg.returnValue !== "send" || !rpData) return;
    const d = { ...rpData, kind: rpKind.value, note: rpNote.value.trim() };
    if (REPORT.form) {
      const q = Object.entries(REPORT.entry).filter(([k, e]) => e && d[k]).map(([k, e]) => `entry.${e}=${encodeURIComponent(d[k])}`).join("&");
      open(`${REPORT.form}?usp=pp_url&${q}`, "_blank", "noopener");
      return;
    }
    const text = `【Ado 應援預習 回報】${d.song ? `\n歌曲：${d.song}\n時間：${d.time}\n這一句：${d.line}` : ""}\n問題：${d.kind}${d.note ? "\n說明：" + d.note : ""}`;
    try { await navigator.clipboard.writeText(text); toast("已複製回報內容"); } catch (e) { prompt("複製這段內容：", text); }
  });

  // 更新日誌：第一次打開時讀 CHANGELOG.md（## 版本、- 項目、`程式碼`、[文字](網址)）
  const logDlg = document.getElementById("logDlg"), logBody = document.getElementById("logBody");
  const LOG_URL = "https://github.com/Gcree/ado-guide/blob/main/CHANGELOG.md";
  let logLoaded = false;
  const inline = t => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  function renderLog(md) {
    let html = "", open = false;
    for (const raw of md.split("\n")) {
      const ln = raw.trim(), h = ln.match(/^##\s+(\S+)(?:\s+[—-]\s+(.+))?$/);
      if (h || !ln.startsWith("- ")) { if (open) { html += "</ul>"; open = false; } }
      if (h) html += `<h3>${inline(h[1])}${h[2] ? `<small>${inline(h[2])}</small>` : ""}</h3>`;
      else if (ln.startsWith("- ")) { if (!open) { html += "<ul>"; open = true; } html += `<li>${inline(ln.slice(2))}</li>`; }
    }
    return html + (open ? "</ul>" : "");
  }
  document.getElementById("logBtn").addEventListener("click", async () => {
    logDlg.showModal();
    if (logLoaded) return;
    try {
      const r = await fetch("CHANGELOG.md", { cache: "no-cache" });
      if (!r.ok) throw 0;
      logBody.innerHTML = renderLog(await r.text()); logLoaded = true;
    } catch (e) { logBody.innerHTML = `<p>讀不到更新日誌，可以到 <a href="${LOG_URL}" target="_blank" rel="noopener">GitHub</a> 看。</p>`; }
  });

  // 鍵盤：空白鍵播放／暫停，← → 上一句、下一句（在輸入框裡不搶按鍵）
  addEventListener("keydown", e => {
    if (!S || songV.hidden || !ready || e.metaKey || e.ctrlKey || e.altKey || dlg.open || logDlg.open) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === " " || e.key === "k") {
      if (e.target.closest("button, summary, a") && e.key === " ") return;
      e.preventDefault(); isPlaying() ? pause() : player.playVideo();
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && LINES.length) {
      e.preventDefault();
      const t = now(), li = lineAt(t);
      // 往前：這句剛開始 1.5 秒內就回上一句，不然回這句開頭
      const to = e.key === "ArrowRight" ? LINES[li + 1] : (li >= 0 && t - LINES[li].t > 1.5 ? LINES[li] : LINES[li - 1]);
      if (to) { holdUntil = 0; seek(to.t); }
    }
  });

  // ── 路由：#歌曲 id 開歌曲頁，其他回首頁 ──
  // 回清單時捲回離開前的位置
  let listY = 0;
  function route() {
    // 每首歌的獨立頁（song/<id>/）沒有 # 時直接開那首
    const h = location.hash.slice(1) || PAGE_SONG, [id, at] = h.split("@"), s = BY[id];
    if (s) {
      if (!homeV.hidden) listY = scrollY;
      document.body.classList.add("on-song");
      homeV.hidden = true; songV.hidden = false; openSong(s, Math.max(0, Math.floor(+at || 0))); scrollTo(0, 0);
    } else {
      pause(); hideAlert(); document.body.classList.remove("on-song"); songV.hidden = true; homeV.hidden = false; document.title = PAGE_SONG ? "Ado 應援預習" : PAGE_TITLE;
      renderRecent();
      const target = h && document.getElementById(h);
      if (target) target.scrollIntoView({ block: "start" }); else scrollTo(0, listY);
    }
  }
  addEventListener("hashchange", route);
  route();

  // ── 舞台燈光 ──
  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Math.max(0, Math.min(1, a))})`; };
  const BLUE = "#5d9dfe", DEEP = "#2348a8", IVORY = "#f2efe8";
  function stage(cv, o) {
    const ctx = cv.getContext("2d"); let W = 0, H = 0;
    const size = () => { const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    addEventListener("resize", size); size();
    const sticks = Array.from({ length: o.sticks }, () => ({ x: Math.random(), y: Math.random(), ph: Math.random() * 6.28, c: BLUE }));
    const petals = Array.from({ length: o.petals }, () => ({ x: Math.random(), y: Math.random(), r: 3 + Math.random() * 4, s: .2 + Math.random() * .4, a: Math.random() * 6.28 }));
    // pal：這首的螢光棒顏色；null 是首頁的藍白
    let pal = null, beams = [];
    const pen = cols => {
      pal = cols && cols.length ? cols : null;
      beams = pal ? [0, 1, 2, 3].map(i => pal[i % pal.length]) : [DEEP, BLUE, IVORY, DEEP];
      sticks.forEach((s, i) => s.c = pal ? pal[i % pal.length] : Math.random() < .75 ? BLUE : IVORY);
    };
    pen(null);
    // hit：重拍的亮度（1 → 0），beat：第幾拍，用來輪流換閃光的顏色
    const draw = (tt, energy, hit, listen, playing, beat) => {
      if (!cv.width) size();
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      [.12, .34, .58, .86].forEach((bx, i) => {
        const col = beams[i], sway = reduce ? 0 : Math.sin(tt * .45 + i * 1.7) * .16;
        const ox = W * (bx + (i % 2 ? .08 : -.08)), oy = H * 1.05, tx = W * (bx + sway), w = W * (.06 + .03 * hit);
        const g = ctx.createLinearGradient(ox, oy, tx, 0), a = (.05 + .12 * energy + .3 * hit) * o.k;
        g.addColorStop(0, hex(col, 0)); g.addColorStop(.4, hex(col, a)); g.addColorStop(1, hex(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox - 4, oy); ctx.lineTo(tx - w, -20); ctx.lineTo(tx + w, -20); ctx.lineTo(ox + 4, oy); ctx.fill();
      });
      // 重拍：從台下往上整片亮一下
      if (hit > .01) {
        const col = (pal || [BLUE])[beat % (pal || [BLUE]).length], g = ctx.createRadialGradient(W / 2, H * 1.1, 0, W / 2, H * 1.1, Math.max(W, H) * .95);
        g.addColorStop(0, hex(col, .2 * hit * o.k)); g.addColorStop(1, hex(col, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      petals.forEach((p, i) => {
        if (!reduce && playing) { p.y += p.s * .0015 * (1 + energy); p.a += .008; if (p.y > 1.05) { p.y = -.05; p.x = Math.random(); } }
        ctx.save(); ctx.translate(p.x * W + Math.sin(p.a) * 12, p.y * H); ctx.rotate(p.a);
        ctx.fillStyle = hex(pal ? pal[i % pal.length] : BLUE, .28 * o.k); ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, 6.28); ctx.fill(); ctx.restore();
      });
      const baseY = H - 4, band = Math.min(70, H * .14);
      sticks.forEach(s => {
        const swing = reduce ? 0 : Math.sin(tt * (playing ? 4.2 : 1.3) + s.ph) * (playing ? .5 : .2) * (listen ? .3 : 1);
        ctx.save(); ctx.translate(s.x * W, baseY - s.y * band - 6 * hit); ctx.rotate(swing);
        ctx.strokeStyle = hex(s.c, (.16 + .3 * energy + .45 * hit) * (.45 + s.y * .55) * o.k);
        ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -(12 + s.y * 8)); ctx.stroke(); ctx.restore();
      });
      ctx.globalCompositeOperation = "source-over";
    };
    draw.pen = pen;
    return draw;
  }
  const bg = stage(document.getElementById("fx"), { sticks: 110, petals: 22, k: 1.25 });

  // 彩帶砲：左右下角各噴一發，紙片會翻面飄落，長彩帶邊飛邊扭；只在有東西在飛的時候畫
  function cannon(cv) {
    const ctx = cv.getContext("2d"); let W = 0, H = 0, bits = [], run = false, last = 0;
    const size = () => { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    addEventListener("resize", size); size();
    const rnd = (a, b) => a + Math.random() * (b - a);
    const tick = ms => {
      const dt = Math.min(.05, last ? (ms - last) / 1000 : .016); last = ms;
      ctx.clearRect(0, 0, W, H);
      bits = bits.filter(p => p.age < p.life && p.y < H + 80);
      for (const p of bits) {
        p.age += dt; if (p.age < 0) continue;
        // 空氣阻力讓它很快慢下來，之後靠重力慢慢飄落
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + 520 * dt;
        p.x += (p.vx + Math.sin(p.age * p.fq + p.ph) * p.sway) * dt; p.y += p.vy * dt; p.spin += p.vs * dt;
        const a = Math.min(1, (p.life - p.age) / 1.2);
        if (p.trail) {
          // 每移動一小段記一個點，飄得慢時彩帶也保持一樣長
          const h = p.trail[0];
          if (!h || Math.hypot(p.x - h[0], p.y - h[1]) > 7) { p.trail.unshift([p.x, p.y]); if (p.trail.length > 16) p.trail.pop(); }
          ctx.fillStyle = hex(p.c, a);
          for (let i = 1; i < p.trail.length; i++) {
            const [x0, y0] = p.trail[i - 1], [x1, y1] = p.trail[i], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
            const w = 3.5 * Math.abs(Math.cos(p.spin + i * .55)) + .6, nx = -dy / l * w, ny = dx / l * w;
            ctx.beginPath(); ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x1 + nx, y1 + ny); ctx.lineTo(x1 - nx, y1 - ny); ctx.lineTo(x0 - nx, y0 - ny); ctx.fill();
          }
        } else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin * .6); ctx.scale(1, Math.cos(p.spin));
          ctx.fillStyle = hex(p.c, a); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        }
      }
      run = bits.length > 0;
      if (run) requestAnimationFrame(tick); else { ctx.clearRect(0, 0, W, H); last = 0; }
    };
    return cols => {
      if (reduce) return;
      const pal = [...(cols && cols.length ? cols : [BLUE, IVORY]), "#ffd76a", "#eef2f8"], n = W < 600 ? 55 : 95;
      [-1, 1].forEach(side => {
        const ox = side < 0 ? -10 : W + 10, oy = H + 10;
        for (let i = 0; i < n + 10; i++) {
          // 往畫面中間偏上噴：角度離垂直 15–40 度，速度決定能衝多高
          const ribbon = i >= n, ang = rnd(15, 40) * Math.PI / 180, v = H * rnd(1.5, 2.5) * (ribbon ? 1.1 : 1);
          bits.push({ x: ox, y: oy, vx: -side * Math.sin(ang) * v, vy: -Math.cos(ang) * v, age: -rnd(0, .18), life: rnd(4.5, 6.5),
            drag: ribbon ? rnd(1.6, 2.1) : rnd(2.2, 3), sway: rnd(20, 60), fq: rnd(2, 5), ph: rnd(0, 6.28), spin: rnd(0, 6.28), vs: rnd(4, 11) * (Math.random() < .5 ? -1 : 1),
            w: rnd(6, 10), h: rnd(10, 16), c: pal[Math.floor(Math.random() * pal.length)], trail: ribbon ? [] : null });
        }
      });
      if (!run) { run = true; requestAnimationFrame(tick); }
    };
  }
  const blast = cannon(document.getElementById("confetti"));
  // 副歌高潮（最後一次副歌開頭）的秒數：MV 音訊和聲比對＋歌詞重複找的，再依歌詞段落人工修正
  const CLIMAX = { aiaia: 190.36, aishite: 161.24, akuruhi: 202.94, angelseek: 149.3, ashura: 139.43, burikino: 163.7, catseye: 145.75, charles: 178.85, chocolat: 178.27, dignity: 187.27, domestic: 114.59, dryflower: 229.74, elf: 237.27, episodex: 165.67, freedom: 153.74, giragira: 219.12, gyakkou: 192.71, hanabi: 163.72, hanataba: 183.25, haruni: 181.86, hellosignals: 147.49, himawari: 174.22, hotaru: 265.96, ibara: 209.89, jikkai: 175.46, kagakushu: 184.47, kamippoina: 174.95, kanjaa: 236.06, kawaikute: 188.49, kazarijanai: 173.36, kaze: 211.47, kazetowatashi: 282.75, kira: 137.71, kitaro: 106.47, kittocoaster: 143.9, kokoro: 217.56, kurakura: 146.97, lovemeforever: 206.43, luckybruto: 170.63, magic: 134.64, mirror: 135.86, missing: 118.79, mondaisaku: 160.09, monstruo: 154.83, motherland: 214.34, nukegara: 140.44, odo: 169.11, pierrot: 148.16, ponpokorin: 69.01, radio: 167.91, ravensky: 212.09, readymade: 184.18, rebellion: 133.56, rockstar: 177.47, rule: 178.23, saikyo: 189.47, sakura: 280.79, sekai: 189.4, shinjidai: 160.4, shoka: 180.15, show: 154.95, soldiergame: 176.73, staygold: 184.22, sukideite: 182.07, totmusica: 144.62, tsumitobatsu: 179.27, unravel: 199.14, usseewa: 167.48, utakata: 108.64, value: 150.66, villain: 165.25, vivarium: 171.27, zero: 112.16 };
  addEventListener("hashchange", () => setTimeout(() => dispatchEvent(new Event("resize")), 0));

  // 背景燈光只在播放時動；沒播放時畫一次就停，不在閱讀時晃
  let stageT = 0, lastMs = 0, idleDrawn = false, penSong, blasted = false;
  addEventListener("resize", () => { idleDrawn = false; });
  function frame(ms) {
    const cue = update(), playing = S && !songV.hidden && isPlaying(), t = now();
    clicks(t, playing);
    // 歌曲頁燈光換成這首的螢光棒顏色，回首頁換回藍白
    const want = S && !songV.hidden ? S : null;
    if (want !== penSong) { penSong = want; bg.pen(want && penOf(want).cols); idleDrawn = false; blasted = false; }
    // 播到副歌高潮噴一次彩帶；倒回高潮前再播到會再噴
    const cx = want && CLIMAX[want.id];
    if (cx != null) {
      if (t < cx - .3) blasted = false;
      else if (playing && !blasted && t >= cx - .05 && t < cx + .8) { blasted = true; blast(penOf(want).cols); }
    }
    if (playing) stageT += Math.min(.1, (ms - lastMs) / 1000);
    lastMs = ms;
    // 每拍亮一下再退，小節第一拍最亮；這首沒有拍點資料時，改在每句歌詞開頭亮
    const li = lineAt(t), l = LINES[li], b = beatAt(t);
    let hit = 0, beat = Math.max(0, li);
    if (playing && !reduce && b) { hit = beatPulse(b) * (b.down ? 1 : .5); beat = Math.max(0, Math.floor(b.k / 4)); }
    else if (playing && !reduce && l) hit = Math.exp(-(t - l.t) / .4) * (l.acts.length ? 1 : .65);
    const energy = playing && cue ? (cue.listen ? .2 : cue.beat ? 1 : .45) : .4;
    if (playing || !idleDrawn) { bg(stageT, energy, hit, cue && cue.listen, playing, beat); idleDrawn = !playing; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
