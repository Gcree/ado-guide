// 把歌詞對時工具下載的 <id>.json 寫回 song-lyrics.js：同一首就整首換掉，新歌就加在最後
// 用法：node tools/timing/apply.mjs <id>.json [更多檔案…]，寫完記得跑 node scripts/check-data.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../song-lyrics.js");
const files = process.argv.slice(2);
if (!files.length) { console.error("用法：node tools/timing/apply.mjs <id>.json [更多檔案…]"); process.exit(1); }

const raw = fs.readFileSync(file, "utf8"), crlf = raw.includes("\r\n"), src = raw.replace(/\r\n/g, "\n");
const HEAD = "var SONGS = ", TAIL = ";\n\n  return SONGS;";
const a = src.indexOf(HEAD), b = src.indexOf(TAIL);
if (a < 0 || b < 0) throw new Error("song-lyrics.js 的格式跟預期不同（找不到 var SONGS = … return SONGS;），沒有寫入");
const songs = require(file);
// 先確認原檔照 JSON.stringify 排版，寫回去時其他歌一個字都不會動
if (src.slice(a + HEAD.length, b) !== JSON.stringify(songs, null, 2)) throw new Error("song-lyrics.js 不是 JSON.stringify(…, null, 2) 的排版，為了不動到其他歌，沒有寫入");

for (const f of files) {
  const entry = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!entry.id || !Array.isArray(entry.lyrics)) throw new Error(`${f} 不是對時工具輸出的格式（要有 id 和 lyrics）`);
  for (let i = 1; i < entry.lyrics.length; i++) {
    if (entry.lyrics[i].time < entry.lyrics[i - 1].time) throw new Error(`${f} 第 ${i + 1} 句比上一句早，先回工具修正`);
  }
  const i = songs.findIndex(s => s.id === entry.id);
  if (i >= 0) songs[i] = entry; else songs.push(entry);
  console.log(`${i >= 0 ? "更新" : "新增"} ${entry.id}：${entry.lyrics.length} 句`);
}
let out = src.slice(0, a + HEAD.length) + JSON.stringify(songs, null, 2) + src.slice(b);
if (crlf) out = out.replace(/\n/g, "\r\n");
fs.writeFileSync(file, out);
console.log("已寫入 song-lyrics.js，接著跑 node scripts/check-data.mjs");
