import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const positionalArgs = args.filter(a => a !== '--dry-run');

if (positionalArgs.length < 2) {
  console.error('Usage: node merge_times.mjs [--dry-run] <id> <path-to-corrected.json>');
  process.exit(1);
}

const songId = positionalArgs[0];
const correctedFilePath = path.resolve(process.cwd(), positionalArgs[1]);

if (!fs.existsSync(correctedFilePath)) {
  console.error(`Corrected file does not exist: ${correctedFilePath}`);
  process.exit(1);
}

const correctedRaw = fs.readFileSync(correctedFilePath, 'utf-8');
let correctedData;
try {
  correctedData = JSON.parse(correctedRaw);
} catch (e) {
  console.error(`Failed to parse corrected JSON: ${e.message}`);
  process.exit(1);
}

if (!correctedData.lines || !Array.isArray(correctedData.lines)) {
  console.error('Corrected data missing "lines" array.');
  process.exit(1);
}

// 1. Read existing song-lyrics.js
const songLyricsPath = path.join(repoRoot, 'song-lyrics.js');
const rawSource = fs.readFileSync(songLyricsPath, 'utf-8');
const SONGS = require(songLyricsPath);

const targetSong = SONGS.find(s => s.id === songId);
if (!targetSong) {
  console.error(`Song with id "${songId}" not found in song-lyrics.js`);
  process.exit(1);
}

const correctedLines = correctedData.lines;

// Check 1: Line count matches
if (correctedLines.length !== targetSong.lyrics.length) {
  console.error(`Line count mismatch for ${songId}: expected ${targetSong.lyrics.length}, got ${correctedLines.length}`);
  process.exit(1);
}

// Check 2: jp is identical verbatim
for (let idx = 0; idx < correctedLines.length; idx++) {
  const origJp = targetSong.lyrics[idx].jp;
  const newJp = correctedLines[idx].jp;
  if (origJp !== newJp) {
    console.error(`Line ${idx} text mismatch for ${songId}:\nExpected: "${origJp}"\nReceived: "${newJp}"`);
    process.exit(1);
  }
}

// Check 3: Monotonic increasing time between 0 and duration
for (let idx = 0; idx < correctedLines.length; idx++) {
  const t = Number(correctedLines[idx].time);
  if (isNaN(t) || t < 0 || t > targetSong.duration) {
    console.error(`Line ${idx} time out of bounds [0, ${targetSong.duration}]: ${correctedLines[idx].time}`);
    process.exit(1);
  }
  if (idx > 0) {
    const prevT = Number(correctedLines[idx - 1].time);
    if (t < prevT) {
      console.error(`Line ${idx} time (${t}) is earlier than line ${idx - 1} (${prevT})`);
      process.exit(1);
    }
  }
}

// Find song block in raw source
const idPattern = new RegExp(`"id"\\s*:\\s*"${songId}"`);
const match = idPattern.exec(rawSource);
if (!match) {
  console.error(`Could not locate song id "${songId}" in source code`);
  process.exit(1);
}

const lyricsIndex = rawSource.indexOf('"lyrics"', match.index);
if (lyricsIndex === -1) {
  console.error(`Could not locate lyrics block for "${songId}"`);
  process.exit(1);
}

const lyricsArrayStart = rawSource.indexOf('[', lyricsIndex);
let depth = 0;
let lyricsArrayEnd = -1;
for (let i = lyricsArrayStart; i < rawSource.length; i++) {
  if (rawSource[i] === '[') depth++;
  else if (rawSource[i] === ']') {
    depth--;
    if (depth === 0) {
      lyricsArrayEnd = i;
      break;
    }
  }
}

if (lyricsArrayEnd === -1) {
  console.error(`Could not determine end of lyrics array for "${songId}"`);
  process.exit(1);
}

const lyricsBlock = rawSource.slice(lyricsArrayStart, lyricsArrayEnd + 1);

// Replace "time": <number>
let lineCounter = 0;
let modifiedCount = 0;

const updatedLyricsBlock = lyricsBlock.replace(/"time"\s*:\s*(\d+(?:\.\d+)?)/g, (fullMatch, oldNum) => {
  const lineIdx = lineCounter++;
  if (lineIdx >= correctedLines.length) {
    throw new Error(`More time entries found than expected in ${songId}`);
  }
  const oldVal = parseFloat(oldNum);
  const newVal = Number(correctedLines[lineIdx].time);
  const formattedVal = newVal.toFixed(2);
  if (Math.abs(oldVal - newVal) >= 0.001) {
    modifiedCount++;
  }
  return `"time": ${formattedVal}`;
});

if (lineCounter !== correctedLines.length) {
  console.error(`Replaced ${lineCounter} lines, but expected ${correctedLines.length}`);
  process.exit(1);
}

const updatedFullSource = rawSource.slice(0, lyricsArrayStart) + updatedLyricsBlock + rawSource.slice(lyricsArrayEnd + 1);

if (isDryRun) {
  const previewDir = path.join(__dirname, 'work');
  fs.mkdirSync(previewDir, { recursive: true });
  const previewPath = path.join(previewDir, 'song-lyrics.preview.js');
  fs.writeFileSync(previewPath, updatedFullSource, 'utf-8');
  console.log(`[DRY-RUN] Verified ${songId}. ${modifiedCount} of ${correctedLines.length} line times changed.`);
  console.log(`[DRY-RUN] Preview written to: ${previewPath}`);
} else {
  fs.writeFileSync(songLyricsPath, updatedFullSource, 'utf-8');
  console.log(`Verified ${songId}. ${modifiedCount} of ${correctedLines.length} line times updated in song-lyrics.js.`);
}
