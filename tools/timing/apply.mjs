// 把歌詞對時工具下載的 <id>.json 寫回歌詞檔：同一首就整首換掉，新歌就加進去
// MV 版（<id>.json）寫入 song-lyrics.js；現場版（<id>-live.json，type: "live"）寫入 song-lyrics-live.js 並依 id 排序
// 用法：node tools/timing/apply.mjs <id>.json [更多檔案…]，寫完記得跑 node scripts/check-data.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const files = process.argv.slice(2);
if (!files.length) { console.error("用法：node tools/timing/apply.mjs <id>.json [更多檔案…]"); process.exit(1); }

const TARGETS = {
  mv: { file: path.join(root, "song-lyrics.js"), varName: "SONGS", sort: false },
  live: { file: path.join(root, "song-lyrics-live.js"), varName: "LIVE_SONGS", sort: true }
};

// 讀入目標檔；先確認原檔照 JSON.stringify 排版，寫回去時其他歌一個字都不會動
function open(target) {
  const raw = fs.readFileSync(target.file, "utf8"), crlf = raw.includes("\r\n"), src = raw.replace(/\r\n/g, "\n");
  const HEAD = `var ${target.varName} = `, TAIL = `;\n\n  return ${target.varName};`;
  const a = src.indexOf(HEAD), b = src.indexOf(TAIL);
  const name = path.basename(target.file);
  if (a < 0 || b < 0) throw new Error(`${name} 的格式跟預期不同（找不到 ${HEAD}… return ${target.varName};），沒有寫入`);
  const songs = require(target.file);
  if (src.slice(a + HEAD.length, b) !== JSON.stringify(songs, null, 2)) throw new Error(`${name} 不是 JSON.stringify(…, null, 2) 的排版，為了不動到其他歌，沒有寫入`);
  return { ...target, name, crlf, src, a: a + HEAD.length, b, songs, touched: false };
}

const opened = {};
for (const f of files) {
  const entry = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!entry.id || !Array.isArray(entry.lyrics)) throw new Error(`${f} 不是對時工具輸出的格式（要有 id 和 lyrics）`);
  for (let i = 1; i < entry.lyrics.length; i++) {
    if (entry.lyrics[i].time < entry.lyrics[i - 1].time) throw new Error(`${f} 第 ${i + 1} 句比上一句早，先回工具修正`);
  }
  const kind = entry.type === "live" || /-live$/.test(entry.id) ? "live" : "mv";
  const t = opened[kind] || (opened[kind] = open(TARGETS[kind]));
  const i = t.songs.findIndex(s => s.id === entry.id);
  if (i >= 0) t.songs[i] = entry; else t.songs.push(entry);
  if (t.sort) t.songs.sort((x, y) => x.id.localeCompare(y.id));
  t.touched = true;

  const actsCount = entry.lyrics.filter(l => l.acts && l.acts.length).length;
  const uniqueActs = [...new Set(entry.lyrics.flatMap(l => l.acts || []))];
  const actsSummary = actsCount ? `（包含 ${actsCount} 句應援動作：${uniqueActs.join(", ")}）` : "";
  const last = entry.lyrics[entry.lyrics.length - 1];
  if (last && typeof entry.duration === "number" && last.time > entry.duration) {
    console.warn(`⚠ ${entry.id}：最後一句在 ${last.time}s，但 duration 只有 ${entry.duration}s，請確認曲長`);
  }
  console.log(`${i >= 0 ? "更新" : "新增"} ${entry.id} → ${t.name}：${entry.lyrics.length} 句 ${actsSummary}`);
}

for (const t of Object.values(opened)) {
  if (!t.touched) continue;
  let out = t.src.slice(0, t.a) + JSON.stringify(t.songs, null, 2) + t.src.slice(t.b);
  if (t.crlf) out = out.replace(/\n/g, "\r\n");
  fs.writeFileSync(t.file, out);
  console.log(`已寫入 ${t.name}`);
}
console.log("接著跑 node scripts/check-data.mjs");
