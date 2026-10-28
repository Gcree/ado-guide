#!/usr/bin/env node
// 檢查歌曲與歌詞資料完整性與正確性
// 用法：node scripts/check-data.mjs

import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(import.meta.url);

const { SONGS, UT, PEN, BEAT, CLIMAX, LIVES } = require(path.join(root, "songs.js"));
const LYRICS = require(path.join(root, "song-lyrics.js"));

const parseLen = str => str.split(":").reduce((a, b) => a * 60 + +b, 0);
const ALLOWED_ACTS = new Set(["sing", "clap", "wave", "jump", "call", "gesture", "listen"]);
const ALLOWED_PENS = new Set([..."青水白赤桃紫橙黄緑彩"]);

const errors = [];
const warns = [];

const error = (msg) => errors.push(msg);
const warn = (msg) => warns.push(msg);

// 建立索引
const songsMap = new Map(SONGS.map(s => [s.id, s]));
const lyricsMap = new Map(LYRICS.map(b => [b.id, b]));

// 1. songs.js 與 song-lyrics.js 一致性檢查
for (const s of SONGS) {
  if (!lyricsMap.has(s.id)) {
    error(`[${s.id}] 在 songs.js 存在，但在 song-lyrics.js 找不到對應項目`);
  }
}
for (const b of LYRICS) {
  if (!songsMap.has(b.id)) {
    error(`[${b.id}] 在 song-lyrics.js 存在，但在 songs.js 找不到對應項目`);
  }
}

for (const s of SONGS) {
  const b = lyricsMap.get(s.id);
  if (!b) continue;
  if (s.yt !== b.youtubeId) {
    error(`[${s.id}] YouTube ID 不一致: songs.js=${s.yt}, song-lyrics.js=${b.youtubeId}`);
  }
  const sDur = parseLen(s.len);
  if (typeof b.duration !== "number" || Math.abs(sDur - b.duration) > 2) {
    error(`[${s.id}] 曲長差距大於 2 秒: songs.js=${s.len} (${sDur}s), song-lyrics.js=${b.duration}s`);
  }
}

// 2. 歌詞時間 time 檢查；3. acts 檢查；4. sing 檢查
for (const b of LYRICS) {
  const s = songsMap.get(b.id);
  const dur = s ? parseLen(s.len) : b.duration;
  let prevTime = -1;

  (b.lyrics || []).forEach((l, idx) => {
    const lineNum = idx + 1;

    // 2. time 由小到大，在 0 到曲長之間
    if (typeof l.time !== "number" || Number.isNaN(l.time)) {
      error(`[${b.id}] 第 ${lineNum} 行: time 不是有效數字 (${l.time})`);
    } else {
      if (l.time < 0 || l.time > dur) {
        error(`[${b.id}] 第 ${lineNum} 行: time (${l.time}s) 超出歌曲範圍 0~${dur}s`);
      }
      if (l.time < prevTime) {
        error(`[${b.id}] 第 ${lineNum} 行: time (${l.time}s) 小於前一行時間 (${prevTime}s)，未由小到大排序`);
      }
      prevTime = l.time;
    }

    // 3. acts 只能是 ACT 定義的名稱
    if (l.acts) {
      if (!Array.isArray(l.acts)) {
        error(`[${b.id}] 第 ${lineNum} 行: acts 不是陣列`);
      } else {
        for (const a of l.acts) {
          if (!ALLOWED_ACTS.has(a)) {
            error(`[${b.id}] 第 ${lineNum} 行: acts 包含無效動作 "${a}"`);
          }
        }
      }
    }

    // 4. sing 的每個字串都出現在那行的 jp 裡
    if (l.sing) {
      if (!Array.isArray(l.sing)) {
        error(`[${b.id}] 第 ${lineNum} 行: sing 不是陣列`);
      } else {
        const jp = l.jp || "";
        for (const w of l.sing) {
          if (!jp.includes(w)) {
            error(`[${b.id}] 第 ${lineNum} 行: sing 字串 "${w}" 未出現在日文歌詞 jp: "${jp}" 之中`);
          }
        }
      }
    }
  });
}

// 3. SONGS 中的 acts 檢查
for (const s of SONGS) {
  for (const a of (s.acts || [])) {
    if (!ALLOWED_ACTS.has(a)) {
      error(`[${s.id}] songs.js 中的 acts 包含無效動作 "${a}"`);
    }
  }
}

// 5. PEN 檢查
for (const [id, val] of Object.entries(PEN)) {
  if (!songsMap.has(id)) {
    error(`[${id}] 在 PEN 表中存在，但不在 songs.js 歌單中`);
  }
  if (typeof val !== "string" || !val.length) {
    error(`[${id}] PEN 格式錯誤: "${val}"`);
    continue;
  }
  for (let i = 0; i < val.length; i++) {
    const c = val[i];
    if (i === 0 && c === "?") continue;
    if (!ALLOWED_PENS.has(c)) {
      error(`[${id}] PEN 包含未定義顏色字元 "${c}" (完整: "${val}")`);
    }
  }
}

// 6. BEAT 檢查；CLIMAX 檢查
for (const [id, val] of Object.entries(BEAT)) {
  if (!songsMap.has(id)) {
    error(`[${id}] 在 BEAT 表中存在，但不在 songs.js 歌單中`);
  }
  if (!Array.isArray(val) || val.length !== 3) {
    error(`[${id}] BEAT 格式錯誤，應為 [BPM, 秒數, 0或1]: ${JSON.stringify(val)}`);
    continue;
  }
  const [bpm, sec, conf] = val;
  if (typeof bpm !== "number" || bpm < 60 || bpm > 220) {
    error(`[${id}] BEAT BPM (${bpm}) 超出有效範圍 60–220`);
  }
  if (typeof sec !== "number" || sec < 0) {
    error(`[${id}] BEAT 秒數 (${sec}) 無效`);
  }
  if (conf !== 0 && conf !== 1) {
    error(`[${id}] BEAT 置信度標記 (${conf}) 應為 0 或 1`);
  }
}

for (const [id, sec] of Object.entries(CLIMAX)) {
  const s = songsMap.get(id);
  if (!s) {
    error(`[${id}] 在 CLIMAX 表中存在，但不在 songs.js 歌單中`);
    continue;
  }
  const dur = parseLen(s.len);
  if (typeof sec !== "number" || sec < 0 || sec >= dur) {
    error(`[${id}] CLIMAX 秒數 (${sec}) 無效或超出曲長 (${dur}s)`);
  }
}

// 7. 每首歌要不是 free／hold／sug，就要有 tips
for (const s of SONGS) {
  if (!s.free && !s.hold && !s.sug) {
    if (!Array.isArray(s.tips) || s.tips.length === 0) {
      error(`[${s.id}] 未標記 free／hold／sug，且未填寫任何 tips 應援重點`);
    }
  }
}

// 8. LIVES 檢查
if (LIVES) {
  for (const [id, tracks] of Object.entries(LIVES)) {
    if (!songsMap.has(id)) {
      error(`[${id}] 在 LIVES 表中存在，但不在 songs.js 歌單中`);
    }
    if (!Array.isArray(tracks) || tracks.length === 0) {
      error(`[${id}] LIVES 項目必須為非空陣列`);
    }
    for (const t of tracks) {
      if (!t.concert || !t.yt) {
        error(`[${id}] LIVES 項目缺少 concert 或 yt: ${JSON.stringify(t)}`);
      }
    }
  }
}

// 9. WARN 提醒（不使檢查失敗）
const missingUT = SONGS.filter(s => !UT[s.id]).map(s => s.id);
if (missingUT.length) {
  warn(`缺少 UT（歌ネット）編號的歌曲 (${missingUT.length} 首): ${missingUT.join(", ")}`);
}

const missingBEAT = SONGS.filter(s => !BEAT[s.id]).map(s => s.id);
if (missingBEAT.length) {
  warn(`缺少 BEAT 拍點資料的歌曲 (${missingBEAT.length} 首): ${missingBEAT.join(", ")}`);
}

const missingCLIMAX = SONGS.filter(s => !CLIMAX[s.id]).map(s => s.id);
if (missingCLIMAX.length) {
  warn(`缺少 CLIMAX 副歌高潮秒數的歌曲 (${missingCLIMAX.length} 首): ${missingCLIMAX.join(", ")}`);
}

for (const b of LYRICS) {
  if (!b.lyrics || b.lyrics.length === 0) {
    warn(`[${b.id}] 沒有逐行歌詞資料`);
    continue;
  }
  let missingTr = 0;
  for (const l of b.lyrics) {
    const jp = (l.jp || "").trim();
    const isBracket = /^[（(].*[)）]$/.test(jp);
    if (!isBracket && !(l.tr || "").trim()) {
      missingTr++;
    }
  }
  if (missingTr > 0) {
    warn(`[${b.id}] 有 ${missingTr} / ${b.lyrics.length} 行非括號補位行缺少中文翻譯 tr`);
  }
}

// 印出結果
if (warns.length) {
  console.log(`=== 資料檢查提醒 (WARN: ${warns.length} 則) ===`);
  for (const w of warns) {
    console.log(`[WARN] ${w}`);
  }
}

if (errors.length) {
  console.error(`\n=== 資料檢查失敗 (ERROR: ${errors.length} 則) ===`);
  for (const e of errors) {
    console.error(`[ERROR] ${e}`);
  }
  process.exit(1);
} else {
  console.log(`\n資料檢查通過：0 個錯誤，${warns.length} 個提醒。`);
  process.exit(0);
}
