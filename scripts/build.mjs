// 建置正式網站：複製檔案，並替每首歌做一頁 song/<id>/（有自己的標題、說明與分享資訊，Google 才收錄得到）；
// 歌詞拆成每首一個檔 lyrics/<id>.json，網頁打開哪首才載哪首
// 三種語言：中文在根目錄、英文在 en/、日文在 jp/；介面文字以中文原文當 key 查 i18n.js（英文版歌詞下面放羅馬拼音 song-romaji.json）
// 用法：node scripts/build.mjs [輸出資料夾，預設 dist]
// GitHub Actions 每次推到 main 都會跑這支，再發布到 GitHub Pages；平常改網站只要改 index.html、style.css、app.js、song-lyrics.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const SITE = "https://ado.kuti.cc/";
// 站長的 Threads：結構化資料的 sameAs 和頁尾連結都用這個，讓 Google 知道網站和帳號是同一個來源
const THREADS = "https://www.threads.com/@kiut._no";
const INSTAGRAM = "https://www.instagram.com/ku.n3c/";
// Google Search Console 的 HTML 標記驗證碼（只放在中文首頁）；另外根目錄的 googlea6b361c7e6e7d11c.html 是 HTML 檔案驗證，兩個都不要刪
const GSC_VERIFY = "YLXviPdOfiLpoPdirdp39Tf7T0PrqSdDVMpdkZnxveg";
// Google Analytics 4 評估 ID（若有 ID 請替換成自己的 G-XXXXXXXXXX，留空 "" 則不載入 GA）
const GA_ID = "G-HF9BLBHBL4";

// 語言：dir 是網址前綴；hreflang 給搜尋引擎分辨語言；網址用 jp/，語言代碼照標準寫 ja
const LANGS = [
  { code: "zh", dir: "", html: "zh-Hant-TW", hreflang: "zh-Hant", og: "zh_TW", name: "Ado 應援指南" },
  { code: "en", dir: "en/", html: "en", hreflang: "en", og: "en_US", name: "Ado Fan Chant Guide" },
  { code: "ja", dir: "jp/", html: "ja", hreflang: "ja", og: "ja_JP", name: "Ado 応援ガイド" }
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] || path.join(root, "dist"));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const hash = text => createHash("sha1").update(text).digest("hex").slice(0, 8);
// 分享預覽圖加上內容雜湊，換圖後 LINE／Facebook／X 會重新抓，不會一直顯示舊圖
const OG_IMG = `${SITE}assets/og.jpg?v=${createHash("sha1").update(fs.readFileSync(path.join(root, "assets/og.jpg"))).digest("hex").slice(0, 8)}`;
const css = read("style.css"), songsText = read("songs.js"), app = read("app.js"), karaokeSrc = read("karaoke-sources.js"), liveLyricsText = read("song-lyrics-live.js");
const require = createRequire(import.meta.url);
const LYRICS = require(path.join(root, "song-lyrics.js"));
const LYRICS_LIVE = require(path.join(root, "song-lyrics-live.js"));
const { SONGS, UT, PEN } = require(path.join(root, "songs.js"));
const I18N = require(path.join(root, "i18n.js"));
// 羅馬拼音：GitHub Actions 建置前用 tools/romaji/romaji.mjs 產生；沒有的話英文版歌詞下面就不放
const ROMAJI = fs.existsSync(path.join(root, "song-romaji.json")) ? JSON.parse(read("song-romaji.json")) : {};

// 翻譯：查不到的字記下來，建置最後列出來（畫面會先顯示中文）
const missing = { en: new Set(), ja: new Set() };
const makeT = code => (src, ...args) => {
  let v = src;
  if (code !== "zh") {
    const d = (I18N[code] || {})[src];
    if (d === undefined) missing[code].add(src); else v = d;
  }
  return v.replace(/\{(\d+)\}/g, (_, i) => args[i]);
};

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

function penOf(s, T = makeT("zh")) {
  const pen = !s.hold && PEN[s.id] && PEN[s.id][0] !== "?" && PEN[s.id];
  const keys = [...(pen || "青")];
  const word = k => (k === "彩" ? T("彩色") : T(PENC[k][0]));
  return {
    keys,
    none: !pen,
    text: !pen ? T("藍色（官方未指定，建議切換為代表色藍色）") : keys.map(k => (k === "彩" ? T("彩色") : T("{0}色", word(k)))).join(T("、")),
    shortText: !pen ? T("藍（未指定）") : keys.map(word).join(T("、")),
    words: keys.map(word),
    cols: keys.flatMap(k => (k === "彩" ? RAINBOW : [k]).map(c => PENC[c][1]))
  };
}

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const json = o => JSON.stringify(o).replace(/</g, "\\u003c");
const isOffbeat = txt => !!txt && txt.includes("反拍");
const isNote = j => !!j && /^（[^）]+）$/.test(j.trim()); // （間奏）這種全形括號的說明；半形括號的是歌詞

// ── 搜尋結果上看到的文字：標題和描述直接寫出答案（手燈什麼色、哪裡要唱），像 Threads 貼文一樣「內容就是標題」 ──
// 中文：歌名以外大家會拿來搜的名字（中文譯名＋別名，例如〈うっせぇわ〉新聞多寫「煩死了」）
const otherNames = s => [...new Set([s.zh !== s.ja ? s.zh : "", ...(s.alias || [])].filter(Boolean))];
// 標題、描述用的第二個歌名：中文用台灣環球的官方中文曲名（沒有就用讀音或英文）；英文用英文名；日文只放日文原名
const namePart = (s, code) => (code === "ja" ? "" : code === "en" ? (s.en && s.en !== s.ja ? s.en : "") : (s.zh && s.zh !== s.ja ? s.zh : (s.en && s.en !== s.ja ? s.en : "")));
// 歌曲頁標題：中文超過 32 字、英文超過 60 字（Google 大約顯示的長度）就只放日文歌名
function songTitle(s, code) {
  const n = namePart(s, code);
  if (code === "en") { const full = `Ado "${n || s.ja}"${n ? ` (${s.ja})` : ""} Fan Chant Guide`; return full.length <= 60 ? full : `Ado "${s.ja}" Fan Chant Guide`; }
  if (code === "ja") return `Ado「${s.ja}」ライブ応援ガイド`;
  const full = `Ado〈${s.ja}〉${n ? n + " " : ""}應援教學`;
  return full.length <= 32 ? full : `Ado〈${s.ja}〉應援教學`;
}
function songDesc(s, code, p, tips, T) {
  const n = namePart(s, code), tie = s.tie ? T(s.tie) : "";
  if (code === "en") {
    const pen = p.none ? "Penlight: no official color, so go with Ado's signature blue." : `Penlight: ${p.words.join(", ")}.`;
    const how = tips.length ? tips.slice(0, 2).join("; ") + "." : (s.free ? "No set chant, just sway along to the beat." : "Chants are still being confirmed; get to know the melody first.");
    return cut(`How to cheer for Ado's "${n || s.ja}"${tie ? ` (${tie})` : ""} at a concert. ${pen} ${how} Practice with the official MV and synced romaji lyrics.`, 160);
  }
  if (code === "ja") {
    const pen = p.none ? "ペンライトは指定なし、迷ったらAdoのイメージカラーの青。" : `ペンライトは${p.words.join("・")}。`;
    const how = tips.length ? tips.slice(0, 2).join("、") + "。" : (s.free ? "決まったコールはなく、リズムに合わせて自由に。" : "応援はまだ確認中、まずはメロディーを覚えよう。");
    return cut(`Adoのライブで「${s.ja}」${tie ? `（${tie}）` : ""}はどう応援する？${pen}${how}公式MVと同期歌詞で予習できます。`, 120);
  }
  const pen = p.none ? "手燈沒有指定，切 Ado 的代表色藍色；" : `手燈切${p.words.join("、")}；`;
  const how = tips.length ? tips.slice(0, 2).join("，") + "。" : (s.free ? "沒有固定應援，跟著節奏搖手燈就好。" : "應援還在整理，先熟悉旋律。");
  return cut(`〈${s.ja}〉${n ? `（${n}）` : ""}${s.tie ? `是${s.tie}。` : ""}演唱會怎麼應援？${pen}${how}跟著官方 MV 和日中同步歌詞，先在家練一遍。`, 130);
}

function isoDuration(lenStr) {
  const [m, s] = lenStr.split(":").map(Number);
  return `PT${m}M${s}S`;
}

function jaHTML(txt, sung = []) {
  const out = [], re = /([一-鿿々〆ヵヶ]+)[(（]([぀-ヿー]+)[)）]/g, hit = new Set();
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
// 有羅馬拼音的行多一個 ro，英文版歌詞下面顯示
const lyFiles = {}, lyIndex = {};
const withRo = (id, lines) => lines.map(l => (ROMAJI[id] && l.jp && ROMAJI[id][l.jp] ? { ...l, ro: ROMAJI[id][l.jp] } : l));
for (const s of SONGS) {
  const b = LYRICS.find(x => x.id === s.id), lines = withRo(s.id, (b && b.lyrics) || []);
  lyFiles[`lyrics/${s.id}.json`] = JSON.stringify({ ...(b || { id: s.id }), lyrics: lines });
  if (lines.length) lyIndex[s.id] = lines.filter(l => (l.acts || []).some(a => a !== "listen")).length;
}
for (const b of LYRICS_LIVE) {
  const baseId = b.baseId || b.id.replace("-live", "");
  const lines = withRo(baseId, b.lyrics || []);
  lyFiles[`lyrics-live/${baseId}.json`] = JSON.stringify({ ...b, lyrics: lines });
}
lyFiles["lyrics/index.json"] = JSON.stringify(lyIndex);

// 版本字串：內容變了才換，瀏覽器才會抓新的（原始檔寫 ?v=dev）
const LYV = hash(Object.values(lyFiles).join("\n"));
const gaScript = GA_ID ? [
  `<!-- Google tag (gtag.js) -->`,
  `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>`,
  `<script>`,
  `  window.dataLayer = window.dataLayer || [];`,
  `  function gtag(){dataLayer.push(arguments);}`,
  `  gtag('js', new Date());`,
  `  gtag('config', '${GA_ID}');`,
  `</script>`
].join("\n") : "";

// 頁尾版本號跟 CHANGELOG 最上面那版走，不用手動同步
const VERSION = (read("CHANGELOG.md").match(/^## (v\d+\.\d+\.\d+)/m) || [])[1];
if (!VERSION) throw new Error("CHANGELOG.md 找不到版本標題（## vX.Y.Z）");
const src = read("index.html")
  .replace(/<span class="build">[^<]*<\/span>/, `<span class="build">${VERSION}</span>`)
  .replace(/style\.css\?v=[^"]*/, `style.css?v=${hash(css)}`)
  .replace("songs.js?v=dev", `songs.js?v=${hash(songsText)}`)
  .replace("song-lyrics-live.js?v=dev", `song-lyrics-live.js?v=${hash(liveLyricsText)}`)
  .replace("karaoke-sources.js?v=dev", `karaoke-sources.js?v=${hash(karaokeSrc)}`)
  .replace("app.js?v=dev", `app.js?v=${hash(app)}`)
  .replace('<html lang="zh-Hant-TW">', `<html lang="zh-Hant-TW" data-lyrics="${LYV}">`);

// 每種語言的字典另存一個小檔，英文版只載英文、日文版只載日文
const i18nFiles = Object.fromEntries(["en", "ja"].map(code => [code, `window.ADO_I18N = ${JSON.stringify({ [code]: I18N[code] || {} })};\n`]));

// ── 版型翻譯：把 index.html 裡的中文換成目前語言（歌曲內容是之後才填進去的，不會被換到） ──
// 1. 字典裡含 HTML 的 key（一句話中間夾著標籤，例如「從<span>〈唱〉</span>開始練」）整段換
// 2. 標籤之間的文字、aria-label／title／placeholder／alt／content 屬性逐一查字典
const hasCJK = t => /[぀-ヿ一-鿿]/.test(t);
function translateTemplate(html, L, T) {
  if (L.code === "zh") return html;
  const dict = I18N[L.code] || {};
  for (const k of Object.keys(dict).filter(k => k.includes("<")).sort((a, b) => b.length - a.length)) html = html.split(k).join(dict[k]);
  // 已經是譯文的（上面整段換掉的、或日文版裡本來就是日文的字）不用再查
  const done = new Set(Object.values(dict).flatMap(v => v.split(/<[^>]+>/).map(x => x.trim())).filter(Boolean));
  const tr = text => {
    const t = text.trim();
    if (!t || !hasCJK(t) || (!(t in dict) && done.has(t))) return text;
    return text.replace(t, T(t));
  };
  html = html.replace(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->)|>([^<>]+)(?=<)/g, (m, skip, text) => (skip ? skip : ">" + tr(text)));
  html = html.replace(/(\s(?:aria-label|title|placeholder|alt|content)=")([^"]*)(")/g, (m, a, v, b) => a + (hasCJK(v) ? esc(T(v.replace(/&amp;/g, "&").replace(/&quot;/g, '"'))) : v) + b);
  return html;
}

// 英文、日文版在子資料夾：共用的 CSS、JS、圖示往上一層找；<html> 標上語言
function langTemplate(L, T) {
  const up = L.dir ? "../" : "";
  let html = translateTemplate(src, L, T)
    .replace('<html lang="zh-Hant-TW" ', `<html lang="${L.html}" data-lang="${L.code}"${up ? ` data-root="${up}"` : ""} `)
    .replace("<!-- build:i18n -->", L.code === "zh" ? "" : `<script src="${up}i18n/${L.code}.js?v=${hash(i18nFiles[L.code])}"></script>`);
  // 頂欄的站名：英文用短名，手機上放得下
  const SHORT = { en: "Ado Chant Guide" };
  if (SHORT[L.code]) html = html.replace(/(<span class="mark-name">)[^<]*(<\/span>)/, `$1${SHORT[L.code]}$2`);
  if (up) html = html.replace(/(\s(?:href|src)=")((?:favicon\.ico|assets\/|manifest\.webmanifest|style\.css|songs\.js|song-lyrics-live\.js|karaoke-sources\.js|app\.js)[^"]*")/g, `$1${up}$2`);
  return html;
}

// hreflang：每一頁都列出三種語言的網址，中文當預設
const altLinks = rest => [
  ...LANGS.map(x => `<link rel="alternate" hreflang="${x.hreflang}" href="${SITE}${x.dir}${rest}">`),
  `<link rel="alternate" hreflang="x-default" href="${SITE}${rest}">`
].join("\n");
// 語言切換的連結：這一頁的三種語言版本（相對於這個語言的根目錄）
function langLinks(html, L, rest) {
  return html.replace(/<a ([^>]*)data-lang-link="(\w+)"([^>]*) href="[^"]*"([^>]*)>/g, (m, a, code, b, c) => {
    const here = code === L.code, x = LANGS.find(y => y.code === code);
    const href = (here ? "" : (L.dir ? "../" : "") + x.dir) + rest || "./";
    let attrs = `${a}data-lang-link="${code}"${b} href="${href}"${c}`;
    if (/aria-checked=/.test(attrs)) attrs = attrs.replace(/aria-checked="[^"]*"/, `aria-checked="${here}"`);
    else attrs = attrs.replace(/\s*aria-current="[^"]*"/, "") + (here ? ' aria-current="true"' : "");
    return `<a ${attrs}>`;
  });
}

function page(tpl, L, T, { rest, title, desc, ld, base, song, extra = "" }) {
  const url = SITE + L.dir + rest;
  let html = tpl
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${song ? "music.song" : "website"}">`)
    .replace(/<!-- build:seo[^>]*-->/, [
      `<link rel="canonical" href="${url}">`,
      altLinks(rest),
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:site_name" content="${L.name}">`,
      `<meta property="og:locale" content="${L.og}">`,
      ...LANGS.filter(x => x !== L).map(x => `<meta property="og:locale:alternate" content="${x.og}">`),
      `<meta property="og:image" content="${OG_IMG}">`,
      `<meta property="og:image:alt" content="${esc(T("Ado 應援指南：看 MV，跟著亮起的歌詞一起應援"))}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(desc)}">`,
      `<meta name="twitter:image" content="${OG_IMG}">`,
      `<script type="application/ld+json">${json(ld)}</script>`,
      gaScript,
      extra
    ].filter(Boolean).join("\n"));
  if (base) html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<base href="${base}">`);
  if (song) html = html.replace(/<html lang="([^"]+)" /, `<html lang="$1" data-song="${song.id}" `);
  return langLinks(html, L, rest);
}

const write = (rel, text) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
fs.rmSync(out, { recursive: true, force: true });

const STARTERS = ["odo", "freedom", "shinjidai", "gyakkou", "ashura", "usseewa"].map(id => SONGS.find(s => s.id === id)).filter(Boolean);
const thumbHtml = (s, w, h, lazy) => `<img class="thumb" src="https://i.ytimg.com/vi/${s.yt}/mqdefault.jpg" alt="" width="${w}" height="${h}" decoding="async"${lazy ? ' loading="lazy"' : ""}>`;
const urls = [""];

// ── 每種語言產生首頁＋每首歌的獨立頁 ──
function renderLang(L) {
  const T = makeT(L.code);
  const tpl = langTemplate(L, T);
  const icon = a => `<svg class="a-${a}" role="img" aria-label="${esc(T(ACT_MAP[a]?.name || a))}"><use href="#${ACT_MAP[a]?.icon || "i-sing"}"/></svg>`;
  const penDots = s => {
    const p = penOf(s, T);
    return `<span class="dots" aria-label="${esc(T("螢光棒：") + p.shortText)}">${p.keys.map(k => (k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`)).join("")}</span>`;
  };
  const subOf = s => [namePart(s, L.code), s.cover ? T("翻唱") : ""].filter(Boolean).join("・");
  const actIcons = s => s.acts.filter(a => a !== "listen").map(icon).join("");
  const tipsOf = s => (s.hold || s.sug ? [] : s.tips || []).map(t => T(t));

  // ── 首頁（靜態預渲染歌曲清單，讓搜尋引擎與 AI 爬蟲能直接索引所有內部連結） ──
  const usedActs = new Set(SONGS.flatMap(s => s.acts.filter(a => a !== "listen")));
  const homeLegendHtml = Object.keys(ACT_MAP).filter(a => usedActs.has(a)).map(a => `<span class="a-${a}">${icon(a)}${T(ACT_MAP[a].name)}</span>`).join("");
  const homeSongListHtml = SONGS.map(s => `<li><a class="song" href="song/${s.id}/" data-id="${s.id}">${thumbHtml(s, 80, 45, true)}<span class="song-main"><span class="name"><span class="ja" lang="ja">${esc(s.ja)}</span><span class="sub"><span class="zh">${esc(subOf(s))}</span>${penDots(s)}</span></span><span class="acts">${actIcons(s)}${s.free ? `<span class="free">${T("自由搖")}</span>` : ""}</span></span></a></li>`).join("");
  const homeShelfHtml = STARTERS.map(s => `<li><a class="card" href="song/${s.id}/" data-id="${s.id}">${thumbHtml(s, 320, 180, false)}<span class="card-text"><span class="card-ja" lang="ja">${esc(s.ja)}</span><span class="card-sub"><span>${esc(subOf(s))}</span><span class="acts">${actIcons(s)}</span></span></span></a></li>`).join("");

  // 常見問題：結構化資料直接讀這個語言畫面上的文字，兩邊一致
  const FAQ = [...tpl.matchAll(/<details class="faq-item">\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
    .map(m => m.slice(1).map(t => t.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()));
  if (!FAQ.length) throw new Error("index.html 找不到常見問題（details.faq-item）");
  const home = SITE + L.dir;
  const COPY = {
    zh: {
      title: `Ado 演唱會應援教學｜${SONGS.length} 首歌的手燈顏色與大合唱`,
      desc: `第一次去 Ado 演唱會也不慌：${SONGS.length} 首歌各有一頁，跟著官方 MV 和日中同步歌詞，哪裡拍手、哪裡大合唱、哪裡喊「Hey!」、手燈切什麼顏色都標好了。非官方粉絲製作，不照任何場次歌單，不暴雷。`,
      site: `非官方粉絲製作的 Ado 演唱會應援指南：收錄 ${SONGS.length} 首歌曲教學，看著 MV 跟同步歌詞，練哪裡拍手、哪裡大合唱、哪裡喊聲，還有每首手燈推薦顏色與藍牙手燈連動。`,
      list: "Ado 演唱會歌曲應援清單", listDesc: `Ado ${SONGS.length} 首歌曲的演唱會應援教學與同步歌詞`
    },
    en: {
      title: `Ado Concert Chant Guide: Penlight Colors & Sing-Alongs for ${SONGS.length} Songs`,
      desc: `Going to an Ado concert? Each of ${SONGS.length} songs has its own page: play the official MV with synced lyrics and romaji, and see exactly where to clap, sing along, shout "Hey!", and which penlight color to use. Unofficial, made by fans, spoiler-free.`,
      site: `An unofficial fan-made guide to Ado concert chants: ${SONGS.length} songs with synced lyrics, romaji, sing-along parts, clap and call cues, and penlight colors.`,
      list: "Ado concert chant guide by song", listDesc: `Chant guides and synced lyrics for ${SONGS.length} Ado songs`
    },
    ja: {
      title: `Adoライブ応援ガイド｜${SONGS.length}曲のペンライト色・コール・合唱パート`,
      desc: `初めてのAdoライブでも大丈夫。${SONGS.length}曲それぞれに専用ページ、公式MVと同期歌詞で、手拍子・合唱・「Hey!」コールの場所とペンライトの色をチェックできます。ファンによる非公式サイト、セトリのネタバレなし。`,
      site: `ファンが作った非公式のAdoライブ応援ガイド。${SONGS.length}曲の同期歌詞、合唱パート、手拍子・コールのタイミング、ペンライト色をまとめています。`,
      list: "Ado ライブ応援ガイド 曲一覧", listDesc: `Adoの${SONGS.length}曲の応援ガイドと同期歌詞`
    }
  }[L.code];
  const homeLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        "name": L.name,
        ...(L.code === "zh" ? { "alternateName": ["Ado 應援預習", "ADO FAN CHANT GUIDE", "Ado 演唱會應援指南", "Ado 應援"] } : {}),
        "url": home,
        "inLanguage": L.html,
        "description": COPY.site,
        "publisher": { "@id": `${SITE}#author` },
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
        "@type": "Person",
        "@id": `${SITE}#author`,
        "name": "Kuti",
        "url": SITE,
        "sameAs": [THREADS, INSTAGRAM, "https://github.com/Gcree"]
      },
      {
        "@type": "ItemList",
        "@id": `${home}#songlist`,
        "name": COPY.list,
        "description": COPY.listDesc,
        "numberOfItems": SONGS.length,
        "itemListElement": SONGS.map((s, idx) => ({
          "@type": "ListItem",
          "position": idx + 1,
          "name": songTitle(s, L.code),
          "url": `${home}song/${s.id}/`
        }))
      },
      {
        "@type": "FAQPage",
        "@id": `${home}#faq`,
        "mainEntity": FAQ.map(([name, text]) => ({ "@type": "Question", name, "acceptedAnswer": { "@type": "Answer", text } }))
      }
    ]
  };
  let homeHtml = page(tpl, L, T, {
    rest: "",
    title: COPY.title,
    desc: COPY.desc,
    ld: homeLd,
    extra: L.code === "zh" && GSC_VERIFY && `<meta name="google-site-verification" content="${GSC_VERIFY}">`
  });
  homeHtml = homeHtml
    .replace('<ul class="songs collapsed" id="songList"></ul>', `<ul class="songs collapsed" id="songList">${homeSongListHtml}</ul>`)
    .replace('<ul class="shelf" id="shelf"></ul>', `<ul class="shelf" id="shelf">${homeShelfHtml}</ul>`)
    .replace('<span class="count" id="songCount"></span>', `<span class="count" id="songCount">${T("{0} 首", SONGS.length)}</span>`)
    .replace(/(<p class="list-progress" id="listProgress"[^>]*>)[^<]*(<\/p>)/, `$1${T("已列出 {0}／{1} 首", 12, SONGS.length)}$2`)
    .replace(/(<span id="factSongs">)\d+(<\/span>)/, `$1${SONGS.length}$2`)
    .replace(/(<div class="home-legend" id="homeLegend"[^>]*>)(<\/div>)/, `$1${homeLegendHtml}$2`);
  write(`${L.dir}index.html`, homeHtml);

  // ── 各歌曲獨立頁面（完全靜態預渲染標題、應援重點、手燈顏色、歌詞與 JSON-LD 結構化資料） ──
  for (let i = 0; i < SONGS.length; i++) {
    const s = SONGS[i];
    const prevSong = SONGS[i - 1] || null;
    const nextSong = SONGS[i + 1] || null;
    const b = LYRICS.find(x => x.id === s.id);
    const lines = withRo(s.id, (b && b.lyrics) || []);
    const pen = penOf(s, T);
    const tips = tipsOf(s);
    const rest = `song/${s.id}/`;
    const url = home + rest;
    if (L.code === "zh") urls.push(rest);
    const pageTitle = songTitle(s, L.code);
    const desc = songDesc(s, L.code, pen, tips, T);
    const dn = namePart(s, L.code);

    const songLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${url}#webpage`,
          "url": url,
          "name": pageTitle,
          "description": desc,
          "inLanguage": L.html,
          "isPartOf": { "@type": "WebSite", "@id": `${home}#website` },
          "author": { "@type": "Person", "@id": `${SITE}#author`, "name": "Kuti", "sameAs": [THREADS, INSTAGRAM] },
          "breadcrumb": { "@id": `${url}#breadcrumb` }
        },
        {
          "@type": "BreadcrumbList",
          "@id": `${url}#breadcrumb`,
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": L.name, "item": home },
            { "@type": "ListItem", "position": 2, "name": T("全部歌曲"), "item": `${home}#songs` },
            { "@type": "ListItem", "position": 3, "name": T("〈{0}〉應援指南", s.ja), "item": url }
          ]
        },
        {
          "@type": "MusicRecording",
          "@id": `${url}#song`,
          "name": s.ja,
          "alternateName": [...new Set([s.zh, s.en, s.ro, ...(s.alias || [])])].filter(x => x && x !== s.ja),
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
            "name": T("Ado〈{0}〉官方 MV", s.ja),
            "description": T("Ado〈{0}〉官方音樂錄影帶 MV", s.ja),
            "thumbnailUrl": `https://i.ytimg.com/vi/${s.yt}/hqdefault.jpg`,
            "embedUrl": `https://www.youtube.com/embed/${s.yt}`,
            "uploadDate": `${s.date}T00:00:00+09:00`
          }
        },
        {
          "@type": "FAQPage",
          "@id": `${url}#faq`,
          "mainEntity": [
            {
              "@type": "Question",
              "name": T("Ado〈{0}〉演唱會手燈推薦什麼顏色？", s.ja),
              "acceptedAnswer": { "@type": "Answer", "text": T("Ado〈{0}〉演唱會推薦手燈顏色為：{1}。若搭配 PenlightSync 桌面 App，可透過藍牙自動切換官方手燈顏色。", s.ja, pen.text) }
            },
            {
              "@type": "Question",
              "name": T("Ado〈{0}〉演唱會有什麼應援動作或大合唱？", s.ja),
              "acceptedAnswer": { "@type": "Answer", "text": tips.length ? tips.join(T("；")) : (s.free ? T("這首歌沒有固定應援，現場自由跟著節奏搖手燈即可。") : T("這首歌應援資料整理中，先熟悉旋律並跟隨現場氣氛。")) }
            },
            ...(s.lives.length ? [{
              "@type": "Question",
              "name": T("Ado〈{0}〉有演唱會現場音源可以聽嗎？", s.ja),
              "acceptedAnswer": { "@type": "Answer", "text": T("有，Ado 官方已釋出〈{0}〉在歷年演唱會（{1}）的官方現場音源。", s.ja, s.lives.map(l => l.concert).join(T("、"))) }
            }] : [])
          ]
        }
      ]
    };

    let songHtml = page(tpl, L, T, { rest, base: "../../", song: s, title: pageTitle, desc, ld: songLd });

    // 靜態預渲染歌詞行與應援標記；第二行：中文版放中譯、英文版放羅馬拼音、日文版不放
    const mainAct = acts => acts.find(a => a !== "listen") || (acts.length ? "listen" : "");
    const lineAct = l => ((l.sing && l.sing.length) ? "sing" : mainAct((l.acts || []).filter(a => a !== "sing")) || mainAct(l.acts || []));
    const subLine = l => (L.code === "en" ? l.ro || "" : L.code === "ja" ? "" : l.tr || "");
    let prerenderedLines = "";
    if (!lines.length) {
      prerenderedLines = `<div class="empty"><b>${T("這首還沒有逐行時間軸")}</b>${tips.length ? `<ul class="summary">${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul><span>${T("先邊看 MV 邊照上面的重點練。")}</span>` : `<span>${T("應援還在整理，先看 MV 熟悉旋律，副歌跟著現場氣氛就好。")}</span>`}<span>${T('歌詞請看<a href="{0}" target="_blank" rel="noopener">歌ネット的正版歌詞頁</a>。', s.ut)}</span></div>`;
    } else {
      prerenderedLines = lines.map((l, li) => {
        const m = lineAct(l);
        const acts = (s.hold ? [] : (l.acts || [])).filter(a => ACT_MAP[a] && a !== "listen");
        const sing = s.hold ? [] : (l.sing || []);
        const cls = "ln" + (m ? " a-" + m : "") + (acts.includes("sing") ? " sing" : "");
        const jp = isNote(l.jp) ? T(l.jp.trim()) : l.jp;
        const ja = jp ? jaHTML(jp, sing) : `<span class="ph">${T("日文歌詞（{0}）", fmt(l.time || 0))}</span>`;
        const sub = subLine(l);
        const zh = sub ? esc(sub) : (l.jp || L.code !== "zh" ? "" : `<span class="ph">中譯</span>`);
        let callHtml = "";
        if (l.call && !(li && lines[li - 1].call === l.call)) {
          if (isOffbeat(l.call)) {
            callHtml = `<span class="call call-offbeat"><svg class="ico-clap"><use href="#i-clap"/></svg><span class="call-txt">${T("反拍拍手")}</span><span class="call-rhythm"><b>${T("空")}</b><i>${T("拍")}</i><b>${T("空")}</b><i>${T("拍")}</i></span></span>`;
          } else {
            callHtml = `<span class="call">${esc(T(l.call))}</span>`;
          }
        }
        return `<div class="${cls}" tabindex="0"><div class="ja" lang="ja">${ja}</div>${zh ? `<div class="zh"${L.code === "en" ? ' lang="ja-Latn"' : ""}>${zh}</div>` : ""}<div class="acts">${acts.map(icon).join("")}</div>${callHtml}</div>`;
      }).join("");
    }

    const subTitleHtml = dn ? `<span lang="${L.code === "zh" && s.zh !== s.ja ? "zh-Hant-TW" : "en"}">${esc(dn)}</span>` : "";
    const cueHowText = s.free
      ? T("沒有固定應援，跟著現場氣氛就好。")
      : (s.hold ? T("先熟悉旋律，跟著現場氣氛就好。") : (lines.length ? T("播放後，這裡會顯示現在要做的動作。") : T("這首還沒有逐行時間軸，照歌詞欄的重點練。")));

    const lives = s.lives;
    const liveRows = lives.length ? `<dt id="cardLiveDt">${T("現場音源")}</dt><dd id="cardLiveDd">${lives.map(l => `<a href="https://www.youtube.com/watch?v=${l.yt}" class="live-chip" target="_blank" rel="noopener">${esc(l.concert)} ↗</a>`).join(" ")}</dd>` : `<dt id="cardLiveDt" hidden>${T("現場音源")}</dt><dd id="cardLiveDd" hidden></dd>`;

    const akaText = L.code === "zh" ? [...new Set([...otherNames(s), s.en && s.en !== s.ja ? s.en : ""].filter(Boolean))].join("・") : L.code === "en" ? (s.ro && s.ro !== s.en ? s.ro : "") : "";
    const tie = s.tie ? T(s.tie) : "";
    const album = s.album ? T(s.album) : "";
    const cardHtml = `<section class="song-guide-card" id="songGuideCard" aria-label="${esc(T("歌曲應援速覽"))}"><h3 class="card-title">${T("〈{0}〉應援速覽", `<span id="cardJa">${esc(s.ja)}${dn ? `（${esc(dn)}）` : ""}</span>`)}</h3><dl class="card-dl"><dt id="cardAkaDt"${akaText ? "" : " hidden"}>${T("也叫")}</dt><dd id="cardAkaDd"${akaText ? "" : " hidden"}>${esc(akaText)}</dd><dt id="cardTieDt"${tie ? "" : " hidden"}>${T("出處")}</dt><dd id="cardTieDd"${tie ? "" : " hidden"}>${esc(tie)}</dd><dt id="cardAlbumDt"${album ? "" : " hidden"}>${T("收錄專輯")}</dt><dd id="cardAlbumDd"${album ? "" : " hidden"}>${esc(album)}</dd><dt id="cardDateDt">${T("發布日期")}</dt><dd id="cardDateDd">${esc(s.date.replace(/-/g, "/"))}</dd><dt>${T("推薦手燈")}</dt><dd id="cardPen">${esc(pen.text)}</dd><dt>${T("應援重點")}</dt><dd id="cardTips">${esc(tips.length ? tips.join(T("；")) : (s.free ? T("沒有固定應援，自由跟著節奏搖手燈。") : T("應援還在整理，先熟悉旋律。")))}</dd><dt>${T("官方 MV")}</dt><dd><a id="cardYt" href="https://www.youtube.com/watch?v=${s.yt}" target="_blank" rel="noopener">${T("在 YouTube 開啟 ↗")}</a></dd><dt>${T("正版歌詞")}</dt><dd><a id="cardLyrics" href="${s.ut}" target="_blank" rel="noopener">${T("歌ネット ↗")}</a></dd><dt>${T("串流平台")}</dt><dd id="cardStream">${s.stream.map(x => `<a href="${x.url}" class="live-chip" target="_blank" rel="noopener">${esc(x.name)} ↗</a>`).join(" ")}</dd>${liveRows}</dl></section>`;

    // 轉換歌曲頁面的 HTML：預設展示歌曲 view，隱藏 home view，並將標題、螢光棒、歌詞填入靜態標籤
    songHtml = songHtml
      .replace('<body>', '<body class="on-song">')
      .replace('<div class="view home" id="home">', '<div class="view home" id="home" hidden>')
      .replace('<div class="view" id="song" hidden>', '<div class="view" id="song">')
      .replace('<h1 id="sTitle" lang="ja"></h1>', `<h1 id="sTitle" lang="ja">${esc(s.ja)}${subTitleHtml}</h1>`)
      .replace('<span class="pen" id="pen"></span>', `<span class="pen" id="pen">${T("螢光棒")}${penDots(s)}<b>${esc(pen.shortText)}</b></span>`)
      .replace('<div class="how" id="cueHow"></div>', `<div class="how" id="cueHow">${esc(cueHowText)}</div>`)
      .replace('<ul class="summary" id="cueSummary"></ul>', `<ul class="summary" id="cueSummary">${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`)
      .replace('<div id="lines"></div>', `<div id="lines">${prerenderedLines}</div>`)
      .replace(/<section class="song-guide-card" id="songGuideCard"[^>]*>[\s\S]*?<\/section>/, cardHtml);

    // 上一首／下一首連結預渲染
    if (prevSong) songHtml = songHtml.replace(/<a class="ib" id="prevSong" aria-label="[^"]*">/, `<a class="ib" id="prevSong" href="song/${prevSong.id}/" data-id="${prevSong.id}" aria-label="${esc(T("上一首：{0}", prevSong.ja))}">`);
    if (nextSong) songHtml = songHtml.replace(/<a class="ib" id="nextSong" aria-label="[^"]*">/, `<a class="ib" id="nextSong" href="song/${nextSong.id}/" data-id="${nextSong.id}" aria-label="${esc(T("下一首：{0}", nextSong.ja))}">`);

    write(`${L.dir}song/${s.id}/index.html`, songHtml);
  }
}
LANGS.forEach(renderLang);
for (const [code, text] of Object.entries(i18nFiles)) write(`i18n/${code}.js`, text);

// 找不到的網址回首頁
write("404.html", `<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="robots" content="noindex"><title>找不到這一頁｜Ado 應援指南</title><meta http-equiv="refresh" content="0;url=${SITE}"><p>找不到這一頁，<a href="${SITE}">回 Ado 應援指南首頁</a>。 Page not found — <a href="${SITE}en/">Ado Fan Chant Guide</a>｜<a href="${SITE}jp/">Ado 応援ガイド</a></p></html>\n`);

// 網站地圖：每個網址列出三種語言版本（xhtml:link），Google 才知道它們是同一頁的不同語言
// lastmod 用 CHANGELOG 最新一版的日期：只有真的改版才變，Google 才會相信這個日期
const today = (read("CHANGELOG.md").match(/^## v\d+\.\d+\.\d+ — (\d{4}-\d{2}-\d{2})/m) || [])[1] || new Date().toISOString().slice(0, 10);
const alts = rest => LANGS.map(x => `    <xhtml:link rel="alternate" hreflang="${x.hreflang}" href="${SITE}${x.dir}${rest}"/>`).concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${rest}"/>`).join("\n");
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${LANGS.flatMap(L => urls.map(
    rest => `  <url>\n    <loc>${SITE}${L.dir}${rest}</loc>\n    <lastmod>${today}</lastmod>\n${alts(rest)}\n  </url>`
  )).join("\n")}\n</urlset>\n`
);

// ── 產生給 AI Agents / LLMs 的標準說明文件 (llms.txt 與 llms-full.txt) ──
function generateLlmsTxt() {
  const lines = [
    `# Ado 應援指南 (Ado Concert Fan Chant & Penlight Guide)`,
    ``,
    `> 非官方粉絲製作的 Ado 演唱會應援指南網站：收錄 ${SONGS.length} 首歌曲的現場應援教學、官方 MV 同步日中歌詞、推薦手燈螢光棒顏色、拍手段落與大合唱重點。不依照任何單一場次的歌單，安心預習不暴雷。`,
    `> English: ${SITE}en/ ・ 日本語: ${SITE}jp/`,
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
    const lives = s.lives;
    const tips = s.tips.length ? s.tips.join("；") : (s.free ? "沒有固定應援，自由跟著節奏搖手燈。" : "應援資料整理中，先熟悉旋律。");
    lines.push(
      `### [${s.ja}${s.zh !== s.ja ? `（${s.zh}）` : ""}](${SITE}song/${s.id}/)`,
      `- **發行日期**：${s.date}`,
      `- **推薦手燈顏色**：${pen.text}`,
      `- **官方 MV**：https://www.youtube.com/watch?v=${s.yt} (${s.len})`,
      ...(lives.length ? [`- **官方現場音源**：${lives.map(l => `${l.concert} (https://www.youtube.com/watch?v=${l.yt})`).join("、")}`] : []),
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
      ...(s.lives.length ? [`- 官方現場音源：${s.lives.map(l => `${l.concert} (https://www.youtube.com/watch?v=${l.yt})`).join("、")}`] : []),
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
  "song-lyrics-live.js",
  "CHANGELOG.md",
  "manifest.webmanifest",
  "googlea6b361c7e6e7d11c.html",
  "robots.txt"
]) {
  const srcPath = path.join(root, f);
  if (fs.existsSync(srcPath)) fs.copyFileSync(srcPath, path.join(out, f));
}
if (fs.existsSync(path.join(root, "assets/favicon.ico"))) {
  fs.copyFileSync(path.join(root, "assets/favicon.ico"), path.join(out, "favicon.ico"));
}
// 離線用的 Service Worker：先存三種語言的首頁、共用的 CSS／JS 和每首歌詞檔；VERSION 跟著這些檔案的版本走，有改才會換新版
const precache = [
  ...LANGS.map(L => L.dir || "./"),
  `style.css?v=${hash(css)}`, `songs.js?v=${hash(songsText)}`, `karaoke-sources.js?v=${hash(karaokeSrc)}`, `app.js?v=${hash(app)}`,
  ...Object.entries(i18nFiles).map(([code, text]) => `i18n/${code}.js?v=${hash(text)}`),
  ...Object.keys(lyFiles).map(f => `${f}?v=${LYV}`),
  "manifest.webmanifest", "favicon.ico", "assets/favicon.svg", "assets/icon-192.png"
];
const swSrc = read("sw.js");
write("sw.js", swSrc.replace("__VERSION__", hash(precache.join("\n") + swSrc)).replace("__PRECACHE__", JSON.stringify(precache)));
write("CNAME", "ado.kuti.cc\n");
fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), { recursive: true });

console.log(`輸出到 ${out}：中文、英文（en/）、日文（jp/）各首頁＋${SONGS.length} 首歌頁、${Object.keys(lyIndex).length} 首歌詞檔${Object.keys(ROMAJI).length ? `（${Object.keys(ROMAJI).length} 首有羅馬拼音）` : "（沒有 song-romaji.json，英文版不放羅馬拼音）"}、sitemap.xml、robots.txt、llms.txt、llms-full.txt、404.html`);
for (const code of ["en", "ja"]) {
  if (missing[code].size) console.log(`⚠ ${code} 還沒翻譯 ${missing[code].size} 句（畫面先顯示中文）：${[...missing[code]].slice(0, 8).join("｜")}${missing[code].size > 8 ? "…" : ""}`);
}
if (process.env.I18N_MISSING) fs.writeFileSync(process.env.I18N_MISSING, JSON.stringify(Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, [...v]])), null, 1));
