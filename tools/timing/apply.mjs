// 把歌詞對時工具下載的 <id>.json 寫回歌詞檔：同一首就整首換掉，新歌就加進去
// MV 版（<id>.json）寫入 song-lyrics.js；現場版（<id>-live.json，type: "live"）寫入 song-lyrics-live.js 並依 id 排序
// 對時工作台的「存回歌詞檔」用的是同一份邏輯（lyrics-store.js），平常直接在工作台存就好；這支留給手上只有 JSON 檔的時候
// 用法：node tools/timing/apply.mjs <id>.json [更多檔案…]，寫完記得跑 node scripts/check-data.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, "../..");
const { merge, validate, kindOf, TARGETS } = require(path.join(here, "lyrics-store.js"));
const { SONGS } = require(path.join(root, "songs.js"));
const files = process.argv.slice(2);
if (!files.length) { console.error("用法：node tools/timing/apply.mjs <id>.json [更多檔案…]"); process.exit(1); }

const texts = {};
for (const f of files) {
  const entry = JSON.parse(fs.readFileSync(f, "utf8"));
  const kind = kindOf(entry), file = path.join(root, TARGETS[kind].file);
  const song = SONGS.find(s => s.id === (entry.baseId || String(entry.id).replace(/-live$/, "")));
  const { errors, warnings } = validate(entry, song);
  if (errors.length) throw new Error(`${f} 有 ${errors.length} 個問題，先回工具修正：\n- ${errors.join("\n- ")}`);
  warnings.forEach(w => console.warn(`⚠ ${entry.id}：${w}`));

  const r = merge(texts[kind] ?? fs.readFileSync(file, "utf8"), entry);
  texts[kind] = r.text;
  const actsCount = entry.lyrics.filter(l => l.acts && l.acts.length).length;
  const uniqueActs = [...new Set(entry.lyrics.flatMap(l => l.acts || []))];
  const actsSummary = actsCount ? `（包含 ${actsCount} 句應援動作：${uniqueActs.join(", ")}）` : "";
  console.log(`${r.replaced ? (r.unchanged ? "沒有變動" : "更新") : "新增"} ${entry.id} → ${r.file}：${entry.lyrics.length} 句 ${actsSummary}`);
}

for (const [kind, text] of Object.entries(texts)) {
  fs.writeFileSync(path.join(root, TARGETS[kind].file), text);
  console.log(`已寫入 ${TARGETS[kind].file}`);
}
console.log("接著跑 node scripts/check-data.mjs");
