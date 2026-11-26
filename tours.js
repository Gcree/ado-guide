// 巡演專頁資料：由 scripts/build.mjs 讀取並自動生成中／英／日三語靜態頁（tour/<id>/、en/tour/<id>/、jp/tour/<id>/）
// 歌曲資訊（歌名、縮圖、手燈色、應援重點）皆從 songs.js 自動連動，這裡只填巡演場次、預習分組曲目 ID 與開唱後的防雷實際歌單。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ADO_TOURS = factory();
})(this, function () {
  const TOURS = [
    {
      id: "utattemita-2027",
      updated: "2026-11-26",
      startDate: "2027-01-10",
      endDate: "2027-02-28",
      // 首頁入口橫幅顯示用（只顯示第一個 active: true 的巡演）
      active: true,
      officialUrl: "https://www.universal-music.co.jp/ado/",
      copy: {
        zh: {
          badge: "10 週年翻唱巡迴",
          name: "Adoの歌ってみたツアー2027",
          shortName: "翻唱巡迴 2027",
          bannerTag: "2027 巡迴預習",
          bannerTitle: "Ado 歌ってみた翻唱巡迴 2027 歌單預習",
          bannerSub: "2027/01/10 東京開唱・翻唱專輯《その２》與熱門翻唱分層整理，不暴雷",
          bannerCta: "看預習歌單",
          title: "Ado 歌ってみた巡迴 2027 歌單預習與應援指南｜翻唱專輯《その２》",
          desc: "Ado 歌い手活動 10 週年「Adoの歌ってみたツアー2027」（東京・大阪・愛知 6 公演）不暴雷歌單預習：整理《歌ってみたアルバム その２》與第 1 彈收錄曲、已有現場應援紀錄與熱門新翻唱，支援一鍵匯入待練清單與手燈顏色參考。",
          heroLead: "紀念 Ado 歌い手活動滿 10 週年的「歌ってみた」翻唱主題巡演（東京・大阪・愛知共 6 公演）。本頁將《Adoの歌ってみたアルバム その２》與歷年高人氣翻唱分層整理，開唱前安心預習不暴雷，開唱後另設防雷摺疊區收錄實際演出歌單。",
          statusNote: "目前為開唱前不暴雷預習清單（2027/01/10 首場後於下方防雷區更新實際歌單）",
          scheduleTitle: "巡演日程與場館（3 都市・全 6 公演）",
          scheduleSub: "皆為日本當地時間（JST），實際入場與開演時間請以官方公告為準",
          rulesTitle: "翻唱巡迴應援速記",
          rulesSub: "進場前先掌握三個大原則，第一次看翻唱專場也能輕鬆融入",
          rules: [
            {
              title: "手燈迷惘一律切藍色（迷ったら青）",
              body: "翻唱曲多數沒有官方指定手燈色；除了〈unravel〉〈ヒバナ〉〈あのバンド〉等已有現場慣例的曲目外，切 Ado 代表色「藍色」或跟隨舞台燈光與周圍觀眾最安心。"
            },
            {
              title: "專心聽歌聲，別硬喊不存在的 Call",
              body: "這場巡演聚焦 Ado 的翻唱原點與唱功表現，許多名曲偏抒情或張力型，沒有固定口號；遇到高潮拍手或 Ado 現場引導再一起互動即可。"
            },
            {
              title: "一鍵載入待練清單，先從 2 張翻唱專輯聽起",
              body: "點擊各分組右側的「載入待練清單」即可直接回到主站連播練習；電腦版同樣可搭配 PenlightSync 自動切換官方手燈顏色。"
            }
          ],
          prepTitle: "翻唱預習歌單（不暴雷）",
          prepSub: "依專輯關聯度、現場應援紀錄與近期熱度分為 4 組，可單首點進看同步歌詞，或整組匯入待練清單",
          loadListBtn: "整組載入待練清單",
          allCoversBtn: "在首頁看全部 {0} 首翻唱",
          backHomeBtn: "回 Ado 應援指南首頁",
          spoilerTitle: "實際演出歌單（セトリ）｜防暴雷區",
          spoilerSub: "為保留未看場次粉絲的驚喜，實際演出曲目預設收合；不想被暴雷請勿展開",
          spoilerSummary: "⚠️ 點此展開各場實際演出歌單（含暴雷，2027/01/10 首場後更新）",
          spoilerPending: "尚未開唱，將於 2027/01/10 東京・有明アリーナ首場結束後依可靠現場紀錄陸續補上。",
          faqTitle: "翻唱巡迴常見問題",
          faqs: [
            {
              q: "「Adoの歌ってみたツアー2027」跟一般巡演有什麼不同？",
              a: "這次是紀念 Ado 自 2017 年 1 月 10 日投稿〈君の体温〉展開歌い手活動滿 10 週年的特別巡演，主軸聚焦在「歌ってみた（翻唱）」曲目，並連動 2026 年 12 月 23 日發行的《Adoの歌ってみたアルバム その２》。"
            },
            {
              q: "這份預習歌單會暴雷嗎？",
              a: "不會。上方 4 組預習清單完全依據已公開的兩張翻唱專輯、過去演唱會曾唱過的翻唱曲與官方 YouTube 熱門翻唱整理，不代表實際曲順。開唱後的真實歌單會獨立放在預設收合的「防暴雷區」中，不展開就不會看到。"
            },
            {
              q: "沒有標示應援或手燈顏色的翻唱曲該怎麼應援？",
              a: "手燈統一先切 Ado 的代表色「藍色」即可，現場若舞台主色明顯改變或周圍觀眾統一切色再跟著換。沒有固定 Call 的歌就專心欣賞唱功、跟著節奏揮手燈，實際互動一律以現場氣氛和 Ado 的引導為準。"
            },
            {
              q: "《Adoの歌ってみたアルバム その２》的預留曲什麼時候會有歌詞與 MV？",
              a: "專輯預定於 2026 年 12 月 23 日發行，待官方釋出音源或 MV 後，本站就會陸續補上逐行同步歌詞與時間軸；若巡演現場發展出固定應援或手燈色，也會一併更新。"
            }
          ]
        },
        en: {
          badge: "10th Anniversary Cover Tour",
          name: "Ado's \"Utattemita\" Tour 2027",
          shortName: "Utattemita Tour 2027",
          bannerTag: "2027 Tour Prep",
          bannerTitle: "Ado Utattemita Cover Tour 2027 Setlist Prep",
          bannerSub: "Starts Jan 10, 2027 in Tokyo — spoiler-free cover tiers from Utattemita Album Vol. 2 & fan favorites",
          bannerCta: "Open prep guide",
          title: "Ado Utattemita Tour 2027 Setlist Prep & Cover Guide | Lightstick Colors",
          desc: "Spoiler-free prep guide for Ado's 10th anniversary Utattemita Tour 2027 (Tokyo, Osaka, Aichi — 6 shows): Utattemita Album Vol. 2 & Vol. 1 tracks, covers with confirmed live chants, and top YouTube covers with one-click practice lists.",
          heroLead: "Celebrating the 10th anniversary of Ado's utaite debut, Ado's \"Utattemita\" Tour 2027 brings 6 arena shows across Tokyo, Osaka, and Aichi. Practice key covers from Utattemita Album Vol. 2, Vol. 1, and fan-favorite uploads spoiler-free—plus a spoiler-guarded section for actual setlists once the tour begins.",
          statusNote: "Spoiler-free pre-tour prep list (actual setlists will be added inside the collapsed spoiler box after Jan 10, 2027)",
          scheduleTitle: "Tour Schedule & Venues (3 Cities, 6 Shows)",
          scheduleSub: "All times in Japan Standard Time (JST). Always check official announcements for final door/show times.",
          rulesTitle: "Cover Tour Cheering Basics",
          rulesSub: "Three quick rules so you feel confident even if a cover has no fixed chant yet",
          rules: [
            {
              title: "When in doubt, go with Ado's blue",
              body: "Most cover tracks don't have an official lightstick / penlight color. Outside covers with established concert colors (like unravel, HIBANA, and That Band), switch to blue or follow the stage lighting."
            },
            {
              title: "Enjoy the vocals — don't force chants",
              body: "This tour celebrates Ado's cover roots and vocal range. Many tracks have no set call; clap along when the beat builds or follow Ado's cues on stage."
            },
            {
              title: "Load a whole group into your practice list",
              body: "Use “Load into practice list” on any section below to queue those songs on the main player. Desktop users can also connect PenlightSync for automatic lightstick color changes."
            }
          ],
          prepTitle: "Spoiler-Free Prep Playlist",
          prepSub: "Grouped into 4 tiers by album relevance, confirmed live chants, and popularity—open any song for synced romaji lyrics or queue a whole group",
          loadListBtn: "Load into practice list",
          allCoversBtn: "Browse all {0} covers on home",
          backHomeBtn: "Back to Ado Fan Chant Guide",
          spoilerTitle: "Actual Tour Setlists (Spoiler-Guarded)",
          spoilerSub: "Kept collapsed by default so fans attending later dates stay spoiler-free",
          spoilerSummary: "⚠️ Click to reveal actual show setlists (spoilers — updated after Jan 10, 2027)",
          spoilerPending: "Tour has not started yet. Verified setlists will be added here after the opening night at Ariake Arena on Jan 10, 2027.",
          faqTitle: "Tour FAQ",
          faqs: [
            {
              q: "What makes Ado's \"Utattemita\" Tour 2027 different from other Ado tours?",
              a: "It celebrates the 10th anniversary of Ado's first utaite upload (“Kimi no Taion” on Jan 10, 2017), focusing on her cover repertoire alongside the Dec 23, 2026 release of Utattemita Album Vol. 2."
            },
            {
              q: "Will this prep page spoil the actual setlist?",
              a: "No. The 4 prep sections are built purely from publicly announced cover albums, past live cover performances, and popular YouTube covers. Actual concert setlists are placed separately inside a collapsed spoiler box."
            },
            {
              q: "Which lightstick / penlight color should I use for covers without a listed color?",
              a: "Default to Ado's signature blue, and match the stage lighting or crowd if a color naturally emerges during the performance."
            },
            {
              q: "When will lyrics and MVs be added for the upcoming Utattemita Album Vol. 2 tracks?",
              a: "Utattemita Album Vol. 2 releases on Dec 23, 2026. Once official audio or MVs drop, synced lyrics and romaji will be added—and any live chants that emerge on tour will be updated too."
            }
          ]
        },
        ja: {
          badge: "歌い手10周年ツアー",
          name: "Adoの歌ってみたツアー2027",
          shortName: "歌ってみたツアー2027",
          bannerTag: "2027 ツアー予習",
          bannerTitle: "Adoの歌ってみたツアー2027 セトリ予習・応援ガイド",
          bannerSub: "2027/1/10 有明アリーナ開幕・『歌ってみたアルバム その２』＆人気カバーをネタバレなしで予習",
          bannerCta: "予習ページへ",
          title: "Adoの歌ってみたツアー2027 セトリ予習・ペンライト色・コールまとめ",
          desc: "歌い手活動10周年記念「Adoの歌ってみたツアー2027」（東京・大阪・愛知 全6公演）のネタバレなし予習ガイド。『Adoの歌ってみたアルバム その２』＆第1弾収録曲、コール確認済みカバー、人気・最新歌ってみたをまとめて練習リストへ一括追加できます。",
          heroLead: "Adoの歌い手活動10周年記念日（2027年1月10日）に開幕する「Adoの歌ってみたツアー2027」（東京・大阪・愛知 全6公演）向けの予習ページ。『Adoの歌ってみたアルバム その２』や定番カバーをネタバレなしで整理し、開幕後の実際のセトリは折りたたみネタバレ防止エリアに掲載します。",
          statusNote: "現在は開幕前のネタバレなし予習リストです（2027/1/10 東京初日以降、下部の折りたたみエリアに実セトリを追記）",
          scheduleTitle: "公演日程・会場一覧（全国3都市・全6公演）",
          scheduleSub: "開場・開演時間は変更になる場合があります。最新情報は必ず公式サイトをご確認ください。",
          rulesTitle: "歌ってみたツアー応援の基本",
          rulesSub: "カバー曲が中心の公演でも迷わず楽しめる3つのポイント",
          rules: [
            {
              title: "ペンライト色に迷ったら「青」",
              body: "カバー曲は公式指定色がない曲が多数です。〈unravel〉〈ヒバナ〉〈あのバンド〉などライブ実績のある曲以外は、Adoのイメージカラーの青か、会場の照明に合わせれば安心です。"
            },
            {
              title: "無理にコールを入れず、歌声を堪能する",
              body: "歌い手10周年の原点回帰となるツアーのため、聴かせる楽曲も多く想定されます。決まったコールがない曲はリズムに合わせて自由にペンライトを振り、Adoの煽りに合わせて盛り上がりましょう。"
            },
            {
              title: "グループごとに練習リストへ一括追加",
              body: "各セクションの「練習リストに追加」から、そのまま連続再生で予習できます。PC版なら PenlightSync を使った公式ペンライト自動連動にも対応しています。"
            }
          ],
          prepTitle: "歌ってみた予習リスト（ネタバレなし）",
          prepSub: "アルバム収録・ライブ実績・人気度で4グループに整理。曲名から同期歌詞ページへ、ボタンから練習リストへ一括追加できます",
          loadListBtn: "練習リストで連続再生",
          allCoversBtn: "トップで全{0}曲のカバーを見る",
          backHomeBtn: "Ado 応援ガイド トップへ",
          spoilerTitle: "実際のセットリスト（ネタバレ防止エリア）",
          spoilerSub: "これから参戦する方への配慮として、公演ごとの実セトリはデフォルトで閉じています",
          spoilerSummary: "⚠️ クリックして各公演の実際のセトリを表示（ネタバレ注意・2027/1/10 初日以降更新）",
          spoilerPending: "公演開始前です。2027年1月10日の東京・有明アリーナ初日終了後、確認できたセットリストを順次掲載します。",
          faqTitle: "歌ってみたツアー よくある質問",
          faqs: [
            {
              q: "「Adoの歌ってみたツアー2027」はいつものライブと何が違いますか？",
              a: "2017年1月10日の「君の体温」初投稿から歌い手活動10周年を記念する特別ツアーで、カバー楽曲（歌ってみた）が主軸となります。2026年12月23日発売の『Adoの歌ってみたアルバム その２』とも連動しています。"
            },
            {
              q: "この予習リストを見るとセトリのネタバレになりますか？",
              a: "なりません。上の4グループは公表済みの歌ってみたアルバム2作品、過去ライブで披露されたカバー曲、YouTube人気カバーから構成した予習用リストです。実際の公演セトリは下の折りたたみエリアに分離しています。"
            },
            {
              q: "応援やペンライト色が未記載のカバー曲はどうすればいいですか？",
              a: "ペンライトは基本の「青」にしておき、会場の照明や周囲の雰囲気に合わせて切り替えるのがおすすめです。コールや手拍子も現地の空気とAdoのリードに合わせれば大丈夫です。"
            },
            {
              q: "『Adoの歌ってみたアルバム その２』の発売予定曲はいつ歌詞が追加されますか？",
              a: "2026年12月23日のリリース後、公式音源・MVの公開にあわせて同期歌詞とタイムラインを順次追加します。ツアーで定着した応援やペンライト色も確認でき次第反映します。"
            }
          ]
        }
      },
      shows: [
        {
          id: "tokyo-1",
          date: "2027-01-10",
          open: "15:30",
          start: "17:00",
          city: { zh: "東京", en: "Tokyo", ja: "東京" },
          day: { zh: "日", en: "Sun", ja: "日" },
          venue: { zh: "有明アリーナ", en: "Ariake Arena", ja: "有明アリーナ" },
          addressLocality: "Tokyo",
          addressCountry: "JP",
          note: { zh: "歌い手 10 週年紀念日・首場", en: "10th Anniversary Opening Night", ja: "歌い手10周年記念日・初日" },
          songs: []
        },
        {
          id: "tokyo-2",
          date: "2027-01-11",
          open: "14:30",
          start: "16:00",
          city: { zh: "東京", en: "Tokyo", ja: "東京" },
          day: { zh: "一・祝", en: "Mon", ja: "月・祝" },
          venue: { zh: "有明アリーナ", en: "Ariake Arena", ja: "有明アリーナ" },
          addressLocality: "Tokyo",
          addressCountry: "JP",
          songs: []
        },
        {
          id: "osaka-1",
          date: "2027-01-30",
          open: "15:30",
          start: "17:00",
          city: { zh: "大阪", en: "Osaka", ja: "大阪" },
          day: { zh: "六", en: "Sat", ja: "土" },
          venue: { zh: "Asueアリーナ大阪", en: "Asue Arena Osaka", ja: "Asueアリーナ大阪" },
          addressLocality: "Osaka",
          addressCountry: "JP",
          songs: []
        },
        {
          id: "osaka-2",
          date: "2027-01-31",
          open: "14:30",
          start: "16:00",
          city: { zh: "大阪", en: "Osaka", ja: "大阪" },
          day: { zh: "日", en: "Sun", ja: "日" },
          venue: { zh: "Asueアリーナ大阪", en: "Asue Arena Osaka", ja: "Asueアリーナ大阪" },
          addressLocality: "Osaka",
          addressCountry: "JP",
          songs: []
        },
        {
          id: "aichi-1",
          date: "2027-02-27",
          open: "15:30",
          start: "17:00",
          city: { zh: "愛知", en: "Aichi", ja: "愛知" },
          day: { zh: "六", en: "Sat", ja: "土" },
          venue: { zh: "ポートメッセなごや 第1展示館", en: "Port Messe Nagoya Hall 1", ja: "ポートメッセなごや 第1展示館" },
          addressLocality: "Nagoya",
          addressCountry: "JP",
          songs: []
        },
        {
          id: "aichi-2",
          date: "2027-02-28",
          open: "14:30",
          start: "16:00",
          city: { zh: "愛知", en: "Aichi", ja: "愛知" },
          day: { zh: "日", en: "Sun", ja: "日" },
          venue: { zh: "ポートメッセなごや 第1展示館", en: "Port Messe Nagoya Hall 1", ja: "ポートメッセなごや 第1展示館" },
          addressLocality: "Nagoya",
          addressCountry: "JP",
          note: { zh: "最終場", en: "Tour Final", ja: "千秋楽" },
          songs: []
        }
      ],
      groups: [
        {
          id: "album-2",
          tier: "1",
          title: {
            zh: "《Adoの歌ってみたアルバム その２》（2026/12/23 發行）",
            en: "Utattemita Album Vol. 2 (Dec 23, 2026)",
            ja: "『Adoの歌ってみたアルバム その２』（2026/12/23 発売）"
          },
          sub: {
            zh: "本巡演最核心的新翻唱專輯，目前收錄已公開的 7 首曲目（含 5 首發片預留曲）",
            en: "The centerpiece release for this tour — 7 announced tracks so far (including 5 upcoming album tracks)",
            ja: "本ツアーの核となる最新カバーアルバム。公開済みの7曲（発売予定5曲含む）を収録"
          },
          songs: ["kuchibashi", "fairytale", "unknownmothergoose", "mousoushikkan", "entersandman", "kawakiwoameku", "lagata"]
        },
        {
          id: "album-1",
          tier: "2",
          title: {
            zh: "《Adoの歌ってみたアルバム》（2023）全 10 曲",
            en: "Utattemita Album Vol. 1 (2023) — All 10 Tracks",
            ja: "『Adoの歌ってみたアルバム』（2023）全10曲"
          },
          sub: {
            zh: "第一張官方翻唱專輯全曲收錄，〈愛して愛して愛して〉〈罪と罰〉〈神っぽいな〉等都是現場超高人氣曲",
            en: "All 10 tracks from Ado's first official cover album, including fan-favorite staples like Aishite and God-ish",
            ja: "第1弾カバーアルバム全10曲。「愛して愛して愛して」「罪と罰」「神っぽいな」など定番曲ぞろい"
          },
          songs: ["unravel", "aishite", "kamippoina", "tsumitobatsu", "burikino", "villain", "kawaikute", "kazarijanai", "dryflower", "hotaru"]
        },
        {
          id: "live-verified",
          tier: "3",
          title: {
            zh: "已有現場應援紀錄的翻唱曲",
            en: "Covers with Confirmed Live Chants",
            ja: "ライブ応援・コール確認済みのカバー曲"
          },
          sub: {
            zh: "過去大型演唱會已確立手燈色與拍手／喊聲慣例的翻唱曲，建議優先把應援練熟",
            en: "Covers with established concert penlight colors and crowd cues from past Ado live shows",
            ja: "過去のライブでペンライト色やコール・手拍子が定着しているカバー曲。まず押さえておきたい3曲"
          },
          songs: ["unravel", "hibana", "anobando"]
        },
        {
          id: "origin-and-hot",
          tier: "4",
          title: {
            zh: "10 週年原點＆熱門・近期新翻唱精選",
            en: "10th Anniversary Origin, Recent & Fan-Favorite Covers",
            ja: "10周年の原点＆人気・最新歌ってみた厳選"
          },
          sub: {
            zh: "從 2017/01/10 首支投稿〈君の体温〉出發，精選 2025–2026 最新翻唱與高人氣代表作",
            en: "Starting from Ado's Jan 10, 2017 debut cover “Kimi no Taion”, plus 2025–2026 releases and top fan-favorite covers",
            ja: "2017年1月10日の初投稿「君の体温」をはじめ、2025〜2026年の最新カバーと人気曲12選"
          },
          // 特別加註的曲目標籤（例如 10 週年原點、最新翻唱）
          badges: {
            kiminotaion: { zh: "2017/1/10 首支投稿", en: "2017 Debut Cover", ja: "2017/1/10 初投稿" },
            brain: { zh: "最新翻唱", en: "New Cover", ja: "最新カバー" },
            andjuly: { zh: "近期翻唱", en: "Recent", ja: "新着" }
          },
          songs: [
            "kiminotaion",
            "brain",
            "andjuly",
            "eaasou",
            "soldiergame",
            "ponpokorin",
            "catseye",
            "charles",
            "jikkai",
            "kitaro",
            "overdose",
            "darlingdance"
          ]
        }
      ]
    }
  ];

  return { TOURS };
});
