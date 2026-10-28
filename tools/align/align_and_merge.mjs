import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

const isApply = process.argv.includes('--apply');

const maruDir = path.join(__dirname, 'work/marumaru');
const songLyricsPath = path.join(repoRoot, 'song-lyrics.js');
const ADO_SONGS = require(songLyricsPath);

// Normalization helper
const stripFurigana = s => (s || "").replace(/([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g, "$1");
const norm = s => stripFurigana(s)
  .replace(/[\s\(\)（）\-\_\x27\"\’\:\：\.\,\!\?？！…「」『』]/g, "")
  .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .toLowerCase();

const isFiller = s => !s || (s.startsWith("（") && s.endsWith("）")) || (s.startsWith("(") && s.endsWith(")"));

// Calibrated times based on true audio vocal onset waveforms
const CALIBRATED_USSEEWA_TIMES = {
  0: 0.55,
  1: 2.46,
  2: 7.90,
  3: 16.10,
  4: 18.74,
  5: 21.44,
  6: 24.14,
  7: 26.16,
  8: 29.60,
  9: 32.23,
  10: 36.55,
  11: 37.91,
  12: 40.45,
  13: 43.20,
  14: 45.71,
  15: 50.43,
  16: 53.75,
  17: 56.15,
  18: 59.25,
  19: 62.20,
  20: 64.30,
  21: 67.28,
  22: 70.00,
  23: 75.44,
  24: 84.90,
  25: 87.55,
  26: 90.20,
  27: 92.90,
  28: 95.75,
  29: 98.28,
  30: 100.99,
  31: 105.30,
  32: 106.38,
  33: 109.08,
  34: 111.90,
  35: 114.14,
  36: 119.19,
  37: 122.22,
  38: 125.26,
  39: 131.15,
  40: 132.65,
  41: 136.04,
  42: 138.40,
  43: 143.92,
  44: 153.65,
  45: 158.90,
  46: 161.68,
  47: 164.36,
  48: 166.72,
  49: 169.41,
  50: 172.45,
  51: 175.50,
  52: 177.00,
  53: 180.80,
  54: 183.25,
  55: 185.90,
  56: 189.80
};

let stats = {
  totalSongs: ADO_SONGS.length,
  updatedSongs: 0,
  vocalLinesTotal: 0,
  vocalLinesUpdated: 0,
  trFilled: 0,
  interludesAdded: 0,
  aitakuteAdded: 0
};

const updatedSongsList = [];

for (const song of ADO_SONGS) {
  const maruFile = path.join(maruDir, `${song.id}.json`);

  // Special Case 1: aitakute (empty lyrics in ado-guide)
  if (song.id === "aitakute" && fs.existsSync(maruFile)) {
    const maruData = JSON.parse(fs.readFileSync(maruFile, 'utf8'));
    const maruLines = maruData.lines.filter(l => l.start != null && l.lyrics && l.lyrics.trim());
    const newLyrics = [];

    for (let i = 0; i < maruLines.length; i++) {
      const ml = maruLines[i];
      newLyrics.push({
        time: Math.round(ml.start * 100) / 100,
        jp: ml.lyrics,
        tr: ml.zh || ""
      });
      stats.aitakuteAdded++;

      const nextMl = maruLines[i + 1];
      if (nextMl && ml.end && (nextMl.start - ml.end >= 6.5)) {
        newLyrics.push({
          time: Math.round((ml.end + 0.5) * 100) / 100,
          jp: "（間奏）",
          tr: ""
        });
        stats.interludesAdded++;
      }
    }

    updatedSongsList.push({
      ...song,
      lyrics: newLyrics
    });
    stats.updatedSongs++;
    continue;
  }

  // Song not in MaruMaru (hotaru, charles)
  if (!fs.existsSync(maruFile)) {
    updatedSongsList.push(song);
    continue;
  }

  const maruData = JSON.parse(fs.readFileSync(maruFile, 'utf8'));
  const maruLines = maruData.lines.filter(l => l.start != null && l.lyrics && l.lyrics.trim());

  if (song.lyrics.length === 0) {
    updatedSongsList.push(song);
    continue;
  }

  stats.updatedSongs++;

  // Step 1: Sequential Multi-Line Matching
  let mIdx = 0;
  const lineMatches = new Array(song.lyrics.length).fill(null);

  for (let i = 0; i < song.lyrics.length; i++) {
    const al = song.lyrics[i];
    if (isFiller(al.jp)) continue;
    stats.vocalLinesTotal++;
    const aNorm = norm(al.jp);

    for (let j = mIdx; j < Math.min(maruLines.length, mIdx + 8); j++) {
      const ml = maruLines[j];
      const mNorm = norm(ml.lyrics);

      // Exact 1:1 match
      if (aNorm === mNorm) {
        lineMatches[i] = { time: ml.start, end: ml.end, zh: ml.zh };
        mIdx = j + 1;
        break;
      }

      // Maru line contains this Ado line (1 maru -> multiple ado lines)
      if (mNorm.includes(aNorm)) {
        let combined = aNorm;
        let k = i + 1;
        while (k < song.lyrics.length && !isFiller(song.lyrics[k].jp) && combined.length < mNorm.length) {
          combined += norm(song.lyrics[k].jp);
          k++;
        }
        if (combined === mNorm || mNorm.includes(combined)) {
          // Distribute time proportionally by length
          const totalLen = combined.length || 1;
          const totalDur = (ml.end && ml.end > ml.start) ? (ml.end - ml.start) : (k - i) * 2.5;
          let offset = 0;

          for (let idx = i; idx < k; idx++) {
            const partLen = norm(song.lyrics[idx].jp).length;
            const partStart = ml.start + (totalDur * (offset / totalLen));
            const partEnd = ml.start + (totalDur * ((offset + partLen) / totalLen));
            lineMatches[idx] = { time: partStart, end: partEnd, zh: idx === i ? ml.zh : null };
            offset += partLen;
          }
          i = k - 1;
          mIdx = j + 1;
          break;
        }
      }

      // Ado line contains multiple Maru lines
      if (aNorm.includes(mNorm)) {
        let combinedM = mNorm;
        let k = j + 1;
        while (k < maruLines.length && combinedM.length < aNorm.length) {
          combinedM += norm(maruLines[k].lyrics);
          k++;
        }
        if (combinedM === aNorm || aNorm.includes(combinedM)) {
          lineMatches[i] = { time: ml.start, end: maruLines[k - 1].end, zh: ml.zh };
          mIdx = k;
          break;
        }
      }
    }
  }

  // Step 2: Build new lyrics array, fill translations, add/reposition interludes
  const newLyrics = [];

  for (let i = 0; i < song.lyrics.length; i++) {
    const al = song.lyrics[i];
    const match = lineMatches[i];

    if (isFiller(al.jp)) {
      // Reposition existing interlude if previous vocal has an end time
      let adjustedTime = al.time;
      const prevMatch = i > 0 ? lineMatches[i - 1] : null;
      const nextMatch = i + 1 < song.lyrics.length ? lineMatches[i + 1] : null;

      if (prevMatch && prevMatch.end) {
        const nextTime = nextMatch ? nextMatch.time : (prevMatch.end + 5);
        if (prevMatch.end < nextTime) {
          adjustedTime = Math.round(Math.min(prevMatch.end + 0.5, (prevMatch.end + nextTime) / 2) * 100) / 100;
        }
      }
      newLyrics.push({ ...al, time: adjustedTime });
      continue;
    }

    // Vocal line
    let newTime = al.time;
    let newTr = al.tr;

    if (match) {
      newTime = Math.round(match.time * 100) / 100;
      stats.vocalLinesUpdated++;
      if ((!newTr || newTr.trim() === "") && match.zh) {
        newTr = match.zh;
        stats.trFilled++;
      }
    }

    if (song.id === "usseewa" && CALIBRATED_USSEEWA_TIMES[i] != null) {
      newTime = CALIBRATED_USSEEWA_TIMES[i];
    }

    const newLine = { ...al, time: newTime };
    if (newTr) newLine.tr = newTr;
    newLyrics.push(newLine);

    // Step 3: Insert new （間奏） if long silence gap exists to next vocal line
    if (i + 1 < song.lyrics.length && !isFiller(song.lyrics[i + 1].jp)) {
      const nextMatch = lineMatches[i + 1];
      const nextTime = nextMatch ? nextMatch.time : song.lyrics[i + 1].time;
      const currEnd = (match && match.end) ? match.end : newTime + 2.5;

      if (nextTime - currEnd >= 7.0) {
        const interludeTime = Math.round((currEnd + 0.6) * 100) / 100;
        newLyrics.push({
          time: interludeTime,
          jp: "（間奏）",
          tr: ""
        });
        stats.interludesAdded++;
      }
    }
  }

  // Step 4: Guarantee strictly ascending timestamps
  for (let i = 1; i < newLyrics.length; i++) {
    if (newLyrics[i].time <= newLyrics[i - 1].time) {
      newLyrics[i].time = Math.round((newLyrics[i - 1].time + 0.05) * 100) / 100;
    }
  }

  updatedSongsList.push({
    ...song,
    lyrics: newLyrics
  });
}

console.log("\n================ ALIGNMENT RESULTS ================");
console.log(`Total songs in library: ${stats.totalSongs}`);
console.log(`Songs updated with alignment: ${stats.updatedSongs}`);
console.log(`Vocal lines updated with precision times: ${stats.vocalLinesUpdated} / ${stats.vocalLinesTotal} (${(stats.vocalLinesUpdated/stats.vocalLinesTotal*100).toFixed(1)}%)`);
console.log(`Missing Chinese translations populated: ${stats.trFilled}`);
console.log(`New interlude (間奏) markers added: ${stats.interludesAdded}`);
console.log(`Aitakute full lines created: ${stats.aitakuteAdded}`);
console.log("===================================================\n");

// Write output
const banner = `/**
 * Ado 應援預習 - 歌曲同步歌詞與中譯檔案 (Song Lyrics & Translations)
 * 格式參考自 Vaundy 應援指南 (vaundy.tiaui.co)
 * 每個歌曲包含 id, title, youtubeId, duration, lyrics: [{ time, jp, tr, acts, sing, call }]
 * 原創曲的逐行動作依 じゅん🌝ぴ 的 note（2024-04-26）標在原文寫的 MV 時間點；原文沒寫的歌不標
 * sing 是觀眾要唱的字（取該行最後一次出現的位置）；歌詞裡沒有這些字時改用 call 標籤
 * jp 是「（間奏）」「（觀眾接唱）」這類括號的行，是原文時間點沒有對應歌詞時補的
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    var lyrics = factory();
    root.SONG_LYRICS = lyrics;
    root.SONGS = lyrics;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SONGS = `;

const footer = `;

  return SONGS;
});
`;

const formattedJson = JSON.stringify(updatedSongsList, null, 2)
  .split('\n')
  .map((line, idx) => idx === 0 ? line : '  ' + line)
  .join('\n');

const fullContent = banner + formattedJson + footer;

if (isApply) {
  fs.writeFileSync(songLyricsPath, fullContent, 'utf8');
  console.log(`[APPLY] Successfully updated ${songLyricsPath}!`);
} else {
  const previewPath = path.join(__dirname, 'work/song-lyrics.preview.js');
  fs.writeFileSync(previewPath, fullContent, 'utf8');
  console.log(`[DRY-RUN] Preview written to ${previewPath}. Run with --apply to commit.`);
}
