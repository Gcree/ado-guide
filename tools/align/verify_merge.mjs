import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import vm from 'node:vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const TARGET_IDS = ['show', 'odo', 'kokoro'];

function parseSongLyrics(codeStr) {
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(codeStr, sandbox);
  return sandbox.module.exports;
}

// 1. Get HEAD version and current version
let headSource;
try {
  headSource = execSync('git show HEAD:song-lyrics.js', { cwd: repoRoot, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
} catch (e) {
  console.error(`Failed to fetch HEAD:song-lyrics.js: ${e.message}`);
  process.exit(1);
}

const currentSourcePath = path.join(repoRoot, 'song-lyrics.js');
const currentSource = fs.readFileSync(currentSourcePath, 'utf-8');

const headSongs = parseSongLyrics(headSource);
const currentSongs = parseSongLyrics(currentSource);

if (headSongs.length !== currentSongs.length) {
  console.error(`Total song count mismatch: HEAD has ${headSongs.length}, current has ${currentSongs.length}`);
  process.exit(1);
}

let anyFailure = false;

// 2. Check 71 songs outside target list are bit-for-bit unchanged
for (let i = 0; i < headSongs.length; i++) {
  const hSong = headSongs[i];
  const cSong = currentSongs[i];

  if (hSong.id !== cSong.id) {
    console.error(`Song ordering or id mismatch at index ${i}: ${hSong.id} vs ${cSong.id}`);
    process.exit(1);
  }

  if (!TARGET_IDS.includes(hSong.id)) {
    const hStr = JSON.stringify(hSong);
    const cStr = JSON.stringify(cSong);
    if (hStr !== cStr) {
      console.error(`Non-target song "${hSong.id}" was modified!`);
      anyFailure = true;
    }
  }
}

if (anyFailure) {
  process.exit(1);
}

// 3. Check the 3 target songs
console.log('--- Verification Summary for Target Songs ---');

for (const id of TARGET_IDS) {
  const hSong = headSongs.find(s => s.id === id);
  const cSong = currentSongs.find(s => s.id === id);

  if (!hSong || !cSong) {
    console.error(`Song ${id} not found in one of the versions`);
    process.exit(1);
  }

  if (hSong.title !== cSong.title || hSong.youtubeId !== cSong.youtubeId || hSong.duration !== cSong.duration) {
    console.error(`Metadata mismatch for ${id}`);
    process.exit(1);
  }

  if (hSong.lyrics.length !== cSong.lyrics.length) {
    console.error(`Lyrics length mismatch for ${id}: HEAD has ${hSong.lyrics.length}, current has ${cSong.lyrics.length}`);
    process.exit(1);
  }

  let changedCount = 0;
  let maxDiff = 0;

  for (let idx = 0; idx < hSong.lyrics.length; idx++) {
    const hLine = hSong.lyrics[idx];
    const cLine = cSong.lyrics[idx];

    // Check all fields except time
    if (hLine.jp !== cLine.jp) {
      console.error(`[${id}] Line ${idx} jp mismatch:\nHEAD:    ${hLine.jp}\nCurrent: ${cLine.jp}`);
      anyFailure = true;
    }
    if (hLine.tr !== cLine.tr) {
      console.error(`[${id}] Line ${idx} tr mismatch:\nHEAD:    ${hLine.tr}\nCurrent: ${cLine.tr}`);
      anyFailure = true;
    }
    if (JSON.stringify(hLine.acts) !== JSON.stringify(cLine.acts)) {
      console.error(`[${id}] Line ${idx} acts mismatch`);
      anyFailure = true;
    }
    if (JSON.stringify(hLine.sing) !== JSON.stringify(cLine.sing)) {
      console.error(`[${id}] Line ${idx} sing mismatch`);
      anyFailure = true;
    }
    if (JSON.stringify(hLine.call) !== JSON.stringify(cLine.call)) {
      console.error(`[${id}] Line ${idx} call mismatch`);
      anyFailure = true;
    }

    // Verify time field
    if (typeof cLine.time !== 'number' || isNaN(cLine.time)) {
      console.error(`[${id}] Line ${idx} time is not a valid number: ${cLine.time}`);
      anyFailure = true;
    }
    if (cLine.time < 0 || cLine.time > cSong.duration) {
      console.error(`[${id}] Line ${idx} time ${cLine.time} is outside [0, ${cSong.duration}]`);
      anyFailure = true;
    }
    if (idx > 0 && cLine.time < cSong.lyrics[idx - 1].time) {
      console.error(`[${id}] Line ${idx} time (${cLine.time}) < line ${idx - 1} time (${cSong.lyrics[idx - 1].time})`);
      anyFailure = true;
    }

    const diff = Math.abs(hLine.time - cLine.time);
    if (diff >= 0.001) {
      changedCount++;
      if (diff > maxDiff) {
        maxDiff = diff;
      }
    }
  }

  console.log(`[PASS] ${id} (${cSong.title}): ${changedCount}/${cSong.lyrics.length} times modified, max diff: ${maxDiff.toFixed(2)}s`);
}

if (anyFailure) {
  console.error('\nVerification FAILED.');
  process.exit(1);
} else {
  console.log('\nAll checks PASSED cleanly.');
  process.exit(0);
}
