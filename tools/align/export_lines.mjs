import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

const SONGS = require(path.join(repoRoot, 'song-lyrics.js'));

const TARGET_IDS = ['show', 'odo', 'kokoro'];
const outputDir = path.join(__dirname, 'work', 'input');

fs.mkdirSync(outputDir, { recursive: true });

for (const id of TARGET_IDS) {
  const song = SONGS.find(s => s.id === id);
  if (!song) {
    console.error(`Song not found: ${id}`);
    process.exit(1);
  }

  const lines = song.lyrics.map((line, idx) => {
    const isLast = idx === song.lyrics.length - 1;
    const nextTime = isLast ? song.duration : song.lyrics[idx + 1].time;
    const trimmedJp = line.jp.trim();
    const filler = /^（[^）]+）$/.test(trimmedJp);

    return {
      i: idx,
      time: line.time,
      nextTime,
      jp: line.jp,
      filler
    };
  });

  const targetFile = path.join(outputDir, `${id}.json`);
  fs.writeFileSync(targetFile, JSON.stringify(lines, null, 2), 'utf-8');
  console.log(`Exported ${id}: ${lines.length} lines -> ${targetFile}`);
}
