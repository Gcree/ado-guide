#!/usr/bin/env node
// 檢查歌曲與歌詞資料完整性與正確性
// 用法：node scripts/check-data.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const {
  SONGS, UT, PEN, BEAT, CLIMAX, LIVES, LIVE_VIDEOS,
  SERIES = [], PRACTICE = {}, ALBUMS = [], CREDIT = {}, TIE = {}, ALIAS = {}
} = require(path.join(root, "songs.js"));
const LYRICS = require(path.join(root, "song-lyrics.js"));
const LYRICS_LIVE = require(path.join(root, "song-lyrics-live.js"));
const I18N = require(path.join(root, "i18n.js"));

const parseLen = str => str.split(":").reduce((a, b) => a * 60 + +b, 0);
const ALLOWED_ACTS = new Set(["sing", "clap", "wave", "jump", "call", "gesture", "listen"]);
const ALLOWED_PENS = new Set([..."青水白赤桃紫橙黄緑彩"]);
const YT_RE = /^[\w-]{11}$/;
const LEN_RE = /^\d+:[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const warns = [];

const error = (msg) => errors.push(msg);
const warn = (msg) => warns.push(msg);

const isValidDate = (str) => {
  if (typeof str !== "string" || !DATE_RE.test(str)) return false;
  const d = new Date(`${str}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
};

// 重複 ID 檢查與索引建立
const songsMap = new Map();
for (const s of SONGS) {
  if (songsMap.has(s.id)) error(`[${s.id}] songs.js 中有重複的歌曲 ID`);
  else songsMap.set(s.id, s);
}

const lyricsMap = new Map();
for (const b of LYRICS) {
  if (lyricsMap.has(b.id)) error(`[${b.id}] song-lyrics.js 中有重複的歌曲 ID`);
  else lyricsMap.set(b.id, b);
}

const liveLyricsMap = new Map();
const liveBaseSeen = new Set();
for (const b of LYRICS_LIVE) {
  if (liveLyricsMap.has(b.id)) error(`[${b.id}] song-lyrics-live.js 中有重複的 ID`);
  else liveLyricsMap.set(b.id, b);
  const baseId = b.baseId || String(b.id || "").replace(/-live$/, "");
  if (liveBaseSeen.has(baseId)) error(`[${b.id}] song-lyrics-live.js 中有重複的 baseId "${baseId}"`);
  else liveBaseSeen.add(baseId);
}

// 1. songs.js 基本欄位與 song-lyrics.js 一致性檢查
for (const s of SONGS) {
  if (!YT_RE.test(s.yt || "")) error(`[${s.id}] songs.js 的 yt 格式不對（應為 11 碼）: ${s.yt}`);
  if (!LEN_RE.test(s.len || "")) error(`[${s.id}] songs.js 的 len 格式不對（應為 M:SS）: ${s.len}`);
  if (!isValidDate(s.date)) error(`[${s.id}] songs.js 的 date 格式不對（應為 YYYY-MM-DD）: ${s.date}`);
  if (!lyricsMap.has(s.id)) error(`[${s.id}] 在 songs.js 存在，但在 song-lyrics.js 找不到對應項目`);
}
for (const b of LYRICS) {
  if (!songsMap.has(b.id)) error(`[${b.id}] 在 song-lyrics.js 存在，但在 songs.js 找不到對應項目`);
}

for (const s of SONGS) {
  const b = lyricsMap.get(s.id);
  if (!b) continue;
  if (s.yt !== b.youtubeId) {
    error(`[${s.id}] YouTube ID 不一致: songs.js=${s.yt}, song-lyrics.js=${b.youtubeId}`);
  }
  if (LEN_RE.test(s.len || "")) {
    const sDur = parseLen(s.len);
    if (typeof b.duration !== "number" || !Number.isFinite(b.duration) || Math.abs(sDur - b.duration) > 2) {
      error(`[${s.id}] 曲長差距大於 2 秒: songs.js=${s.len} (${sDur}s), song-lyrics.js=${b.duration}s`);
    }
  }
}

// 共用歌詞區塊檢查（MV 與現場版）
function validateLyricsBlock(b, dur, { label, song = null, isLive = false }) {
  const prefix = isLive ? `[${b.id} (${label})]` : `[${b.id}]`;
  if (typeof b.duration !== "number" || !Number.isFinite(b.duration) || b.duration <= 0) {
    error(`${prefix} duration 不是有效的正數 (${b.duration})`);
  }
  const lines = Array.isArray(b.lyrics) ? b.lyrics : [];
  let prevTime = -1;
  let missingTr = 0;

  lines.forEach((l, idx) => {
    const lineNum = idx + 1;
    if (typeof l.time !== "number" || !Number.isFinite(l.time)) {
      error(`${prefix} 第 ${lineNum} 行: time 不是有效數字 (${l.time})`);
    } else {
      if (l.time < 0 || (typeof dur === "number" && l.time > dur)) {
        error(`${prefix} 第 ${lineNum} 行: time (${l.time}s) 超出歌曲範圍 0~${dur}s`);
      }
      if (l.time < prevTime) {
        error(`${prefix} 第 ${lineNum} 行: time (${l.time}s) 小於前一行時間 (${prevTime}s)，未由小到大排序`);
      }
      prevTime = l.time;
    }

    if (l.duration !== undefined) {
      if (typeof l.duration !== "number" || !Number.isFinite(l.duration) || l.duration <= 0) {
        error(`${prefix} 第 ${lineNum} 行: duration (${l.duration}) 必須大於 0`);
      } else {
        const next = lines[idx + 1];
        if (next && typeof l.time === "number" && typeof next.time === "number" && l.time + l.duration > next.time + 0.05) {
          warn(`${prefix} 第 ${lineNum} 行: duration (${l.time} + ${l.duration} = ${(l.time + l.duration).toFixed(2)}s) 與下一行 (${next.time}s) 重疊超過 0.05s`);
        }
      }
    }

    if (l.acts !== undefined) {
      if (!Array.isArray(l.acts)) {
        error(`${prefix} 第 ${lineNum} 行: acts 不是陣列`);
      } else {
        for (const a of l.acts) {
          if (!ALLOWED_ACTS.has(a)) error(`${prefix} 第 ${lineNum} 行: acts 包含無效動作 "${a}"`);
        }
        if (song?.free && l.acts.some(a => a !== "listen")) {
          error(`${prefix} 第 ${lineNum} 行: 歌曲標記 free: true 卻包含逐行動作 [${l.acts.join(", ")}]`);
        }
      }
    }

    if (l.sing !== undefined) {
      if (!Array.isArray(l.sing)) {
        error(`${prefix} 第 ${lineNum} 行: sing 不是陣列`);
      } else {
        const jp = l.jp || "";
        for (const w of l.sing) {
          if (typeof w !== "string" || !w || !jp.includes(w)) {
            error(`${prefix} 第 ${lineNum} 行: sing 字串 "${w}" 未出現在日文歌詞 jp: "${jp}" 之中`);
          }
        }
      }
    }

    const jp = (l.jp || "").trim();
    if (!/^[（(].*[)）]$/.test(jp) && !(l.tr || "").trim()) missingTr++;
  });

  if (!lines.length) {
    warn(`${prefix} 沒有逐行歌詞資料`);
  } else if (missingTr > 0) {
    warn(`${prefix} 有 ${missingTr} / ${lines.length} 行非括號補位行缺少中文翻譯 tr`);
  }
}

// 2. MV 歌詞檢查
for (const b of LYRICS) {
  const s = songsMap.get(b.id);
  const dur = s && LEN_RE.test(s.len || "") ? parseLen(s.len) : b.duration;
  validateLyricsBlock(b, dur, { label: "MV", song: s, isLive: false });
}

// 2.1 LIVE 歌詞完整檢查
for (const b of LYRICS_LIVE) {
  const baseId = b.baseId || String(b.id || "").replace(/-live$/, "");
  if (!b.baseId || !songsMap.has(baseId)) {
    error(`[${b.id}] song-lyrics-live.js 的 baseId "${b.baseId}" 不存在於 songs.js`);
  }
  validateLyricsBlock(b, b.duration, { label: "LIVE", isLive: true });
}

// 3. SONGS 中的 acts 與 free/tips 檢查
for (const s of SONGS) {
  for (const a of (s.acts || [])) {
    if (!ALLOWED_ACTS.has(a)) error(`[${s.id}] songs.js 中的 acts 包含無效動作 "${a}"`);
  }
  if (s.free && (s.acts || []).length > 0) {
    error(`[${s.id}] 標記 free: true 卻同時設定 acts: ${JSON.stringify(s.acts)}`);
  }
  if (!s.free && !s.hold && !s.sug) {
    if (!Array.isArray(s.tips) || s.tips.length === 0) {
      error(`[${s.id}] 未標記 free／hold／sug，且未填寫任何 tips 應援重點`);
    }
  }
}

// 4. 各資料表的歌曲 ID 存在檢查
function checkMapIds(tableName, obj) {
  for (const id of Object.keys(obj || {})) {
    if (!songsMap.has(id)) error(`[${id}] 在 ${tableName} 表中存在，但不在 songs.js 歌單中`);
  }
}
checkMapIds("UT", UT);
checkMapIds("PEN", PEN);
checkMapIds("BEAT", BEAT);
checkMapIds("CLIMAX", CLIMAX);
checkMapIds("LIVES", LIVES);
checkMapIds("LIVE_VIDEOS", LIVE_VIDEOS);
checkMapIds("CREDIT", CREDIT);
checkMapIds("TIE", TIE);
checkMapIds("ALIAS", ALIAS);

for (const g of SERIES) {
  const seen = new Set();
  for (const id of (g.ids || [])) {
    if (!songsMap.has(id)) error(`[${id}] 在 SERIES「${g.name}」存在，但不在 songs.js 歌單中`);
    if (seen.has(id)) error(`[${id}] 在 SERIES「${g.name}」重複出現`);
    seen.add(id);
  }
}

const albumSeen = new Set();
for (const a of ALBUMS) {
  for (const id of (a.ids || [])) {
    if (!songsMap.has(id)) error(`[${id}] 在 ALBUMS「${a.name}」存在，但不在 songs.js 歌單中`);
    if (albumSeen.has(id)) error(`[${id}] 在 ALBUMS 中重複出現`);
    albumSeen.add(id);
  }
}

const practiceSeen = new Set();
for (const [tier, ids] of Object.entries(PRACTICE)) {
  for (const id of (ids || [])) {
    if (!songsMap.has(id)) error(`[${id}] 在 PRACTICE 第 ${tier} 層存在，但不在 songs.js 歌單中`);
    if (practiceSeen.has(id)) error(`[${id}] 在 PRACTICE 中重複出現`);
    practiceSeen.add(id);
  }
}

// 5. PEN 格式檢查
for (const [id, val] of Object.entries(PEN)) {
  if (typeof val !== "string" || !val.length) {
    error(`[${id}] PEN 格式錯誤: "${val}"`);
    continue;
  }
  for (let i = 0; i < val.length; i++) {
    const c = val[i];
    if (i === 0 && c === "?") continue;
    if (!ALLOWED_PENS.has(c)) error(`[${id}] PEN 包含未定義顏色字元 "${c}" (完整: "${val}")`);
  }
}

// 6. BEAT 與 CLIMAX 檢查
for (const [id, val] of Object.entries(BEAT)) {
  if (!Array.isArray(val) || val.length !== 3) {
    error(`[${id}] BEAT 格式錯誤，應為 [BPM, 秒數, 0或1]: ${JSON.stringify(val)}`);
    continue;
  }
  const [bpm, sec, conf] = val;
  if (typeof bpm !== "number" || bpm < 60 || bpm > 220) error(`[${id}] BEAT BPM (${bpm}) 超出有效範圍 60–220`);
  if (typeof sec !== "number" || sec < 0) error(`[${id}] BEAT 秒數 (${sec}) 無效`);
  if (conf !== 0 && conf !== 1) error(`[${id}] BEAT 置信度標記 (${conf}) 應為 0 或 1`);
}

for (const [id, sec] of Object.entries(CLIMAX)) {
  const s = songsMap.get(id);
  if (!s || !LEN_RE.test(s.len || "")) continue;
  const dur = parseLen(s.len);
  if (typeof sec !== "number" || sec < 0 || sec >= dur) {
    error(`[${id}] CLIMAX 秒數 (${sec}) 無效或超出曲長 (${dur}s)`);
  }
}

// 7. LIVES 與 LIVE_VIDEOS 檢查
for (const [id, tracks] of Object.entries(LIVES || {})) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    error(`[${id}] LIVES 項目必須為非空陣列`);
    continue;
  }
  const seen = new Set();
  for (const t of tracks) {
    if (!t || !t.concert || !t.yt) {
      error(`[${id}] LIVES 項目缺少 concert 或 yt: ${JSON.stringify(t)}`);
      continue;
    }
    if (!YT_RE.test(t.yt)) error(`[${id}] LIVES 的 YouTube ID 格式不對（應為 11 碼）: ${t.yt}`);
    if (seen.has(t.yt)) error(`[${id}] LIVES 有重複的影片: ${t.yt}`);
    seen.add(t.yt);
    if (songsMap.get(id)?.yt === t.yt) warn(`[${id}] LIVES 的 ${t.yt} 和主播放影片相同，現場音源選單會重複`);
  }
}

for (const [id, item] of Object.entries(LIVE_VIDEOS || {})) {
  if (!item || !item.concert || !item.yt) {
    error(`[${id}] LIVE_VIDEOS 項目缺少 concert 或 yt: ${JSON.stringify(item)}`);
    continue;
  }
  if (!YT_RE.test(item.yt)) error(`[${id}] LIVE_VIDEOS 的 YouTube ID 格式不對（應為 11 碼）: ${item.yt}`);
  if (songsMap.get(id)?.yt === item.yt) warn(`[${id}] LIVE_VIDEOS 的 ${item.yt} 和主 MV 相同`);
}

// 8. i18n.js 重複 key 檢查（掃描原始碼）與靜態 T("...") 覆蓋檢查
const i18nRaw = fs.readFileSync(path.join(root, "i18n.js"), "utf8");
{
  let locale = null;
  const seen = { en: new Map(), ja: new Map() };
  i18nRaw.split(/\r?\n/).forEach((line, idx) => {
    const lm = line.match(/^\s{4}(en|ja):\s*\{/);
    if (lm) { locale = lm[1]; return; }
    if (locale && /^\s{4}\}/.test(line)) { locale = null; return; }
    if (!locale) return;
    const km = line.match(/^\s{6}("(?:[^"\\]|\\.)*")\s*:/);
    if (!km) return;
    const key = JSON.parse(km[1]);
    if (seen[locale].has(key)) {
      error(`[i18n.js:${idx + 1}] ${locale} 有重複的 key「${key}」（前一次出現在第 ${seen[locale].get(key)} 行）`);
    } else {
      seen[locale].set(key, idx + 1);
    }
  });
}

function checkI18nKey(key, source) {
  if (!key) return;
  for (const loc of ["en", "ja"]) {
    if (!Object.hasOwn(I18N[loc] || {}, key)) {
      error(`[i18n] ${source} 的 key「${key}」缺少 ${loc} 翻譯`);
    }
  }
}

for (const file of ["app.js", "scripts/build.mjs"]) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const re = /\bT\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  let m;
  while ((m = re.exec(src))) {
    const raw = m[1];
    const key = raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\'/g, "'");
    checkI18nKey(key, file);
  }
}
for (const s of SONGS) {
  if (!s.hold && !s.sug) (s.tips || []).forEach(t => checkI18nKey(t, `songs.js[${s.id}].tips`));
  if (s.tie) checkI18nKey(s.tie, `songs.js[${s.id}].tie`);
  if (s.album) checkI18nKey(s.album, `songs.js[${s.id}].album`);
}
for (const g of SERIES) checkI18nKey(g.name, "songs.js SERIES");
for (const b of [...LYRICS, ...LYRICS_LIVE]) {
  for (const l of (b.lyrics || [])) {
    if (l.call && !l.call.includes("反拍")) checkI18nKey(l.call, `lyrics[${b.id}].call`);
    const jp = (l.jp || "").trim();
    if (/^（[^）]+）$/.test(jp)) checkI18nKey(jp, `lyrics[${b.id}].jp`);
  }
}

// 9. WARN 提醒（不使檢查失敗）
const missingUT = SONGS.filter(s => !UT[s.id]).map(s => s.id);
if (missingUT.length) warn(`缺少 UT（歌ネット）編號的歌曲 (${missingUT.length} 首): ${missingUT.join(", ")}`);

const missingBEAT = SONGS.filter(s => !BEAT[s.id]).map(s => s.id);
if (missingBEAT.length) warn(`缺少 BEAT 拍點資料的歌曲 (${missingBEAT.length} 首): ${missingBEAT.join(", ")}`);

const missingCLIMAX = SONGS.filter(s => !CLIMAX[s.id]).map(s => s.id);
if (missingCLIMAX.length) warn(`缺少 CLIMAX 副歌高潮秒數的歌曲 (${missingCLIMAX.length} 首): ${missingCLIMAX.join(", ")}`);

// 印出結果
if (warns.length) {
  console.log(`=== 資料檢查提醒 (WARN: ${warns.length} 則) ===`);
  for (const w of warns) console.log(`[WARN] ${w}`);
}

if (errors.length) {
  console.error(`\n=== 資料檢查失敗 (ERROR: ${errors.length} 則) ===`);
  for (const e of errors) console.error(`[ERROR] ${e}`);
  process.exit(1);
} else {
  console.log(`\n資料檢查通過：0 個錯誤，${warns.length} 個提醒。`);
  process.exit(0);
}
