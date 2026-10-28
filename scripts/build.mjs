// 建置正式網站：複製檔案，並替每首歌做一頁 song/<id>/（有自己的標題、說明與分享資訊，Google 才收錄得到）；
// 歌詞拆成每首一個檔 lyrics/<id>.json，網頁打開哪首才載哪首
// 用法：node scripts/build.mjs [輸出資料夾，預設 dist]
// GitHub Actions 每次推到 main 都會跑這支，再發布到 GitHub Pages；平常改網站只要改 index.html、style.css、app.js、song-lyrics.js
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const SITE = "https://gcree.github.io/ado-guide/";
const NAME = "Ado 應援指南";
// Google Search Console 的 HTML 標記驗證碼（只放在首頁）；另外根目錄的 googlea6b361c7e6e7d11c.html 是 HTML 檔案驗證，兩個都不要刪
const GSC_VERIFY = "YLXviPdOfiLpoPdirdp39Tf7T0PrqSdDVMpdkZnxveg";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.resolve(process.argv[2] || path.join(root, "dist"));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const hash = text => createHash("sha1").update(text).digest("hex").slice(0, 8);
const css = read("style.css"), songsText = read("songs.js"), app = read("app.js"), karaokeSrc = read("karaoke-sources.js");
const require = createRequire(import.meta.url);
const LYRICS = require(path.join(root, "song-lyrics.js"));
const { SONGS, UT, PEN } = require(path.join(root, "songs.js"));

const PENC = {
  青: ["藍", "#5d9dfe"],
  水: ["水藍", "#5fd4ff"],
  白: ["白", "#f2efe8"],
  赤: ["紅", "#ff4a5a"],
  桃: ["粉紅", "#ff7ab8"],
  紫: ["紫", "#a374ff"],
  橙: ["橘", "#ff9a3c"],
  黄: ["黃", "#ffd84a"],
  緑: ["綠", "#4ee08a"]
};
const RAINBOW = [..."赤橙黄緑水青紫"];

const ACT_MAP = {
  sing:    { name: "大合唱",   icon: "i-sing",    how: "跟著一起唱" },
  clap:    { name: "拍手",     icon: "i-clap",    how: "跟著節拍拍手" },
  wave:    { name: "舉手揮動", icon: "i-wave",    how: "舉手左右揮" },
  jump:    { name: "跳躍",     icon: "i-jump",    how: "跟著節奏跳" },
  call:    { name: "喊聲",     icon: "i-call",    how: "跟著喊短句" },
  gesture: { name: "手勢",     icon: "i-gesture", how: "跟 Ado 做同樣的動作" },
  listen:  { name: "安靜聽",   icon: "i-listen",  how: "留給 Ado 唱" }
};

// 統整歌曲資料結構（與 app.js 邏輯完全一致）
SONGS.forEach(s => {
  if (s.sug || (!s.free && (!s.tips || !s.tips.length))) s.hold = true;
  if (s.hold) { s.acts = []; s.tips = []; }
  s.ut = UT[s.id] ? `https://www.uta-net.com/song/${UT[s.id]}/` : `https://www.uta-net.com/artist/29298/`;
  s.acts = s.acts || [];
  s.tips = s.tips || [];
  s.dur = s.len.split(":").reduce((a, b) => a * 60 + +b, 0);
});
SONGS.sort((a, b) => a.date.localeCompare(b.date)).forEach((s, i) => (s.no = i + 1));

function penOf(s) {
  const pen = !s.hold && PEN[s.id] && PEN[s.id][0] !== "?" && PEN[s.id];
  const keys = [...(pen || "青")];
  return {
    keys,
    none: !pen,
    text: !pen ? "藍色（官方未指定，建議切換為代表色藍色）" : keys.map(k => (k === "彩" ? "彩色" : (PENC[k] ? PENC[k][0] + "色" : k))).join("、"),
    shortText: !pen ? "藍（未指定）" : keys.map(k => (k === "彩" ? "彩色" : (PENC[k] ? PENC[k][0] : k))).join("、"),
    cols: keys.flatMap(k => (k === "彩" ? RAINBOW : [k]).map(c => PENC[c][1]))
  };
}

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const json = o => JSON.stringify(o).replace(/</g, "\\u003c");

function isoDuration(lenStr) {
  const [m, s] = lenStr.split(":").map(Number);
  return `PT${m}M${s}S`;
}

const icon = a => `<svg class="a-${a}" role="img" aria-label="${ACT_MAP[a]?.name || a}"><use href="#${ACT_MAP[a]?.icon || "i-sing"}"/></svg>`;

const penDots = s => {
  const p = penOf(s);
  return `<span class="dots" aria-label="螢光棒：${esc(p.shortText)}">${p.keys.map(k => (k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`)).join("")}</span>`;
};

function jaHTML(txt, sung = []) {
  const out = [], re = /([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g, hit = new Set();
  sung.forEach(w => {
    const i = txt.lastIndexOf(w);
    if (i >= 0) for (let j = i; j < i + w.length; j++) hit.add(j);
  });
  let kIndex = 0;
  const k = (i, html) => {
    const rot = (((kIndex * 7) % 15) - 7).toFixed(1) + "deg";
    out.push(`<span class="k${hit.has(i) ? " sung" : ""}" style="--i:${kIndex++};--rot:${rot}">${html}</span>`);
  };
  const chars = (str, at) => {
    for (const c of str) {
      k(at, esc(c));
      at += c.length;
    }
  };
  let last = 0, m;
  while ((m = re.exec(txt))) {
    chars(txt.slice(last, m.index), last);
    k(m.index, `<ruby>${esc(m[1])}<rt>${esc(m[2])}</rt></ruby>`);
    last = re.lastIndex;
  }
  chars(txt.slice(last), last);
  return out.join("");
}

// 每首一個歌詞檔（沒有歌詞的歌也放一個空的，網頁就不會讀到 404）；index.json 記每首的應援數量（有動作、不是「安靜聽」的行數）
const lyFiles = {}, lyIndex = {};
for (const s of SONGS) {
  const b = LYRICS.find(x => x.id === s.id), lines = (b && b.lyrics) || [];
  lyFiles[`lyrics/${s.id}.json`] = JSON.stringify({ ...(b || { id: s.id }), lyrics: lines });
  if (lines.length) lyIndex[s.id] = lines.filter(l => (l.acts || []).some(a => a !== "listen")).length;
}
lyFiles["lyrics/index.json"] = JSON.stringify(lyIndex);

// 版本字串：內容變了才換，瀏覽器才會抓新的（原始檔寫 ?v=dev）
const LYV = hash(Object.values(lyFiles).join("\n"));
const src = read("index.html")
  .replace("style.css?v=dev", `style.css?v=${hash(css)}`)
  .replace("songs.js?v=dev", `songs.js?v=${hash(songsText)}`)
  .replace("karaoke-sources.js?v=dev", `karaoke-sources.js?v=${hash(karaokeSrc)}`)
  .replace("app.js?v=dev", `app.js?v=${hash(app)}`)
  .replace('<html lang="zh-Hant-TW">', `<html lang="zh-Hant-TW" data-lyrics="${LYV}">`);

function page({ url, title, desc, ld, base, song, extra = "" }) {
  let html = src
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${song ? "music.song" : "website"}">`)
    .replace(/<!-- build:seo[^>]*-->/, [
      `<link rel="canonical" href="${url}">`,
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:site_name" content="${NAME}">`,
      `<meta property="og:locale" content="zh_TW">`,
      `<meta property="og:image" content="${SITE}assets/og.jpg">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(desc)}">`,
      `<meta name="twitter:image" content="${SITE}assets/og.jpg">`,
      `<script type="application/ld+json">${json(ld)}</script>`,
      extra
    ].filter(Boolean).join("\n"));
  if (base) html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<base href="${base}">`);
  if (song) html = html.replace('<html lang="zh-Hant-TW" ', `<html lang="zh-Hant-TW" data-song="${song.id}" `);
  return html;
}

const write = (rel, text) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
fs.rmSync(out, { recursive: true, force: true });

// ── 產生首頁（靜態預渲染歌曲清單，讓搜尋引擎與 AI 爬蟲能直接索引所有內部連結） ──
const usedActs = new Set(SONGS.flatMap(s => s.acts.filter(a => a !== "listen")));
const homeLegendHtml = Object.keys(ACT_MAP)
  .filter(a => usedActs.has(a))
  .map(a => `<span class="a-${a}">${icon(a)}${ACT_MAP[a].name}</span>`)
  .join("");

const homeSongListHtml = SONGS.map(s => {
  const sub = s.zh !== s.ja ? `<span class="zh">${esc(s.zh)}</span>` : "";
  const cover = s.cover ? '<span class="zh">翻唱</span>' : "";
  const dots = penDots(s);
  const tagx = !lyIndex[s.id] ? '<span class="tagx">只有重點</span>' : "";
  const acts = s.acts.filter(a => a !== "listen").map(icon).join("");
  return `<li><a class="song" href="song/${s.id}/" data-id="${s.id}"><span class="no">${String(s.no).padStart(2, "0")}</span><div class="name"><span class="ja" lang="ja">${esc(s.ja)}</span><div class="sub">${sub}${cover}${dots}<span>${s.len}</span>${tagx}</div></div><div class="acts">${acts}</div></a></li>`;
}).join("");

const homeLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}#website`,
      "name": NAME,
      "alternateName": ["Ado 應援預習", "ADO FAN CHANT GUIDE", "Ado 演唱會應援指南", "Ado 應援"],
      "url": SITE,
      "inLanguage": "zh-Hant-TW",
      "description": `非官方粉絲製作的 Ado 演唱會應援指南：收錄 ${SONGS.length} 首歌曲教學，看著 MV 跟同步歌詞，練哪裡拍手、哪裡大合唱、哪裡喊聲，還有每首手燈推薦顏色與藍牙手燈連動。`,
      "about": {
        "@type": "MusicGroup",
        "name": "Ado",
        "url": "https://www.youtube.com/@Ado1024",
        "sameAs": [
          "https://twitter.com/ado1024imokenp",
          "https://www.instagram.com/ado1024sweetadream/"
        ]
      }
    },
    {
      "@type": "ItemList",
      "@id": `${SITE}#songlist`,
      "name": "Ado 演唱會歌曲應援清單",
      "description": `Ado ${SONGS.length} 首歌曲的演唱會應援教學與同步歌詞`,
      "numberOfItems": SONGS.length,
      "itemListElement": SONGS.map((s, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "name": `Ado〈${s.ja}〉${s.zh !== s.ja ? `(${s.zh}) ` : ""}演唱會應援指南`,
        "url": `${SITE}song/${s.id}/`
      }))
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE}#faq`,
      "mainEntity": [
        {
          "@type": "Question",
          "name": "什麼是 Ado 應援指南？如何使用？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ado 應援指南是非官方粉絲製作的演唱會應援教學網站，收錄 74 首歌曲教學。包含官方 MV 同步歌詞、哪裡拍手、哪裡大合唱、哪裡喊聲，以及每首曲目的手燈推薦顏色與 PenlightSync 藍牙手燈連動功能。不照特定場次歌單，安心不暴雷。"
          }
        },
        {
          "@type": "Question",
          "name": "參加 Ado 演唱會手燈要調什麼顏色？沒有寫顏色的歌怎麼辦？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Ado 演唱會各曲目有不同的粉絲推薦螢光棒顏色，例如〈唱〉為橘黃色、〈うっせぇわ〉為藍紅色、〈FREEDOM〉為白藍色、〈新時代〉為彩桃色。如果不確定手燈顏色或現場來不及切換，切換為 Ado 的代表色「藍色」（迷ったら青）即可。"
          }
        },
        {
          "@type": "Question",
          "name": "演唱會應援有哪些主要動作種類？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "大合唱（sing）：跟隨 Ado 一起引吭高歌；拍手（clap）：隨鼓點或特定節奏擊掌；喊聲（call）：在間奏呼喊「Hey! Hey!」給予現場回應；舉手揮動（wave）：隨台上動作左右揮手燈；安靜聽（listen）：抒情曲目靜心欣賞 Ado 演唱。"
          }
        },
        {
          "@type": "Question",
          "name": "如何使用 PenlightSync 連動實體 Ado 官方手燈？",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "點擊首頁上方的「下載手燈連動」，下載安裝由社群開發的 PenlightSync 桌面應用程式（支援 Windows 及 macOS），透過藍牙連接 Ado 官方手燈後，手燈顏色即可隨著網站正在播放的歌曲即時自動變色。"
          }
        }
      ]
    }
  ]
};

let homeHtml = page({
  url: SITE,
  title: `${NAME}｜Ado 演唱會應援教學・同步歌詞・手燈顏色・大合唱預習`,
  desc: `非官方粉絲製作的 Ado 演唱會應援指南：收錄 ${SONGS.length} 首歌曲教學，看著 MV 跟同步歌詞，練哪裡拍手、哪裡大合唱、哪裡喊聲，還有每首手燈推薦顏色與藍牙手燈連動。不照特定場次歌單，安心不暴雷。`,
  ld: homeLd,
  extra: GSC_VERIFY && `<meta name="google-site-verification" content="${GSC_VERIFY}">`
});

homeHtml = homeHtml
  .replace('<ul class="songs" id="songList"></ul>', `<ul class="songs" id="songList">${homeSongListHtml}</ul>`)
  .replace('<p class="count" id="songCount"></p>', `<p class="count" id="songCount">共 ${SONGS.length} 首</p>`)
  .replace('<div class="legend" id="homeLegend" aria-label="圖示代表的動作"></div>', `<div class="legend" id="homeLegend" aria-label="圖示代表的動作">${homeLegendHtml}</div>`);

write("index.html", homeHtml);

// ── 產生各歌曲獨立頁面（完全靜態預渲染標題、應援重點、手燈顏色、歌詞與 JSON-LD 結構化資料） ──
const urls = [SITE];
for (let i = 0; i < SONGS.length; i++) {
  const s = SONGS[i];
  const prevSong = SONGS[i - 1] || null;
  const nextSong = SONGS[i + 1] || null;
  const b = LYRICS.find(x => x.id === s.id);
  const lines = (b && b.lyrics) || [];
  const hasLines = lines.length > 0;
  const pen = penOf(s);
  const name = s.zh && s.zh !== s.ja ? `${s.ja}（${s.zh}）` : s.ja;
  const tips = s.hold || s.sug ? [] : s.tips || [];
  const tipsSummaryText = tips.length
    ? `應援重點：${tips.join("；")}`
    : (s.free ? "這首歌沒有固定應援，現場自由跟隨節奏搖動手燈" : "應援資料整理中，先熟悉旋律並跟隨現場氣氛");
  const desc = `Ado〈${s.ja}〉${s.zh && s.zh !== s.ja ? `（${s.zh}）` : ""}演唱會現場應援指南：推薦手燈顏色為${pen.text}。${tipsSummaryText}。搭配官方 MV 與同步日中歌詞練習，非官方粉絲製作。`;
  const url = `${SITE}song/${s.id}/`;
  urls.push(url);

  const pageTitle = `Ado〈${s.ja}〉${s.zh && s.zh !== s.ja ? `（${s.zh}）` : (s.en ? `（${s.en}）` : "")} 演唱會應援指南與歌詞｜手燈顏色・大合唱・拍手教學`;

  const songLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        "url": url,
        "name": pageTitle,
        "description": desc,
        "inLanguage": "zh-Hant-TW",
        "isPartOf": { "@type": "WebSite", "@id": `${SITE}#website` },
        "breadcrumb": { "@id": `${url}#breadcrumb` }
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": NAME, "item": SITE },
          { "@type": "ListItem", "position": 2, "name": "全部歌曲", "item": `${SITE}#songs` },
          { "@type": "ListItem", "position": 3, "name": `〈${s.ja}〉應援指南`, "item": url }
        ]
      },
      {
        "@type": "MusicRecording",
        "@id": `${url}#song`,
        "name": s.ja,
        "alternateName": [s.zh, s.en].filter(x => x && x !== s.ja),
        "byArtist": {
          "@type": "MusicGroup",
          "name": "Ado",
          "url": "https://www.youtube.com/@Ado1024"
        },
        "datePublished": s.date,
        "duration": isoDuration(s.len),
        "url": url,
        "inLanguage": "ja",
        "video": {
          "@type": "VideoObject",
          "name": `Ado〈${s.ja}〉官方 MV`,
          "description": `Ado〈${s.ja}〉官方音樂錄影帶 MV`,
          "thumbnailUrl": `https://i.ytimg.com/vi/${s.yt}/hqdefault.jpg`,
          "embedUrl": `https://www.youtube-nocookie.com/embed/${s.yt}`,
          "uploadDate": s.date
        }
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        "mainEntity": [
          {
            "@type": "Question",
            "name": `Ado〈${s.ja}〉演唱會手燈推薦什麼顏色？`,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": `Ado〈${s.ja}〉演唱會推薦手燈顏色為：${pen.text}。若搭配 PenlightSync 桌面 App，可透過藍牙自動切換官方手燈顏色。`
            }
          },
          {
            "@type": "Question",
            "name": `Ado〈${s.ja}〉演唱會有什麼應援動作或大合唱？`,
            "acceptedAnswer": {
              "@type": "Answer",
              "text": tips.length ? tips.join("；") : (s.free ? "這首歌沒有固定應援，現場自由跟著節奏搖手燈即可。" : "這首歌應援資料整理中，先熟悉旋律並跟隨現場氣氛。")
            }
          }
        ]
      }
    ]
  };

  let songHtml = page({
    url,
    base: "../../",
    song: s,
    title: pageTitle,
    desc: cut(desc, 160),
    ld: songLd
  });

  // 靜態預渲染歌詞行與應援標記
  const mainAct = acts => acts.find(a => a !== "listen") || (acts.length ? "listen" : "");
  const lineAct = l => ((l.sing && l.sing.length) ? "sing" : mainAct((l.acts || []).filter(a => a !== "sing")) || mainAct(l.acts || []));
  let prerenderedLines = "";
  if (!lines.length) {
    prerenderedLines = `<div class="empty"><b>這首還沒有逐行時間軸</b>${s.tips.length ? `<ul class="summary">${s.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul><span>先邊看 MV 邊照上面的重點練。</span>` : "<span>應援還在整理，先看 MV 熟悉旋律，副歌跟著現場氣氛就好。</span>"}<span>歌詞請看<a href="${s.ut}" target="_blank" rel="noopener">歌ネット的正版歌詞頁</a>。</span></div>`;
  } else {
    prerenderedLines = lines.map((l, li) => {
      const m = lineAct(l);
      const acts = (s.hold ? [] : (l.acts || [])).filter(a => ACT_MAP[a] && a !== "listen");
      const sing = s.hold ? [] : (l.sing || []);
      const cls = "ln" + (m ? " a-" + m : "") + (acts.includes("sing") ? " sing" : "");
      const ja = l.jp ? jaHTML(l.jp, sing) : `<span class="ph">日文歌詞（${fmt(l.time || 0)}）</span>`;
      const zh = l.tr ? esc(l.tr) : (l.jp ? "" : `<span class="ph">中譯</span>`);
      let callHtml = "";
      if (l.call && !(li && lines[li - 1].call === l.call)) {
        if (l.call.includes("反拍")) {
          callHtml = `<span class="call call-offbeat"><svg class="ico-clap"><use href="#i-clap"/></svg><span class="call-txt">反拍拍手</span><span class="call-rhythm"><b>空</b><i>拍</i><b>空</b><i>拍</i></span></span>`;
        } else {
          callHtml = `<span class="call">${esc(l.call)}</span>`;
        }
      }
      return `<div class="${cls}" tabindex="0"><div class="ja" lang="ja">${ja}</div>${zh ? `<div class="zh">${zh}</div>` : ""}<div class="acts">${acts.map(icon).join("")}</div>${callHtml}</div>`;
    }).join("");
  }

  const subTitleHtml = s.zh !== s.ja ? `<span lang="zh-Hant-TW">${esc(s.zh)}</span>` : (s.en ? `<span lang="en">${esc(s.en)}</span>` : "");
  const cueHowText = s.free
    ? "沒有固定應援，跟著現場氣氛就好。"
    : (s.hold ? "先熟悉旋律，跟著現場氣氛就好。" : (lines.length ? "播放後，這裡會顯示現在要做的動作。" : "這首還沒有逐行時間軸，照歌詞欄的重點練。"));

  const cardHtml = `<section class="song-guide-card" id="songGuideCard" aria-label="歌曲應援速覽"><h3 class="card-title">〈<span id="cardJa">${esc(s.ja)}${s.zh !== s.ja ? `（${esc(s.zh)}）` : ""}</span>〉應援速覽</h3><dl class="card-dl"><dt>推薦手燈</dt><dd id="cardPen">${esc(pen.text)}</dd><dt>應援重點</dt><dd id="cardTips">${esc(tips.length ? tips.join("；") : (s.free ? "沒有固定應援，自由跟著節奏搖手燈。" : "應援還在整理，先熟悉旋律。"))}</dd><dt>官方 MV</dt><dd><a id="cardYt" href="https://www.youtube.com/watch?v=${s.yt}" target="_blank" rel="noopener">在 YouTube 開啟 ↗</a></dd></dl></section>`;

  // 轉換歌曲頁面的 HTML：預設展示歌曲 view，隱藏 home view，並將標題、螢光棒、歌詞填入靜態標籤
  songHtml = songHtml
    .replace('<body>', '<body class="on-song">')
    .replace('<div class="view home" id="home">', '<div class="view home" id="home" hidden>')
    .replace('<div class="view" id="song" hidden>', '<div class="view" id="song">')
    .replace('<h1 id="sTitle" lang="ja"></h1>', `<h1 id="sTitle" lang="ja">${esc(s.ja)}${subTitleHtml}</h1>`)
    .replace('<span class="pen" id="pen"></span>', `<span class="pen" id="pen">螢光棒${penDots(s)}<b>${esc(pen.shortText)}</b></span>`)
    .replace('<div class="how" id="cueHow"></div>', `<div class="how" id="cueHow">${esc(cueHowText)}</div>`)
    .replace('<ul class="summary" id="cueSummary"></ul>', `<ul class="summary" id="cueSummary">${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`)
    .replace('<div id="lines"></div>', `<div id="lines">${prerenderedLines}</div>`)
    .replace(/<section class="song-guide-card" id="songGuideCard"[^>]*>[\s\S]*?<\/section>/, cardHtml);

  if (tips.length > 0) {
    songHtml = songHtml
      .replace('<details class="vopt tips-opt" id="tipsOpt" hidden>', '<details class="vopt tips-opt" id="tipsOpt">')
      .replace('<ul class="summary" id="tipsSummary"></ul>', `<ul class="summary" id="tipsSummary">${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`);
  }

  // 上一首／下一首連結預渲染
  if (prevSong) {
    songHtml = songHtml.replace('<a class="ib" id="prevSong" aria-label="上一首">', `<a class="ib" id="prevSong" href="song/${prevSong.id}/" data-id="${prevSong.id}" aria-label="上一首：${esc(prevSong.ja)}">`);
  }
  if (nextSong) {
    songHtml = songHtml.replace('<a class="ib" id="nextSong" aria-label="下一首">', `<a class="ib" id="nextSong" href="song/${nextSong.id}/" data-id="${nextSong.id}" aria-label="下一首：${esc(nextSong.ja)}">`);
  }

  write(`song/${s.id}/index.html`, songHtml);
}

// 找不到的網址回首頁
write("404.html", `<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="robots" content="noindex"><title>找不到這一頁｜${NAME}</title><meta http-equiv="refresh" content="0;url=${SITE}"><p>找不到這一頁，<a href="${SITE}">回 ${NAME} 首頁</a>。</p></html>\n`);

// 網站地圖
const today = new Date().toISOString().slice(0, 10);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (u, idx) =>
        `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${idx === 0 ? "1.0" : "0.8"}</priority>\n  </url>`
    )
    .join("\n")}\n</urlset>\n`
);

// ── 產生給 AI Agents / LLMs 的標準說明文件 (llms.txt 與 llms-full.txt) ──
function generateLlmsTxt() {
  const lines = [
    `# Ado 應援指南 (Ado Concert Fan Chant & Penlight Guide)`,
    ``,
    `> 非官方粉絲製作的 Ado 演唱會應援指南網站：收錄 ${SONGS.length} 首歌曲的現場應援教學、官方 MV 同步日中歌詞、推薦手燈螢光棒顏色、拍手段落與大合唱重點。不依照任何單一場次的歌單，安心預習不暴雷。`,
    ``,
    `網站首頁：${SITE}`,
    `完整歌詞與應援全文檔：${SITE}llms-full.txt`,
    ``,
    `## 全場演唱會通用原則`,
    `1. **手燈顏色通則（迷ったら青）**：如果歌曲未指定螢光棒顏色、或現場來不及更換，請切換至 Ado 的代表色「藍色」。`,
    `2. **抒情歌安靜聽**：標記為「安靜聽」的抒情曲目，請靜心欣賞 Ado 的歌聲，不要在曲中突兀大喊以維護觀賞品質。`,
    `3. **應援動作種類**：`,
    `   - 大合唱 (sing)：全場觀眾在特定段落跟隨 Ado 一起引吭高歌。`,
    `   - 拍手 (clap)：隨鼓點或指定拍點擊掌（如 FREEDOM / 逆光的固定拍手節奏）。`,
    `   - 呼喊 (call)：在間奏或喊口號時喊「Hey! Hey!」給予現場回應。`,
    `   - 舉手揮動 (wave)：跟隨 Ado 動作舉起手燈左右擺動。`,
    `   - 跳躍 (jump)：間奏或副歌特定小節跳躍。`,
    `   - 手勢 (gesture)：跟隨 Ado 在台上的招牌手勢動作。`,
    `   - 安靜聽 (listen)：留給 Ado 唱，全場專心聆聽。`,
    ``,
    `## 歌曲應援與手燈顏色索引表`,
    `| 編號 | 日文歌名 | 中文歌名 | 英文歌名 | 推薦手燈顏色 | 應援動作 | 頁面連結 |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`
  ];

  for (const s of SONGS) {
    const pen = penOf(s);
    const acts = s.acts.map(a => ACT_MAP[a]?.name || a).join("、") || "自由跟隨節奏";
    lines.push(`| ${String(s.no).padStart(2, "0")} | ${s.ja} | ${s.zh} | ${s.en || "-"} | ${pen.shortText} | ${acts} | ${SITE}song/${s.id}/ |`);
  }

  lines.push(``, `## 歌曲應援重點速覽`, ``);

  for (const s of SONGS) {
    const pen = penOf(s);
    const tips = s.tips.length ? s.tips.join("；") : (s.free ? "沒有固定應援，自由跟著節奏搖手燈。" : "應援資料整理中，先熟悉旋律。");
    lines.push(
      `### [${s.ja}${s.zh !== s.ja ? `（${s.zh}）` : ""}](${SITE}song/${s.id}/)`,
      `- **發行日期**：${s.date}`,
      `- **推薦手燈顏色**：${pen.text}`,
      `- **官方 MV**：https://www.youtube.com/watch?v=${s.yt} (${s.len})`,
      `- **應援重點**：${tips}`,
      ``
    );
  }

  return lines.join("\n") + "\n";
}

function generateLlmsFullTxt() {
  const lines = [
    `# Ado 演唱會應援指南：完整知識庫 (Ado Fan Chant Guide - Full Knowledge Base)`,
    ``,
    `> 本檔案提供 AI Agents 與 LLM 爬蟲最完整、無歧義的 Ado 演唱會應援資料庫，包含 ${SONGS.length} 首歌曲的元資料、應援指南、手燈顏色與同步日中雙語歌詞。`,
    ``,
    `網站首頁：${SITE}`,
    ``
  ];

  for (const s of SONGS) {
    const pen = penOf(s);
    const b = LYRICS.find(x => x.id === s.id);
    const songLines = (b && b.lyrics) || [];
    const tips = s.tips.length ? s.tips.join("；") : (s.free ? "沒有固定應援，自由跟隨現場節奏。" : "應援資料整理中，先熟悉旋律。");

    lines.push(
      `---`,
      `## ${String(s.no).padStart(2, "0")}. Ado〈${s.ja}〉${s.zh !== s.ja ? `（${s.zh}）` : ""}${s.en ? ` / ${s.en}` : ""}`,
      `- 頁面網址：${SITE}song/${s.id}/`,
      `- 發行日期：${s.date}`,
      `- 歌曲長度：${s.len}`,
      `- 推薦手燈顏色：${pen.text}`,
      `- 應援動作：${s.acts.map(a => ACT_MAP[a]?.name || a).join("、") || "自由跟隨節奏"}`,
      `- 應援重點指南：${tips}`,
      `- 官方 MV 連結：https://www.youtube.com/watch?v=${s.yt}`,
      `- 正版歌詞連結：${s.ut}`,
      ``
    );

    if (songLines.length) {
      lines.push(`### 〈${s.ja}〉同步歌詞與應援標註`);
      for (const l of songLines) {
        const t = fmt(l.time || 0);
        const jp = l.jp || "";
        const tr = l.tr ? ` (${l.tr})` : "";
        const acts = (l.acts || []).filter(a => a !== "listen").map(a => ACT_MAP[a]?.name || a).join(", ");
        const sing = l.sing && l.sing.length ? ` [觀眾合唱: ${l.sing.join(", ")}]` : "";
        const call = l.call ? ` [喊聲: ${l.call}]` : "";
        const badge = (acts || sing || call) ? ` 【${[acts, sing, call].filter(Boolean).join(" ")}】` : "";
        lines.push(`- [${t}] ${jp}${tr}${badge}`);
      }
      lines.push(``);
    }
  }

  return lines.join("\n") + "\n";
}

write("llms.txt", generateLlmsTxt());
write("llms-full.txt", generateLlmsFullTxt());

for (const [f, text] of Object.entries(lyFiles)) write(f, text);

// 其他檔案原樣複製（song-lyrics.js 留著給還開著舊版網頁的人）
for (const f of [
  "style.css",
  "songs.js",
  "app.js",
  "karaoke-sources.js",
  "song-lyrics.js",
  "CHANGELOG.md",
  "manifest.webmanifest",
  "googlea6b361c7e6e7d11c.html",
  "robots.txt"
]) {
  const srcPath = path.join(root, f);
  if (fs.existsSync(srcPath)) fs.copyFileSync(srcPath, path.join(out, f));
}
fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), { recursive: true });

console.log(`輸出到 ${out}：首頁＋${SONGS.length} 首歌頁、${Object.keys(lyIndex).length} 首歌詞檔、sitemap.xml、robots.txt、llms.txt、llms-full.txt、404.html`);
