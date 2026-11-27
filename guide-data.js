// 演唱會新手須知＆全曲手燈顏色（guide/）的三語文案
// 只放這一頁的文字；手燈顏色表的歌、顏色、曲數一律由 scripts/build.mjs 從 songs.js 算，不要在這裡寫死歌名或數字
// 找歌、篩選、測驗交給首頁；這一頁只做「現場規定＋全曲手燈顏色＋常見問題」，版面原則見 scripts/build.mjs 的 guide/ 段落
// 規則照 rules 陣列的順序顯示；warn: true 是一定要遵守的禁止事項，排最前面、加紅色標記
// 用 **字** 包起來的是嚴重的禁止字眼（禁止、不能、不行），畫面上顯示成紅字；<title>、description、結構化資料、本頁導覽會拿掉 **
// 文字裡的 {must}（必練曲名單）、{mustN}、{covers}、{songs}、{all}（首頁全部曲數）、{n}（色數）由建置時代入
// 規則類的內容（手燈、攝影、望遠鏡、Dress Code）每場可能不同，畫面上一律提醒以官方公告為準
// 中文照站上其他頁的口氣寫：短句、白話、台灣用語（中控、手燈、應援、練），不要寫成行銷文案
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ADO_GUIDE = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const GUIDE = {
    id: "guide",
    // 頁面內容實際改動的日期（sitemap lastmod、結構化資料 dateModified）；改文案時一起更新
    updated: "2026-11-27",
    copy: {
      zh: {
        title: "Ado 演唱會新手須知＆全曲手燈顏色｜禁止事項與中控",
        desc: "第一次去 Ado 演唱會先看這頁：場內全程禁止拍照錄影、不能帶望遠鏡、官方手燈中控和藍色玫瑰 Dress Code，再附上每首歌的手燈顏色。",
        shortName: "新手須知＆手燈顏色",
        badge: "第一次去演唱會",
        h1: "Ado 演唱會新手須知＆手燈顏色",
        lead: "第一次參加 Ado 演唱會？出發前先看過下面幾條現場規定，再對照每首歌的手燈顏色。應援不用全部背熟，跟著 Ado 的帶動和周圍氣氛就好。",
        nav: "本頁導覽",
        mapLabel: "這頁有什麼",
        rulesTitle: "現場規定",
        rulesCount: "{0} 條",
        warnTag: "禁止",
        rulesNote: "各場規定可能略有不同，出發前請再確認該場官方網站與票券上的注意事項。",
        rules: [
          {
            id: "rule-photo",
            warn: true,
            title: "場內**禁止**拍照、錄音、錄影",
            body: "從進場到散場全程**不能拍**，開演前拍座位或空舞台也**不行**，被工作人員發現會立即制止。",
            points: ["進場前手機轉靜音並收進包包", "想拍照留念，請到場外拍看板或布置"]
          },
          {
            id: "rule-binoculars",
            warn: true,
            title: "**不能**帶望遠鏡",
            body: "由於 Ado 不公開長相，演唱會注意事項明文**禁止攜帶與使用望遠鏡**。",
            points: ["雙筒、單筒、看劇用的小望遠鏡都**不行**，直接不要帶"]
          },
          {
            id: "rule-penlight",
            title: "官方手燈有中控，不用自己切",
            body: "近年巡演常指定使用最新款官方手燈（如「大進化！割とデカいかも？！キラキラペンライト」）。開演前以官方 App 綁定座位後，場內會由中控統一變色。",
            points: ["常見規格為 3 顆 4 號（AAA）鹼性電池，建議多帶一組備用", "務必套上手繩，揮舞時才不會甩飛", "沒開中控時，可照下方手燈顏色切換，或跟著周圍觀眾就好"]
          },
          {
            id: "rule-dresscode",
            title: "Dress Code「藍色玫瑰」",
            body: "官方慣例會鼓勵穿搭帶點藍色或玫瑰元素（藍色服飾、玫瑰飾品等），但並非強制規定，穿得輕鬆好活動最重要。",
            points: ["演出過程多數時間會站著，建議穿好走的鞋", "避免過大的帽子或頭飾，以免擋到後方觀眾視線"]
          },
          {
            id: "rule-etiquette",
            title: "應援跟著 Ado 及現場人員",
            body: "不用把所有口號都背起來，Ado 帶動的時候一起喊、一起拍手就好。也可以跟著周遭的人一起，曲中切記不要突兀大喊。",
            points: ["喊聲與拍手留在間奏和 Ado 帶動的段落", "手燈別長時間舉過頭頂，避免擋住後排視線"]
          }
        ],
        colorsTitle: "全曲手燈顏色",
        colorsCount: "{n} 色・{songs} 首",
        colorsSub: "整理目前已有現場資料的曲目代表色；沒開中控時可照這裡切，點任一歌名就能直接開 MV 練應援。",
        mustTag: "必練",
        legendMust: "必練曲",
        legendDots: "小色點：這首還會用到的其他顏色",
        songsN: "{0} 首",
        noneName: "未指定",
        noneHint: "跟著中控或舞台燈光",
        colorsNote: "用到多種顏色的歌會放在第一個主色那一列。顏色為粉絲整理的現場推薦，並非官方指定；有開中控時一切以中控為準，尚無現場資料的歌不會列入。",
        ctaHome: "到首頁挑歌練（{all} 首）",
        faqTitle: "常見問題",
        faqCount: "{0} 題",
        faqs: [
          { q: "沒買到官方手燈怎麼辦？", a: "要看該場主辦單位的說明：如果沒有限制手燈款式，可以使用市售通用手燈，或是 Ado 以往出過的官方手燈（中控時再跟著周圍換色）；但如果明文限定只能使用「大進化！割とデカいかも？！キラキラペンライト」，就需要另外購入。沒有手燈也沒關係，空手拍手一樣能盡興參與。" },
          { q: "忘記某首歌的手燈顏色怎麼辦？", a: "有開中控的話官方手燈會自動變色，完全不用記；沒開中控就看舞台燈光或跟著旁邊的人換色就好。開演後把手機收好，專心享受現場最重要。" },
          { q: "第一次去要先練哪幾首？", a: "建議先練首頁標「必練」的 {mustN} 首：{must}。這幾首演唱會出現頻率高，拍手、喊聲、大合唱也最多，練熟後大多數曲目都能輕鬆跟上。" },
          { q: "可以帶望遠鏡、用手機拍嗎？", a: "**不行**。Ado 的演唱會**禁止**攜帶與使用望遠鏡；場內從進場到散場全程**禁止**拍照、錄音、錄影，開演前拍空舞台也**不行**。詳細規定請以各場官方公告為準。" },
          { q: "演唱會也會唱翻唱嗎？", a: "會。Ado 的演唱會常穿插翻唱曲，2027 年的「歌ってみた」巡迴更是以翻唱為主。這頁收錄了 {covers} 首已確認應援的翻唱，更多翻唱曲目可以到 2027 翻唱巡迴預習頁查看。" },
          { q: "這頁的手燈顏色是官方的嗎？", a: "不是。這是粉絲整理的推薦顏色，原創曲主要參考じゅん🌝ぴ在 note 上的整理。現場有開中控時以中控為準；尚無現場資料、僅屬推測的顏色不會放上來。" }
        ],
        toTour: "看 2027 翻唱巡迴預習",
        // 其他頁面導過來的連結文字
        linkFoot: "新手須知＆手燈顏色",
        linkHome: "第一次去演唱會？先看新手須知和手燈顏色",
        linkTour: "看演唱會新手須知和手燈顏色",
        llms: "演唱會新手須知與全曲手燈顏色"
      },
      en: {
        title: "Ado Concert Beginner Guide & Lightstick Color Cheat Sheet",
        desc: "First Ado concert? The rules that matter (no photos, no binoculars, penlight sync, blue-rose dress code) plus the penlight color for every song.",
        shortName: "Beginner Guide & Colors",
        badge: "First concert",
        h1: "Ado Concert Beginner Guide & Lightstick Colors",
        lead: "Heading to your first Ado concert? Check the venue rules below, then browse each song's penlight color. You don't need to memorize every chant — just follow Ado and the crowd.",
        nav: "On this page",
        mapLabel: "Page overview",
        rulesTitle: "Venue Rules",
        rulesCount: "{0} rules",
        warnTag: "Banned",
        rulesNote: "Rules can vary by show. Double-check the official website and your ticket guidelines before you go.",
        rules: [
          {
            id: "rule-photo",
            warn: true,
            title: "**No** photos, audio or video",
            body: "Strictly **not allowed** from entry to exit — even photos of your seat or the empty stage before the show are **banned**, and staff will intervene.",
            points: ["Silence your phone and keep it tucked in your bag", "Take souvenir photos at the signage or displays outside the hall"]
          },
          {
            id: "rule-binoculars",
            warn: true,
            title: "**No** binoculars",
            body: "Ado keeps her face private, so concert guidelines strictly **ban bringing or using binoculars**.",
            points: ["Binoculars, monoculars and opera glasses are **all banned** — leave them at home"]
          },
          {
            id: "rule-penlight",
            title: "Official penlight: central control handles the colors",
            body: "Recent tours often specify the latest official model (such as “Daishinka! Warito Dekai kamo?! Kirakira Penlight”). Pair it to your seat in the official app before doors, and venue wireless control will sync its colors automatically.",
            points: ["Usually takes 3 AAA alkaline batteries — bring a spare set", "Loop the wrist strap on so it can't slip out", "When central control is off, switch using the colors below or match the crowd"]
          },
          {
            id: "rule-dresscode",
            title: "Dress code: blue roses",
            body: "Fans traditionally wear a touch of blue or a rose motif — a blue outfit, rose hair clip or small accessory. It's completely optional, so wear whatever feels comfortable.",
            points: ["You'll be standing most of the show, so wear comfortable shoes", "Skip tall hats or large headpieces that block people behind you"]
          },
          {
            id: "rule-etiquette",
            title: "Follow Ado, staff & the crowd",
            body: "You don't need every chant memorized — clap and call out when Ado leads, or simply follow the people around you. Avoid shouting abruptly in the middle of songs.",
            points: ["Save calls and claps for interludes and the moments Ado cues", "Avoid holding your penlight above your head for long stretches"]
          }
        ],
        colorsTitle: "Penlight Colors for Every Song",
        colorsCount: "{n} colors · {songs} songs",
        colorsSub: "Confirmed live colors for every documented song. Switch to these when central control is off, or tap any title to practice with its MV.",
        mustTag: "must-learn",
        legendMust: "Must-learn song",
        legendDots: "Small dots: the song's other colors",
        songsN: "{0} songs",
        noneName: "Unspecified",
        noneHint: "Follow central control or the stage lights",
        colorsNote: "Multi-color songs are grouped under their primary color. Colors are fan-compiled recommendations, not official rules; follow central control whenever active. Songs without live data yet are omitted.",
        ctaHome: "Pick songs to practice ({all})",
        faqTitle: "FAQ",
        faqCount: "{0} questions",
        faqs: [
          { q: "What if I don't have the official penlight?", a: "Check the organizer's rules for your show. If there is no model restriction, you can bring a generic color-changing penlight or a previous official Ado penlight (and match the crowd during central control). If the show restricts attendees strictly to “Daishinka! Warito Dekai kamo?! Kirakira Penlight” (大進化！割とデカいかも？！キラキラペンライト), you will need to buy that model — or simply enjoy the show clapping along without one." },
          { q: "What if I forget a song's penlight color?", a: "With central control on, the official penlight switches automatically so there's nothing to memorize. Without it, just follow the stage lighting or the people around you and keep your phone put away during the show." },
          { q: "Which songs should I learn first?", a: "Start with the {mustN} must-learn songs on the home page: {must}. They appear most often on setlists and have the most claps, calls and sing-alongs." },
          { q: "Can I bring binoculars or film on my phone?", a: "**No.** Ado's concerts **ban** bringing and using binoculars, and photos, audio and video are **banned** from entry to exit — even of the empty stage before the show. Check each show's official notice for details." },
          { q: "Does Ado sing covers at concerts?", a: "Yes. Ado regularly includes covers, and the 2027 Utattemita tour centers on them. This page lists {covers} covers with confirmed chants; check the 2027 cover tour prep page for the rest." },
          { q: "Are these penlight colors official?", a: "No. They are fan recommendations, mainly based on Jun's notes on note.com for original songs. Follow central control whenever it's active; predicted colors without live data are not listed." }
        ],
        toTour: "2027 cover tour prep",
        linkFoot: "Beginner guide & penlight colors",
        linkHome: "First concert? Read the beginner guide and penlight colors",
        linkTour: "Read the concert beginner guide and penlight colors",
        llms: "Concert beginner guide & penlight colors"
      },
      ja: {
        title: "Ado ライブ初心者ガイド＆ペンライト色早見表｜ルール・無線制御",
        desc: "初めての Ado ライブで押さえたい撮影禁止・双眼鏡禁止・公式ペンライトの無線制御・青い薔薇ドレスコードと、全曲のペンライト色。",
        shortName: "初心者ガイド＆ペンライト色",
        badge: "初めてのライブ",
        h1: "Ado ライブ初心者ガイド＆ペンライト色早見表",
        lead: "初めての Ado ライブなら、出発前に下の会場ルールを押さえて、曲ごとのペンライト色をチェックしておきましょう。応援は全部覚えなくても、Ado の煽りと周りの空気に合わせれば大丈夫。",
        nav: "このページの目次",
        mapLabel: "このページの内容",
        rulesTitle: "会場ルール",
        rulesCount: "{0}項目",
        warnTag: "禁止",
        rulesNote: "公演ごとに細かな規定が異なる場合があります。出発前に公式サイトとチケットの注意事項を必ず確認してください。",
        rules: [
          {
            id: "rule-photo",
            warn: true,
            title: "撮影・録音・録画は**禁止**",
            body: "入場から退場まで一切**撮影できません**。開演前の座席や無人のステージも**NG**で、見つかるとスタッフに制止されます。",
            points: ["入場前にスマホはマナーモードにしてカバンへ", "記念撮影は会場外の看板やフォトスポットで"]
          },
          {
            id: "rule-binoculars",
            warn: true,
            title: "双眼鏡は**持ち込み禁止**",
            body: "Ado は顔を公開していないため、ライブの注意事項で**双眼鏡の持ち込み・使用が禁止**されています。",
            points: ["双眼鏡・単眼鏡・オペラグラスは**すべてNG**。持参しないのが確実です"]
          },
          {
            id: "rule-penlight",
            title: "公式ペンライトは無線制御で自動",
            body: "近年のツアーでは最新公式モデル（「大進化！割とデカいかも？！キラキラペンライト」など）が指定される傾向があります。開演前に公式アプリで座席登録すると、本番中は無線制御で自動的に色が変わります。",
            points: ["単4形アルカリ電池3本を使うものが多いため、予備を持参すると安心", "ストラップを手首に通し、振った拍子に飛ぶのを防止", "無線制御がない場面では下のペンライト色や周りに合わせて切り替え"]
          },
          {
            id: "rule-dresscode",
            title: "ドレスコード「青い薔薇」",
            body: "青いアイテムや薔薇モチーフ（青い服、薔薇のヘアアクセや小物など）を取り入れるのが定番ですが、強制ではありません。動きやすい服装がいちばん。",
            points: ["立っている時間が長いため歩きやすい靴がおすすめ", "大きな髪飾りや帽子は後ろの人の視界を遮るので控えめに"]
          },
          {
            id: "rule-etiquette",
            title: "応援は Ado や会場の流れに合わせて",
            body: "コールをすべて暗記する必要はありません。Ado が煽ったときに一緒に声を出したり手拍子したり、周りの人に合わせて楽しむだけでOK。曲中に唐突な大声を出すのは控えましょう。",
            points: ["コールや手拍子は間奏や Ado が合図したところで", "ペンライトを頭上に掲げ続けると後列の視界を遮ります"]
          }
        ],
        colorsTitle: "全曲ペンライト色",
        colorsCount: "{n}色・{songs}曲",
        colorsSub: "ライブで確認できている曲ごとのイメージカラー一覧です。無線制御がないときの参考に、曲名をタップするとそのまま MV で練習できます。",
        mustTag: "必修",
        legendMust: "必修曲",
        legendDots: "小さな点：その曲で使うほかの色",
        songsN: "{0}曲",
        noneName: "指定なし",
        noneHint: "無線制御か照明に合わせて",
        colorsNote: "複数の色を使う曲は最初の主色の欄にまとめています。ファン有志の非公式おすすめなので、無線制御があるときは制御に従ってください。ライブ情報がまだない曲は載せていません。",
        ctaHome: "トップで曲を選んで練習（{all}曲）",
        faqTitle: "よくある質問",
        faqCount: "{0}問",
        faqs: [
          { q: "公式ペンライトを買えなかったら？", a: "各公演の主催者案内を確認してください。機種の制限がない公演なら、市販の汎用ペンライトや過去の公式ペンライトでも使えます（無線制御中は周りの色に合わせて）。一方、「大進化！割とデカいかも？！キラキラペンライト」のみ使用可と指定されている公演では、対象モデルの購入が必要です。ペンライトがなくても手拍子で十分楽しめます。" },
          { q: "曲のペンライト色を忘れたら？", a: "無線制御があれば公式ペンライトが自動で変わるので覚える必要はありません。制御がないときもステージ照明や周りに合わせれば大丈夫。公演中はスマホをしまってライブに集中しましょう。" },
          { q: "初めての Ado ライブ、まずどの曲を練習すればいい？", a: "まずはトップページで「必修」マークの{mustN}曲：{must}。披露される機会が多く、手拍子・コール・合唱も充実しているので、押さえておくと本番で乗りやすくなります。" },
          { q: "双眼鏡やスマホでの撮影はできる？", a: "**できません**。Ado のライブは双眼鏡の持ち込み・使用が**禁止**で、場内は入場から退場まで撮影・録音・録画**禁止**。開演前の無人ステージも撮れません。詳しくは各公演の公式案内を確認してください。" },
          { q: "カバー曲もライブで歌われる？", a: "歌われます。Ado のライブではカバーもよく披露され、2027 年の「歌ってみたツアー」はカバー中心です。このページには応援が確認できているカバー{covers}曲を掲載、そのほかは2027 歌ってみたツアー予習ページをご覧ください。" },
          { q: "このページのペンライト色は公式？", a: "公式ではありません。ファンがまとめたおすすめの色で、オリジナル曲は主にじゅん🌝ぴさんの note のまとめをもとにしています。無線制御があるときはそちらに従ってください。ライブでの情報がない予想の色は載せていません。" }
        ],
        toTour: "2027 歌ってみたツアー予習へ",
        linkFoot: "初心者ガイド＆ペンライト色",
        linkHome: "初めてのライブなら、初心者ガイドとペンライト色へ",
        linkTour: "ライブ初心者ガイドとペンライト色を見る",
        llms: "ライブ初心者ガイド＆ペンライト色早見表"
      }
    }
  };

  return { GUIDE };
});
