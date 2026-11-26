// 建置正式網站：複製檔案，並替每首歌做一頁 song/<id>/（有自己的標題、說明與分享資訊，Google 才收錄得到）；
// 歌詞拆成每首一個檔 lyrics/<id>.json，網頁打開哪首才載哪首
// 三種語言：中文在根目錄、英文在 en/、日文在 jp/；介面文字以中文原文當 key 查 i18n.js（英文版歌詞下面放羅馬拼音 song-romaji.json）
// 用法：node scripts/build.mjs [輸出資料夾，預設 dist]
// GitHub Actions 每次推到 main 都會跑這支，再發布到 GitHub Pages；平常改網站只要改 index.html、style.css、app.js、song-lyrics.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { songLastmod } from "./song-lastmod.mjs";

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
const stage3dPath = path.join(root, "assets/stage3d.js");
const STAGE3DV = fs.existsSync(stage3dPath) ? hash(fs.readFileSync(stage3dPath)) : "";
const esbuildMod = await import("esbuild")
  .catch(() => import(pathToFileURL(path.join(root, "tools/stage3d/node_modules/esbuild/lib/main.js")).href))
  .catch(() => null);
const esbuild = esbuildMod?.transform ? esbuildMod : esbuildMod?.default?.transform ? esbuildMod.default : null;
const minifyJs = async code => (esbuild ? (await esbuild.transform(code, { loader: "js", minify: true, target: "es2020", legalComments: "none" })).code : code);
const minifyCss = async code => (esbuild ? (await esbuild.transform(code, { loader: "css", minify: true })).code : code);

function mustReplace(str, target, repl, label) {
  const fn = typeof repl === "function" ? repl : () => repl;
  if (typeof target === "string") {
    if (!str.includes(target)) throw new Error(`build.mjs 找不到模板標記：${label || target}`);
    return str.replace(target, fn);
  }
  if (!target.test(str)) throw new Error(`build.mjs 找不到模板標記：${label || target}`);
  return str.replace(target, fn);
}
// 分享預覽圖加上內容雜湊，換圖後 LINE／Facebook／X 會重新抓，不會一直顯示舊圖
const OG_IMG = `${SITE}assets/og.jpg?v=${createHash("sha1").update(fs.readFileSync(path.join(root, "assets/og.jpg"))).digest("hex").slice(0, 8)}`;
const FRONTEND_SCRIPTS = [
  "shared/render.js",
  "js/setlist.js",
  "js/penlight.js",
  "js/quiz-engine.js",
  "app.js"
];
const frontendParts = FRONTEND_SCRIPTS.map(f => {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) throw new Error(`build.mjs 找不到前端腳本：${f}`);
  return fs.readFileSync(p, "utf8");
});
const rawAppBundle = frontendParts.join("\n;\n");
const css = read("style.css"), songsText = read("songs.js"), karaokeSrc = read("karaoke-sources.js");
const require = createRequire(import.meta.url);
const renderModPath = path.join(root, "shared/render.js");
if (!fs.existsSync(renderModPath)) throw new Error("build.mjs 找不到共用模組：shared/render.js");
const {
  ACT_MAP, PENC, TIER_LABEL, esc, fmt, isoDuration, isNote, isOffbeat,
  penOf: sharedPenOf, penDots: sharedPenDots, jaHTML,
  relatedOf: sharedRelatedOf, songInlineSummary: sharedSongInlineSummary,
  mainAct, lineAct
} = require(renderModPath);
const LYRICS = require(path.join(root, "song-lyrics.js"));
const LYRICS_LIVE = require(path.join(root, "song-lyrics-live.js"));
const { SONGS, UT, PEN, SERIES, PRACTICE = {} } = require(path.join(root, "songs.js"));
const { TOURS = [] } = fs.existsSync(path.join(root, "tours.js")) ? require(path.join(root, "tours.js")) : {};

const relatedOf = (s, T) => sharedRelatedOf(s, SONGS, SERIES, T);
const songInlineSummary = (s, code, pen, tips, lines, T) => sharedSongInlineSummary(s, code, pen, tips, lines, T, namePart);
const penOf = (s, T = makeT("zh")) => sharedPenOf(s, PEN, T);

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

// 統整歌曲資料結構（與 app.js 邏輯完全一致）
SONGS.forEach(s => {
  if (s.sug || (!s.free && (!s.tips || !s.tips.length))) s.hold = true;
  if (s.hold) { s.acts = []; s.tips = []; }
  s.ut = UT[s.id] ? `https://www.uta-net.com/song/${UT[s.id]}/` : `https://www.uta-net.com/artist/29298/`;
  s.acts = s.acts || [];
  s.tips = s.tips || [];
  s.dur = s.len ? s.len.split(":").reduce((a, b) => a * 60 + +b, 0) : 0;
});
SONGS.sort((a, b) => a.date.localeCompare(b.date)).forEach((s, i) => (s.no = i + 1));
// 只有已確認應援資料（有應援重點或確認為自由搖）且非未發行預留曲才納入索引與 sitemap；
// 尚在整理中（hold／sug）或未發行的預留頁（upcoming）仍保留站內可看，但標 noindex, follow，避免薄頁拉低整站品質
const isIndexableSong = s => !s.hold && !s.upcoming;
const INDEXABLE_SONGS = SONGS.filter(isIndexableSong);
const SONG_BY_ID = new Map(SONGS.map(s => [s.id, s]));
const TOUR_BY_ID = new Map(TOURS.map(t => [t.id, t]));
const hasLiveVideo = s => Boolean(s.liveVideo || (s.live && s.yt));
const hasLiveAudio = s => Boolean((s.lives && s.lives.length > 0) && !s.liveVideo && !s.live);
const hasLive = s => Boolean((s.lives && s.lives.length > 0) || s.liveVideo || s.live);
const LIVE_ALL_CNT = SONGS.filter(hasLive).length;
const LIVE_VID_CNT = SONGS.filter(hasLiveVideo).length;
const LIVE_AUD_CNT = SONGS.filter(hasLiveAudio).length;

const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const json = o => JSON.stringify(o).replace(/</g, "\\u003c");

// ── 搜尋結果上看到的文字：標題和描述直接寫出答案（手燈什麼色、哪裡要唱），像 Threads 貼文一樣「內容就是標題」 ──
// 中文：歌名以外大家會拿來搜的名字（中文譯名＋別名，例如〈うっせぇわ〉新聞多寫「煩死了」）
const otherNames = s => [...new Set([s.zh !== s.ja ? s.zh : "", ...(s.alias || [])].filter(Boolean))];
// 標題、描述用的第二個歌名：中文用台灣環球的官方中文曲名（沒有就用英文）；英文用英文名（沒有且原名非英數時改用羅馬拼音）；日文只放日文原名
const namePart = (s, code) => (
  code === "ja" ? ""
    : code === "en" ? (s.en && s.en !== s.ja ? s.en : (s.ro && s.ro !== s.ja ? s.ro : ""))
    : (s.zh && s.zh !== s.ja ? s.zh : (s.en && s.en !== s.ja ? s.en : ""))
);
// 歌曲頁標題：中文超過 32 字、英文超過 60 字（Google 大約顯示的長度）就只放日文歌名
function songTitle(s, code) {
  const n = namePart(s, code);
  if (code === "en") { const full = `Ado "${n || s.ja}"${n ? ` (${s.ja})` : ""} Fan Chant Guide`; return full.length <= 60 ? full : `Ado "${n || s.ja}" Fan Chant Guide`; }
  if (code === "ja") return `Ado「${s.ja}」ライブコール・応援ガイド`;
  const full = `Ado〈${s.ja}〉${n ? n + " " : ""}應援教學`;
  return full.length <= 32 ? full : `Ado〈${s.ja}〉應援教學`;
}
// 分頁標題（<title>）：歌名＋這首實際有的應援（只寫真的有的，標題才不會跟內容不符被 Google 改寫）
// 長度上限約等於搜尋結果顯示得完的寬度，太長就依序拿掉別名、再拿掉後半段
function songPageTitle(s, code) {
  const has = a => (s.acts || []).includes(a);
  const hook = {
    zh: has("sing") ? "手燈顏色與大合唱" : has("call") ? "手燈顏色與喊聲" : has("clap") ? "手燈顏色與拍手" : "手燈顏色",
    en: has("sing") ? "Lightstick Colors & Sing-Along" : has("call") ? "Lightstick Colors & Calls" : has("clap") ? "Lightstick Colors & Claps" : "Lightstick Colors",
    ja: has("sing") && has("call") ? "ペンライト色・コール・合唱" : has("sing") ? "ペンライト色・合唱" : has("call") ? "ペンライト色・コール" : has("clap") ? "ペンライト色・手拍子" : "ペンライト色"
  }[code];
  const n = namePart(s, code);
  const tries = {
    zh: [`Ado〈${s.ja}〉${n ? n + " " : ""}應援教學｜${hook}`, `Ado〈${s.ja}〉應援教學｜${hook}`],
    en: [`Ado "${n || s.ja}"${n ? ` (${s.ja})` : ""} Fan Chant Guide | ${hook}`, `Ado "${n || s.ja}" Fan Chant Guide | ${hook}`],
    ja: [`Ado「${s.ja}」ライブコール・応援ガイド｜${hook}`, `Ado「${s.ja}」ライブ応援ガイド｜${hook}`]
  }[code];
  const max = code === "en" ? 65 : 34;
  return tries.find(t => t.length <= max) || songTitle(s, code);
}
function songDesc(s, code, p, tips, T) {
  const n = namePart(s, code), tie = s.tie ? T(s.tie) : "";
  if (code === "en") {
    const pen = p.none ? "Penlight / lightstick: no color on record yet; follow central control or the stage lighting." : `Penlight / lightstick: ${p.words.join(", ")}.`;
    const how = tips.length ? tips.slice(0, 2).join("; ") + "." : (s.free ? "No set chant, just sway along to the beat." : "Chants are still being confirmed; get to know the melody first.");
    return cut(`How to cheer for Ado's "${n || s.ja}"${tie ? ` (${tie})` : ""} at a concert. ${pen} ${how} Practice with the official MV and synced romaji lyrics.`, 160);
  }
  if (code === "ja") {
    const pen = p.none ? "ペンライト色は情報なし、無線制御か照明に合わせて。" : `ペンライトは${p.words.join("・")}。`;
    const how = tips.length ? tips.slice(0, 2).join("、") + "。" : (s.free ? "決まったコールはなく、リズムに合わせて自由に。" : "応援はまだ確認中、まずはメロディーを覚えよう。");
    return cut(`Adoのライブで「${s.ja}」${tie ? `（${tie}）` : ""}はどう応援する？${pen}${how}公式MVと同期歌詞で予習できます。`, 120);
  }
  const pen = p.none ? "手燈顏色還沒有資料，跟著中控或舞台燈光；" : `手燈切${p.words.join("、")}；`;
  const how = tips.length ? tips.slice(0, 2).join("，") + "。" : (s.free ? "沒有固定應援，跟著節奏搖手燈就好。" : "應援還在整理，先熟悉旋律。");
  return cut(`〈${s.ja}〉${n ? `（${n}）` : ""}${s.tie ? `是${s.tie}。` : ""}演唱會怎麼應援？${pen}${how}跟著官方 MV 和日中同步歌詞，先在家練一遍。`, 130);
}

// 每首一個歌詞檔（沒有歌詞的歌也放一個空的，網頁就不會讀到 404）；index.json 記每首的應援數量（有動作、不是「安靜聽」的行數）
// 有羅馬拼音的行多一個 ro，英文版歌詞下面顯示
const lyFiles = {}, lyIndex = {}, mvHashes = {}, liveHashes = {};
const withRo = (id, lines) => lines.map(l => (ROMAJI[id] && l.jp && ROMAJI[id][l.jp] ? { ...l, ro: ROMAJI[id][l.jp] } : l));
for (const s of SONGS) {
  const b = LYRICS.find(x => x.id === s.id), lines = withRo(s.id, (b && b.lyrics) || []);
  const text = JSON.stringify({ ...(b || { id: s.id }), lyrics: lines });
  lyFiles[`lyrics/${s.id}.json`] = text;
  mvHashes[s.id] = hash(text);
  if (lines.length) lyIndex[s.id] = lines.filter(l => (l.acts || []).some(a => a !== "listen")).length;
}
for (const b of LYRICS_LIVE) {
  const baseId = b.baseId || b.id.replace("-live", "");
  const lines = withRo(baseId, b.lyrics || []);
  const text = JSON.stringify({ ...b, lyrics: lines });
  lyFiles[`lyrics-live/${baseId}.json`] = text;
  liveHashes[baseId] = hash(text);
}
lyFiles["lyrics/index.json"] = JSON.stringify(lyIndex);

// 靜態卡拉OK快取拆成每首一個小檔（karaoke/<id>.json）並與歌詞雜湊一併寫入 lyrics/hashes.json
const karaokeHashes = {}, karaokeFiles = {};
const karaokeCachePath = path.join(root, "karaoke-cache.json");
if (fs.existsSync(karaokeCachePath)) {
  const kc = JSON.parse(fs.readFileSync(karaokeCachePath, "utf8"));
  if (kc && typeof kc === "object" && !Array.isArray(kc)) {
    for (const [id, entry] of Object.entries(kc)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const text = JSON.stringify(entry);
      karaokeFiles[`karaoke/${id}.json`] = text;
      karaokeHashes[id] = hash(text);
    }
  }
}
lyFiles["lyrics/hashes.json"] = JSON.stringify({ mv: mvHashes, live: liveHashes, karaoke: karaokeHashes });

// 版本字串：內容變了才換，瀏覽器才會抓新的（原始檔寫 ?v=dev）
const LYV = hash(Object.values(lyFiles).join("\n") + "\n" + Object.values(karaokeFiles).join("\n"));
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
// 最後更新日：CHANGELOG 最新一版的日期。頁尾看得到、結構化資料的 dateModified 和網站地圖的 lastmod 都用它，三邊一致
const UPDATED = (read("CHANGELOG.md").match(/^## v\d+\.\d+\.\d+ — (\d{4}-\d{2}-\d{2})/m) || [])[1] || new Date().toISOString().slice(0, 10);
// 每首歌頁的更新日：那首歌的資料或歌詞最後一次改動的日期（scripts/song-lastmod.mjs）；拿不到 git 歷史就全部用網站更新日
const SONG_DATES = songLastmod(root, SONGS.map(s => s.id));
if (!SONG_DATES) console.warn("拿不到 git 歷史（淺層 clone？），歌曲頁的 lastmod 改用網站更新日 " + UPDATED);
const songUpdated = id => (SONG_DATES && SONG_DATES[id]) || UPDATED;
// Ado 本人：維基百科與 Wikidata 讓搜尋引擎、AI 確定是哪一位 Ado（同名的人很多）
const ADO = {
  "@type": "MusicGroup",
  "@id": `${SITE}#ado`,
  "name": "Ado",
  "url": "https://www.universal-music.co.jp/ado/",
  "sameAs": [
    "https://www.wikidata.org/wiki/Q104012678",
    "https://en.wikipedia.org/wiki/Ado_(singer)",
    "https://ja.wikipedia.org/wiki/Ado_(%E6%AD%8C%E6%89%8B)",
    "https://www.youtube.com/@Ado1024",
    "https://x.com/ado1024imokenp",
    "https://www.instagram.com/ado1024sweetadream/",
    "https://open.spotify.com/artist/6mEQK9m2krja6X1cfsAjfl"
  ]
};
const [cssOut, songsOut, appOut, karaokeSrcOut] = await Promise.all([
  minifyCss(css),
  minifyJs(songsText),
  minifyJs(rawAppBundle),
  minifyJs(karaokeSrc)
]);

let src = read("index.html");
src = mustReplace(src, /<span class="build">[^<]*<\/span>/, () => `<span class="build">${VERSION} · <time datetime="${UPDATED}">${UPDATED}</time></span>`, "index.html span.build");
src = mustReplace(src, /style\.css\?v=[^"]*/, () => `style.css?v=${hash(cssOut)}`, "index.html style.css?v=");
src = mustReplace(src, "songs.js?v=dev", () => `songs.js?v=${hash(songsOut)}`, "index.html songs.js?v=dev");
src = mustReplace(src, "karaoke-sources.js?v=dev", () => `karaoke-sources.js?v=${hash(karaokeSrcOut)}`, "index.html karaoke-sources.js?v=dev");
src = mustReplace(
  src,
  /<!--\s*build:app-scripts:start\s*-->[\s\S]*?<!--\s*build:app-scripts:end\s*-->/,
  () => `<script defer src="app.js?v=${hash(appOut)}"></script>`,
  "index.html build:app-scripts"
);
src = mustReplace(src, '<html lang="zh-Hant-TW">', `<html lang="zh-Hant-TW" data-lyrics="${LYV}"${STAGE3DV ? ` data-stage3d="${STAGE3DV}"` : ""}>`, 'index.html <html lang="zh-Hant-TW">');

// 每種語言的字典另存一個小檔，英文版只載英文、日文版只載日文；只保留執行期（app.js、共用模組與歌曲／歌詞資料）會用到的 key
const runtimeKeySet = new Set([
  "歌ネット ↗", "在 YouTube 開啟 ↗", "尚未公開", "預留曲目", "尚無 MV", "即將發行", "合作",
  ...Object.values(TIER_LABEL),
  ...Object.values(PENC).map(([name]) => name),
  "彩色",
  ...Object.values(ACT_MAP).flatMap(a => [a.name, a.how]),
  "全部年份", "{0} 首", "年份：", "；", "、"
]);
for (const s of SONGS) {
  for (const t of (s.tips || [])) runtimeKeySet.add(t);
  if (s.tie) runtimeKeySet.add(s.tie);
  if (s.album) runtimeKeySet.add(s.album);
}
for (const g of (SERIES || [])) runtimeKeySet.add(g.name);
for (const b of [...LYRICS, ...LYRICS_LIVE]) {
  for (const l of (b.lyrics || [])) {
    if (l.call) runtimeKeySet.add(l.call);
    const jp = (l.jp || "").trim();
    if (isNote(jp)) runtimeKeySet.add(jp);
  }
}
const isRuntimeKey = k => {
  if (runtimeKeySet.has(k)) return true;
  const escKey = JSON.stringify(k).slice(1, -1);
  return rawAppBundle.includes(k) || rawAppBundle.includes(escKey)
    || karaokeSrc.includes(k) || karaokeSrc.includes(escKey)
    || songsText.includes(k) || songsText.includes(escKey);
};
const i18nFiles = Object.fromEntries(await Promise.all(
  ["en", "ja"].map(async code => {
    const dict = I18N[code] || {};
    const pruned = Object.fromEntries(Object.entries(dict).filter(([k]) => isRuntimeKey(k)));
    return [code, await minifyJs(`window.ADO_I18N = ${JSON.stringify({ [code]: pruned })};\n`)];
  })
));

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
  let html = translateTemplate(src, L, T);
  html = mustReplace(
    html,
    /[ \t]*<!--\s*fonts:tw:start\s*-->\r?\n?([\s\S]*?)[ \t]*<!--\s*fonts:tw:end\s*-->\r?\n?/,
    (_, inner) => (L.code === "zh" ? inner : ""),
    "langTemplate fonts:tw"
  );
  html = mustReplace(html, '<html lang="zh-Hant-TW" ', `<html lang="${L.html}" data-lang="${L.code}"${up ? ` data-root="${up}"` : ""} `, "langTemplate <html");
  html = mustReplace(html, "<!-- build:i18n -->", L.code === "zh" ? "" : `<script defer src="${up}i18n/${L.code}.js?v=${hash(i18nFiles[L.code])}"></script>`, "langTemplate build:i18n");
  // 頂欄的站名：英文用短名，手機上放得下
  const SHORT = { en: "Ado Chant Guide" };
  if (SHORT[L.code]) html = mustReplace(html, /(<span class="mark-name">)[^<]*(<\/span>)/, (m, a, b) => `${a}${SHORT[L.code]}${b}`, "langTemplate mark-name");
  if (up) html = html.replace(/(\s(?:href|src)=")((?:favicon\.ico|assets\/|style\.css|songs\.js|karaoke-sources\.js|app\.js)[^"]*")/g, `$1${up}$2`);
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

function page(tpl, L, T, { rest, title, desc, ld, base, song, robots, extra = "" }) {
  const url = SITE + L.dir + rest;
  const ogImg = song && song.yt ? `https://i.ytimg.com/vi/${song.yt}/hqdefault.jpg` : OG_IMG;
  const ogW = song && song.yt ? 480 : 1200;
  const ogH = song && song.yt ? 360 : 630;
  const ogAlt = song ? title : T("Ado 應援指南：看 MV，跟著同步歌詞先把應援練熟");
  const seoBlock = [
    `<link rel="canonical" href="${url}">`,
    altLinks(rest),
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:site_name" content="${L.name}">`,
    `<meta property="og:locale" content="${L.og}">`,
    ...LANGS.filter(x => x !== L).map(x => `<meta property="og:locale:alternate" content="${x.og}">`),
    `<meta property="og:image" content="${ogImg}">`,
    `<meta property="og:image:alt" content="${esc(ogAlt)}">`,
    `<meta property="og:image:width" content="${ogW}">`,
    `<meta property="og:image:height" content="${ogH}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${ogImg}">`,
    `<script type="application/ld+json">${json(ld)}</script>`,
    gaScript,
    extra
  ].filter(Boolean).join("\n");
  let html = tpl;
  html = mustReplace(html, /<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`, "page <title>");
  html = mustReplace(html, /<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${esc(desc)}">`, "page meta description");
  if (robots) html = mustReplace(html, /<meta name="robots" content="[^"]*">/, () => `<meta name="robots" content="${robots}">`, "page meta robots");
  html = mustReplace(html, /<meta property="og:title" content="[^"]*">/, () => `<meta property="og:title" content="${esc(title)}">`, "page og:title");
  html = mustReplace(html, /<meta property="og:description" content="[^"]*">/, () => `<meta property="og:description" content="${esc(desc)}">`, "page og:description");
  html = mustReplace(html, /<meta property="og:type" content="[^"]*">/, () => `<meta property="og:type" content="${song ? "music.song" : "website"}">`, "page og:type");
  html = mustReplace(html, /<!-- build:seo[^>]*-->/, () => seoBlock, "page build:seo");
  if (base) html = mustReplace(html, '<meta charset="utf-8">', `<meta charset="utf-8">\n<base href="${base}">`, "page <meta charset>");
  if (song) html = mustReplace(html, /<html lang="([^"]+)" /, (m, lang) => `<html lang="${lang}" data-song="${song.id}" `, "page data-song");
  return langLinks(html, L, rest);
}

const write = (rel, text) => {
  const f = path.join(out, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text);
};
fs.rmSync(out, { recursive: true, force: true });

const FREQ_1 = (PRACTICE[1] || []).map(id => SONGS.find(s => s.id === id)).filter(Boolean);
const FREQ_2 = (PRACTICE[2] || []).map(id => SONGS.find(s => s.id === id)).filter(Boolean);
const FREQ_3 = (PRACTICE[3] || []).map(id => SONGS.find(s => s.id === id)).filter(Boolean);
const STARTERS = FREQ_1;
const FREQ_ALL_CNT = FREQ_1.length + FREQ_2.length + FREQ_3.length;
const LATEST = SONGS.filter(s => !s.upcoming).sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.no - b.no).slice(0, 6);
const urls = [""];

const rootManifest = JSON.parse(read("manifest.webmanifest"));
const MANIFEST_COPY = {
  en: {
    name: "Ado Fan Chant Guide",
    short_name: "Ado Chant Guide",
    description: "Unofficial fan-made Ado concert chant guide: watch MVs with synced lyrics to practice claps, sing-alongs, penlight colors, and calls."
  },
  ja: {
    name: "Ado 応援ガイド",
    short_name: "Ado 応援ガイド",
    description: "ファン制作の非公式 Ado ライブ応援ガイド：公式MVと同期歌詞で手拍子・合唱・ペンライト色・コールを予習できます。"
  }
};

// ── 每種語言產生首頁＋每首歌的獨立頁 ──
function renderLang(L) {
  const T = makeT(L.code);
  const tpl = langTemplate(L, T);
  const thumbHtml = (s, w, h, lazy) => s.yt
    ? `<img class="thumb" src="https://i.ytimg.com/vi/${s.yt}/mqdefault.jpg" alt="" width="${w}" height="${h}" decoding="async"${lazy ? ' loading="lazy"' : ""}>`
    : `<span class="thumb thumb-ph" aria-hidden="true"><span>${esc(s.upcoming ? T("預留曲目") : T("尚無 MV"))}</span></span>`;
  const icon = a => `<svg class="a-${a}" role="img" aria-label="${esc(T(ACT_MAP[a]?.name || a))}"><use href="#${ACT_MAP[a]?.icon || "i-sing"}"/></svg>`;
  const penDots = s => sharedPenDots(s, PEN, T);
  const subOf = s => [namePart(s, L.code), s.cover ? T("翻唱") : (s.collab ? T("合作") : ""), s.upcoming ? T("即將發行") : ""].filter(Boolean).join("・");
  const actIcons = s => s.acts.filter(a => a !== "listen").map(icon).join("");
  const tipsOf = s => (s.hold || s.sug ? [] : s.tips || []).map(t => T(t));

  // ── 首頁（靜態預渲染歌曲清單，讓搜尋引擎與 AI 爬蟲能直接索引所有內部連結） ──
  const usedActs = new Set(SONGS.flatMap(s => s.acts.filter(a => a !== "listen")));
  const homeLegendHtml = Object.keys(ACT_MAP).filter(a => usedActs.has(a)).map(a => `<span class="a-${a}">${icon(a)}${T(ACT_MAP[a].name)}</span>`).join("");
  const ORIGINAL_SONGS = SONGS.filter(s => !s.cover && !s.collab);
  const homeSongListHtml = ORIGINAL_SONGS.map(s => `<li><a class="song" href="song/${s.id}/" data-id="${s.id}">${thumbHtml(s, 80, 45, true)}<span class="song-main"><span class="name"><span class="ja" lang="ja">${esc(s.ja)}</span><span class="sub"><span class="zh">${esc(subOf(s))}</span>${penDots(s)}</span></span><span class="acts">${actIcons(s)}${s.free ? `<span class="free">${T("自由搖")}</span>` : ""}</span></span></a></li>`).join("");
  const sortedForReel = [...SONGS].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.no - a.no);
  const reelRows = [0, 1, 2].map(i => {
    const start = Math.round((i * sortedForReel.length) / 3);
    const end = Math.round(((i + 1) * sortedForReel.length) / 3);
    return sortedForReel.slice(start, end);
  });
  const reelCardHtml = s => {
    const sub = namePart(s, L.code) || (s.upcoming ? T("即將發行") : "") || (s.cover ? T("翻唱") : (s.collab ? T("合作") : ""));
    const year = (s.date || "").slice(0, 4);
    return `<a class="reel-card" href="song/${s.id}/" data-id="${s.id}" draggable="false">${thumbHtml(s, 116, 65, true)}<span class="reel-info"><span class="reel-ja" lang="ja">${esc(s.ja)}</span><span class="reel-meta">${penDots(s)}<span class="reel-year">${esc(year)}</span>${sub ? `<span class="reel-sub">${esc(sub)}</span>` : ""}</span></span></a>`;
  };
  const reelYearCounts = {};
  for (const s of sortedForReel) { const y = (s.date || "").slice(0, 4); if (/^\d{4}$/.test(y)) reelYearCounts[y] = (reelYearCounts[y] || 0) + 1; }
  const yearItemHtml = (y, label, n) => `<button type="button" class="pop-item" role="menuitemradio" data-year="${y}" aria-checked="${y ? "false" : "true"}"><span>${esc(label)}</span><span class="pop-meta">${esc(T("{0} 首", n))}</span><svg class="pop-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>`;
  const homeYearItemsHtml = yearItemHtml("", T("全部年份"), SONGS.length)
    + Object.keys(reelYearCounts).sort((a, b) => b - a).map(y => yearItemHtml(y, y, reelYearCounts[y])).join("");
  const homeSongIndexHtml = reelRows.map((row, idx) =>
    `<div class="reel-row" data-dir="${idx % 2 === 1 ? "1" : "-1"}"><div class="reel-track">${row.map(reelCardHtml).join("")}</div></div>`
  ).join("");
  const shelfHtml = (list, lazy = false) => list.map(s => `<li><a class="card" href="song/${s.id}/" data-id="${s.id}">${thumbHtml(s, 320, 180, lazy)}<span class="card-text"><span class="card-ja" lang="ja">${esc(s.ja)}</span><span class="card-sub"><span>${esc(subOf(s))}</span><span class="acts">${actIcons(s)}</span></span></span></a></li>`).join("");
  const homeShelfHtml = shelfHtml(STARTERS, false);
  const homeLatestShelfHtml = shelfHtml(LATEST, true);

  // 常見問題：結構化資料直接讀這個語言畫面上的文字，兩邊一致
  const FAQ = [...tpl.matchAll(/<details class="faq-item"(?:\s+open)?>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
    .map(m => m.slice(1).map(t => t.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()));
  if (!FAQ.length) throw new Error("index.html 找不到常見問題（details.faq-item）");
  const home = SITE + L.dir;
  const COPY = {
    zh: {
      title: `Ado 應援指南｜演唱會手燈顏色、大合唱與拍手教學（${SONGS.length} 首）`,
      desc: `第一次去 Ado 演唱會也不慌：${SONGS.length} 首歌各有一頁，跟著官方 MV 和日中同步歌詞，哪裡拍手、哪裡大合唱、哪裡喊「Hey!」、手燈切什麼顏色都標好了。非官方粉絲製作，不照任何場次歌單，不暴雷。`,
      site: `非官方粉絲製作的 Ado 演唱會應援指南：收錄 ${SONGS.length} 首歌曲教學，看著 MV 跟同步歌詞，練哪裡拍手、哪裡大合唱、哪裡喊聲，還有每首手燈推薦顏色與藍牙手燈連動。`,
      list: "Ado 演唱會歌曲應援清單", listDesc: `Ado ${INDEXABLE_SONGS.length} 首歌曲的演唱會應援教學與同步歌詞`
    },
    en: {
      title: `Ado Fan Chant Guide | Lightstick Colors & Sing-Alongs (${SONGS.length} Songs)`,
      desc: `Going to an Ado concert? Each of ${SONGS.length} songs has its own page: play the official MV with synced lyrics and romaji, and see exactly where to clap, sing along, shout "Hey!", and which penlight / lightstick color to use. Unofficial, made by fans, spoiler-free.`,
      site: `An unofficial fan-made guide to Ado concert chants: ${SONGS.length} songs with synced lyrics, romaji, sing-along parts, clap and call cues, and penlight / lightstick colors.`,
      list: "Ado concert chant guide by song", listDesc: `Chant guides and synced lyrics for ${INDEXABLE_SONGS.length} Ado songs`
    },
    ja: {
      title: `Ado 応援ガイド｜ライブのペンライト色・コール・合唱（全${SONGS.length}曲）`,
      desc: `初めてのAdoライブでも大丈夫。${SONGS.length}曲それぞれに専用ページ、公式MVと同期歌詞で、手拍子・合唱・「Hey!」コールの場所とペンライトの色をチェックできます。ファンによる非公式サイト、セトリのネタバレなし。`,
      site: `ファンが作った非公式のAdoライブ応援ガイド。${SONGS.length}曲の同期歌詞、合唱パート、手拍子・コールのタイミング、ペンライト色をまとめています。`,
      list: "Ado ライブ応援ガイド 曲一覧", listDesc: `Adoの${INDEXABLE_SONGS.length}曲の応援ガイドと同期歌詞`
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
        "dateModified": UPDATED,
        "about": ADO
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
        "numberOfItems": INDEXABLE_SONGS.length,
        "itemListElement": INDEXABLE_SONGS.map((s, idx) => ({
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
  homeHtml = mustReplace(homeHtml, '<h1 id="sTitle" lang="ja"></h1>', '<p id="sTitle" lang="ja"></p>', "home #sTitle");
  homeHtml = mustReplace(homeHtml, '<nav class="song-index" id="songIndex" aria-label="' + esc(T("全部歌曲連結")) + '"></nav>', `<nav class="song-index" id="songIndex" aria-label="${esc(T("全部歌曲連結"))}">${homeSongIndexHtml}</nav>`, "home #songIndex");
  homeHtml = mustReplace(homeHtml, '<div class="pop narrow reel-year-pop" id="reelYearPop" role="menu" aria-label="' + esc(T("選擇年份")) + '" hidden></div>', `<div class="pop narrow reel-year-pop" id="reelYearPop" role="menu" aria-label="${esc(T("選擇年份"))}" hidden>${homeYearItemsHtml}</div>`, "home #reelYearPop");
  homeHtml = mustReplace(homeHtml, '<ul class="songs collapsed" id="songList"></ul>', `<ul class="songs collapsed" id="songList">${homeSongListHtml}</ul>`, "home #songList");
  homeHtml = mustReplace(homeHtml, '<ul class="shelf" id="shelf"></ul>', `<ul class="shelf" id="shelf">${homeShelfHtml}</ul>`, "home #shelf");
  homeHtml = mustReplace(homeHtml, '<ul class="shelf" id="latestShelf"></ul>', `<ul class="shelf" id="latestShelf">${homeLatestShelfHtml}</ul>`, "home #latestShelf");
  homeHtml = mustReplace(homeHtml, '<span class="count" id="songCount"></span>', `<span class="count" id="songCount">${T("{0} 首", ORIGINAL_SONGS.length)}</span>`, "home #songCount");
  homeHtml = mustReplace(homeHtml, /(<p class="list-progress" id="listProgress"[^>]*>)[^<]*(<\/p>)/, (m, a, b) => `${a}${T("已列出 {0}／{1} 首", Math.min(12, ORIGINAL_SONGS.length), ORIGINAL_SONGS.length)}${b}`, "home #listProgress");
  homeHtml = mustReplace(homeHtml, /(<span id="factSongs">)[^<]*(<\/span>)/, (m, a, b) => `${a}${SONGS.length}${b}`, "home #factSongs");
  homeHtml = mustReplace(homeHtml, /(<b class="cnt" id="cntFreqAll">)[^<]*(<\/b>)/, (m, a, b) => `${a}${FREQ_ALL_CNT}${b}`, "home #cntFreqAll");
  homeHtml = mustReplace(homeHtml, /(<b class="cnt" id="cntFreq1">)[^<]*(<\/b>)/, (m, a, b) => `${a}${FREQ_1.length}${b}`, "home #cntFreq1");
  homeHtml = mustReplace(homeHtml, /(<b class="cnt" id="cntFreq2">)[^<]*(<\/b>)/, (m, a, b) => `${a}${FREQ_2.length}${b}`, "home #cntFreq2");
  homeHtml = mustReplace(homeHtml, /(<b class="cnt" id="cntFreq3">)[^<]*(<\/b>)/, (m, a, b) => `${a}${FREQ_3.length}${b}`, "home #cntFreq3");
  homeHtml = mustReplace(homeHtml, /(<b class="cnt" id="cntLiveAll">)[^<]*(<\/b>)/, (m, a, b) => `${a}${LIVE_ALL_CNT}${b}`, "home #cntLiveAll");
  homeHtml = mustReplace(homeHtml, /(<b class="cnt" id="cntLiveVideo">)[^<]*(<\/b>)/, (m, a, b) => `${a}${LIVE_VID_CNT}${b}`, "home #cntLiveVideo");
  homeHtml = mustReplace(homeHtml, /(<b class="cnt" id="cntLiveAudio">)[^<]*(<\/b>)/, (m, a, b) => `${a}${LIVE_AUD_CNT}${b}`, "home #cntLiveAudio");
  homeHtml = mustReplace(homeHtml, /(<div class="home-legend" id="homeLegend"[^>]*>)(<\/div>)/, (m, a, b) => `${a}${homeLegendHtml}${b}`, "home #homeLegend");
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
    const indexable = isIndexableSong(s);
    if (L.code === "zh" && indexable) urls.push(rest);
    const pageTitle = songPageTitle(s, L.code);
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
          "about": { "@id": `${url}#song` },
          "dateModified": songUpdated(s.id),
          "primaryImageOfPage": { "@type": "ImageObject", "url": s.yt ? `https://i.ytimg.com/vi/${s.yt}/hqdefault.jpg` : OG_IMG },
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
          "byArtist": ADO,
          "datePublished": s.date,
          ...(s.len ? { "duration": isoDuration(s.len) } : {}),
          "url": url,
          "inLanguage": "ja",
          ...(s.yt ? {
            "video": {
              "@type": "VideoObject",
              "name": T("Ado〈{0}〉官方 MV", s.ja),
              "description": T("Ado〈{0}〉官方音樂錄影帶 MV", s.ja),
              "thumbnailUrl": `https://i.ytimg.com/vi/${s.yt}/hqdefault.jpg`,
              "embedUrl": `https://www.youtube.com/embed/${s.yt}`,
              "uploadDate": `${s.date}T00:00:00+09:00`
            }
          } : {})
        }
      ]
    };

    let songHtml = page(tpl, L, T, {
      rest,
      base: "../../",
      song: s,
      title: pageTitle,
      desc,
      ld: songLd,
      robots: indexable ? undefined : "noindex, follow"
    });

    // 靜態預渲染歌詞行與應援標記；第二行：中文版放中譯、英文版放羅馬拼音、日文版不放
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
    const cardInnerDl = `<dl class="card-dl"><dt id="cardAkaDt"${akaText ? "" : " hidden"}>${T("也叫")}</dt><dd id="cardAkaDd"${akaText ? "" : " hidden"}>${esc(akaText)}</dd><dt id="cardTieDt"${tie ? "" : " hidden"}>${T("出處")}</dt><dd id="cardTieDd"${tie ? "" : " hidden"}>${esc(tie)}</dd><dt id="cardAlbumDt"${album ? "" : " hidden"}>${T("收錄專輯")}</dt><dd id="cardAlbumDd"${album ? "" : " hidden"}>${esc(album)}</dd><dt id="cardDateDt">${T("發布日期")}</dt><dd id="cardDateDd">${esc(s.date.replace(/-/g, "/"))}</dd><dt>${T("推薦手燈")}</dt><dd id="cardPen">${esc(pen.text)}</dd><dt>${T("應援重點")}</dt><dd id="cardTips">${esc(tips.length ? tips.join(T("；")) : (s.free ? T("沒有固定應援，自由跟著節奏搖手燈。") : T("應援還在整理，先熟悉旋律。")))}</dd><dt>${T("官方 MV")}</dt><dd>${s.yt ? `<a id="cardYt" href="https://www.youtube.com/watch?v=${s.yt}" target="_blank" rel="noopener">${T("在 YouTube 開啟 ↗")}</a>` : `<a id="cardYt">${T("尚未公開")}</a>`}</dd><dt>${T("正版歌詞")}</dt><dd><a id="cardLyrics" href="${s.ut}" target="_blank" rel="noopener">${T("歌ネット ↗")}</a></dd><dt>${T("串流平台")}</dt><dd id="cardStream">${s.stream.map(x => `<a href="${x.url}" class="live-chip" target="_blank" rel="noopener">${esc(x.name)} ↗</a>`).join(" ")}</dd>${liveRows}</dl>`;

    const c = s.credit;
    const who = list => list.map(n => `<span lang="ja">${esc(n)}</span>`).join("、");
    const creditRows = !c ? [] : [[T("作詞"), c.w], [T("作曲"), c.c], [T("編曲"), c.a]].filter(([, v]) => v && v.length).map(([k, v]) => `<dt>${k}</dt><dd>${who(v)}</dd>`);
    if (c && c.x && c.x.length) creditRows.push(`<dt>${T("延伸聽")}</dt><dd><span class="card-note">${T("本站還沒收、Ado 也唱過的同作者作品")}</span>${c.x.map(t => `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent("Ado " + t)}" target="_blank" rel="noopener" class="live-chip" lang="ja">${esc(t)} ↗</a>`).join(" ")}</dd>`);
    const relGroups = relatedOf(s, T);
    const relBlock = relGroups.length ? `<section class="rel-block" aria-label="${esc(T("關聯曲"))}"><h4 class="rel-title">${T("關聯曲")}<small>${T("同一位創作者、同一部作品，點了直接換歌")}</small></h4>${relGroups.map(g => `<div class="rel-g"><p class="rel-h"><b${g.kind === "who" ? ' lang="ja"' : ""}>${esc(g.name)}</b><small>${g.kind === "who" ? T("這首的{0}", esc(g.role)) : T("同一部作品")}</small></p><ul class="rel-list">${g.songs.map(({ s: x, role }) => `<li><a class="rel-link" href="song/${x.id}/" data-id="${x.id}">${thumbHtml(x, 64, 36, true)}<span class="rel-t"><b lang="ja">${esc(x.ja)}</b>${role || x.cover ? `<small>${[role, x.cover ? T("翻唱") : ""].filter(Boolean).join("・")}</small>` : ""}</span></a></li>`).join("")}</ul></div>`).join("")}</section>` : "";
    const inlineLead = songInlineSummary(s, L.code, pen, tips, lines, T);
    const inlineDl = cardInnerDl.replace(/ id="[^"]+"/g, "");
    const inlineHtml = `<h2 class="guide-inline-h">${T("〈{0}〉應援速覽", `${esc(s.ja)}${dn ? `（${esc(dn)}）` : ""}`)}</h2><p class="guide-inline-lead">${esc(inlineLead)}</p><div class="song-guide-card">${inlineDl}${creditRows.length ? `<dl class="card-dl card-credit">${creditRows.join("")}</dl>` : ""}${relBlock}</div>`;

    // 轉換歌曲頁面的 HTML：預設展示歌曲 view，隱藏 home view 並移除首頁專屬的靜態文案（練習原則與常見問題）以減少跨頁重複內容；
    // 速覽彈窗（#guideDlg 裡的 #songGuideCard）由 app.js 載入時填值，不重複靜態輸出，避免與 #songGuideInline 疊字
    songHtml = mustReplace(songHtml, '<body>', '<body class="on-song">', "song <body>");
    songHtml = mustReplace(songHtml, '<div class="view home" id="home">', '<div class="view home" id="home" hidden>', "song #home");
    songHtml = mustReplace(songHtml, /<!-- 巡演專頁橫幅[\s\S]*?<section class="tour-banner-sec" id="tourBanner"[\s\S]*?<\/section>\s*/, "", "song strip #tourBanner");
    songHtml = mustReplace(songHtml, /<!-- 應援練習說明 -->[\s\S]*?<section class="home-guide" id="homeGuide"[\s\S]*?<\/section>\s*/, "", "song strip #homeGuide");
    songHtml = mustReplace(songHtml, /<!-- 常見問題 -->[\s\S]*?<section class="faq" id="faq"[\s\S]*?<\/section>\s*/, "", "song strip #faq");
    songHtml = mustReplace(songHtml, /<h1 id="heroH">([\s\S]*?)<\/h1>/, (m, inner) => `<p id="heroH">${inner}</p>`, "song #heroH");
    songHtml = mustReplace(songHtml, '<div class="view" id="song" hidden>', '<div class="view" id="song">', "song #song");
    songHtml = mustReplace(songHtml, '<h1 id="sTitle" lang="ja"></h1>', `<h1 id="sTitle" lang="ja">${esc(s.ja)}${subTitleHtml}</h1>`, "song #sTitle");
    songHtml = mustReplace(songHtml, '<span class="pen" id="pen"></span>', `<span class="pen" id="pen">${T("螢光棒")}${penDots(s)}<b>${esc(pen.shortText)}</b></span>`, "song #pen");
    songHtml = mustReplace(songHtml, '<div class="how" id="cueHow"></div>', `<div class="how" id="cueHow">${esc(cueHowText)}</div>`, "song #cueHow");
    songHtml = mustReplace(songHtml, '<ul class="summary" id="cueSummary"></ul>', `<ul class="summary" id="cueSummary">${tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>`, "song #cueSummary");
    songHtml = mustReplace(songHtml, '<div id="lines"></div>', `<div id="lines">${prerenderedLines}</div>`, "song #lines");
    songHtml = mustReplace(songHtml, `<section class="song-guide-inline" id="songGuideInline" aria-label="${esc(T("歌曲應援詳情"))}"></section>`, `<section class="song-guide-inline" id="songGuideInline" data-song="${s.id}" aria-label="${esc(T("歌曲應援詳情"))}">${inlineHtml}</section>`, "song #songGuideInline");

    // 上一首／下一首連結預渲染
    if (prevSong) songHtml = mustReplace(songHtml, /<a class="ib" id="prevSong" aria-label="[^"]*">/, () => `<a class="ib" id="prevSong" href="song/${prevSong.id}/" data-id="${prevSong.id}" aria-label="${esc(T("上一首：{0}", prevSong.ja))}">`, "song #prevSong");
    if (nextSong) songHtml = mustReplace(songHtml, /<a class="ib" id="nextSong" aria-label="[^"]*">/, () => `<a class="ib" id="nextSong" href="song/${nextSong.id}/" data-id="${nextSong.id}" aria-label="${esc(T("下一首：{0}", nextSong.ja))}">`, "song #nextSong");

    write(`${L.dir}song/${s.id}/index.html`, songHtml);
  }

  // ── 巡演預習專頁（tour/<id>/）：獨立靜態頁，不載入主站大型腳本，只掛輕量選單／外觀互動 ──
  const tourInlineScript = `<script>
(function(){
  var menus=[["lampBtn","lampPop"],["langBtn","langPop"],["themeBtn","themePop"]].map(function(p){return[document.getElementById(p[0]),document.getElementById(p[1])];}).filter(function(p){return p[0]&&p[1];});
  function closeAll(){menus.forEach(function(p){p[1].hidden=true;p[0].setAttribute("aria-expanded","false");});}
  menus.forEach(function(p){
    p[0].addEventListener("click",function(e){
      e.stopPropagation();
      var open=!p[1].hidden;
      closeAll();
      if(!open){p[1].hidden=false;p[0].setAttribute("aria-expanded","true");}
    });
  });
  document.addEventListener("click",function(e){if(!e.target.closest(".menu"))closeAll();});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")closeAll();});
  var mq=matchMedia("(prefers-color-scheme: light)");
  function applyTheme(mode){
    var light=mode==="light"||(mode!=="dark"&&mq.matches);
    document.documentElement.dataset.theme=light?"light":"dark";
    var mc=document.querySelector('meta[name="theme-color"]');
    if(mc)mc.content=light?"#ffffff":"#070a12";
    document.querySelectorAll("[data-theme-pick]").forEach(function(b){b.setAttribute("aria-checked",String(b.dataset.themePick===mode));});
  }
  var saved="system";
  try{saved=localStorage.getItem("theme")||"system";}catch(e){}
  applyTheme(saved);
  mq.addEventListener("change",function(){var cur="system";try{cur=localStorage.getItem("theme")||"system";}catch(e){}if(cur==="system")applyTheme("system");});
  document.querySelectorAll("[data-theme-pick]").forEach(function(b){
    b.addEventListener("click",function(){
      var m=b.dataset.themePick;
      try{if(m==="system")localStorage.removeItem("theme");else localStorage.setItem("theme",m);}catch(e){}
      applyTheme(m);closeAll();
    });
  });
  var bar=document.getElementById("bar");
  function syncBar(){if(bar)bar.classList.toggle("is-stuck",scrollY>4);}
  addEventListener("scroll",syncBar,{passive:true});syncBar();
  var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 預熱書架：跟首頁「推薦練習」一樣，進度條跟著捲動走，箭頭一次捲 80%，到底就停用；放得下就不顯示
  document.querySelectorAll("[data-shelf]").forEach(function(shelf){
    var nav=shelf.nextElementSibling,thumb=nav.querySelector(".shelf-thumb"),track=nav.querySelector(".shelf-track");
    var prev=nav.querySelector('[data-dir="-1"]'),next=nav.querySelector('[data-dir="1"]'),btns=nav.querySelector(".shelf-btns"),tick=0;
    function measure(){
      tick=0;if(!shelf.clientWidth)return;
      var max=shelf.scrollWidth-shelf.clientWidth,frac=Math.min(1,shelf.clientWidth/shelf.scrollWidth),pos=max>0?shelf.scrollLeft/max:0,still=max<=1;
      track.hidden=still;btns.hidden=still;nav.classList.toggle("is-static",still);
      thumb.style.width=frac*100+"%";thumb.style.left=pos*(1-frac)*100+"%";
      var had=document.activeElement;prev.disabled=pos<=.01;next.disabled=pos>=.99;
      if(had===prev&&prev.disabled)next.focus();else if(had===next&&next.disabled)prev.focus();
    }
    shelf.addEventListener("scroll",function(){if(!tick)tick=requestAnimationFrame(measure);},{passive:true});
    if(window.ResizeObserver)new ResizeObserver(function(){measure();}).observe(shelf);
    [prev,next].forEach(function(b){b.addEventListener("click",function(){shelf.scrollBy({left:+b.getAttribute("data-dir")*shelf.clientWidth*.8,behavior:reduce?"auto":"smooth"});});});
    measure();
  });
  // 本頁導覽（浮動進度側欄）：寬螢幕是黏在左邊的側欄，手機是底部浮動按鈕＋展開清單；捲到哪一段就亮哪一段，進度線跟著填滿
  var rail=document.getElementById("tourRail"),fab=document.getElementById("tourFab");
  if(rail){
    var links=[].slice.call(rail.querySelectorAll("a[data-sec]"));
    var items=links.map(function(a){return{a:a,el:document.getElementById(a.getAttribute("data-sec")),top:!a.closest(".tour-rail-sub"),li:a.closest(".tour-rail-item")};}).filter(function(x){return x.el;});
    var tops=items.filter(function(x){return x.top;}),list=rail.querySelector(".tour-rail-list");
    var pct=document.getElementById("tourRailPct"),hero=document.querySelector(".tour-hero"),fabLabel=document.getElementById("tourFabLabel"),ring=document.getElementById("tourFabRing"),C=2*Math.PI*9,tick2=0;
    function dotY(it){var d=it.a.querySelector(".tour-rail-dot")||it.a,r=d.getBoundingClientRect();return r.top-list.getBoundingClientRect().top+r.height/2;}
    function update(){
      tick2=0;if(!tops.length)return;
      var y=scrollY,vh=innerHeight,line=vh*.32,act=-1,sub=null;
      tops.forEach(function(it,i){if(it.el.getBoundingClientRect().top<=line)act=i;});
      var at=tops[act]||null;
      items.forEach(function(it){if(!it.top&&at&&it.li===at.li&&it.el.getBoundingClientRect().top<=line)sub=it;});
      items.forEach(function(it){var on=it===at||it===sub;it.a.classList.toggle("is-active",on);if(on)it.a.setAttribute("aria-current","location");else it.a.removeAttribute("aria-current");});
      tops.forEach(function(it,i){it.a.classList.toggle("is-passed",i<=act);});
      var ys=tops.map(dotY),h=ys[0];
      if(at){var r=at.el.getBoundingClientRect(),nx=tops[act+1],span=nx?nx.el.getBoundingClientRect().top-r.top:r.height,f=Math.max(0,Math.min(1,(line-r.top)/Math.max(1,span)));h=ys[act]+(nx?f*(ys[act+1]-ys[act]):0);}
      list.style.setProperty("--rail-top",ys[0]+"px");list.style.setProperty("--rail-len",(ys[ys.length-1]-ys[0])+"px");list.style.setProperty("--rail-fill",Math.max(0,h-ys[0])+"px");
      var start=tops[0].el.getBoundingClientRect().top+y-line,end=document.documentElement.scrollHeight-vh,p=Math.max(0,Math.min(1,(y-start)/Math.max(1,end-start)));
      if(pct)pct.textContent=Math.round(p*100)+"%";
      if(ring)ring.style.strokeDashoffset=String(C*(1-p));
      if(fabLabel)fabLabel.textContent=(at||tops[0]).a.getAttribute("data-label");
      if(fab)fab.classList.toggle("is-shown",!hero||hero.getBoundingClientRect().bottom<0);
    }
    function setOpen(o){rail.classList.toggle("is-open",o);if(fab)fab.setAttribute("aria-expanded",String(o));if(o)update();}
    addEventListener("scroll",function(){if(!tick2)tick2=requestAnimationFrame(update);},{passive:true});
    addEventListener("resize",function(){update();});
    if(window.ResizeObserver)new ResizeObserver(function(){update();}).observe(document.body);
    if(fab)fab.addEventListener("click",function(e){e.stopPropagation();setOpen(!rail.classList.contains("is-open"));});
    document.addEventListener("click",function(e){if(rail.classList.contains("is-open")&&!e.target.closest("#tourRail")&&!e.target.closest("#tourFab"))setOpen(false);});
    document.addEventListener("keydown",function(e){if(e.key==="Escape"&&rail.classList.contains("is-open")){setOpen(false);if(fab)fab.focus();}});
    links.forEach(function(a){a.addEventListener("click",function(e){
      var el=document.getElementById(a.getAttribute("data-sec"));if(!el)return;
      e.preventDefault();setOpen(false);el.scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"});history.replaceState(null,"",location.pathname+location.search+"#"+el.id);
    });});
    update();
  }
})();
</script>`;

  for (const tour of TOURS) {
    const tc = tour.copy[L.code];
    if (!tc) continue;
    const rest = `tour/${tour.id}/`;
    const url = home + rest;
    if (L.code === "zh") urls.push(rest);

    const uniqueTourSongs = [];
    const seenIds = new Set();
    for (const g of (tour.groups || [])) {
      for (const sid of (g.songs || [])) {
        if (seenIds.has(sid)) continue;
        const s = SONG_BY_ID.get(sid);
        if (s) { seenIds.add(sid); uniqueTourSongs.push(s); }
      }
    }

    const tourLd = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${url}#webpage`,
          "url": url,
          "name": tc.title,
          "description": tc.desc,
          "inLanguage": L.html,
          "isPartOf": { "@type": "WebSite", "@id": `${home}#website` },
          "about": ADO,
          "dateModified": tour.updated || UPDATED,
          "author": { "@type": "Person", "@id": `${SITE}#author`, "name": "Kuti", "sameAs": [THREADS, INSTAGRAM] },
          "breadcrumb": { "@id": `${url}#breadcrumb` }
        },
        {
          "@type": "BreadcrumbList",
          "@id": `${url}#breadcrumb`,
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": L.name, "item": home },
            { "@type": "ListItem", "position": 2, "name": tc.shortName, "item": url }
          ]
        },
        {
          "@type": "MusicEvent",
          "@id": `${url}#event`,
          "name": tc.name,
          "description": tc.desc,
          "startDate": tour.startDate,
          "endDate": tour.endDate,
          "eventStatus": "https://schema.org/EventScheduled",
          "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
          "performer": ADO,
          "url": tour.officialUrl || url,
          "subEvent": (tour.shows || []).map(sh => ({
            "@type": "MusicEvent",
            "name": `${tc.name} (${sh.city[L.code]} ${sh.date})`,
            "startDate": `${sh.date}T${sh.start}:00+09:00`,
            "doorTime": `${sh.date}T${sh.open}:00+09:00`,
            "eventStatus": "https://schema.org/EventScheduled",
            "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
            "performer": ADO,
            "location": {
              "@type": "Place",
              "name": sh.venue[L.code],
              "address": {
                "@type": "PostalAddress",
                "addressLocality": sh.addressLocality,
                "addressCountry": sh.addressCountry
              }
            }
          }))
        },
        {
          "@type": "ItemList",
          "@id": `${url}#preplist`,
          "name": tc.warmTitle,
          "numberOfItems": uniqueTourSongs.length,
          "itemListElement": uniqueTourSongs.map((s, idx) => ({
            "@type": "ListItem",
            "position": idx + 1,
            "name": songTitle(s, L.code),
            "url": `${home}song/${s.id}/`
          }))
        },
        {
          "@type": "FAQPage",
          "@id": `${url}#faq`,
          "mainEntity": (tc.faqs || []).map(f => ({
            "@type": "Question",
            "name": f.q,
            "acceptedAnswer": { "@type": "Answer", "text": f.a }
          }))
        }
      ]
    };

    // ── 版面：主標（直接開練）→ ① 預熱（開演前）→ ② 各場歌單（開演後，每天各自點開）→ 現場小提醒 → 常見問題 ──
    const UI = {
      zh: { covers: "更多翻唱", coversSub: "預熱沒列到的 {0} 首；加上預熱的 {1} 首，就是本站全部 {2} 首翻唱。", alsoIn: "{0}已列在 {1}", sep: "；", sep2: "", t1: "現場有固定應援", t1s: "過去演唱會已經有固定手燈色、拍手或喊聲，最值得先練", t2: "演唱會唱過", t2s: "Ado 在演唱會唱過，應援還在整理，先把旋律聽熟", t3: "翻唱專輯收錄", t3s: "兩張《歌ってみたアルバム》裡的其他歌", t4: "其他歌ってみた", t4s: "YouTube 上的歌ってみた，依投稿年份由新到舊", playTier: "練這層", older: "顯示更早的翻唱（{0} 首）", olderHide: "收合更早的翻唱", year: "{0} 年", nav: "本頁導覽", prev: "上一組", next: "下一組", play: "練這組", playAll: "開始練預熱歌單", toShows: "看各場歌單", step: "第 {0} 步", songs: "{0} 首", playable: "{0} 首可連播", day: "Day {0}", pending: "尚未開演", tba: "歌單整理中", published: "{0} 首・點開看歌單（含劇透）", playShow: "照這場練", source: "來源", encore: "安可", rotating: "替換曲", notOnSite: "本站尚未收錄", core: "每場都唱的歌", coreSub: "已公開 {0} 場都有唱，還沒公開的場次先練這些", coreSum: "{0} 首・點開看（含劇透）", status0: "還沒開演，先練預熱歌單", statusN: "已公開 {0}／{1} 場歌單", dates: "{0} – {1}・{2} 都市 {3} 場", jst: "時間皆為日本時間，以官方公告為準" },
      en: { covers: "More Covers", coversSub: "The {0} covers not in the warm-up. Together with the {1} warm-up songs, that makes all {2} covers on this site.", alsoIn: "{0} is already in group {1}", sep: "; ", sep2: " ", t1: "Confirmed live chants", t1s: "Established lightstick colors, claps or calls from past concerts — practice these first", t2: "Sung live before", t2s: "Ado has sung these in concert; chants are still being confirmed, so learn the melody first", t3: "On the cover albums", t3s: "The rest of both Utattemita Albums", t4: "Other Utattemita covers", t4s: "Utattemita uploads on YouTube, newest first", playTier: "Practice this tier", older: "Show older covers ({0})", olderHide: "Hide older covers", year: "{0}", nav: "On this page", prev: "Previous group", next: "Next group", play: "Practice this set", playAll: "Start warm-up practice", toShows: "Setlists by show", step: "Step {0}", songs: "{0} songs", playable: "{0} playable", day: "Day {0}", pending: "Not yet", tba: "Setlist coming soon", published: "{0} songs · tap to reveal (spoilers)", playShow: "Practice this show", source: "Source", encore: "Encore", rotating: "Rotating", notOnSite: "Not on this site yet", core: "Played at every show", coreSub: "Sung at all {0} published shows — practice these for shows still to come", coreSum: "{0} songs · tap to reveal (spoilers)", status0: "Tour hasn't started — warm up first", statusN: "{0} of {1} setlists published", dates: "{0} – {1} · {2} cities, {3} shows", jst: "Times are JST; check official announcements" },
      ja: { covers: "その他のカバー", coversSub: "予習リストにない{0}曲。予習の{1}曲と合わせて、収録しているカバー全{2}曲です。", alsoIn: "{0}は{1}に掲載", sep: "／", sep2: "", t1: "ライブ応援が定着", t1s: "過去のライブでペンライト色・手拍子・コールが定着している曲。まずはここから", t2: "ライブで披露済み", t2s: "ライブで歌われたことがある曲。応援は確認中なので、まずメロディを覚えよう", t3: "カバーアルバム収録", t3s: "『歌ってみたアルバム』2作品のその他の収録曲", t4: "その他の歌ってみた", t4s: "YouTube の歌ってみた。新しい順", playTier: "この段を練習", older: "それ以前のカバーを表示（{0}曲）", olderHide: "以前のカバーを閉じる", year: "{0}年", nav: "このページの目次", prev: "前のグループ", next: "次のグループ", play: "このリストで練習", playAll: "予習リストで練習を始める", toShows: "公演ごとのセトリへ", step: "STEP {0}", songs: "{0}曲", playable: "{0}曲を連続再生", day: "DAY{0}", pending: "開催前", tba: "セトリ準備中", published: "{0}曲・タップで表示（ネタバレ注意）", playShow: "このセトリで練習", source: "出典", encore: "アンコール", rotating: "日替わり", notOnSite: "未収録", core: "全公演で披露", coreSub: "公開済み{0}公演すべてで披露。これからの公演はまずこの曲から", coreSum: "{0}曲・タップで表示（ネタバレ注意）", status0: "開幕前。まずは予習リストから", statusN: "{0}／{1}公演のセトリを公開中", dates: "{0} – {1}・{2}都市 {3}公演", jst: "時間はすべて日本時間。最新情報は公式でご確認ください" }
    }[L.code];
    const fmt = (str, ...a) => str.replace(/\{(\d)\}/g, (m, i) => a[+i]);
    const arrow = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>`;
    const playIco = `<svg class="tour-play-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>`;
    // 連播只排有 MV 的歌（預留曲沒有影片可以練）
    const canPlay = s => Boolean(s && s.yt);
    const playHref = ids => `./#list=${ids.join(",")}?play=1`;
    const fmtDate = (d, withYear = true) => {
      const [y, m, dd] = d.split("-");
      return L.code === "en" ? `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1]} ${+dd}${withYear ? `, ${y}` : ""}` : `${withYear ? y + "/" : ""}${m}/${dd}`;
    };
    // 歌曲列跟首頁「全部歌曲」同一個樣子；no 有值時（實際歌單）在縮圖前加曲順
    const songRow = (s, tag = "", no = 0) => {
      const noHtml = no ? `<span class="tour-set-no">${String(no).padStart(2, "0")}</span>` : "";
      const tipHint = !s.hold && s.tips && s.tips.length ? `<span class="tour-song-tip">${esc(T(s.tips[0]))}</span>` : "";
      return `<li><a class="song" href="song/${s.id}/" data-id="${s.id}">${noHtml}${thumbHtml(s, 80, 45, true)}<span class="song-main"><span class="name"><span class="ja" lang="ja">${esc(s.ja)}</span><span class="sub"><span class="zh">${esc(subOf(s))}</span>${tag}${penDots(s)}</span>${tipHint}</span><span class="acts">${actIcons(s)}${s.free ? `<span class="free">${T("自由搖")}</span>` : ""}</span></span></a></li>`;
    };
    const playBtn = (ids, label, showCount = true) => ids.length
      ? `<a class="pill-btn tour-play" href="${esc(playHref(ids))}">${playIco}<span>${esc(label)}</span>${showCount ? `<span class="tour-play-n">${esc(fmt(UI.songs, ids.length))}</span>` : ""}</a>`
      : "";

    // ① 預熱：每一組一排首頁書架（標題＋一句說明＋「練這組」，下面橫向滑動的歌曲卡片，再下面進度條和箭頭）
    //    還沒有 MV 的預留曲排在最後，用首頁同款的「預留曲目」佔位圖
    const warmPlayIds = uniqueTourSongs.filter(canPlay).map(s => s.id);
    // 同一首歌只在第一個出現的分組列出，後面的分組在進度條旁註明「已列在 01」
    const placedIn = new Map();
    (tour.groups || []).forEach((g, gi) => (g.songs || []).forEach(id => { if (SONG_BY_ID.has(id) && !placedIn.has(id)) placedIn.set(id, gi); }));
    const groupNo = gi => String(gi + 1).padStart(2, "0");
    const groupCount = (tour.groups || []).length;
    const shelfCard = (s, badge) => `<li><a class="card" href="song/${s.id}/" data-id="${s.id}">${thumbHtml(s, 320, 180, true)}${badge ? `<span class="tour-thumb-tag">${esc(badge)}</span>` : ""}<span class="card-text"><span class="card-ja" lang="ja">${esc(s.ja)}</span><span class="card-sub"><span>${esc(subOf(s))}</span><span class="acts">${actIcons(s)}</span></span></span></a></li>`;
    const shelvesHtml = (tour.groups || []).map((g, gi) => {
      const gSongs = (g.songs || []).map(id => SONG_BY_ID.get(id)).filter(Boolean);
      const own = gSongs.filter(s => placedIn.get(s.id) === gi);
      const ordered = [...own.filter(s => !s.upcoming), ...own.filter(s => s.upcoming)];
      const elsewhere = gSongs.filter(s => placedIn.get(s.id) !== gi);
      const note = [...new Set(elsewhere.map(s => placedIn.get(s.id)))].map(k => fmt(UI.alsoIn, elsewhere.filter(s => placedIn.get(s.id) === k).map(s => `〈${s.ja}〉`).join(""), groupNo(k))).join(UI.sep);
      const sid = `shelf-${g.id}`;
      return `<section class="tour-shelf" id="group-${esc(g.id)}" aria-labelledby="groupH-${esc(g.id)}">
          <div class="tour-shelf-head">
            <div class="tour-shelf-copy">
              <h3 id="groupH-${esc(g.id)}"><span class="tour-tier">${groupNo(gi)}</span>${esc(g.short[L.code])}<span class="count">${esc(fmt(UI.songs, own.length))}</span></h3>
              <p class="sec-sub">${esc(g.sub[L.code])}</p>
            </div>
            ${playBtn(gSongs.filter(canPlay).map(s => s.id), UI.play, false)}
          </div>
          <ul class="shelf" id="${sid}" data-shelf>${ordered.map(s => shelfCard(s, g.badges && g.badges[s.id] && g.badges[s.id][L.code])).join("")}</ul>
          <div class="shelf-nav">
            <div class="shelf-hint">
              <span class="shelf-track" aria-hidden="true"><span class="shelf-thumb"></span></span>
              ${note ? `<span class="tour-shelf-note">${esc(note)}</span>` : ""}
            </div>
            <div class="shelf-btns">
              <button type="button" class="round-btn" data-dir="-1" aria-label="${esc(UI.prev)}" aria-controls="${sid}" disabled><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg></span></button>
              <button type="button" class="round-btn" data-dir="1" aria-label="${esc(UI.next)}" aria-controls="${sid}"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg></span></button>
            </div>
          </div>
        </section>`;
    }).join("");

    // ③ 更多翻唱：預熱沒列到的翻唱，接著預熱的編號往下分層（有固定應援 → 唱過現場 → 翻唱專輯 → 其他，依年份新到舊）
    // 每首翻唱在整頁只出現一次：預熱＋這裡＝本站全部翻唱
    const ALL_COVERS = SONGS.filter(s => s.cover);
    const restCovers = ALL_COVERS.filter(s => !placedIn.has(s.id));
    const warmCoverCnt = ALL_COVERS.length - restCovers.length;
    const coverTier = s => (!s.hold ? 1 : hasLive(s) ? 2 : s.album ? 3 : 4);
    const tierDefs = [1, 2, 3, 4].map(n => ({
      n,
      id: `covers-t${n}`,
      title: UI[`t${n}`],
      sub: UI[`t${n}s`],
      songs: restCovers.filter(s => coverTier(s) === n).sort((x, y) => (n === 4 ? y.date.localeCompare(x.date) : x.date.localeCompare(y.date)))
    })).filter(t => t.songs.length);
    tierDefs.forEach((t, i) => { t.no = String(groupCount + i + 1).padStart(2, "0"); });
    // 只剩一層時不再多一個重複的小標題，說明和連播按鈕直接放在段落標題
    const singleTier = tierDefs.length === 1 ? tierDefs[0] : null;
    const tierRows = list => list.map(s => songRow(s)).join("");
    const tierBody = t => {
      if (t.n !== 4) return `<ul class="songs tour-songs">${tierRows(t.songs)}</ul>`;
      const years = [...new Set(t.songs.map(s => s.date.slice(0, 4)))];
      const yearBlock = y => `<h4 class="tour-year">${esc(fmt(UI.year, y))}</h4><ul class="songs tour-songs">${tierRows(t.songs.filter(s => s.date.startsWith(y)))}</ul>`;
      const recent = years.slice(0, 2), older = years.slice(2);
      const olderCnt = t.songs.filter(s => older.includes(s.date.slice(0, 4))).length;
      return recent.map(yearBlock).join("") + (older.length
        ? `<details class="tour-more tour-older"><summary><span class="tour-more-show">${esc(fmt(UI.older, olderCnt))}</span><span class="tour-more-hide">${esc(UI.olderHide)}</span></summary>${older.map(yearBlock).join("")}</details>`
        : "");
    };
    const coversHtml = tierDefs.map(t => `<section class="tour-cover-tier" id="${t.id}" aria-labelledby="${t.id}H">
        <div class="tour-group-head">
          <div class="tour-group-copy">
            <span class="tour-tier" aria-hidden="true">${t.no}</span>
            <div>
              <h3 id="${t.id}H">${esc(t.title)}<span class="count">${esc(fmt(UI.songs, t.songs.length))}</span></h3>
              <p class="sec-sub">${esc(t.sub)}</p>
            </div>
          </div>
          ${playBtn(t.songs.filter(canPlay).map(s => s.id), UI.playTier)}
        </div>
        ${tierBody(t)}
      </section>`).join("");

    // ② 各場歌單：歌單項目可以是歌曲 ID，或本站還沒收錄的 { ja: "曲名" }
    const entryOf = x => typeof x === "string" ? { song: SONG_BY_ID.get(x), key: x } : { song: x.id ? SONG_BY_ID.get(x.id) : null, text: x.ja, key: x.id || `t:${x.ja}` };
    const showEntries = sh => [...(sh.songs || []), ...(sh.encore || [])].map(entryOf);
    const shows = tour.shows || [];
    const publishedShows = shows.filter(sh => (sh.songs || []).length > 0);
    // 已公開場次都有唱的歌＝每場都唱；只在部分場次出現的標「替換曲」（至少兩場公開後才比較）
    const coreKeys = publishedShows.length >= 2
      ? [...new Set(showEntries(publishedShows[0]).map(e => e.key))].filter(k => publishedShows.every(sh => showEntries(sh).some(e => e.key === k)))
      : [];
    const isRotating = key => publishedShows.length >= 2 && !coreKeys.includes(key);
    const todayIso = new Date().toISOString().slice(0, 10);
    const setlistItem = (e, no) => {
      const tag = isRotating(e.key) ? `<span class="tier-tag is-t2">${esc(UI.rotating)}</span>` : "";
      if (e.song) return songRow(e.song, tag, no);
      return `<li><span class="song is-plain"><span class="tour-set-no">${String(no).padStart(2, "0")}</span><span class="thumb tour-thumb-empty" aria-hidden="true"></span><span class="song-main"><span class="name"><span class="ja" lang="ja">${esc(e.text)}</span><span class="sub"><span class="zh">${esc(UI.notOnSite)}</span>${tag}</span></span></span></span></li>`;
    };
    // 同一個場館連續的場次歸成一組，依序標 Day 1、Day 2…
    const cityGroups = [];
    for (const sh of shows) {
      const last = cityGroups[cityGroups.length - 1];
      if (last && last.venue === sh.venue.ja) last.shows.push(sh);
      else cityGroups.push({ venue: sh.venue.ja, city: sh.city[L.code], venueName: sh.venue[L.code], shows: [sh] });
    }
    const dayHtml = (sh, di, multi) => {
      const dateDisp = `${fmtDate(sh.date)}${L.code === "en" ? ` (${sh.day.en})` : `（${sh.day[L.code]}）`}`;
      const label = multi ? `<span class="tour-day-label">${esc(fmt(UI.day, di + 1))}</span>` : "";
      const note = sh.note && sh.note[L.code] ? `<span class="tour-show-note">${esc(sh.note[L.code])}</span>` : "";
      const head = `<span class="tour-day-top">${label}<strong class="tour-day-date">${esc(dateDisp)}</strong>${note}</span><span class="tour-day-time">OPEN ${esc(sh.open)} / START ${esc(sh.start)}</span>`;
      const main = (sh.songs || []).map(entryOf), enc = (sh.encore || []).map(entryOf);
      if (!main.length) {
        const state = sh.date >= todayIso ? UI.pending : UI.tba;
        return `<div class="tour-day is-pending" id="show-${esc(sh.id)}">${head}<span class="tour-day-state">${esc(state)}</span></div>`;
      }
      const ids = [...main, ...enc].filter(e => canPlay(e.song)).map(e => e.song.id);
      const src = sh.source && sh.source.url ? `<a class="tour-source" href="${esc(sh.source.url)}" target="_blank" rel="noopener">${esc(UI.source)}：${esc(sh.source.name || sh.source.url)} ↗</a>` : "";
      const encHtml = enc.length ? `<li class="tour-encore">${esc(UI.encore)}</li>${enc.map((e, i) => setlistItem(e, main.length + i + 1)).join("")}` : "";
      return `<details class="tour-day" id="show-${esc(sh.id)}">
        <summary>${head}<span class="tour-day-state is-ready">${esc(fmt(UI.published, main.length + enc.length))}</span></summary>
        <div class="tour-day-body">
          <div class="tour-day-actions">${playBtn(ids, UI.playShow)}${src}</div>
          <ol class="songs tour-setlist">${main.map((e, i) => setlistItem(e, i + 1)).join("")}${encHtml}</ol>
        </div>
      </details>`;
    };
    const coreSongs = coreKeys.map(k => SONG_BY_ID.get(k)).filter(Boolean);
    const coreHtml = coreSongs.length ? `<details class="tour-day tour-core" id="show-core">
        <summary><span class="tour-day-top"><strong class="tour-day-date">${esc(UI.core)}</strong></span><span class="tour-day-time">${esc(fmt(UI.coreSub, publishedShows.length))}</span><span class="tour-day-state is-ready">${esc(fmt(UI.coreSum, coreSongs.length))}</span></summary>
        <div class="tour-day-body">
          <div class="tour-day-actions">${playBtn(coreSongs.filter(canPlay).map(s => s.id), UI.play)}</div>
          <ul class="songs tour-songs">${coreSongs.map(s => songRow(s)).join("")}</ul>
        </div>
      </details>` : "";
    const citiesHtml = cityGroups.map(cg => `<section class="tour-city" id="city-${esc(cg.shows[0].id)}" aria-label="${esc(cg.city)}">
        <h3 class="tour-city-h"><span class="tour-city-name">${esc(cg.city)}</span><span class="tour-city-venue" lang="ja">${esc(cg.venueName)}</span></h3>
        <div class="tour-days">${cg.shows.map((sh, di) => dayHtml(sh, di, cg.shows.length > 1)).join("")}</div>
      </section>`).join("");

    const tipsHtml = (tc.tips || []).map(r => `<article class="guide-pill"><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p></article>`).join("");
    const faqHtml = (tc.faqs || []).map(f => `<details class="faq-item"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");
    const cityCount = new Set(shows.map(sh => sh.city.ja)).size;
    const metaLine = shows.length ? fmt(UI.dates, fmtDate(shows[0].date), fmtDate(shows[shows.length - 1].date, L.code === "en"), cityCount, shows.length) : "";
    const statusLine = publishedShows.length ? fmt(UI.statusN, publishedShows.length, shows.length) : UI.status0;
    const stepHead = (n, id, title, sub, side = "") => `<div class="tour-step-head">
          <span class="tour-step" aria-hidden="true">${n}</span>
          <div class="tour-step-copy">
            <h2 id="${id}"><span class="sr-only">${esc(fmt(UI.step, n))}：</span>${esc(title)}</h2>
            <p class="sec-sub">${esc(sub)}</p>
          </div>
          ${side}
        </div>`;

    // 本頁導覽：大段落（預熱、各場歌單、全部翻唱…）＋小段落（城市、翻唱分層）；data-label 給手機浮動按鈕顯示目前在哪一段
    const railLink = (id, label, top) => `<a href="${rest}#${id}" data-sec="${id}" data-label="${esc(label)}">${top ? `<span class="tour-rail-dot" aria-hidden="true"></span>` : ""}<span>${esc(label)}</span></a>`;
    const railSub = subs => subs.length ? `<ol class="tour-rail-sub">${subs.map(([id, label]) => `<li>${railLink(id, label, false)}</li>`).join("")}</ol>` : "";
    const railTop = (id, label, subs = []) => `<li class="tour-rail-item">${railLink(id, label, true)}${railSub(subs)}</li>`;
    const railHtml = `<nav class="tour-rail" id="tourRail" aria-label="${esc(UI.nav)}">
          <div class="tour-rail-head"><span>${esc(UI.nav)}</span><span class="tour-rail-pct" id="tourRailPct" aria-hidden="true">0%</span></div>
          <ol class="tour-rail-list">
            ${railTop("warmup", tc.warmTitle)}
            ${railTop("shows", tc.showsTitle, cityGroups.map(cg => [`city-${cg.shows[0].id}`, cg.city]))}
            ${railTop("covers", UI.covers)}
            ${railTop("tips", tc.tipsTitle)}
            ${railTop("faq", tc.faqTitle)}
          </ol>
        </nav>`;

    const tourMainHtml = `<main class="col tour-main" id="main">
      <nav class="tour-crumb" aria-label="Breadcrumb">
        <a href="./">${esc(L.name)}</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">${esc(tc.shortName)}</span>
      </nav>

      <section class="tour-hero" aria-labelledby="tourH">
        <span class="tour-badge">${esc(tc.badge)}</span>
        <h1 id="tourH">${esc(tc.name)}</h1>
        <p class="tour-meta">${esc(metaLine)}<span class="tour-meta-status">${esc(statusLine)}</span></p>
        <p class="tour-lead">${esc(tc.heroLead)}</p>
        <div class="tour-cta">
          ${warmPlayIds.length ? `<a class="btn primary tour-cta-main" href="${esc(playHref(warmPlayIds))}">${playIco}<span>${esc(UI.playAll)}</span></a>` : ""}
          <a class="tint-link" href="${rest}#shows">${esc(UI.toShows)}${arrow}</a>
        </div>
      </section>

      <div class="tour-body">
        ${railHtml}
        <div class="tour-content">
          <section class="tour-sec" id="warmup" aria-labelledby="warmH">
            ${stepHead(1, "warmH", tc.warmTitle, tc.warmSub)}
            <div class="tour-shelves">${shelvesHtml}</div>
          </section>

          <section class="tour-sec" id="shows" aria-labelledby="showsH">
            ${stepHead(2, "showsH", tc.showsTitle, tc.showsSub)}
            ${coreHtml}
            <div class="tour-cities">${citiesHtml}</div>
            <p class="tour-note">${esc(UI.jst)}</p>
          </section>

          <section class="tour-sec" id="covers" aria-labelledby="coversH">
            <div class="sec-head"><div><h2 id="coversH">${esc(UI.covers)}<span class="count">${esc(fmt(UI.songs, restCovers.length))}</span></h2><p class="sec-sub">${esc(fmt(UI.coversSub, restCovers.length, warmCoverCnt, ALL_COVERS.length))}${singleTier ? esc(UI.sep2 + singleTier.sub) : ""}</p></div>${singleTier ? playBtn(singleTier.songs.filter(canPlay).map(s => s.id), UI.playTier) : ""}</div>
            <div class="tour-cover-tiers">${singleTier ? `<div class="tour-cover-tier" id="${singleTier.id}">${tierBody(singleTier)}</div>` : coversHtml}</div>
          </section>

          <section class="tour-sec" id="tips" aria-labelledby="tipsH">
            <div class="sec-head"><h2 id="tipsH">${esc(tc.tipsTitle)}</h2></div>
            <div class="home-guide-grid">${tipsHtml}</div>
          </section>

          <section class="faq tour-sec" id="faq" aria-labelledby="faqH">
            <h2 id="faqH">${esc(tc.faqTitle)}</h2>
            <div class="faq-list">${faqHtml}</div>
          </section>

          <div class="tour-foot-cta">
            <a class="tint-link" href="./">${esc(tc.backHomeBtn)}${arrow}</a>
          </div>
        </div>
      </div>

      <button type="button" class="tour-fab" id="tourFab" aria-controls="tourRail" aria-expanded="false" aria-label="${esc(UI.nav)}">
        <svg class="tour-fab-ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle id="tourFabRing" cx="12" cy="12" r="9" stroke-dasharray="56.55" stroke-dashoffset="56.55"/></svg>
        <span class="tour-fab-label" id="tourFabLabel">${esc(tc.warmTitle)}</span>
        <svg class="tour-fab-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14l5-5 5 5"/></svg>
      </button>
    </main>`;

    let tourHtml = page(tpl, L, T, { rest, base: "../../", title: tc.title, desc: tc.desc, ld: tourLd });
    tourHtml = mustReplace(tourHtml, '<body>', '<body class="on-tour">', "tour <body>");
    tourHtml = mustReplace(tourHtml, /<canvas id="fx"[\s\S]*?<div class="shell">/, '<div class="shell">', "tour strip canvases");
    tourHtml = mustReplace(tourHtml, /<main class="col" id="main">[\s\S]*?<\/main>/, () => tourMainHtml, "tour <main>");
    tourHtml = tourHtml.replace('<a href="#songs">', '<a href="./#songs">');
    tourHtml = tourHtml.replace(/<button type="button" id="(?:logBtn|feedbackBtn|pwaInstallBtn)"[^>]*>[^<]*<\/button>\s*/g, "");
    tourHtml = mustReplace(tourHtml, /<div class="toast" id="toast"[\s\S]*?<\/body>/, () => `${tourInlineScript}\n</body>`, "tour strip dialogs & app scripts");
    write(`${L.dir}${rest}index.html`, tourHtml);
  }
  if (L.code !== "zh") {
    const copy = MANIFEST_COPY[L.code];
    const locManifest = {
      ...rootManifest,
      name: copy.name,
      short_name: copy.short_name,
      description: copy.description,
      lang: L.code,
      start_url: "./",
      scope: "./",
      icons: (rootManifest.icons || []).map(ic => ({ ...ic, src: `../${ic.src}` })),
      shortcuts: (rootManifest.shortcuts || []).map(sc => ({ ...sc, name: T(sc.name) }))
    };
    write(`${L.dir}manifest.webmanifest`, JSON.stringify(locManifest, null, 2) + "\n");
  }
}
LANGS.forEach(renderLang);
for (const [code, text] of Object.entries(i18nFiles)) write(`i18n/${code}.js`, text);

// 找不到的網址回首頁
write("404.html", `<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="robots" content="noindex"><title>找不到這一頁｜Ado 應援指南</title><meta http-equiv="refresh" content="0;url=${SITE}"><p>找不到這一頁，<a href="${SITE}">回 Ado 應援指南首頁</a>。 Page not found — <a href="${SITE}en/">Ado Fan Chant Guide</a>｜<a href="${SITE}jp/">Ado 応援ガイド</a></p></html>\n`);

// 網站地圖：每個網址列出三種語言版本（xhtml:link），Google 才知道它們是同一頁的不同語言
// lastmod：首頁用 CHANGELOG 最新一版的日期；歌曲頁用那首歌自己最後改動的日期。只有內容真的變了日期才動，Google 才會相信
const lastmodOf = rest => {
  const m = /^song\/([^/]+)\/$/.exec(rest);
  if (m) return songUpdated(m[1]);
  const tm = /^tour\/([^/]+)\/$/.exec(rest);
  if (tm) return TOUR_BY_ID.get(tm[1])?.updated || UPDATED;
  return UPDATED;
};
const alts = rest => LANGS.map(x => `    <xhtml:link rel="alternate" hreflang="${x.hreflang}" href="${SITE}${x.dir}${rest}"/>`).concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${rest}"/>`).join("\n");
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${LANGS.flatMap(L => urls.map(
    rest => `  <url>\n    <loc>${SITE}${L.dir}${rest}</loc>\n    <lastmod>${lastmodOf(rest)}</lastmod>\n${alts(rest)}\n  </url>`
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
    ...(TOURS.length ? TOURS.map(t => `巡演專頁（${t.copy.zh.shortName}）：${SITE}tour/${t.id}/`) : []),
    `完整歌詞與應援全文檔：${SITE}llms-full.txt`,
    ``,
    `## 全場演唱會通用原則`,
    `1. **手燈顏色通則**：現場有開中控（無線制御）時，手燈顏色由會場統一控制，不用自己切換。沒開中控時照本站標示的顏色；本站沒標顏色的歌代表還沒有現場資料，請跟著舞台燈光或周圍觀眾。`,
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
      `- **官方 MV**：${s.yt ? `https://www.youtube.com/watch?v=${s.yt}${s.len ? ` (${s.len})` : ""}` : "尚未公開"}`,
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
      `- 歌曲長度：${s.len || "尚未公開"}`,
      `- 推薦手燈顏色：${pen.text}`,
      `- 應援動作：${s.acts.map(a => ACT_MAP[a]?.name || a).join("、") || "自由跟隨節奏"}`,
      `- 應援重點指南：${tips}`,
      `- 官方 MV 連結：${s.yt ? `https://www.youtube.com/watch?v=${s.yt}` : "尚未公開"}`,
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
for (const [f, text] of Object.entries(karaokeFiles)) write(f, text);
write("style.css", cssOut);
write("songs.js", songsOut);
write("app.js", appOut);
write("karaoke-sources.js", karaokeSrcOut);

// 其他檔案原樣複製（song-lyrics.js 與 song-lyrics-live.js 留在原始碼供免建置開發模式使用）
for (const f of [
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
// 離線用的 Service Worker：先存核心外殼與 lyrics/index.json／hashes.json（__PRECACHE__），再依每首雜湊分批存歌詞（__LYRICS_PRECACHE__）；VERSION 跟著內容走
const corePrecache = [
  ...LANGS.map(L => L.dir || "./"),
  `style.css?v=${hash(cssOut)}`,
  `songs.js?v=${hash(songsOut)}`,
  `karaoke-sources.js?v=${hash(karaokeSrcOut)}`,
  `app.js?v=${hash(appOut)}`,
  ...Object.entries(i18nFiles).map(([code, text]) => `i18n/${code}.js?v=${hash(text)}`),
  `lyrics/index.json?v=${LYV}`,
  `lyrics/hashes.json?v=${LYV}`,
  "manifest.webmanifest",
  "en/manifest.webmanifest",
  "jp/manifest.webmanifest",
  "favicon.ico",
  "assets/favicon.svg",
  "assets/icon-192.png",
  ...(fs.existsSync(path.join(root, "assets/icon-maskable.svg")) ? ["assets/icon-maskable.svg"] : [])
];
const lyricsPrecache = [
  ...Object.entries(mvHashes).map(([id, h]) => `lyrics/${id}.json?v=${h}`),
  ...Object.entries(liveHashes).map(([id, h]) => `lyrics-live/${id}.json?v=${h}`)
];
const swSrc = read("sw.js");
const hasSplitPrecache = swSrc.includes("__LYRICS_PRECACHE__");
const swPre = hasSplitPrecache ? corePrecache : [...corePrecache, ...lyricsPrecache];
const swVer = hash([...corePrecache, ...lyricsPrecache].join("\n") + swSrc);
let swOut = mustReplace(swSrc, "__VERSION__", swVer, "sw.js __VERSION__");
swOut = mustReplace(swOut, "__PRECACHE__", JSON.stringify(swPre), "sw.js __PRECACHE__");
if (hasSplitPrecache) swOut = mustReplace(swOut, "__LYRICS_PRECACHE__", JSON.stringify(lyricsPrecache), "sw.js __LYRICS_PRECACHE__");
write("sw.js", swOut);
write("CNAME", "ado.kuti.cc\n");
fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), { recursive: true });

const kCount = Object.keys(karaokeHashes).length;
console.log(`輸出到 ${out}：中文、英文（en/）、日文（ja/）各首頁＋${SONGS.length} 首歌頁（${INDEXABLE_SONGS.length} 首納入索引與 sitemap，${SONGS.length - INDEXABLE_SONGS.length} 首標記 noindex）＋${TOURS.length} 個巡演專頁、${Object.keys(lyIndex).length} 首歌詞檔${kCount ? `、${kCount} 首卡拉OK快取` : ""}${Object.keys(ROMAJI).length ? `（${Object.keys(ROMAJI).length} 首有羅馬拼音）` : "（沒有 song-romaji.json，英文版不放羅馬拼音）"}${esbuild ? "（已啟用 esbuild 壓縮）" : ""}、sitemap.xml、robots.txt、llms.txt、llms-full.txt、404.html`);
for (const code of ["en", "ja"]) {
  if (missing[code].size) console.log(`⚠ ${code} 還沒翻譯 ${missing[code].size} 句（畫面先顯示中文）：${[...missing[code]].slice(0, 8).join("｜")}${missing[code].size > 8 ? "…" : ""}`);
}
if (process.env.I18N_MISSING) fs.writeFileSync(process.env.I18N_MISSING, JSON.stringify(Object.fromEntries(Object.entries(missing).map(([k, v]) => [k, [...v]])), null, 1));
