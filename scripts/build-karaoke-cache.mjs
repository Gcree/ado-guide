import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const karaoke = require(path.join(root, "karaoke-sources.js"));
const { SONGS } = require(path.join(root, "songs.js"));
const LYRICS = require(path.join(root, "song-lyrics.js"));

console.log(`=== 開始為 ${SONGS.length} 首歌曲抓取並校對卡拉OK檔案 ===\n`);

const results = [];
const bundled = {};

// 依序處理，每次間隔 100ms 避免觸發 API 限流
for (let i = 0; i < SONGS.length; i++) {
  const song = SONGS[i];
  const lyricData = LYRICS.find(l => l.id === song.id);
  
  if (!lyricData || !Array.isArray(lyricData.lyrics) || lyricData.lyrics.length === 0) {
    results.push({ id: song.id, title: song.ja, status: "no_lyrics" });
    continue;
  }

  process.stdout.write(`[${i + 1}/${SONGS.length}] ${song.ja} (${song.id})... `);

  try {
    const timed = await karaoke.load({ id: song.id, ja: song.ja, dur: lyricData.duration }, { timeoutMs: 8000 });
    
    if (timed) {
      const aligned = karaoke.alignToLocalLyrics(timed, lyricData.lyrics);
      if (aligned) {
        const rate = (aligned.matchedLines / aligned.totalLines * 100).toFixed(1);
        const offset = aligned.offset.toFixed(2);
        console.log(`✓ 成功！來源: ${timed.source} | 匹配: ${aligned.matchedLines}/${aligned.totalLines} (${rate}%) | 偏移: ${offset}s`);
        
        bundled[song.id] = timed;
        results.push({
          id: song.id,
          title: song.ja,
          status: "success",
          source: timed.source,
          granularity: timed.granularity,
          matched: aligned.matchedLines,
          total: aligned.totalLines,
          rate: Number(rate),
          offset: Number(offset)
        });
      } else {
        console.log(`⚠ 已取得時間檔，但歌詞對齊未達門檻（將採用行估算同步）`);
        results.push({ id: song.id, title: song.ja, status: "align_failed", source: timed.source });
      }
    } else {
      console.log(`- 無開源卡拉OK檔（將採用本地行時間同步）`);
      results.push({ id: song.id, title: song.ja, status: "miss" });
    }
  } catch (err) {
    console.log(`✗ 錯誤: ${err.message}`);
    results.push({ id: song.id, title: song.ja, status: "error", error: err.message });
  }

  await new Promise(r => setTimeout(r, 120));
}

// 輸出快取檔案
const cacheFile = path.join(root, "karaoke-cache.json");
fs.writeFileSync(cacheFile, JSON.stringify(bundled, null, 2));

const successCount = results.filter(r => r.status === "success").length;
const totalCount = results.length;

console.log("\n==========================================");
console.log(`校對完成！共 ${totalCount} 首歌曲：`);
console.log(`  ✓ 成功對齊卡拉OK：${successCount} 首 (${(successCount / totalCount * 100).toFixed(1)}%)`);
console.log(`  - 採用本地行時間：${totalCount - successCount} 首`);
console.log(`已輸出完整快取檔至: ${path.relative(root, cacheFile)}`);
console.log("==========================================");
