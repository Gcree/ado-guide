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

// 13. Live network integration test (gated behind --live; never put assert.* inside catch)
if (process.argv.includes("--live")) {
  console.log("Test 13: Live probe and alignment test for show, odo, kokoro");
  const targetSongs = [
    { id: "show", title: "唱", dur: 190, minExpectedRate: 0.85 },
    { id: "odo", title: "踊", dur: 209, minExpectedRate: 0.85 },
    { id: "kokoro", title: "心という名の不可解", dur: 270, minExpectedRate: 0.90 }
  ];

  for (const s of targetSongs) {
    const songData = lyrics.find(l => l.id === s.id);
    assert.ok(songData, `Song ${s.id} must exist in song-lyrics.js`);

    let timed = null;
    let netErr = null;
    try {
      timed = await karaoke.load({ id: s.id, ja: s.title, dur: s.dur }, { timeoutMs: 8000 });
    } catch (err) {
      netErr = err;
    }
    if (netErr) {
      console.log(`  [${s.id}] Network error: ${netErr.message}; skipped live assertions.`);
      continue;
    }
    if (timed) {
      assert.equal(timed.format, "timed-lyrics-v1");
      const aligned = karaoke.alignToLocalLyrics(timed, songData.lyrics);
      assert.ok(aligned, `alignToLocalLyrics should succeed for ${s.id}`);
      const rate = aligned.matchedLines / aligned.totalLines;
      console.log(`  [${s.id}] Source: ${aligned.source}, matched: ${aligned.matchedLines}/${aligned.totalLines} (${(rate * 100).toFixed(1)}%), offset: ${aligned.offset.toFixed(2)}s`);
      assert.ok(rate >= s.minExpectedRate, `${s.id} match rate ${rate} should be >= ${s.minExpectedRate}`);
    } else {
      console.log(`  [${s.id}] Live network source unavailable or timed out.`);
    }
  }
} else {
  console.log("Test 13: Skipped live network test (pass --live to run)");
}

// 14. Verify song-lyrics data integrity (brief requirement 4)
console.log("Test 14: Verify song-lyrics.js data integrity");
assert.ok(lyrics.length >= 72, "Must contain all 72+ songs");
const show = lyrics.find(l => l.id === "show");
assert.equal(show.title, "唱");
assert.equal(show.lyrics[0].jp, "Nah-Nah-Nah-Nah-Nah, Ready for my show");
assert.ok(Number.isFinite(show.lyrics[0].time), "First line must have finite time");
assert.deepEqual(show.lyrics[0].acts, ["sing"]);

// 15. parseTtml with mocked DOMParser (valid TTML + parsererror rejection)
console.log("Test 15: parseTtml parsing and parsererror handling");
{
  const prevDOMParser = globalThis.DOMParser;
  const makeNode = (tag, attrs = {}, text = "", children = []) => ({
    tagName: tag,
    attributes: attrs,
    children,
    textContent: text || children.map(c => c.textContent).join(""),
    hasAttribute: k => Object.hasOwn(attrs, k),
    getAttribute: k => (Object.hasOwn(attrs, k) ? attrs[k] : null),
    getElementsByTagName: t => {
      const out = [];
      const walk = list => list.forEach(c => {
        if (c.tagName === t) out.push(c);
        if (c.children) walk(c.children);
      });
      walk(children);
      return out;
    }
  });
  try {
    globalThis.DOMParser = class MockDOMParser {
      parseFromString(xml) {
        if (xml.includes("parsererror")) {
          const errNode = makeNode("parsererror", {}, "SyntaxError");
          return {
            querySelector: sel => (sel === "parsererror" ? errNode : null),
            getElementsByTagName: tag => (tag === "parsererror" ? [errNode] : [])
          };
        }
        const p1 = makeNode("p", { begin: "00:01.00", end: "00:03.00" }, "", [
          makeNode("span", { begin: "00:01.00", end: "00:01.50" }, "あ"),
          makeNode("span", { begin: "00:01.50", end: "00:03.00" }, "い")
        ]);
        const p2 = makeNode("p", { begin: "00:04.00", end: "00:06.00" }, "う", []);
        const root = makeNode("tt", {}, "", [p1, p2]);
        return {
          querySelector: () => null,
          getElementsByTagName: tag => root.getElementsByTagName(tag)
        };
      }
    };
    const valid = karaoke.parseTtml("<tt><p>...</p></tt>");
    assert.ok(valid, "parseTtml must parse valid TTML");
    assert.equal(valid.source, "AMLL TTML DB");
    assert.equal(valid.lines.length, 2);
    assert.equal(valid.lines[0].words.length, 2);
    assert.equal(valid.lines[0].words[0].text, "あ");
    assert.equal(valid.lines[0].words[0].start, 1.0);
    assert.equal(valid.lines[1].words[0].text, "う");
    assert.equal(valid.lines[1].words[0].end, 6.0);
    assert.equal(karaoke.parseTtml("<parsererror>bad</parsererror>"), null, "parseTtml must return null on parsererror");
  } finally {
    if (prevDOMParser === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = prevDOMParser;
  }
}

// 16. alignToLocalLyrics repeated chorus without rewinding cursor (depends on frontend-js karaoke-sources.js fix)
console.log("Test 16: alignToLocalLyrics repeated chorus advances forward without index-0 rewind");
{
  const repeatedTimed = {
    format: "timed-lyrics-v1",
    source: "mock",
    granularity: "word",
    lines: [
      { start: 10, end: 12, text: "繰り返しサビ", words: [{ text: "繰り返しサビ", start: 10, end: 12 }] },
      { start: 20, end: 22, text: "中間の歌詞", words: [{ text: "中間の歌詞", start: 20, end: 22 }] },
      { start: 40, end: 42, text: "繰り返しサビ", words: [{ text: "繰り返しサビ", start: 40, end: 42 }] }
    ]
  };
  const repeatedLocal = [
    { time: 10.5, jp: "繰り返しサビ" },
    { time: 20.5, jp: "中間の歌詞" },
    { time: 40.5, jp: "繰り返しサビ" }
  ];
  const alignedRep = karaoke.alignToLocalLyrics(repeatedTimed, repeatedLocal);
  assert.ok(alignedRep, "Repeated chorus present forward should align");
  assert.equal(alignedRep.matchedLines, 3);
  assert.equal(alignedRep.lines[2].start, 40.5);

  // When second chorus is missing from provider after cursor, must NOT rewind to index 0
  const missingSecondTimed = {
    format: "timed-lyrics-v1",
    source: "mock",
    granularity: "word",
    lines: repeatedTimed.lines.slice(0, 2)
  };
  const noRewind = karaoke.alignToLocalLyrics(missingSecondTimed, repeatedLocal);
  assert.ok(noRewind, "First two lines should still align");
  assert.equal(noRewind.matchedLines, 2, "Missing repeated chorus must not rewind cursor to index 0");
  assert.equal(noRewind.lines[2], null, "Unmatched repeated chorus after cursor must remain null");
}

// 17. mapUnitsToWords repeated kana without backward jump (depends on frontend-js karaoke-sources.js fix)
console.log("Test 17: mapUnitsToWords repeated kana does not jump backward");
{
  const units = karaoke.extractUnits("あいあ");
  const words = [{ text: "あい", start: 1.0, end: 2.0 }];
  const mappedRep = karaoke.mapUnitsToWords(units, words, 1.0, 3.0);
  assert.equal(mappedRep.matchedUnits, 2, "Third repeated kana after cursor must not rewind to 1.0s");
  assert.ok(mappedRep.timings[2].start >= mappedRep.timings[1].end - 0.001, "Third unit must not jump backwards");
}

// 18. writeCache LRU cap (max 20 songs, mock localStorage + fetch; depends on frontend-js karaoke-sources.js fix)
console.log("Test 18: writeCache LRU cap keeps at most 20 songs");
{
  const prevLSDesc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const prevFetch = globalThis.fetch;
  const store = new Map();
  const mockStorage = {
    get length() { return store.size; },
    key: i => Array.from(store.keys())[i] ?? null,
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: k => { store.delete(String(k)); },
    clear: () => { store.clear(); }
  };
  const storageProxy = new Proxy(mockStorage, {
    ownKeys: () => Array.from(store.keys()),
    getOwnPropertyDescriptor: (target, prop) => {
      if (store.has(prop)) return { enumerable: true, configurable: true, value: store.get(prop) };
      return Object.getOwnPropertyDescriptor(target, prop);
    }
  });
  try {
    Object.defineProperty(globalThis, "localStorage", { value: storageProxy, configurable: true, writable: true });
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes("lrclib.net")) {
        const q = new URL(u).searchParams.get("track_name") || "Song";
        return {
          ok: true,
          json: async () => ([{ artistName: "Ado", trackName: q, duration: 180, syncedLyrics: "[00:01.00] テスト歌詞" }])
        };
      }
      return { ok: false, json: async () => null };
    };
    for (let i = 0; i < 25; i++) {
      const res = await karaoke.load({ id: `lru-${i}`, ja: `LruSong${i}`, dur: 180 }, { timeoutMs: 2000 });
      assert.ok(res, `Mock fetch must populate cache for lru-${i}`);
    }
    const songKeys = Array.from(store.keys()).filter(k => {
      try { return JSON.parse(store.get(k))?.format === "timed-lyrics-v1"; } catch { return false; }
    });
    assert.ok(songKeys.length <= 20 && songKeys.length > 0, `Expected 1..20 cached songs, got ${songKeys.length}`);
    assert.ok(!songKeys.some(k => k.endsWith("-lru-0")), "Oldest entry lru-0 must be evicted");
    assert.ok(songKeys.some(k => k.endsWith("-lru-24")), "Newest entry lru-24 must remain cached");
  } finally {
    if (prevLSDesc) Object.defineProperty(globalThis, "localStorage", prevLSDesc);
    else delete globalThis.localStorage;
    if (prevFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = prevFetch;
  }
}

// 19. Static localUrl cache-first + offline + fallback (Contract F; depends on frontend-core karaoke-sources.js)
console.log("Test 19: load(song, { localUrl }) fetches localUrl first even offline, caches, and falls back on 404/error");
{
  const prevLSDesc = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const prevNavDesc = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const prevFetch = globalThis.fetch;
  const store = new Map();
  const mockStorage = {
    get length() { return store.size; },
    key: i => Array.from(store.keys())[i] ?? null,
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: k => { store.delete(String(k)); },
    clear: () => { store.clear(); }
  };
  const storageProxy = new Proxy(mockStorage, {
    ownKeys: () => Array.from(store.keys()),
    getOwnPropertyDescriptor: (target, prop) => {
      if (store.has(prop)) return { enumerable: true, configurable: true, value: store.get(prop) };
      return Object.getOwnPropertyDescriptor(target, prop);
    }
  });
  try {
    Object.defineProperty(globalThis, "localStorage", { value: storageProxy, configurable: true, writable: true });
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });

    // 19a. Offline + localUrl hit -> fetches localUrl first, caches to localStorage, skips external APIs
    const callsA = [];
    const statusesA = [];
    const localPayload = {
      format: "timed-lyrics-v1",
      source: "static-cache",
      granularity: "word",
      lines: [
        { start: 1.0, end: 2.5, text: "テスト", words: [{ text: "テスト", start: 1.0, end: 2.5 }] }
      ]
    };
    globalThis.fetch = async (url) => {
      callsA.push(String(url));
      if (String(url) === "https://local.test/karaoke/static-hit.json?v=abc") {
        return { ok: true, status: 200, json: async () => localPayload };
      }
      throw new Error(`Unexpected external fetch while offline/localUrl hit: ${url}`);
    };
    const hitRes = await karaoke.load(
      { id: "static-hit", ja: "StaticHit", dur: 180 },
      { localUrl: "https://local.test/karaoke/static-hit.json?v=abc", onStatus: ev => statusesA.push(ev) }
    );
    assert.ok(hitRes, "localUrl must succeed even when navigator.onLine === false");
    assert.equal(callsA.length, 1, "Must fetch ONLY localUrl");
    assert.equal(callsA[0], "https://local.test/karaoke/static-hit.json?v=abc");
    assert.equal(hitRes.format, "timed-lyrics-v1");
    assert.equal(hitRes.lines.length, 1);
    assert.ok(statusesA.some(s => s.state === "ready"), "Must emit ready status on localUrl load");
    assert.ok(Array.from(store.keys()).some(k => k.endsWith("-static-hit")), "Must write localUrl result into localStorage");

    // 19b. Subsequent load hits localStorage cache without calling fetch
    let cacheFetchCalls = 0;
    const statusesCached = [];
    globalThis.fetch = async () => { cacheFetchCalls++; throw new Error("fetch must not be called on cache hit"); };
    const cachedRes = await karaoke.load(
      { id: "static-hit", ja: "StaticHit", dur: 180 },
      { localUrl: "https://local.test/karaoke/static-hit.json?v=abc", onStatus: ev => statusesCached.push(ev) }
    );
    assert.ok(cachedRes, "Cached localUrl result must be returned");
    assert.equal(cacheFetchCalls, 0, "Cache hit must not trigger fetch");
    assert.ok(statusesCached.some(s => s.state === "cache"), "Cache hit must emit cache status");

    // 19c. localUrl returns 404 while online -> falls back cleanly to external providers
    Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
    const callsC = [];
    globalThis.fetch = async (url) => {
      const u = String(url);
      callsC.push(u);
      if (u.includes("/karaoke/static-404.json")) return { ok: false, status: 404, json: async () => null };
      if (u.includes("lrclib.net")) {
        return { ok: true, json: async () => ([{ artistName: "Ado", trackName: "Static404", duration: 180, syncedLyrics: "[00:02.00] フォールバック" }]) };
      }
      return { ok: false, status: 404, json: async () => null };
    };
    const fallback404 = await karaoke.load(
      { id: "static-404", ja: "Static404", dur: 180 },
      { localUrl: "https://local.test/karaoke/static-404.json" }
    );
    assert.ok(fallback404, "404 on localUrl must fall back cleanly to online providers");
    assert.ok(callsC[0].includes("/karaoke/static-404.json"), "localUrl must be attempted first before fallback");
    assert.equal(fallback404.lines[0].text, "フォールバック");

    // 19d. localUrl network failure while online -> falls back cleanly without throwing
    const callsD = [];
    globalThis.fetch = async (url) => {
      const u = String(url);
      callsD.push(u);
      if (u.includes("/karaoke/static-err.json")) throw new Error("Network failure");
      if (u.includes("lrclib.net")) {
        return { ok: true, json: async () => ([{ artistName: "Ado", trackName: "StaticErr", duration: 180, syncedLyrics: "[00:03.00] 復旧歌詞" }]) };
      }
      return { ok: false, status: 404, json: async () => null };
    };
    const fallbackErr = await karaoke.load(
      { id: "static-err", ja: "StaticErr", dur: 180 },
      { localUrl: "https://local.test/karaoke/static-err.json" }
    );
    assert.ok(fallbackErr, "Network error on localUrl must fall back cleanly to online providers");
    assert.ok(callsD[0].includes("/karaoke/static-err.json"), "localUrl must be attempted first");
    assert.equal(fallbackErr.lines[0].text, "復旧歌詞");

    // 19e. localUrl 404 while offline -> returns null with offline state and does NOT hit external APIs
    Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true, writable: true });
    const callsE = [];
    const statusesE = [];
    globalThis.fetch = async (url) => {
      const u = String(url);
      callsE.push(u);
      if (u.includes("/karaoke/static-offline-404.json")) return { ok: false, status: 404, json: async () => null };
      throw new Error(`External API must not be fetched when offline: ${u}`);
    };
    const offlineMiss = await karaoke.load(
      { id: "static-offline-404", ja: "OfflineMiss", dur: 180 },
      { localUrl: "https://local.test/karaoke/static-offline-404.json", onStatus: ev => statusesE.push(ev) }
    );
    assert.equal(offlineMiss, null, "Missing localUrl while offline must return null");
    assert.equal(callsE.length, 1, "Must only attempt localUrl when offline");
    assert.ok(statusesE.some(s => s.state === "offline"), "Must emit offline status after localUrl miss offline");
  } finally {
    if (prevLSDesc) Object.defineProperty(globalThis, "localStorage", prevLSDesc);
    else delete globalThis.localStorage;
    if (prevNavDesc) Object.defineProperty(globalThis, "navigator", prevNavDesc);
    else delete globalThis.navigator;
    if (prevFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = prevFetch;
  }
}

console.log("All unit and integration test suites passed successfully!");
