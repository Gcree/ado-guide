// 巡演專頁資料：由 scripts/build.mjs 讀取並自動生成中／英／日三語靜態頁（tour/<id>/、en/tour/<id>/、jp/tour/<id>/）
// 歌曲資訊（歌名、縮圖、手燈色、應援重點）皆從 songs.js 自動連動，這裡只填巡演場次、預熱分組曲目 ID 與開演後各場的實際歌單。
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
          bannerSub: "2027/01/10 東京開唱・兩張翻唱專輯與 YouTube 翻唱分組整理，不暴雷",
          bannerCta: "看預習歌單",
          title: "Ado 歌ってみた巡迴 2027 歌單預習與應援指南｜翻唱專輯《その２》",
          desc: "Ado 歌い手活動 10 週年「Adoの歌ってみたツアー2027」（東京・大阪・愛知 6 公演）歌單預習：開演前照預熱歌單練兩張《歌ってみたアルバム》與 YouTube 上的翻唱，開演後照每一場（Day 1／Day 2）的實際歌單練，點一下就從第一首開始，不暴雷。",
          heroLead: "紀念 Ado 歌い手活動 10 週年的「歌ってみた」巡演，2027/1/10 歌い手活動 10 週年紀念日開唱，東京・大阪・愛知共 6 場。開演前先練預熱歌單；開演後每一場的歌單會整理在下面，照你要去的那天練。",
          warmTitle: "預熱",
          warmSub: "開演前、還不知道歌單時，照這個順序練：先練有固定應援的，再練兩張翻唱專輯和 YouTube 上的翻唱。",
          showsTitle: "各場歌單",
          showsSub: "每場歌單都可能不一樣，同一個場館的 Day 1、Day 2 也可能不同。點開你要去的那天就能照那場練，沒點開不會看到曲目。",
          tipsTitle: "現場小提醒",
          tips: [
            {
              title: "有開中控，手燈就不用自己切",
              body: "現場有開中控時，手燈顏色由會場統一控制，不用自己切。沒開中控時才需要自己切：〈unravel〉〈ヒバナ〉〈あのバンド〉照本站標的顏色；其他翻唱本站還沒有現場手燈色資料，可以跟著舞台燈光或周圍觀眾。"
            },
            {
              title: "沒有固定 Call 就別硬喊",
              body: "本站沒標應援的歌，代表還沒有現場資料。跟著節奏搖手燈就好，副歌拍手或 Ado 帶動時再一起互動。"
            },
            {
              title: "按「練這組」就直接開練",
              body: "會從清單第一首開始，上一首／下一首照清單走。回到首頁，這份清單還在，可以存成自己的待練清單；電腦版可搭配 PenlightSync 自動切手燈顏色。"
            }
          ],
          backHomeBtn: "回 Ado 應援指南首頁",
          faqTitle: "常見問題",
          faqs: [
            {
              q: "「Adoの歌ってみたツアー2027」跟一般巡演有什麼不同？",
              a: "官方公告的說法是紀念 Ado 歌い手活動 10 週年的「歌ってみた」巡演，首場 2027 年 1 月 10 日正是歌い手活動 10 週年紀念日。實際會唱哪些歌，官方沒有公布。《Adoの歌ってみたアルバム その２》2026 年 12 月 23 日發行，官方公告沒有把專輯和巡演連在一起，所以本站把它當成預熱的一組，不代表一定會唱。"
            },
            {
              q: "預熱歌單會暴雷嗎？",
              a: "不會。預熱歌單只用兩張翻唱專輯（《その２》只放官方已公布的曲目）、過去演唱會唱過的翻唱曲和 YouTube 上的翻唱整理，跟實際曲順無關。各場實際歌單要自己點開那一天才會看到。"
            },
            {
              q: "每一場的歌單都一樣嗎？",
              a: "不一定。每一場公開後會分開整理，同一個場館的 Day 1 和 Day 2 也分開列。歌單裡標「替換曲」的是不是每場都唱的歌；還沒公開的場次，可以先練「每場都唱」那份。"
            },
            {
              q: "沒有標示應援或手燈顏色的翻唱曲該怎麼應援？",
              a: "現場有開中控的話，手燈交給中控就好，不用自己切。沒開中控時，本站沒標顏色的歌代表還沒有現場資料，可以跟著舞台燈光或周圍觀眾換色。沒有固定 Call 的歌就跟著節奏搖手燈，互動以現場氣氛和 Ado 的帶動為準。"
            },
            {
              q: "《Adoの歌ってみたアルバム その２》的預留曲什麼時候會有歌詞與 MV？",
              a: "專輯 2026 年 12 月 23 日發行，官方預告約 10 首，目前公布 7 首，其他曲目公布後再補。官方釋出音源或 MV 後，本站會陸續補上同步歌詞；巡演現場若出現固定應援或手燈色，也會一起更新。還沒有 MV 的歌不會排進「練這組」的連播。"
            }
          ]
        },
        en: {
          badge: "10th Anniversary Cover Tour",
          name: "Ado's \"Utattemita\" Tour 2027",
          shortName: "Utattemita Tour 2027",
          bannerTag: "2027 Tour Prep",
          bannerTitle: "Ado Utattemita Cover Tour 2027 Setlist Prep",
          bannerSub: "Starts Jan 10, 2027 in Tokyo — spoiler-free prep from both cover albums and YouTube covers",
          bannerCta: "Open prep guide",
          title: "Ado Utattemita Tour 2027 Setlist Prep & Cover Guide | Lightstick Colors",
          desc: "Practice for Ado's 10th anniversary Utattemita Tour 2027 (Tokyo, Osaka, Aichi — 6 shows): a spoiler-free warm-up list from both Utattemita Albums and YouTube covers, then each show's actual setlist (Day 1 / Day 2) once the tour starts. One tap starts from the first song.",
          heroLead: "Ado's \"Utattemita\" tour for her 10th anniversary as an utaite, opening on the anniversary itself (Jan 10, 2027): 6 shows across Tokyo, Osaka and Aichi. Warm up with the prep list before the tour; once shows start, each show's setlist goes below so you can practice the exact day you're going to.",
          warmTitle: "Warm-up",
          warmSub: "Before the tour, with no setlist known yet, practice in this order: covers with established live chants first, then both cover albums and YouTube covers.",
          showsTitle: "Setlists by Show",
          showsSub: "Setlists can change from show to show, even between Day 1 and Day 2 at the same venue. Open the day you're attending to practice that setlist; nothing is shown until you open it.",
          tipsTitle: "Quick Tips for the Show",
          tips: [
            {
              title: "Central control on? Leave your lightstick alone",
              body: "When the venue runs central (wireless) control, lightstick colors change automatically, so there's nothing to switch. Only without it do you switch yourself: use the colors listed here for unravel, HIBANA and That Band; for other covers we have no live color data yet, so follow the stage lighting or the crowd."
            },
            {
              title: "No set call? Don't force one",
              body: "If a song has no chants listed here, we don't have live data for it yet. Sway to the beat, and clap or join in when the chorus builds or Ado leads the crowd."
            },
            {
              title: "“Practice this set” starts right away",
              body: "It opens the first song and Prev / Next follow the list. Back on the home page the list is still there to save as your own; on desktop, PenlightSync can switch lightstick colors for you."
            }
          ],
          backHomeBtn: "Back to Ado Fan Chant Guide",
          faqTitle: "FAQ",
          faqs: [
            {
              q: "What makes Ado's \"Utattemita\" Tour 2027 different from other Ado tours?",
              a: "The official announcement calls it a \"Utattemita\" (cover) tour for Ado's 10th anniversary as an utaite, opening on the anniversary itself, Jan 10, 2027. The setlist hasn't been announced. Utattemita Album Vol. 2 comes out Dec 23, 2026, but the announcements don't link the album to the tour, so we include it as one warm-up group, not as a confirmed setlist."
            },
            {
              q: "Will the warm-up list spoil the actual setlist?",
              a: "No. It's built only from the two cover albums (Vol. 2 lists only the officially announced tracks), covers Ado has sung live before, and her YouTube covers, and says nothing about the real running order. Actual setlists only appear when you open a specific show."
            },
            {
              q: "Is the setlist the same at every show?",
              a: "Not necessarily. Each show's setlist is listed separately once published, including Day 1 and Day 2 at the same venue. Songs marked “Rotating” weren't played at every show; for shows that haven't happened yet, start with the “Played at every show” list."
            },
            {
              q: "Which lightstick / penlight color should I use for covers without a listed color?",
              a: "If the venue runs central control, leave it to that. Without it, a song with no color listed here means we have no live data yet — follow the stage lighting or the crowd."
            },
            {
              q: "When will lyrics and MVs be added for the upcoming Utattemita Album Vol. 2 tracks?",
              a: "The album releases on Dec 23, 2026; about 10 tracks are planned and 7 have been announced so far, and we'll add the rest as they're revealed. Once official audio or MVs drop, synced lyrics will be added, along with any chants that emerge on tour. Songs without an MV yet are skipped in “Practice this set”."
            }
          ]
        },
        ja: {
          badge: "歌い手10周年ツアー",
          name: "Adoの歌ってみたツアー2027",
          shortName: "歌ってみたツアー2027",
          bannerTag: "2027 ツアー予習",
          bannerTitle: "Adoの歌ってみたツアー2027 セトリ予習・応援ガイド",
          bannerSub: "2027/1/10 有明アリーナ開幕・カバーアルバム2作とYouTubeの歌ってみたをネタバレなしで予習",
          bannerCta: "予習ページへ",
          title: "Adoの歌ってみたツアー2027 セトリ予習・ペンライト色・コールまとめ",
          desc: "歌い手活動10周年記念「Adoの歌ってみたツアー2027」（東京・大阪・愛知 全6公演）の予習ガイド。開幕前は『歌ってみたアルバム』2作とYouTubeの歌ってみたの予習リスト、開幕後は公演ごと（DAY1／DAY2）の実際のセトリで、ワンタップで1曲目から練習できます。",
          heroLead: "歌い手活動10周年の記念日・2027年1月10日に開幕する「歌ってみた」ツアー、東京・大阪・愛知の全6公演。開幕前は予習リストで、開幕後は参戦する公演のセトリでそのまま練習できます。",
          warmTitle: "予習",
          warmSub: "セトリがわからない開幕前は、この順番で練習：まずライブで応援が定着している曲、次にカバーアルバム2作とYouTubeの歌ってみた。",
          showsTitle: "公演ごとのセトリ",
          showsSub: "セトリは公演ごとに変わることがあり、同じ会場の DAY1・DAY2 でも変わる可能性があります。参戦する日を開くとその公演のセトリで練習できます。開くまで曲目は表示されません。",
          tipsTitle: "当日のポイント",
          tips: [
            {
              title: "無線制御があればペンライト操作は不要",
              body: "会場で無線制御（一斉制御）が入っているときは、ペンライトの色は自動で変わるので自分で切り替える必要はありません。制御がないときだけ自分で：〈unravel〉〈ヒバナ〉〈あのバンド〉は当サイト記載の色、その他のカバーはまだライブでの色の情報がないので、ステージの照明や周りに合わせましょう。"
            },
            {
              title: "決まったコールがない曲は無理に入れない",
              body: "当サイトで応援が未記載の曲は、まだライブの情報がない曲です。リズムに合わせてペンライトを振り、サビの手拍子やAdoの煽りに合わせて盛り上がりましょう。"
            },
            {
              title: "「このリストで練習」ですぐ再生",
              body: "1曲目から開き、前の曲／次の曲もリスト順に進みます。トップに戻るとリストが残っているので、自分の練習リストとして保存もできます。PC版は PenlightSync でペンライト色の自動連動にも対応。"
            }
          ],
          backHomeBtn: "Ado 応援ガイド トップへ",
          faqTitle: "よくある質問",
          faqs: [
            {
              q: "「Adoの歌ってみたツアー2027」はいつものライブと何が違いますか？",
              a: "公式発表では、歌い手活動10周年を迎えるAdoの「歌ってみた」ツアーで、初日の2027年1月10日が歌い手活動10周年の記念日です。セトリは発表されていません。『Adoの歌ってみたアルバム その２』は2026年12月23日発売ですが、公式発表ではツアーとの関連は示されていないため、当サイトでは予習リストの1グループとして載せています（披露が確定しているわけではありません）。"
            },
            {
              q: "予習リストはネタバレになりますか？",
              a: "なりません。カバーアルバム2作品（『その２』は公式発表済みの曲のみ）、過去ライブで披露されたカバー曲、YouTubeの歌ってみたから作った予習用リストで、実際の曲順とは関係ありません。実際のセトリは公演を開いたときだけ表示されます。"
            },
            {
              q: "セトリは全公演同じですか？",
              a: "同じとは限りません。公開された公演ごとに分けて掲載し、同じ会場の DAY1 と DAY2 も別々に載せます。「日替わり」が付いた曲は全公演では歌われていない曲です。まだ開催前の公演は「全公演で披露」のリストから練習するのがおすすめです。"
            },
            {
              q: "応援やペンライト色が未記載のカバー曲はどうすればいいですか？",
              a: "無線制御が入っていればそのままでOK、自分で切り替える必要はありません。制御がないときは、当サイトで色が未記載の曲はまだライブの情報がないので、ステージの照明や周りに合わせましょう。コールや手拍子も現地の空気とAdoの煽りに合わせれば大丈夫です。"
            },
            {
              q: "『Adoの歌ってみたアルバム その２』の発売予定曲はいつ歌詞が追加されますか？",
              a: "2026年12月23日発売、全10曲程度の予定で、現在発表されているのは7曲です（残りは発表され次第追加）。発売後、公式音源・MVの公開にあわせて同期歌詞を順次追加します。ツアーで定着した応援やペンライト色も確認でき次第反映します。MVがまだない曲は「このリストで練習」の連続再生には含まれません。"
            }
          ]
        }
      },
      // 公演場次：照日期排。同一個場館連續幾天會自動標成 Day 1、Day 2…
      // 開演後填實際歌單：
      //   songs  照曲順寫歌曲 ID；本站還沒收錄的歌寫成 { ja: "曲名" }
      //   encore 安可曲（寫法同 songs，沒有就留空）
      //   source 來源 { name: "…", url: "…" }（有可靠來源才填歌單，見 CLAUDE.md）
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
          songs: [],
          encore: [],
          source: null
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
          songs: [],
          encore: [],
          source: null
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
          songs: [],
          encore: [],
          source: null
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
          songs: [],
          encore: [],
          source: null
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
          songs: [],
          encore: [],
          source: null
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
          songs: [],
          encore: [],
          source: null
        }
      ],
      groups: [
        // 預熱歌單：照這個順序練（陣列順序就是頁面順序）。short 是書架標題，sub 一句話說明（只寫查證過的事實：官方公告或本站已有來源的資料）
        {
          id: "live-verified",
          short: { zh: "有固定應援", en: "Set chants", ja: "応援定着曲" },
          sub: {
            zh: "本站已用現場資料確認手燈色和應援的翻唱，先練這幾首。",
            en: "Covers whose lightstick colors and chants we've confirmed from live sources — start here.",
            ja: "ライブの情報でペンライト色と応援を確認済みのカバー。まずはここから。"
          },
          songs: ["unravel", "hibana", "anobando"]
        },
        {
          id: "album-2",
          short: { zh: "翻唱專輯 その２", en: "Album Vol. 2", ja: "アルバム その２" },
          sub: {
            zh: "《Adoの歌ってみたアルバム その２》2026/12/23 發行，官方預告約 10 首，這裡是已公布的 7 首。",
            en: "Utattemita Album Vol. 2, out Dec 23, 2026 — about 10 tracks planned; these are the 7 announced so far.",
            ja: "『Adoの歌ってみたアルバム その２』2026/12/23発売。全10曲程度のうち、発表済みの7曲。"
          },
          songs: ["kuchibashi", "fairytale", "unknownmothergoose", "mousoushikkan", "entersandman", "kawakiwoameku", "lagata"]
        },
        {
          id: "album-1",
          short: { zh: "翻唱專輯 第 1 張", en: "Album Vol. 1", ja: "アルバム 第1弾" },
          sub: {
            zh: "2023 年的《Adoの歌ってみたアルバム》，〈愛して愛して愛して〉〈罪と罰〉〈ヴィラン〉等曲在過去演唱會唱過。",
            en: "Utattemita Album (2023); Aishite, Tsumi to Batsu, Villain and others have been sung at past concerts.",
            ja: "2023年の『Adoの歌ってみたアルバム』。「愛して愛して愛して」「罪と罰」「ヴィラン」などは過去のライブで披露済み。"
          },
          songs: ["unravel", "aishite", "kamippoina", "tsumitobatsu", "burikino", "villain", "kawaikute", "kazarijanai", "dryflower", "hotaru"]
        },
        {
          id: "origin-and-hot",
          short: { zh: "YouTube 翻唱", en: "YouTube covers", ja: "YouTubeの歌ってみた" },
          sub: {
            zh: "沒收進翻唱專輯、在 YouTube 發表的歌ってみた，依發表日期由新到舊。",
            en: "Covers released on YouTube but not on either album, newest first.",
            ja: "アルバム未収録の、YouTubeで公開された歌ってみた。新しい順。"
          },
          // 想在縮圖左上角加註的標籤寫在 badges: { 歌曲ID: { zh, en, ja } }（要有來源的事實，不寫推測）
          songs: [
            "brain",
            "andjuly",
            "eaasou",
            "soldiergame",
            "ponpokorin",
            "catseye",
            "kitaro",
            "jikkai",
            "charles",
            "overdose",
            "darlingdance",
            "kiminotaion"
          ]
        }
      ]
    }
  ];

  return { TOURS };
});
