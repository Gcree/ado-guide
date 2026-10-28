(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ADO_SONGS = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── 歌曲資料（MV 為 Ado 官方頻道；len 為 MV 長度） ──
  // 原創曲的 acts／tips／free 依 じゅん🌝ぴ 的 note（2024-04-26）整理；逐行動作在 song-lyrics.js。翻唱曲原文沒寫，標 sug 的是依曲風的建議（目前不顯示，見下方 hold）。
  const SONGS = [
    { id: "show", ja: "唱", zh: "唱", en: "Show", date: "2023-09-06", yt: "pgXpM4l_MwI", len: "3:10", acts: ["sing", "clap"], tips: ["開頭和每次副歌開頭的英文句由觀眾唱", "主歌和副歌有好幾句是 Ado 起頭、觀眾接", "主歌後半、副歌後半、最後副歌三個地方拍手", "最後副歌喊「Clap Clap Clap」時拍三下"], claps: 180.94 },
    { id: "usseewa", ja: "うっせぇわ", zh: "吵死了", date: "2020-10-23", yt: "Qp3b-RXtz4w", len: "3:23", acts: ["call", "sing"], tips: ["間奏喊「Hey! Hey!」", "副歌第二次重複歌名那句由觀眾唱"] },
    { id: "readymade", ja: "レディメイド", zh: "Readymade", date: "2020-12-24", yt: "jg09lNupc1s", len: "4:03", acts: ["call", "sing"], tips: ["間奏喊「Hey! Hey!」", "副歌裡成對的短問句由觀眾回唱"] },
    { id: "freedom", ja: "FREEDOM", zh: "FREEDOM", date: "2022-10-24", yt: "hgyGhu49sGc", len: "3:02", acts: ["clap", "call", "sing"], tips: ["曲前可能先帶一段「パン パン パパン パン」的拍手，聽到這個節奏就是 FREEDOM", "間奏喊「Hey! Hey!」", "副歌以外想拍就跟著拍", "副歌前和 C 段最後，Ado 起頭後觀眾接「1,2,3,4」", "C 段跟著拍手，「Wow wow」和 Ado 一來一往"] },
    { id: "rule", ja: "ルル", zh: "RuLe", date: "2024-07-05", yt: "0Z_YqhYHhpg", len: "3:19", acts: ["sing"], tips: ["副歌連續三次的「サヨナラ」由觀眾唱"] },
    { id: "ashura", ja: "阿修羅ちゃん", zh: "阿修羅醬", date: "2021-10-28", yt: "cyq5-StPISU", len: "3:19", acts: ["wave", "call", "sing"], tips: ["間奏跟著 Ado 舉手，喊「Hey! Hey!」", "副歌跟著 Ado 的手臂左右揮，從左邊開始", "副歌裡 Ado 唱「アンダスタン」後，觀眾重複一次"] },
    { id: "mondaisaku", ja: "アタシは問題作", zh: "我是問題作", date: "2023-02-20", yt: "lZGo8jcEW2M", len: "3:15", acts: ["sing"], tips: ["副歌裡重複歌名的問句由觀眾唱", "副歌另外兩處重複的台詞也由觀眾唱，有時 Ado 會自己唱"] },
    { id: "gyakkou", ja: "逆光", zh: "逆光", date: "2022-07-06", yt: "gt-v_YCkaMY", len: "4:10", acts: ["clap", "call", "gesture"], tips: ["曲前可能先帶一段「パパン パン パパン パン」的拍手，聽到這個節奏就是逆光", "前奏先在第 2、4 拍反拍拍手（口訣：空・拍・空・拍），之後改拍正拍", "間奏喊「Hey! Hey!」", "副歌指定的句子跟著轉手 3 次", "C 段整段拍手"] },
    { id: "odo", ja: "踊", zh: "踊", date: "2021-04-27", yt: "YnSW8ian29w", len: "3:29", acts: ["sing", "call", "jump", "clap"], tips: ["開頭和 B 段結尾那句由觀眾唱", "主歌有幾句和 Ado 一來一往對唱", "副歌的「Woah」由觀眾唱", "間奏第 3、4 和 7、8 小節跳（依演唱會影像）", "最後副歌前拍手"] },
    { id: "shinjidai", ja: "新時代", zh: "新時代", date: "2022-06-15", yt: "1FliVTcX8bQ", len: "3:58", acts: ["clap", "call", "sing"], tips: ["開頭清唱結束、鼓聲進來時拍手", "間奏喊「Hey! Hey!」", "副歌前那句英文由觀眾唱"] },
    { id: "giragira", ja: "ギラギラ", zh: "閃閃發光", date: "2021-02-14", yt: "sOiMD45QGLs", len: "4:37", acts: ["sing"], tips: ["副歌開頭的兩個疊字詞由觀眾唱", "副歌中間的三句英文由觀眾唱"] },
    { id: "kurakura", ja: "クラクラ", zh: "暈眩", date: "2023-10-07", yt: "W_fHWaoQwkw", len: "3:11", acts: ["sing"], tips: ["A 段括號裡的英文由觀眾唱", "副歌 Ado 起頭後，觀眾接下一句", "副歌的歌名由觀眾唱", "最後副歌有一長句由觀眾唱"] },
    { id: "saikyo", ja: "私は最強", zh: "我是最強", date: "2022-06-22", yt: "sk1Z-Hqwwog", len: "4:30", acts: ["clap", "call"], tips: ["開頭的副歌拍手，依場次有時不拍", "間奏喊「Hey! Hey!」"] },
    { id: "aiaia", ja: "アイ・アイ・ア", zh: "AiAiA", date: "2026-03-20", yt: "_8CNByAq1n4", len: "4:20", acts: ["sing"], tips: ["副歌 Ado 唱完歌名，觀眾重複一次", "最後副歌連續四次的歌名也由觀眾重複"] },
    { id: "rockstar", ja: "ロックスター", zh: "搖滾巨星", date: "2025-04-09", yt: "hRJpiCZlLX8", len: "3:51", acts: ["clap", "sing", "call"], tips: ["前奏和間奏照固定節奏踏腳、拍手", "Ado 給信號後一起唱", "官方推薦這樣做到曲子結束；作者建議只有間奏照官方做，其他時候拍手就好", "最後副歌前喊「Hey」"] },
    { id: "staygold", ja: "Stay Gold", zh: "Stay Gold", date: "2026-07-31", yt: "Tmz3mpOq8aE", len: "3:55", live: true, acts: ["sing"], tips: ["副歌的「wow wow」由觀眾唱"] },
    { id: "episodex", ja: "Episode X", zh: "Episode X", date: "2024-12-06", yt: "9dKZeL2UbUM", len: "3:46", acts: ["sing"], tips: ["第二段 A 段的三個單字由觀眾唱"] },
    { id: "totmusica", ja: "Tot Musica", zh: "Tot Musica", date: "2022-08-17", yt: "V9_ZpqfqHFI", len: "3:22", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kira", ja: "綺羅", zh: "KIRA", date: "2026-04-27", yt: "qpcz3-iDUP8", len: "3:19", acts: ["call", "sing"], tips: ["間奏喊「Hey! Hey!」", "副歌前那一長句由觀眾唱"] },
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
    { id: "missing", ja: "行方知れず", zh: "下落不明", date: "2022-10-10", yt: "VQtmqpSE64w", len: "3:16", acts: ["call"], tips: ["間奏喊「Hey! Hey!」"] },
    { id: "himawari", ja: "向日葵", zh: "向日葵", date: "2023-07-11", yt: "aOKa-5AHCtU", len: "4:19", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "dignity", ja: "DIGNITY", zh: "DIGNITY", date: "2023-09-28", yt: "Q9X0J_tLHwY", len: "4:13", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "radio", ja: "オールナイトレディオ", zh: "All Night Radio", date: "2023-11-11", yt: "lfw8W3uWO7s", len: "3:35", acts: ["sing", "wave"], tips: ["開頭和最後副歌前，觀眾喊那串數字", "副歌跟著 Ado 的手臂左右揮，從左邊開始"] },
    { id: "unravel", ja: "unravel", zh: "unravel", date: "2023-11-15", yt: "eZuDklxsaRg", len: "4:01", acts: ["listen", "wave"], tips: ["以聽為主，副歌可以舉手"], sug: true, cover: true },
    { id: "hotaru", ja: "夜明けと蛍", zh: "黎明與螢火蟲", date: "2023-12-12", yt: "1T6b26DTQy4", len: "5:09", acts: ["listen"], tips: ["抒情歌，安靜聽"], sug: true, cover: true },
    { id: "value", ja: "Value", zh: "Value", date: "2024-02-23", yt: "5iAQF_q6FSk", len: "3:13", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "mirror", ja: "MIRROR", zh: "MIRROR", date: "2024-05-31", yt: "zsBBWBEZkFQ", len: "3:00", acts: ["sing"], tips: ["第二次副歌和最後副歌後半，「NE! NE! NE!」和「もう一回！」由觀眾唱"] },
    { id: "sakura", ja: "桜日和とタイムマシン with 初音ミク", zh: "櫻花晴日與時光機", date: "2024-10-24", yt: "nIWZfhpnq6M", len: "5:30", acts: ["call"], tips: ["間奏喊「Hey! Hey!」"] },
    { id: "elf", ja: "エルフ", zh: "精靈", date: "2025-01-24", yt: "SbxR25brgoE", len: "4:23", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "hanataba", ja: "わたしに花束", zh: "給我的花束", date: "2025-04-06", yt: "_RAffg8JQ6g", len: "3:47", acts: ["call"], tips: ["間奏喊「Hey! Hey!」"] },
    { id: "kazetowatashi", ja: "風と私の物語", zh: "風與我的故事", date: "2025-09-26", yt: "oAuKa5NOzWE", len: "5:53", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "magic", ja: "MAGIC", zh: "MAGIC", date: "2025-10-31", yt: "l0WArCNh6G0", len: "2:52", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "angelseek", ja: "エンゼルシーク", zh: "Angelseek", date: "2026-02-09", yt: "aGSmxr-dUq0", len: "3:50", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "vivarium", ja: "ビバリウム", zh: "Vivarium", date: "2026-02-28", yt: "YvYii6dluM8", len: "4:32", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "haruni", ja: "春に舞う", zh: "於春日起舞", date: "2026-05-25", yt: "xIYfDbkq-SM", len: "3:59", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kagakushu", ja: "過学習", zh: "過度學習", date: "2022-03-06", yt: "55W2LxbQoHc", len: "3:35", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "hanabi", ja: "花火", zh: "花火", date: "2022-01-26", yt: "5_-TcIOxm60", len: "3:36", acts: ["clap"], tips: ["副歌和間奏以外一直拍手", "B 段第一句先停拍，下一句再接著拍"] },
    { id: "domestic", ja: "ドメスティックでバイオレンス", zh: "Domestic de Violence", date: "2022-03-26", yt: "iRMYLKIWyUk", len: "2:37", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "luckybruto", ja: "ラッキー・ブルート", zh: "Lucky Bruto", date: "2022-05-08", yt: "u-G_zzhLSy8", len: "3:28", acts: ["sing"], tips: ["副歌裡的「ヘイミスター」由觀眾唱", "結尾的「ダダダン」「バババン」由觀眾唱"] },
    { id: "motherland", ja: "マザーランド", zh: "Motherland", date: "2022-05-08", yt: "_wZfYtYwxro", len: "4:21", acts: ["clap"], tips: ["副歌和 C 段以外一直拍手，樂團會帶", "安靜下來的那段副歌，改在第 2、4 拍反拍拍手（口訣：空・拍・空・拍）"] },
    { id: "nukegara", ja: "抜け空", zh: "空殼", date: "2024-12-30", yt: "JpnqXqy-XMg", len: "3:09", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "zero", ja: "0", zh: "0", date: "2025-10-24", yt: "8vm3Tkv43jw", len: "3:01", acts: ["clap"], tips: ["B 段整段拍手"] },
    { id: "hellosignals", ja: "Hello Signals", zh: "Hello Signals", date: "2025-04-09", yt: "IH-u0Mk_xEY", len: "3:19", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "kittocoaster", ja: "きっとコースター", zh: "一定是雲霄飛車", date: "2024-06-18", yt: "nV5SHldicJY", len: "3:02", acts: ["sing"], tips: ["副歌那句疊字由觀眾唱"] },
    { id: "lovemeforever", ja: "Love me forever!", zh: "Love me forever!", date: "2026-07-03", yt: "WSuAVkaSC38", len: "4:10", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "dnd", ja: "DND feat. KUROMI", zh: "DND feat. KUROMI", en: "DND feat. KUROMI", date: "2026-10-07", yt: "__qvPGatwus", len: "3:08", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "ravensky", ja: "Raven Sky", zh: "Raven Sky", date: "2026-10-16", yt: "7DBSMzbPQzc", len: "4:12", acts: [], tips: ["演唱會尚未公開演唱，目前沒有固定應援，自由跟著節奏"], free: true },
    { id: "kanjaa", ja: "患者A", zh: "患者A", date: "2026-10-24", yt: "JO66tA5Yngs", len: "4:49", acts: [], tips: ["沒有固定應援，自由跟著節奏"], free: true },
    { id: "sukideite", ja: "好きでいて", zh: "請一直喜歡我", date: "2026-09-07", yt: "iTNwVheLpj8", len: "4:07", hold: true },
    { id: "soldiergame", ja: "soldier game", zh: "soldier game", date: "2026-01-13", yt: "J3hzdBkd6bg", len: "3:42", hold: true },
    // 翻唱
    { id: "ponpokorin", ja: "おどるポンポコリン", zh: "跳舞的嘭嘭可琳", date: "2026-01-11", yt: "TZYqDl19qLQ", len: "1:25", acts: ["clap"], tips: ["跟著節拍拍手"], sug: true, cover: true },
    { id: "catseye", ja: "CAT'S EYE", zh: "貓眼", date: "2025-12-26", yt: "8-Qekf_GBow", len: "3:05", acts: ["wave"], tips: ["跟著節拍搖螢光棒"], sug: true, cover: true },
    { id: "kitaro", ja: "ゲゲゲの鬼太郎", zh: "鬼太郎", date: "2025-05-15", yt: "6Qd16SxUjj4", len: "2:15", acts: ["clap"], tips: ["跟著節拍拍手"], sug: true, cover: true },
    { id: "charles", ja: "シャルル", zh: "夏爾", date: "2025-04-16", yt: "trIiMhTDKxo", len: "3:45", acts: ["wave"], tips: ["副歌舉手跟著搖"], sug: true, cover: true },
    { id: "hibana", ja: "ヒバナ", zh: "火花", en: "HIBANA", date: "2025-04-25", yt: "EFsSYiNl2AQ", len: "3:25", acts: ["wave", "clap"], tips: ["跟著節拍拍手、搖螢光棒"], sug: true, cover: true },
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
  const UT = {"show":343570,"usseewa":292534,"readymade":295824,"freedom":313113,"rule":356726,"ashura":309074,"mondaisaku":332973,"gyakkou":321128,"odo":301298,"shinjidai":319758,"giragira":297951,"kurakura":344008,"saikyo":320568,"aiaia":389756,"rockstar":371304,"episodex":364731,"totmusica":322907,"kira":392133,"monstruo":397076,"ibara":336879,"rebellion":324691,"chocolat":349160,"shoka":361947,"pierrot":303332,"aitakute":306065,"akuruhi":315407,"kokoro":313110,"utakata":322805,"sekai":322906,"kaze":322905,"missing":326032,"himawari":340373,"dignity":343573,"radio":344727,"unravel":350288,"hotaru":350286,"value":350381,"mirror":355040,"sakura":362390,"elf":367139,"hanataba":369630,"kazetowatashi":380660,"magic":381653,"angelseek":386914,"vivarium":388255,"haruni":392755,"kagakushu":313108,"hanabi":313112,"domestic":313114,"luckybruto":313111,"motherland":313109,"nukegara":357493,"zero":357492,"hellosignals":371303,"kittocoaster":363098,"lovemeforever":395819,"dnd":399762,"kanjaa":401422,"ravensky":400798,"sukideite":398715,"soldiergame":386267,"ponpokorin":385914,"catseye":380030,"kitaro":374762,"charles":371560,"hibana":265028,"jikkai":373551,"aishite":350293,"kazarijanai":350294,"kamippoina":350289,"kawaikute":350291,"tsumitobatsu":350292,"dryflower":350295,"villain":350290,"burikino":350287};

  // 螢光棒顏色：依 じゅん🌝ぴ 的 note；彩＝カラフル，開頭 ? 是原文的預測（不顯示，當作沒寫）；沒寫的歌用藍（原文：迷ったら青）
  const PEN = { usseewa: "青赤", readymade: "赤桃水", giragira: "白", odo: "赤青", pierrot: "水紫", aitakute: "桃", ashura: "赤橙", kokoro: "白水", hanabi: "彩", kagakushu: "白水", akuruhi: "白水", domestic: "赤桃青", motherland: "青水白", luckybruto: "青赤", shinjidai: "彩桃", saikyo: "彩橙", gyakkou: "赤", utakata: "緑青赤", sekai: "黄", totmusica: "紫青", kaze: "青水", rebellion: "赤青", missing: "白水", freedom: "白青", mondaisaku: "緑彩", ibara: "水白青", himawari: "黄橙緑水", show: "橙黄", dignity: "青水", kurakura: "水桃", radio: "橙黄緑", chocolat: "赤白", value: "水白", mirror: "青桃", kittocoaster: "水桃", rule: "青水赤", nukegara: "水白", zero: "白", hellosignals: "水桃", shoka: "赤青", sakura: "桃", episodex: "青水白", elf: "緑橙黄", hanataba: "水黄", rockstar: "赤黄", staygold: "赤青紫", kazetowatashi: "青水", magic: "紫桃赤", angelseek: "水白", vivarium: "青", aiaia: "赤橙黄", kira: "青橙", haruni: "桃", sukideite: "?黄", monstruo: "橙赤黄水", lovemeforever: "紫水白", dnd: "紫桃青", kanjaa: "白赤", ravensky: "橙赤紫", hibana: "赤青" };
  // 拍點：[BPM, 第一個小節第一拍的秒數, 小節第一拍可信]。從 MV 音訊分析：BPM 以 songbpm.com 為起點微調，再找拍子位置和和聲換的那一拍；
  // 拍點不清楚的歌不列，燈光改成每句歌詞開頭亮一下
  const BEAT = { aiaia: [138, 1.685, 0], aitakute: [160, 0.97, 1], akuruhi: [147, 0.671, 0], ashura: [156, 1.522, 1], burikino: [172, 0.695, 1], catseye: [145, 0.635, 1], charles: [148, 1.306, 0], chocolat: [137, 0.033, 1], dignity: [154, 0.447, 1], dnd: [155, 0.38, 1], domestic: [116, 0.726, 1], dryflower: [148, 0.473, 1], elf: [160, 1.47, 1], episodex: [174, 0.152, 1], freedom: [178, 0.203, 1], giragira: [96, 2.05, 1], gyakkou: [145, 0.366, 0], hanabi: [100, 0.95, 1], hanataba: [93.5, 2.005, 0], haruni: [145, 1.055, 1], hellosignals: [170, 0.595, 0], hibana: [200, 0.45, 1], himawari: [95, 0.773, 1], hotaru: [80, 1.79, 0], ibara: [165, 1.064, 1], jikkai: [149, 0.58, 1], kagakushu: [100, 2.11, 1], kanjaa: [120, 0.056, 0], kawaikute: [160, 0.5, 1], kazarijanai: [178, 1.001, 1], kaze: [140, 1.686, 1], kazetowatashi: [172, 0.533, 0], kira: [155, 0.362, 1], kitaro: [110.98, 1.646, 0], kokoro: [152, 1.525, 1], kurakura: [94, 1.977, 1], lovemeforever: [135, 0.418, 1], luckybruto: [99, 2.172, 0], magic: [133, 0.853, 1], mirror: [114, 1.208, 1], missing: [137.98, 0.393, 1], mondaisaku: [150, 0.42, 1], monstruo: [130, 0.172, 1], motherland: [130, 0.262, 1], nukegara: [132, 0.461, 1], odo: [128, 1.858, 1], pierrot: [120, 0.68, 0], ponpokorin: [140, 0.496, 1], radio: [118, 1.084, 1], ravensky: [162, 0.997, 1], readymade: [97.51, 1.216, 0], rebellion: [178, 0.344, 1], rockstar: [105, 1.643, 0], rule: [132, 0.107, 1], saikyo: [96, 2.17, 0], sakura: [174, 0.152, 1], sekai: [76, 0.39, 1], shinjidai: [175, 1.208, 1], shoka: [94, 0.59, 0], show: [132, 0.747, 1], soldiergame: [132, 0.631, 1], staygold: [140, 1.564, 1], sukideite: [164, 0.379, 1], totmusica: [130, 0.32, 1], tsumitobatsu: [118.5, 1.827, 0], unravel: [135, 0.396, 1], usseewa: [178, 0.505, 1], utakata: [178, 0.874, 1], villain: [102, 1.654, 1], vivarium: [97.5, 0.981, 0], zero: [171, 0.017, 1] };

  // 副歌高潮（最後一次副歌開頭）的秒數：MV 音訊和聲比對＋歌詞重複找的，再依歌詞段落人工修正
  const CLIMAX = { aiaia: 190.36, aishite: 161.24, akuruhi: 202.94, angelseek: 149.3, ashura: 139.43, burikino: 163.7, catseye: 145.75, charles: 178.85, chocolat: 178.27, dignity: 187.27, dnd: 143.6, domestic: 114.59, dryflower: 229.74, elf: 237.27, episodex: 165.67, freedom: 153.74, giragira: 219.12, gyakkou: 192.71, hanabi: 163.72, hanataba: 183.25, haruni: 181.86, hellosignals: 147.49, hibana: 154.9, himawari: 174.22, hotaru: 265.96, ibara: 209.89, jikkai: 175.46, kagakushu: 184.47, kamippoina: 174.95, kanjaa: 236.06, kawaikute: 188.49, kazarijanai: 173.36, kaze: 211.47, kazetowatashi: 282.75, kira: 137.71, kitaro: 106.47, kittocoaster: 143.9, kokoro: 217.56, kurakura: 146.97, lovemeforever: 206.43, luckybruto: 170.63, magic: 134.64, mirror: 135.86, missing: 118.79, mondaisaku: 160.09, monstruo: 154.83, motherland: 214.34, nukegara: 140.44, odo: 169.11, pierrot: 148.16, ponpokorin: 69.01, radio: 167.91, ravensky: 212.09, readymade: 184.18, rebellion: 133.56, rockstar: 177.47, rule: 178.23, saikyo: 189.47, sakura: 280.79, sekai: 189.4, shinjidai: 160.4, shoka: 180.15, show: 154.95, soldiergame: 176.73, staygold: 184.22, sukideite: 182.07, totmusica: 144.62, tsumitobatsu: 179.27, unravel: 199.14, usseewa: 167.48, utakata: 108.64, value: 150.66, villain: 165.25, vivarium: 171.27, zero: 112.16 };
  // 歷年演唱會現場音源（官方 YouTube 釋出版本，依年代由新至舊）
  const LIVES = {
    show: [{ concert: "Hibana (2025)", yt: "WgGdWq6UmGg" }, { concert: "モナ・リザの横顔 (2024)", yt: "ID80ZJjIuHc" }, { concert: "心臓 (2024)", yt: "xZRsPnKF2jk" }, { concert: "Wish (2024)", yt: "n7h7ZyFmDR0" }, { concert: "マーズ (2023)", yt: "09jAVAZBBSY" }],
    usseewa: [{ concert: "Hibana (2025)", yt: "NfqZ2kl6LC8" }, { concert: "心臓 (2024)", yt: "PdV0aSQg6m0" }, { concert: "Wish (2024)", yt: "gU4-Ku28jkk" }, { concert: "マーズ (2023)", yt: "Y8qWIr40TR4" }, { concert: "カムパネルラ (2022)", yt: "99rz6GJZFpw" }, { concert: "喜劇 (2022)", yt: "c3OsNHiOXlk" }],
    readymade: [{ concert: "Hibana (2025)", yt: "dXebsbFWpuQ" }, { concert: "心臓 (2024)", yt: "JoqlGa24c9k" }, { concert: "Wish (2024)", yt: "sr8nxg3TqXE" }, { concert: "マーズ (2023)", yt: "2ag3GithBng" }, { concert: "カムパネルラ (2022)", yt: "_Zf3ZpJDcjg" }, { concert: "喜劇 (2022)", yt: "NxdK3JITYuc" }],
    freedom: [{ concert: "モナ・リザの横顔 (2024)", yt: "Hl3L70i7HUs" }, { concert: "心臓 (2024)", yt: "3sbrao--E34" }, { concert: "Wish (2024)", yt: "J8etYHyEuL0" }, { concert: "マーズ (2023)", yt: "hFUJEhMOxjA" }, { concert: "カムパネルラ (2022)", yt: "3QXBeB3PjAk" }, { concert: "喜劇 (2022)", yt: "roWmL148ys4" }],
    rule: [{ concert: "Hibana (2025)", yt: "UD_T9LFDLbc" }, { concert: "モナ・リザの横顔 (2024)", yt: "MigVIeXG2Ds" }],
    ashura: [{ concert: "Wish (2024)", yt: "4SZRcyIHYzU" }, { concert: "マーズ (2023)", yt: "Cf3T0IYoacU" }, { concert: "カムパネルラ (2022)", yt: "-I-zpdvBjXU" }, { concert: "喜劇 (2022)", yt: "3-qkX3Eax2Y" }],
    mondaisaku: [{ concert: "モナ・リザの横顔 (2024)", yt: "wPNZgbrgm6Q" }, { concert: "マーズ (2023)", yt: "95kE1oGdZRo" }],
    gyakkou: [{ concert: "Hibana (2025)", yt: "qEjMnvOAX9s" }, { concert: "モナ・リザの横顔 (2024)", yt: "6eRkvuJcBQw" }, { concert: "心臓 (2024)", yt: "ut-bYGiHOL4" }, { concert: "Wish (2024)", yt: "Ltv4M_1emnA" }, { concert: "マーズ (2023)", yt: "cTWX49hzLTk" }, { concert: "カムパネルラ (2022)", yt: "8pi-1vPyKPI" }],
    odo: [{ concert: "Hibana (2025)", yt: "_uGFUQlBkk0" }, { concert: "心臓 (2024)", yt: "vc6YZk48zgE" }, { concert: "Wish (2024)", yt: "rY2KkFZmg3Y" }, { concert: "マーズ (2023)", yt: "tsDD8npFUjQ" }, { concert: "カムパネルラ (2022)", yt: "xtnV2V6kR9o" }, { concert: "喜劇 (2022)", yt: "KsoGWz5M7MY" }],
    shinjidai: [{ concert: "Hibana (2025)", yt: "ivGSglSvINE" }, { concert: "心臓 (2024)", yt: "R-YxVi_AcBw" }, { concert: "Wish (2024)", yt: "bylv-6ghf5o" }, { concert: "マーズ (2023)", yt: "T8eJzgW9rUc" }, { concert: "カムパネルラ (2022)", yt: "R3BWPEl767I" }],
    giragira: [{ concert: "Hibana (2025)", yt: "9OpHwXmPtmA" }, { concert: "心臓 (2024)", yt: "UJgw23V2TNU" }, { concert: "Wish (2024)", yt: "gu_pjL_KMfY" }, { concert: "カムパネルラ (2022)", yt: "HkCOF7J-yw0" }, { concert: "喜劇 (2022)", yt: "ybZcoKLVqCE" }],
    kurakura: [{ concert: "Hibana (2025)", yt: "PprZsuQjS6g" }, { concert: "モナ・リザの横顔 (2024)", yt: "EVOik6zlgg0" }, { concert: "心臓 (2024)", yt: "qrkHzKcbLcQ" }, { concert: "Wish (2024)", yt: "TX2m27iq5Gk" }],
    saikyo: [{ concert: "心臓 (2024)", yt: "ZnrmNsHOBpM" }, { concert: "Wish (2024)", yt: "XSbI5auQ8Jk" }, { concert: "マーズ (2023)", yt: "TFTpQOIjxHc" }, { concert: "カムパネルラ (2022)", yt: "8jke-NjdX68" }],
    rockstar: [{ concert: "Hibana (2025)", yt: "YMtXAzCDE_U" }],
    staygold: [{ concert: "Hibana (2025)", yt: "Tmz3mpOq8aE" }],
    episodex: [{ concert: "Hibana (2025)", yt: "taMaq4itiWI" }],
    totmusica: [{ concert: "心臓 (2024)", yt: "UW15nfNNnsM" }, { concert: "Wish (2024)", yt: "9MzT3Eo0NhI" }, { concert: "マーズ (2023)", yt: "Gx6MQ-eAklA" }],
    ibara: [{ concert: "心臓 (2024)", yt: "aJ1XfvT87lk" }, { concert: "マーズ (2023)", yt: "qFP2fD0q7Xw" }],
    rebellion: [{ concert: "モナ・リザの横顔 (2024)", yt: "I1TvjJpQVNk" }, { concert: "Wish (2024)", yt: "DilKFiiEdmM" }, { concert: "マーズ (2023)", yt: "2uBvYV81gaE" }],
    chocolat: [{ concert: "モナ・リザの横顔 (2024)", yt: "hLpRjGbOXVw" }, { concert: "心臓 (2024)", yt: "nD3kJA7EmJQ" }],
    shoka: [{ concert: "モナ・リザの横顔 (2024)", yt: "McCLLXFEqwE" }],
    pierrot: [{ concert: "モナ・リザの横顔 (2024)", yt: "f1wpPbGDOS8" }, { concert: "Wish (2024)", yt: "bKxZyLo5LJs" }, { concert: "マーズ (2023)", yt: "gJ7G9zCDZ9w" }, { concert: "カムパネルラ (2022)", yt: "I0SVv3Y_4ok" }, { concert: "喜劇 (2022)", yt: "oPXLf6v4NoI" }],
    aitakute: [{ concert: "モナ・リザの横顔 (2024)", yt: "-aNQvlUpy8s" }, { concert: "カムパネルラ (2022)", yt: "4OexDHFMjbs" }, { concert: "喜劇 (2022)", yt: "763puEirmHg" }],
    akuruhi: [{ concert: "心臓 (2024)", yt: "RENZ6yYUQp8" }, { concert: "カムパネルラ (2022)", yt: "pO7XmFW9wKY" }],
    kokoro: [{ concert: "モナ・リザの横顔 (2024)", yt: "fZcJLXmHDCk" }, { concert: "心臓 (2024)", yt: "vNu1Bzv0-s4" }, { concert: "Wish (2024)", yt: "xARuAduZLNI" }, { concert: "カムパネルラ (2022)", yt: "7zLttoH_PDM" }, { concert: "喜劇 (2022)", yt: "vXM-ouOarE0" }],
    utakata: [{ concert: "Hibana (2025)", yt: "RRX4XHAnUbQ" }, { concert: "モナ・リザの横顔 (2024)", yt: "MegI6wWnLEQ" }, { concert: "Wish (2024)", yt: "YG1luhZFH_A" }, { concert: "マーズ (2023)", yt: "L0jSlm6k3W4" }],
    missing: [{ concert: "心臓 (2024)", yt: "qKD2AradcHs" }, { concert: "マーズ (2023)", yt: "Cb7f_R1QpTo" }],
    himawari: [{ concert: "マーズ (2023)", yt: "VC10CwlKgtY" }],
    dignity: [{ concert: "心臓 (2024)", yt: "py_aTfmb7G4" }, { concert: "マーズ (2023)", yt: "7WQqDRO70tA" }],
    radio: [{ concert: "モナ・リザの横顔 (2024)", yt: "VkIj2NmnOKA" }],
    unravel: [{ concert: "マーズ (2023)", yt: "oVVsWffwHuY" }],
    value: [{ concert: "Hibana (2025)", yt: "SrGRWVSCZ7Y" }, { concert: "モナ・リザの横顔 (2024)", yt: "alTNywa8j7o" }, { concert: "心臓 (2024)", yt: "YFXn2WTwXxc" }],
    mirror: [{ concert: "Hibana (2025)", yt: "MWtNVJvqvHs" }, { concert: "モナ・リザの横顔 (2024)", yt: "sO1M2AEdUFU" }],
    sakura: [{ concert: "心臓 (2024)", yt: "nnxUioEgG_s" }],
    elf: [{ concert: "Hibana (2025)", yt: "wSiGM7DmH8c" }],
    hanataba: [{ concert: "Hibana (2025)", yt: "bgtcIQRRJA4" }],
    kagakushu: [{ concert: "モナ・リザの横顔 (2024)", yt: "rFBgDVp_F-c" }, { concert: "心臓 (2024)", yt: "d8i41VwBi5s" }, { concert: "カムパネルラ (2022)", yt: "OO8D4i9vs2o" }, { concert: "喜劇 (2022)", yt: "e01hlhBkKH0" }],
    hanabi: [{ concert: "マーズ (2023)", yt: "10357cmXDxQ" }, { concert: "カムパネルラ (2022)", yt: "6Vu4eAII0Jw" }, { concert: "喜劇 (2022)", yt: "xdrhq2FXg0I" }],
    domestic: [{ concert: "心臓 (2024)", yt: "3lPmCE348Ik" }, { concert: "カムパネルラ (2022)", yt: "e7lLiD8XxC4" }, { concert: "喜劇 (2022)", yt: "TTOHtMDREuA" }],
    luckybruto: [{ concert: "Hibana (2025)", yt: "FJnRcpn-J4A" }, { concert: "心臓 (2024)", yt: "FKUxO2kdUx0" }, { concert: "Wish (2024)", yt: "4CijgqNULzs" }, { concert: "カムパネルラ (2022)", yt: "owz9cl4UBKs" }, { concert: "喜劇 (2022)", yt: "irsiKVsaCSo" }],
    motherland: [{ concert: "心臓 (2024)", yt: "mq1WQT1C2Wo" }, { concert: "Wish (2024)", yt: "Bui92P54-cc" }, { concert: "カムパネルラ (2022)", yt: "uz3jbQ0z96Q" }, { concert: "喜劇 (2022)", yt: "SiV-ZfGsBEA" }],
    nukegara: [{ concert: "モナ・リザの横顔 (2024)", yt: "fKlQxCxnhKw" }],
    hellosignals: [{ concert: "モナ・リザの横顔 (2024)", yt: "mWHB35eYMt0" }, { concert: "心臓 (2024)", yt: "Teu10PNyXWc" }],
    charles: [{ concert: "Hibana (2025)", yt: "Z_F6qd34i5w" }],
    hibana: [{ concert: "Hibana (2025) LIVE 映像", yt: "JsZASL6V0QU" }, { concert: "Hibana (2025)", yt: "6NFgH53zn3I" }],
    aishite: [{ concert: "Hibana (2025)", yt: "fl_uG9TgVgs" }, { concert: "心臓 (2024)", yt: "BA4uftKOTaE" }, { concert: "Wish (2024)", yt: "HmkbBdD8044" }],
    kazarijanai: [{ concert: "マーズ (2023)", yt: "ky61bFLd0V4" }],
    tsumitobatsu: [{ concert: "カムパネルラ (2022)", yt: "nlg5SNNhl6A" }],
    villain: [{ concert: "マーズ (2023)", yt: "xxb6mZmJWCc" }],
    burikino: [{ concert: "マーズ (2023)", yt: "vmAd98XYzNI" }]
  };
  SONGS.forEach(s => { s.lives = LIVES[s.id] || []; });
  return { SONGS, UT, PEN, BEAT, CLIMAX, LIVES };
});
