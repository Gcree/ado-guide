// 產生英文版歌詞的羅馬拼音：song-romaji.json（{ 歌曲 id: { 日文歌詞原文: 羅馬拼音 } }）
// GitHub Actions 建置前會自動跑（先 npm install kuromoji）；產生的檔案不進版控，建置時讀進英文版
// 本機要跑：npm install --no-save kuromoji@0.1.2 && node tools/romaji/romaji.mjs
//   kuromoji：https://github.com/takuyaa/kuromoji.js（Apache-2.0），日文斷詞與讀音
// 歌詞裡標了讀音「漢字(かな)」的地方照標的讀；自動讀錯的寫在 tools/romaji/overrides.json（{ id: { 日文原文: 羅馬拼音 } }），會蓋過自動結果
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { tokensToRomaji, applyRuby } from "./kana.mjs";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const require = createRequire(import.meta.url);
const LYRICS = require(path.join(root, "song-lyrics.js"));
const outFile = path.join(root, "song-romaji.json");
const overFile = path.join(root, "tools/romaji/overrides.json");
const over = fs.existsSync(overFile) ? JSON.parse(fs.readFileSync(overFile, "utf8")) : {};

let kuromoji;
try { kuromoji = require("kuromoji"); } catch {
  console.error("找不到 kuromoji，先跑：npm install --no-save kuromoji@0.1.2");
  process.exit(1);
}
const dicPath = path.join(path.dirname(require.resolve("kuromoji/package.json")), "dict");
const tk = await new Promise((ok, ng) => kuromoji.builder({ dicPath }).build((e, t) => (e ? ng(e) : ok(t))));

// 只轉有假名或漢字的行；（間奏）這種全形括號的說明、韓文、英文歌詞不用轉
const isJa = s => /[\u3040-\u30ff\u4e00-\u9fff]/.test(s) && !/^（[^）]+）$/.test(s.trim());
const out = {};
let n = 0;
for (const b of LYRICS) {
  const m = {};
  for (const l of b.lyrics || []) {
    if (!l.jp || !isJa(l.jp) || m[l.jp] !== undefined) continue;
    m[l.jp] = (over[b.id] && over[b.id][l.jp]) || tokensToRomaji(tk.tokenize(applyRuby(l.jp)));
    n++;
  }
  if (Object.keys(m).length) out[b.id] = m;
}
fs.writeFileSync(outFile, JSON.stringify(out) + "\n");
console.log(`羅馬拼音：${Object.keys(out).length} 首、${n} 行 → ${path.relative(root, outFile)}`);
