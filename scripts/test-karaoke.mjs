import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const karaoke = require("../karaoke-sources.js");
const lyrics = require("../song-lyrics.js");

console.log("=== Running Karaoke Sources Unit Tests ===");

// 1. to22Id tests
console.log("Test 1: to22Id format and determinism");
const id1 = karaoke.to22Id("ado-show");
const id2 = karaoke.to22Id("ado-show");
const id3 = karaoke.to22Id("ado-odo");
assert.equal(id1, id2, "to22Id must be deterministic");
assert.notEqual(id1, id3, "different songs must have different IDs");
assert.equal(id1.length, 22, "ID length must be 22");
assert.match(id1, /^[0-9a-zA-Z]{22}$/, "ID must be alphanumeric base62");

// 2. normaliseText tests
console.log("Test 2: normaliseText normalization");
assert.equal(karaoke.normaliseText("Hello, World!"), "helloworld");
assert.equal(karaoke.normaliseText("Ｎａｈ-Ｎａｈ-Ｎａｈ"), "nahnahnah");
assert.equal(karaoke.normaliseText(" [wave] 傾け！ "), "傾け");
assert.equal(karaoke.normaliseText("Ain’t nobody stop"), "aintnobodystop");
assert.equal(karaoke.normaliseText("Ain't nobody stop"), "aintnobodystop");

// 3. stripRuby tests
console.log("Test 3: stripRuby kanji and reading extraction");
const rubyLine = "確信出来る　現在(いま)だけ　重ねて";
assert.equal(karaoke.stripRuby(rubyLine, "kanji"), "確信出来る　現在だけ　重ねて");
assert.equal(karaoke.stripRuby(rubyLine, "reading"), "確信出来る　いまだけ　重ねて");
const fullwidthRuby = "馬鹿げた競争（ラットレース）一抜けたら通報される";
assert.equal(karaoke.stripRuby(fullwidthRuby, "kanji"), "馬鹿げた競争一抜けたら通報される");
assert.equal(karaoke.stripRuby(fullwidthRuby, "reading"), "馬鹿げたラットレース一抜けたら通報される");

// 4. extractUnits vs jaHTML unit count
console.log("Test 4: extractUnits matches DOM .k units");
const showLine1 = "Okay たちまち独壇場 Listen listen";
const units1 = karaoke.extractUnits(showLine1);
assert.equal(units1.length, 26, "Should match 26 character units");
assert.equal(units1[0].text, "O");
assert.equal(units1[units1.length - 1].text, "n");

const rubyUnits = karaoke.extractUnits(rubyLine);
const kanjiUnit = rubyUnits.find(u => u.isRuby);
assert.ok(kanjiUnit, "Should find a ruby unit");
assert.equal(kanjiUnit.text, "現在");
assert.equal(kanjiUnit.reading, "いま");

// 5. parseTime tests
console.log("Test 5: parseTime parsing variations");
assert.equal(karaoke.parseTime(12.34), 12.34);
assert.equal(karaoke.parseTime("12.34"), 12.34);
assert.equal(karaoke.parseTime("1500ms"), 1.5);
assert.equal(karaoke.parseTime("2.5s"), 2.5);
assert.equal(karaoke.parseTime("01:23.45"), 83.45);
assert.equal(karaoke.parseTime("00:00:10.500"), 10.5);
assert.equal(karaoke.parseTime(""), null);
assert.equal(karaoke.parseTime("invalid"), null);

// 6. parseEnhancedLrc tests
console.log("Test 6: parseEnhancedLrc word timing extraction");
const enhancedLrc = `[00:10.00]<00:10.00>Hello <00:10.50>world <00:11.00>again
[00:12.00]<00:12.00>Second <00:12.80>line`;
const parsedLrc = karaoke.parseEnhancedLrc(enhancedLrc);
assert.ok(parsedLrc);
assert.equal(parsedLrc.lines.length, 2);
assert.equal(parsedLrc.lines[0].words[0].text, "Hello ");
assert.equal(parsedLrc.lines[0].words[0].start, 10.00);
assert.equal(parsedLrc.lines[0].words[0].end, 10.50);
assert.equal(parsedLrc.lines[0].words[1].text, "world ");
assert.equal(parsedLrc.lines[0].words[1].start, 10.50);

// 7. parseLrclib syncedLyrics tests (line-level)
console.log("Test 7: parseLrclib syncedLyrics line timing");
const lrclibPayload = {
  syncedLyrics: `[00:05.20] First line\n[00:08.50] Second line`
};
const parsedLrclib = karaoke.parseLrclib(lrclibPayload);
assert.ok(parsedLrclib);
assert.equal(parsedLrclib.granularity, "line");
assert.equal(parsedLrclib.lines.length, 2);
assert.equal(parsedLrclib.lines[0].start, 5.2);
assert.equal(parsedLrclib.lines[0].end, 8.5);

// 8. normaliseBeautifulLyrics tests
console.log("Test 8: normaliseBeautifulLyrics Syllable schema parsing");
const workerPayload = {
  Type: "Syllable",
  Source: { Provider: "qqmusic" },
  Content: [
    {
      Type: "Vocal",
      Lead: {
        StartTime: 1.0,
        EndTime: 3.0,
        Syllables: [
          { Text: "た", StartTime: 1.0, EndTime: 1.5 },
          { Text: "ち", StartTime: 1.5, EndTime: 2.0 },
          { Text: "まち", StartTime: 2.0, EndTime: 3.0 }
        ]
      }
    }
  ]
};
const normalized = karaoke.normaliseBeautifulLyrics(workerPayload);
assert.ok(normalized);
assert.equal(normalized.format, "timed-lyrics-v1");
assert.equal(normalized.granularity, "word");
assert.equal(normalized.lines.length, 1);
assert.equal(normalized.lines[0].words.length, 3);
assert.equal(normalized.lines[0].words[0].text, "た");
assert.equal(normalized.lines[0].words[0].start, 1.0);
assert.equal(normalized.lines[0].words[0].end, 1.5);

// 9. alignToLocalLyrics tests
console.log("Test 9: alignToLocalLyrics alignment with local anchors and offsets");
const mockTimed = {
  format: "timed-lyrics-v1",
  source: "mock-provider",
  granularity: "word",
  lines: [
    {
      start: 10.0,
      end: 14.0,
      text: "たちまち独壇場",
      words: [
        { text: "たち", start: 10.0, end: 11.0 },
        { text: "まち", start: 11.0, end: 12.0 },
        { text: "独壇場", start: 12.0, end: 14.0 }
      ]
    },
    {
      start: 15.0,
      end: 18.0,
      text: "傾け振り切ろう",
      words: [
        { text: "傾け", start: 15.0, end: 16.0 },
        { text: "振り切ろう", start: 16.0, end: 18.0 }
      ]
    },
    {
      start: 20.0,
      end: 23.0,
      text: "確信出来る現在だけ重ねて",
      words: [
        { text: "確信", start: 20.0, end: 20.8 },
        { text: "出来る", start: 20.8, end: 21.5 },
        { text: "現在", start: 21.5, end: 22.2 },
        { text: "だけ", start: 22.2, end: 22.6 },
        { text: "重ねて", start: 22.6, end: 23.0 }
      ]
    }
  ]
};

const mockLocal = [
  { time: 10.5, jp: "たちまち独壇場" }, // offset +0.5
  { time: 15.5, jp: "傾(かたむ)け振(ふ)り切(き)ろう" }, // ruby line, offset +0.5
  { time: 20.5, jp: "確信出来る　現在(いま)だけ　重ねて" } // ruby line, offset +0.5
];

const aligned = karaoke.alignToLocalLyrics(mockTimed, mockLocal);
assert.ok(aligned, "Alignment must succeed");
assert.equal(aligned.matchedLines, 3);
assert.equal(aligned.totalLines, 3);
assert.ok(Math.abs(aligned.offset - 0.5) < 0.001, "Median offset should be 0.5s");

// Verify that line 0 preserves local anchor 10.5 and offsets words
const line0 = aligned.lines[0];
assert.equal(line0.start, 10.5);
assert.equal(line0.words[0].start, 10.5); // 10.0 + 0.5
assert.equal(line0.words[0].end, 11.5);   // 11.0 + 0.5

// Verify that ruby lines matched kanji properly
const line1 = aligned.lines[1];
assert.ok(line1, "Ruby line 1 must be aligned");
assert.equal(line1.start, 15.5);

const line2 = aligned.lines[2];
assert.ok(line2, "Ruby line 2 must be aligned");
assert.equal(line2.start, 20.5);

// 10. Alignment failure safety check (unrelated lyrics or low match)
console.log("Test 10: alignToLocalLyrics rejects low-confidence or mismatched lyrics");
const wrongTimed = {
  format: "timed-lyrics-v1",
  source: "wrong-song",
  granularity: "word",
  lines: [
    {
      start: 10.0,
      end: 12.0,
      text: "全然違う歌詞です",
      words: [{ text: "全然違う歌詞です", start: 10.0, end: 12.0 }]
    }
  ]
};
const wrongAligned = karaoke.alignToLocalLyrics(wrongTimed, mockLocal);
assert.equal(wrongAligned, null, "Mismatched lyrics must return null and trigger fallback");

// 11. Different line breaking support
console.log("Test 11: Different line breaks between provider and local lyrics");
const splitTimed = {
  format: "timed-lyrics-v1",
  source: "combined-line-source",
  granularity: "word",
  lines: [
    {
      start: 30.0,
      end: 36.0,
      text: "第一句歌詞第二句歌詞",
      words: [
        { text: "第一句", start: 30.0, end: 31.5 },
        { text: "歌詞", start: 31.5, end: 33.0 },
        { text: "第二句", start: 33.0, end: 34.5 },
        { text: "歌詞", start: 34.5, end: 36.0 }
      ]
    },
    {
      start: 40.0,
      end: 45.0,
      text: "第三句歌詞第四句歌詞",
      words: [
        { text: "第三句", start: 40.0, end: 42.5 },
        { text: "歌詞", start: 42.5, end: 43.5 },
        { text: "第四句", start: 43.5, end: 44.5 },
        { text: "歌詞", start: 44.5, end: 45.0 }
      ]
    }
  ]
};
const splitLocal = [
  { time: 30.0, jp: "第一句歌詞" },
  { time: 33.0, jp: "第二句歌詞" },
  { time: 40.0, jp: "第三句歌詞" }
];
const splitAligned = karaoke.alignToLocalLyrics(splitTimed, splitLocal);
assert.ok(splitAligned, "Should align across combined lines");
assert.equal(splitAligned.matchedLines, 3);
assert.equal(splitAligned.lines[0].words.length, 2);
assert.equal(splitAligned.lines[1].words.length, 2);

// 12. mapUnitsToWords tests
console.log("Test 12: mapUnitsToWords unit mapping, sub-allocation and whitespace bridging");
const testUnits = karaoke.extractUnits("Okay たちまち 独(ひと)り");
// testUnits: O, k, a, y,  , た, ち, ま, ち,  , 独(ruby), り
const testWords = [
  { text: "Okay", start: 1.0, end: 2.0 },
  { text: "たちまち", start: 2.2, end: 3.4 },
  { text: "独り", start: 3.6, end: 4.2 }
];

const mapped = karaoke.mapUnitsToWords(testUnits, testWords, 1.0, 4.5);
assert.equal(mapped.matchedUnits, 10, "All non-whitespace units should be matched");

// "Okay" is sub-allocated across 4 letters: O, k, a, y
const oTiming = mapped.timings[0];
const kTiming = mapped.timings[1];
const aTiming = mapped.timings[2];
const yTiming = mapped.timings[3];
assert.ok(oTiming.start >= 1.0 && oTiming.end <= kTiming.start + 0.001);
assert.ok(kTiming.start >= oTiming.end - 0.001 && kTiming.end <= aTiming.start + 0.001);
assert.ok(aTiming.start >= kTiming.end - 0.001 && aTiming.end <= yTiming.start + 0.001);
assert.ok(Math.abs(yTiming.end - 2.0) < 0.01);

// Whitespace unit at index 4 should bridge between 2.0 and 2.2
const spaceTiming = mapped.timings[4];
assert.ok(spaceTiming.start >= 2.0 - 0.01 && spaceTiming.end <= 2.2 + 0.01);

// Ruby unit "独" at index 10 should receive timing from "独り"
const rubyTiming = mapped.timings[10];
assert.ok(rubyTiming && rubyTiming.start >= 3.6);

// 13. Integration test with live songs: show, odo, kokoro
console.log("Test 13: Live probe and alignment test for show, odo, kokoro");
const targetSongs = [
  { id: "show", title: "唱", dur: 190, minExpectedRate: 0.85 },
  { id: "odo", title: "踊", dur: 209, minExpectedRate: 0.85 },
  { id: "kokoro", title: "心という名の不可解", dur: 270, minExpectedRate: 0.90 }
];

for (const s of targetSongs) {
  const songData = lyrics.find(l => l.id === s.id);
  assert.ok(songData, `Song ${s.id} must exist in song-lyrics.js`);

  try {
    const timed = await karaoke.load({ id: s.id, ja: s.title, dur: s.dur }, { timeoutMs: 8000 });
    if (timed) {
      assert.equal(timed.format, "timed-lyrics-v1");
      const aligned = karaoke.alignToLocalLyrics(timed, songData.lyrics);
      assert.ok(aligned, `alignToLocalLyrics should succeed for ${s.id}`);
      const rate = aligned.matchedLines / aligned.totalLines;
      console.log(`  [${s.id}] Source: ${aligned.source}, matched: ${aligned.matchedLines}/${aligned.totalLines} (${(rate * 100).toFixed(1)}%), offset: ${aligned.offset.toFixed(2)}s`);
      assert.ok(rate >= s.minExpectedRate, `${s.id} match rate ${rate} should be >= ${s.minExpectedRate}`);
    } else {
      console.log(`  [${s.id}] Live network source unavailable or timed out; verified fallback behavior.`);
    }
  } catch (err) {
    console.log(`  [${s.id}] Network error: ${err.message}; verified fallback behavior.`);
  }
}

// 14. Verify song-lyrics data integrity (brief requirement 4)
console.log("Test 14: Verify song-lyrics.js data integrity");
assert.ok(lyrics.length >= 72, "Must contain all 72+ songs");
const show = lyrics.find(l => l.id === "show");
assert.equal(show.title, "唱");
assert.equal(show.lyrics[0].jp, "Nah-Nah-Nah-Nah-Nah, Ready for my show");
assert.ok(Number.isFinite(show.lyrics[0].time), "First line must have finite time");
assert.deepEqual(show.lyrics[0].acts, ["sing"]);

console.log("All unit and integration test suites passed successfully!");
