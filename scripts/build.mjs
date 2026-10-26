// 建置正式網站：複製檔案，並替每首歌做一頁 song/<id>/（有自己的標題、說明與分享資訊，Google 才收錄得到）；
// 歌詞拆成每首一個檔 lyrics/<id>.json，網頁打開哪首才載哪首
// 用法：node scripts/build.mjs [輸出資料夾，預設 dist]
// GitHub Actions 每次推到 main 都會跑這支，再發布到 GitHub Pages；平常改網站只要改 index.html、style.css、app.js、song-lyrics.js
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const SITE = "https://gcree.github.io/ado-guide/";
const NAME = "Ado 應援預習";
// Google Search Console 的 HTML 標記驗證碼（只放在首頁）；另外根目錄的 googlea6b361c7e6e7d11c.html 是 HTML 檔案驗證，兩個都不要刪
const GSC_VERIFY = "YLXviPdOfiLpoPdirdp39Tf7T0PrqSdDVMpdkZnxveg";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.resolve(process.argv[2] || path.join(root, "dist"));
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const hash = text => createHash("sha1").update(text).digest("hex").slice(0, 8);
const css = read("style.css"), songsText = read("songs.js"), app = read("app.js");
const require = createRequire(import.meta.url);
const LYRICS = require(path.join(root, "song-lyrics.js"));
const { SONGS } = require(path.join(root, "songs.js"));

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
  .replace("app.js?v=dev", `app.js?v=${hash(app)}`)
  .replace('<html lang="zh-Hant-TW">', `<html lang="zh-Hant-TW" data-lyrics="${LYV}">`);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const json = o => JSON.stringify(o).replace(/</g, "\\u003c");

function page({ url, title, desc, ld, base, song, extra = "" }) {
  let html = src
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<!-- build:seo[^>]*-->/, [
      `<link rel="canonical" href="${url}">`,
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:site_name" content="${NAME}">`,
      `<meta property="og:locale" content="zh_TW">`,
      `<meta property="og:image" content="${SITE}assets/og.jpg">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<script type="application/ld+json">${json(ld)}</script>`,
      extra
    ].filter(Boolean).join("\n"));
  if (base) html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n<base href="${base}">`);
  if (song) html = html.replace('<html lang="zh-Hant-TW" ', `<html lang="zh-Hant-TW" data-song="${song}" `);
  return html;
}

const write = (rel, text) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
fs.rmSync(out, { recursive: true, force: true });

// 首頁
write("index.html", page({
  url: SITE,
  title: `${NAME}｜Ado 演唱會應援教學・同步歌詞`,
  desc: `非官方粉絲製作的 Ado 演唱會應援預習：${SONGS.length} 首歌，看著 MV 跟同步歌詞，練哪裡拍手、哪裡大合唱、哪裡喊聲，還有每首的螢光棒顏色。`,
  ld: { "@context": "https://schema.org", "@type": "WebSite", name: NAME, url: SITE, inLanguage: "zh-Hant-TW", description: "Ado 演唱會應援預習（非官方粉絲製作）" },
  extra: GSC_VERIFY && `<meta name="google-site-verification" content="${GSC_VERIFY}">`
}));

// 每首歌一頁
const urls = [SITE];
for (const s of SONGS) {
  const b = LYRICS.find(x => x.id === s.id), hasLines = !!(b && b.lyrics && b.lyrics.length);
  const name = s.zh && s.zh !== s.ja ? `${s.ja}（${s.zh}）` : s.ja;
  const tips = s.hold || s.sug ? [] : s.tips || [];  // 和網頁一樣，sug 的建議先不寫
  const desc = tips.length
    ? `Ado〈${s.ja}〉演唱會應援：${tips.join("；")}。看著 MV 跟${hasLines ? "同步歌詞" : "重點"}練習。非官方粉絲製作。`
    : `Ado〈${s.ja}〉的 MV${hasLines ? " 與同步歌詞" : ""}，應援還在整理，先熟悉旋律。非官方粉絲製作。`;
  const url = `${SITE}song/${s.id}/`;
  urls.push(url);
  write(`song/${s.id}/index.html`, page({
    url, base: "../../", song: s.id,
    title: `${name} ${hasLines ? "應援與歌詞" : "應援"}｜${NAME}`,
    desc: cut(desc, 160),
    ld: {
      "@context": "https://schema.org", "@type": "WebPage", name: `${name} 應援`, url, inLanguage: "zh-Hant-TW",
      isPartOf: { "@type": "WebSite", name: NAME, url: SITE },
      about: { "@type": "MusicRecording", name: s.ja, byArtist: { "@type": "Person", name: "Ado" }, url: `https://www.youtube.com/watch?v=${s.yt}` },
      breadcrumb: { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: NAME, item: SITE },
        { "@type": "ListItem", position: 2, name: s.ja, item: url }
      ] }
    }
  }));
}

// 找不到的網址回首頁
write("404.html", `<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8"><meta name="robots" content="noindex"><title>找不到這一頁｜${NAME}</title><meta http-equiv="refresh" content="0;url=${SITE}"><p>找不到這一頁，<a href="${SITE}">回 ${NAME} 首頁</a>。</p></html>\n`);

// 網站地圖
const today = new Date().toISOString().slice(0, 10);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);

for (const [f, text] of Object.entries(lyFiles)) write(f, text);

// 其他檔案原樣複製（song-lyrics.js 留著給還開著舊版網頁的人）
for (const f of ["style.css", "songs.js", "app.js", "song-lyrics.js", "CHANGELOG.md", "manifest.webmanifest", "googlea6b361c7e6e7d11c.html"]) fs.copyFileSync(path.join(root, f), path.join(out, f));
fs.cpSync(path.join(root, "assets"), path.join(out, "assets"), { recursive: true });

console.log(`輸出到 ${out}：首頁＋${SONGS.length} 首歌頁、${Object.keys(lyIndex).length} 首歌詞檔、sitemap.xml、404.html`);
