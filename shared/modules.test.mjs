import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ADO_SHARED = require(path.join(root, "shared/render.js"));
const ADO_SETLIST = require(path.join(root, "js/setlist.js"));
const ADO_PENLIGHT = require(path.join(root, "js/penlight.js"));
const ADO_QUIZ = require(path.join(root, "js/quiz-engine.js"));

const { SONGS, PEN, BEAT, SERIES, PRACTICE } = require(path.join(root, "songs.js"));
const SONG_LYRICS = require(path.join(root, "song-lyrics.js"));
const I18N = require(path.join(root, "i18n.js"));

function makeT(lang) {
  const dict = I18N[lang] || {};
  return (src, ...args) =>
    (dict[src] ?? src).replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m));
}

// Mirror app.js / build.mjs song hydration on a cloned copy
function hydrateSongs() {
  const list = SONGS.map(s => ({ ...s }));
  list.forEach(s => {
    if (s.sug || (!s.free && (!s.tips || !s.tips.length))) s.hold = true;
    if (s.hold) {
      s.acts = [];
      s.tips = [];
    }
    s.acts = s.acts || [];
    s.tips = s.tips || [];
    s.dur = s.len.split(":").reduce((a, b) => a * 60 + +b, 0);
  });
  list.sort((a, b) => a.date.localeCompare(b.date)).forEach((s, i) => {
    s.no = i + 1;
  });
  return list;
}

// ── 1. UMD Browser + Concatenated Bundle Compatibility ───────────────────────

test("UMD modules load cleanly in browser <script> context and concatenated bundle", () => {
  const win = { Date, Math, Array, Object, Set, Map, JSON, Number, String, Boolean, RegExp, Error, Infinity, NaN, setTimeout, clearTimeout };
  win.window = win;
  win.self = win;
  win.globalThis = win;
  const ctx = vm.createContext(win);

  const files = ["shared/render.js", "js/setlist.js", "js/penlight.js", "js/quiz-engine.js"];
  for (const rel of files) {
    vm.runInContext(fs.readFileSync(path.join(root, rel), "utf8"), ctx, { filename: rel });
  }

  assert.equal(typeof win.ADO_SHARED.jaHTML, "function");
  assert.equal(typeof win.ADO_SETLIST.parseListHash, "function");
  assert.equal(typeof win.ADO_PENLIGHT.createPenlightClient, "function");
  assert.equal(typeof win.ADO_QUIZ.buildTargets, "function");

  // Concatenated bundle simulation (matches build.mjs script concatenation)
  const bundleWin = { Date, Math, Array, Object, Set, Map, JSON, Number, String, Boolean, RegExp, Error, Infinity, NaN, setTimeout, clearTimeout };
  bundleWin.window = bundleWin;
  bundleWin.self = bundleWin;
  bundleWin.globalThis = bundleWin;
  const bundleSrc = files.map(rel => fs.readFileSync(path.join(root, rel), "utf8")).join("\n");
  vm.runInContext(bundleSrc, vm.createContext(bundleWin), { filename: "bundle.js" });

  assert.deepEqual([...bundleWin.ADO_SHARED.PEN_ORDER], ADO_SHARED.PEN_ORDER);
  assert.equal(bundleWin.ADO_SETLIST.gradeOf(95), "S");
  assert.equal(bundleWin.ADO_QUIZ.QZ_POINT.good, 0.6);
});

// ── 2. shared/render.js (Contract A) ─────────────────────────────────────────

test("shared/render: constants and exact penlight hex colors", () => {
  assert.deepEqual(Object.keys(ADO_SHARED.ACT_MAP), ["sing", "clap", "wave", "jump", "call", "gesture", "listen"]);
  assert.deepEqual(ADO_SHARED.ACT_MAP.sing, { name: "大合唱", icon: "i-sing", how: "跟著一起唱" });
  assert.deepEqual(ADO_SHARED.PENC, {
    青: ["藍", "#5d9dfe"],
    水: ["水藍", "#5fd4ff"],
    白: ["白", "#f2efe8"],
    赤: ["紅", "#ff4a5a"],
    桃: ["粉紅", "#ff7ab8"],
    紫: ["紫", "#a374ff"],
    橙: ["橘", "#ff9a3c"],
    黄: ["黃", "#ffd84a"],
    緑: ["綠", "#4ee08a"]
  });
  assert.deepEqual(ADO_SHARED.RAINBOW, [..."赤橙黄緑水青紫"]);
  assert.deepEqual(ADO_SHARED.PEN_ORDER, ["青", "水", "白", "赤", "桃", "紫", "橙", "黄", "緑", "彩"]);
  assert.deepEqual(ADO_SHARED.TIER_LABEL, { 1: "必練", 2: "跟唱・聆聽", 3: "看巡演" });
});

test("shared/render: esc, fmt, isoDuration, isNote, isOffbeat", () => {
  assert.equal(ADO_SHARED.esc(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(ADO_SHARED.esc(null), "");
  assert.equal(ADO_SHARED.esc(0), "0");

  assert.equal(ADO_SHARED.fmt(0), "0:00");
  assert.equal(ADO_SHARED.fmt(5.9), "0:05");
  assert.equal(ADO_SHARED.fmt(190.4), "3:10");
  assert.equal(ADO_SHARED.fmt(-10), "0:00");

  assert.equal(ADO_SHARED.isoDuration("3:10"), "PT3M10S");
  assert.equal(ADO_SHARED.isoDuration("4:03"), "PT4M3S");

  assert.equal(ADO_SHARED.isNote("（間奏）"), true);
  assert.equal(ADO_SHARED.isNote("  （尾奏）  "), true);
  assert.equal(ADO_SHARED.isNote("(間奏)"), false);
  assert.equal(ADO_SHARED.isNote("（間奏）Hey"), false);
  assert.equal(ADO_SHARED.isNote(""), false);

  const Ten = makeT("en");
  assert.equal(ADO_SHARED.isOffbeat("第 2、4 拍反拍"), true);
  assert.equal(ADO_SHARED.isOffbeat("clap on Off-beat", Ten), true);
  assert.equal(ADO_SHARED.isOffbeat("clap on Off-beat"), false);
  assert.equal(ADO_SHARED.isOffbeat("", () => ""), false);
  assert.equal(ADO_SHARED.isOffbeat(null, Ten), false);
});

test("shared/render: penName, penOf, penDots against real SONGS, PEN, and i18n", () => {
  const songs = hydrateSongs();
  const byId = Object.fromEntries(songs.map(s => [s.id, s]));
  const Ten = makeT("en");
  const Tja = makeT("ja");

  assert.equal(ADO_SHARED.penName("青"), "藍");
  assert.equal(ADO_SHARED.penName("青", null, true), "藍色");
  assert.equal(ADO_SHARED.penName("彩"), "彩色");
  assert.equal(ADO_SHARED.penName("水", Ten), "Light blue");
  assert.equal(ADO_SHARED.penName("彩", Tja), "レインボー");

  // Specified multi-color song: show -> 橙黄
  const showPen = ADO_SHARED.penOf(byId.show, PEN);
  assert.deepEqual(showPen, {
    keys: ["橙", "黄"],
    words: ["橘", "黃"],
    none: false,
    text: "橘色、黃色",
    shortText: "橘、黃",
    cols: ["#ff9a3c", "#ffd84a"]
  });

  // English translation
  const showPenEn = ADO_SHARED.penOf(byId.show, PEN, Ten);
  assert.deepEqual(showPenEn.words, ["Orange", "Yellow"]);
  assert.equal(showPenEn.text, "Orange, Yellow");
  assert.equal(showPenEn.shortText, "Orange, Yellow");

  // Unspecified song (not in PEN): charles -> default blue
  const charlesPen = ADO_SHARED.penOf(byId.charles, PEN);
  assert.equal(charlesPen.none, true);
  assert.deepEqual(charlesPen.keys, ["青"]);
  assert.deepEqual(charlesPen.cols, ["#5d9dfe"]);
  assert.equal(charlesPen.shortText, "藍（未指定）");
  assert.equal(charlesPen.text, "藍色（未指定）");

  // Unlisted free song -> also defaults to blue
  const unlistedPen = ADO_SHARED.penOf({ id: "unlisted", hold: false }, PEN);
  assert.equal(unlistedPen.none, true);
  assert.deepEqual(unlistedPen.keys, ["青"]);

  // Prediction ? prefix in PEN: shinka -> treated as unspecified
  const shinkaPen = ADO_SHARED.penOf(byId.shinka, PEN);
  assert.equal(shinkaPen.none, true);
  assert.deepEqual(shinkaPen.keys, ["青"]);

  // Rainbow + color: shinjidai -> 彩桃
  const shinPen = ADO_SHARED.penOf(byId.shinjidai, PEN);
  assert.equal(shinPen.none, false);
  assert.deepEqual(shinPen.keys, ["彩", "桃"]);
  assert.equal(shinPen.cols.length, 8);
  assert.equal(shinPen.cols[7], "#ff7ab8");

  // penDots markup
  const dotsHtml = ADO_SHARED.penDots(byId.shinjidai, PEN);
  assert.equal(
    dotsHtml,
    '<span class="dots" aria-label="螢光棒：彩色、粉紅"><i class="rb"></i><i style="--c:#ff7ab8"></i></span>'
  );
});

test("shared/render: jaHTML ruby, .kw word grouping, and last-match sung highlighting", () => {
  const html = ADO_SHARED.jaHTML("確信(かくしん) Okay? 今(いま)と今(いま)", ["今(いま)"]);
  assert.ok(html.includes('<ruby>確信<rt>かくしん</rt></ruby>'));
  assert.ok(html.includes('<span class="kw"><span class="k"'));
  assert.ok(html.includes(">O</span>"));
  // Only the last "今(いま)" should carry class="k sung"
  const sungMatches = html.match(/class="k sung"/g) || [];
  assert.equal(sungMatches.length, 1);

  // Escapes HTML inside lyrics
  const escaped = ADO_SHARED.jaHTML("A<B");
  assert.ok(escaped.includes("&lt;"));
  assert.ok(!escaped.includes("<B"));
});

test("shared/render: credKey, credHas, credRole, relatedOf, mainAct, lineAct, songInlineSummary", () => {
  const songs = hydrateSongs();
  const byId = Object.fromEntries(songs.map(s => [s.id, s]));
  const Ten = makeT("en");

  assert.equal(ADO_SHARED.credKey("TOPHAMHAT-KYO (FAKE TYPE.)"), "TOPHAMHAT-KYO");
  assert.equal(ADO_SHARED.credHas(byId.show, "c", "Giga & TeddyLoid"), true);
  assert.equal(ADO_SHARED.credRole(byId.usseewa, "syudou"), "詞曲");
  assert.equal(ADO_SHARED.credRole(byId.show, "TOPHAMHAT-KYO"), "作詞");
  assert.equal(ADO_SHARED.credRole(byId.show, "Giga & TeddyLoid"), "作曲");
  assert.equal(ADO_SHARED.credRole(byId.kurakura, "菅野よう子"), "編曲");

  const relShow = ADO_SHARED.relatedOf(byId.show, songs, SERIES);
  const gigaGroup = relShow.find(g => g.kind === "who" && g.name === "Giga & TeddyLoid");
  assert.ok(gigaGroup);
  assert.ok(gigaGroup.songs.some(x => x.s.id === "odo"));

  const relRed = ADO_SHARED.relatedOf(byId.shinjidai, songs, SERIES, Ten);
  const workGroup = relRed.find(g => g.kind === "work");
  assert.ok(workGroup);
  assert.equal(workGroup.name, "One Piece Film: Red");
  assert.ok(workGroup.songs.some(x => x.s.id === "gyakkou"));

  assert.equal(ADO_SHARED.mainAct(["listen", "clap"]), "clap");
  assert.equal(ADO_SHARED.mainAct(["listen"]), "listen");
  assert.equal(ADO_SHARED.mainAct([]), "");
  assert.equal(ADO_SHARED.lineAct({ sing: ["Yeah"], acts: ["sing", "clap"] }), "sing");
  assert.equal(ADO_SHARED.lineAct({ sing: [], acts: ["sing", "clap"] }), "clap");

  const showLines = SONG_LYRICS.find(x => x.id === "show").lyrics;
  const sumZh = ADO_SHARED.songInlineSummary(byId.show, "zh", ADO_SHARED.penOf(byId.show, PEN), byId.show.tips, showLines);
  assert.match(sumZh, /〈唱〉/);
  assert.match(sumZh, /橘、黃/);

  const unlistedFree = { id: "unlisted", ja: "テスト", date: "2025-01-01", len: "3:00", free: true, acts: [] };
  const sumEn = ADO_SHARED.songInlineSummary(unlistedFree, "en", ADO_SHARED.penOf(unlistedFree, PEN, Ten), [], [], Ten);
  assert.match(sumEn, /No live penlight color on record yet/);
  assert.match(sumEn, /no fixed chant or clap routine/);

  const sumTotEn = ADO_SHARED.songInlineSummary(byId.totmusica, "en", ADO_SHARED.penOf(byId.totmusica, PEN, Ten), [], [], Ten);
  assert.match(sumTotEn, /Recommended concert penlight color: Purple, Blue/);
  assert.match(sumTotEn, /no fixed chant or clap routine/);

  const sumJa = ADO_SHARED.songInlineSummary(byId.show, "ja", ADO_SHARED.penOf(byId.show, PEN, makeT("ja")), byId.show.tips, showLines, makeT("ja"));
  assert.match(sumJa, /「唱」/);
});

// ── 3. js/setlist.js (Contract B) ────────────────────────────────────────────

test("js/setlist: parseListHash & formatListHash across Set, Map, plain object, and null", () => {
  assert.equal(ADO_SETLIST.STORAGE_KEY, "practice-setlist");
  assert.equal(ADO_SETLIST.QUIZ_BEST_KEY, "quiz-best");

  const idSet = new Set(["usseewa", "show", "odo"]);
  const idMap = new Map([["usseewa", 1], ["show", 1]]);
  const idObj = { usseewa: true, show: true };

  assert.deepEqual(ADO_SETLIST.parseListHash("#list=usseewa,show,usseewa,bad", idSet), ["usseewa", "show"]);
  assert.deepEqual(ADO_SETLIST.parseListHash("list=show,odo@42?x=1", idSet), ["show", "odo"]);
  assert.deepEqual(ADO_SETLIST.parseListHash("#list=usseewa,odo", idMap), ["usseewa"]);
  assert.deepEqual(ADO_SETLIST.parseListHash("#list=usseewa,toString,show", idObj), ["usseewa", "show"]);
  assert.deepEqual(ADO_SETLIST.parseListHash("#list=alpha, ,beta,alpha", null), ["alpha", "beta"]);
  assert.equal(ADO_SETLIST.parseListHash("#usseewa", idSet), null);
  assert.equal(ADO_SETLIST.parseListHash("#list=", idSet), null);
  assert.equal(ADO_SETLIST.parseListHash("", idSet), null);

  assert.equal(ADO_SETLIST.formatListHash(["usseewa", "show", "usseewa"]), "#list=usseewa,show");
});

test("js/setlist: storage load/save, toggle, gradeOf, loadQuizBest, computeMastery", () => {
  const mem = new Map();
  const webStorage = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, v),
    removeItem: k => mem.delete(k)
  };
  const appStore = {
    get: k => (mem.has(k) ? mem.get(k) : null),
    set: (k, v) => (v == null ? mem.delete(k) : mem.set(k, v))
  };
  const validSet = new Set(SONGS.map(s => s.id));

  assert.deepEqual(ADO_SETLIST.loadSetlist(webStorage, validSet), []);
  ADO_SETLIST.saveSetlist(webStorage, ["usseewa", "show", "usseewa"]);
  assert.deepEqual(ADO_SETLIST.loadSetlist(appStore, validSet), ["usseewa", "show"]);

  mem.set(ADO_SETLIST.STORAGE_KEY, "{bad-json");
  assert.deepEqual(ADO_SETLIST.loadSetlist(webStorage, validSet), []);
  mem.set(ADO_SETLIST.STORAGE_KEY, JSON.stringify(["usseewa", "nonexistent", 123, "show"]));
  assert.deepEqual(ADO_SETLIST.loadSetlist(webStorage, validSet), ["usseewa", "show"]);

  ADO_SETLIST.saveSetlist(webStorage, null);
  assert.equal(mem.has(ADO_SETLIST.STORAGE_KEY), false);

  const t1 = ADO_SETLIST.toggleSetlistId(["usseewa"], "show");
  assert.deepEqual(t1, { ids: ["usseewa", "show"], added: true });
  const t2 = ADO_SETLIST.toggleSetlistId(t1.ids, "usseewa");
  assert.deepEqual(t2, { ids: ["show"], added: false });

  assert.equal(ADO_SETLIST.gradeOf(100), "S");
  assert.equal(ADO_SETLIST.gradeOf(95), "S");
  assert.equal(ADO_SETLIST.gradeOf(94), "A");
  assert.equal(ADO_SETLIST.gradeOf(85), "A");
  assert.equal(ADO_SETLIST.gradeOf(84), "B");
  assert.equal(ADO_SETLIST.gradeOf(70), "B");
  assert.equal(ADO_SETLIST.gradeOf(69), "C");
  assert.equal(ADO_SETLIST.gradeOf(50), "C");
  assert.equal(ADO_SETLIST.gradeOf(49), "D");

  mem.set(ADO_SETLIST.QUIZ_BEST_KEY, "[1,2,3]");
  assert.deepEqual(ADO_SETLIST.loadQuizBest(webStorage), {});

  mem.set(
    ADO_SETLIST.QUIZ_BEST_KEY,
    JSON.stringify({
      usseewa: { score: 96, rate: 1 },
      show: { score: 80, rate: 0.75 },
      bad1: { score: "99" },
      bad2: { score: null },
      bad3: [100],
      odo: { score: 85 }
    })
  );
  const best = ADO_SETLIST.loadQuizBest(appStore);
  assert.deepEqual(best, {
    usseewa: { score: 96, rate: 1 },
    show: { score: 80, rate: 0.75 },
    odo: { score: 85, rate: 1 }
  });

  const freqIds = [...PRACTICE[1], ...PRACTICE[2], ...PRACTICE[3]];
  const mastery = ADO_SETLIST.computeMastery(best, freqIds);
  assert.deepEqual(mastery, { completed: 3, mastered: 2, total: freqIds.length });
});

// ── 4. js/penlight.js (Contract C) ───────────────────────────────────────────

test("js/penlight: handles absent WebSocketCtor without throwing", () => {
  const states = [];
  const client = ADO_PENLIGHT.createPenlightClient({
    WebSocketCtor: null,
    onState: s => states.push(s)
  });

  assert.equal(client.isConnected(), false);
  assert.equal(client.isEnabled(), false);
  assert.equal(client.state, "disconnected");
  assert.doesNotThrow(() => client.connect());
  assert.doesNotThrow(() => client.setEnabled(true));
  assert.equal(client.send({ v: 1 }), false);
  assert.equal(client.sendImmediate({ v: 1 }), false);
  assert.doesNotThrow(() => client.disconnect());
  assert.ok(states.includes("unavailable"));
});

test("js/penlight: 5Hz throttling, sendImmediate, hello state, and clean disconnect", () => {
  const sockets = [];
  class MockWS {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = MockWS.CONNECTING;
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }
    send(data) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
      this.readyState = MockWS.CLOSED;
      if (this.onclose) this.onclose({});
    }
    simulateOpen() {
      this.readyState = MockWS.OPEN;
      if (this.onopen) this.onopen({});
    }
    simulateMessage(payload) {
      if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) });
    }
  }

  let fakeNow = 1000;
  const events = [];
  const client = ADO_PENLIGHT.createPenlightClient({
    url: "ws://127.0.0.1:51730/ado",
    throttleMs: 200,
    now: () => fakeNow,
    WebSocketCtor: MockWS,
    onState: (s, detail) => events.push({ s, detail })
  });

  assert.equal(client.connect(), true);
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].url, "ws://127.0.0.1:51730/ado");
  assert.equal(client.state, "connecting");

  sockets[0].simulateOpen();
  assert.equal(client.isConnected(), true);
  assert.equal(client.state, "connected");

  sockets[0].simulateMessage({ type: "hello", lamp: "linked" });
  assert.equal(events.at(-1).detail.lamp, "linked");

  // 5 Hz throttle (200ms): 0ms sends, +50ms & +199ms throttled, +200ms sends
  assert.equal(client.send({ seq: 1 }), true);
  fakeNow += 50;
  assert.equal(client.send({ seq: 2 }), false);
  fakeNow += 149;
  assert.equal(client.send({ seq: 3 }), false);
  fakeNow += 1;
  assert.equal(client.send({ seq: 4 }), true);
  // sendImmediate bypasses throttle
  assert.equal(client.sendImmediate({ seq: 5 }), true);

  assert.deepEqual(
    sockets[0].sent.map(x => JSON.parse(x).seq),
    [1, 4, 5]
  );

  // disconnect with optional stop payload
  client.disconnect({ v: 1, type: "stop" });
  assert.equal(client.isConnected(), false);
  assert.equal(client.state, "disconnected");
  assert.equal(sockets[0].closed, true);
  assert.deepEqual(JSON.parse(sockets[0].sent.at(-1)), { v: 1, type: "stop" });
});

test("js/penlight: exponential reconnect backoff while enabled and cancel on setEnabled(false)", async () => {
  const sockets = [];
  class MockWS {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      sockets.push(this);
    }
    send() {}
    close() {
      this.readyState = 3;
      if (this.onclose) this.onclose({});
    }
    simulateClose() {
      this.readyState = 3;
      if (this.onclose) this.onclose({});
    }
    simulateOpen() {
      this.readyState = 1;
      if (this.onopen) this.onopen({});
    }
  }

  const delays = [];
  const client = ADO_PENLIGHT.createPenlightClient({
    WebSocketCtor: MockWS,
    backoffBaseMs: 15,
    backoffMaxMs: 40,
    maxRetries: 5,
    onState: (s, detail) => {
      if (s === "reconnecting") delays.push(detail.delay);
    }
  });

  client.setEnabled(true);
  assert.equal(client.isEnabled(), true);
  assert.equal(sockets.length, 1);

  // Trigger 3 consecutive closes -> delays should grow exponentially: 15, 30, 40 (capped)
  sockets[0].simulateClose();
  await new Promise(r => setTimeout(r, 25));
  assert.equal(sockets.length, 2);

  sockets[1].simulateClose();
  await new Promise(r => setTimeout(r, 40));
  assert.equal(sockets.length, 3);

  sockets[2].simulateClose();
  await new Promise(r => setTimeout(r, 50));
  assert.equal(sockets.length, 4);

  assert.deepEqual(delays, [15, 30, 40]);

  // Successful open resets backoff retryCount back to 0
  sockets[3].simulateOpen();
  sockets[3].simulateClose();
  assert.equal(delays.at(-1), 15);

  // Disabling cancels pending reconnect timer
  client.setEnabled(false);
  assert.equal(client.isEnabled(), false);
  const countAtDisable = sockets.length;
  await new Promise(r => setTimeout(r, 35));
  assert.equal(sockets.length, countAtDisable);
});

// ── 5. js/quiz-engine.js (Contract D) ────────────────────────────────────────

test("js/quiz-engine: builds exact show targets and matches Playwright E2E tolerances", () => {
  const showLyrics = SONG_LYRICS.find(x => x.id === "show");
  const showSong = hydrateSongs().find(s => s.id === "show");
  const beat = BEAT.show;
  const targets = ADO_QUIZ.buildTargets({
    lines: showLyrics.lyrics,
    beat,
    dur: showSong.dur,
    isOffbeat: ADO_SHARED.isOffbeat,
    actMap: ADO_SHARED.ACT_MAP
  });

  assert.ok(targets.length > 10);
  // First target is onset sing at 0.6s
  assert.equal(targets[0].act, "sing");
  assert.equal(targets[0].kind, "onset");
  assert.equal(targets[0].t, 0.6);
  assert.equal(targets[0].idx, 0);
  assert.equal(targets[0].done, false);
  assert.equal(targets[0].res, null);
  assert.equal(targets[0].result, null);

  // Verify exact test-ui.mjs clap beat math around 58.6s
  const [bpm, off] = beat;
  const P = 60 / bpm;
  const k = Math.ceil((58.7 - off) / P);
  const tk = off + k * P;

  const clapTarget = targets.find(tg => tg.kind === "beat" && Math.abs(tg.t - tk) < 1e-6);
  assert.ok(clapTarget, "Expected beat target at tk for show clap section");
  assert.equal(clapTarget.act, "clap");

  // Perfect at exact beat
  const rPerf = ADO_QUIZ.judgeTap({ targets, t: tk });
  assert.equal(rPerf.kind, "perfect");
  assert.equal(rPerf.hit, clapTarget);
  assert.ok(Math.abs(rPerf.delta) < 1e-9);
  // judgeTap must be pure (does NOT mutate target)
  assert.equal(clapTarget.res, null);
  assert.equal(clapTarget.done, false);

  // Mark target consumed and judge next beat with +0.12s offset -> Good
  clapTarget.res = rPerf.kind;
  clapTarget.result = rPerf.kind;
  clapTarget.done = true;

  const rGood = ADO_QUIZ.judgeTap({ targets, t: tk + P + 0.12 });
  assert.equal(rGood.kind, "good");
  assert.ok(Math.abs(rGood.delta - 0.12) < 1e-6);

  // Halfway between beats -> stray
  const rStray = ADO_QUIZ.judgeTap({ targets, t: tk + 2 * P + P / 2 });
  assert.equal(rStray.kind, "stray");
  assert.equal(rStray.hit, null);
  assert.equal(rStray.delta, null);
});

test("js/quiz-engine: offbeat claps only target beats 2 and 4 (bar === 1 || bar === 3) and rate scales window", () => {
  const Ten = makeT("en");
  const beat = [120, 0.5, 1]; // P = 0.5s; beats at 0.5 (bar 0), 1.0 (bar 1), 1.5 (bar 2), 2.0 (bar 3), 2.5 (bar 0), 3.0 (bar 1)
  const targets = ADO_QUIZ.buildTargets({
    lines: [
      { time: 0.4, acts: ["clap"], call: "Off-beat", duration: 3.0 }
    ],
    beat,
    dur: 10,
    isOffbeat: txt => ADO_SHARED.isOffbeat(txt, Ten)
  });

  // Only bars 1 and 3: t = 1.0, 2.0, 3.0
  assert.deepEqual(targets.map(x => x.t), [1.0, 2.0, 3.0]);
  assert.equal(ADO_QUIZ.quizAct({ acts: ["clap"], call: "Off-beat" }, txt => ADO_SHARED.isOffbeat(txt, Ten)), "clap");

  // At 0.5x playback speed, beat window scales by 0.5 (perfect <= 0.04, good <= 0.08)
  assert.equal(ADO_QUIZ.judgeTap({ targets, t: 1.03, rate: 0.5 }).kind, "perfect");
  assert.equal(ADO_QUIZ.judgeTap({ targets, t: 1.06, rate: 0.5 }).kind, "good");
  assert.equal(ADO_QUIZ.judgeTap({ targets, t: 1.10, rate: 0.5 }).kind, "stray");

  // Real gyakkou offbeat section check
  const gyakkouLyrics = SONG_LYRICS.find(x => x.id === "gyakkou");
  const gTargets = ADO_QUIZ.buildTargets({
    lines: gyakkouLyrics.lyrics,
    beat: BEAT.gyakkou,
    dur: 250,
    isOffbeat: ADO_SHARED.isOffbeat
  });
  const [gBpm, gOff] = BEAT.gyakkou;
  const gP = 60 / gBpm;
  const offbeatClaps = gTargets.filter(tg => tg.kind === "beat" && tg.label.includes("反拍"));
  assert.ok(offbeatClaps.length > 0);
  for (const tg of offbeatClaps) {
    const k = Math.round((tg.t - gOff) / gP);
    const bar = ((k % 4) + 4) % 4;
    assert.ok(bar === 1 || bar === 3, `Expected bar 1 or 3 for offbeat clap, got bar ${bar}`);
  }
});

test("js/quiz-engine: summarizeQuiz computes score, grade, skipped, and per-action breakdown", () => {
  const targets = [
    { t: 1, act: "sing", kind: "onset", done: true, res: "perfect", result: "perfect" },
    { t: 2, act: "clap", kind: "beat", done: true, result: "good", res: "good" },
    { t: 3, act: "clap", kind: "beat", done: true, res: "miss" },
    { t: 4, act: "wave", kind: "onset", done: true, res: "skip" },
    { t: 5, act: "call", kind: "onset", done: true, result: "skipped" }
  ];

  const sum = ADO_QUIZ.summarizeQuiz({ targets, extra: 2 });
  // (1 + 0.6 + 0) / 3 = 53.33 -> 53 (C)
  assert.equal(sum.score, 53);
  assert.equal(sum.grade, "C");
  assert.equal(sum.total, 3);
  assert.equal(sum.skipped, 2);
  assert.equal(sum.judged, 3);
  assert.equal(sum.perfect, 1);
  assert.equal(sum.good, 1);
  assert.equal(sum.miss, 1);
  assert.equal(sum.extra, 2);
  assert.deepEqual(sum.per, {
    sing: { hit: 1, total: 1 },
    clap: { hit: 1, total: 2 }
  });

  // Explicit counts override derivation
  const explicit = ADO_QUIZ.summarizeQuiz({ perfect: 19, good: 1, miss: 0, extra: 1 });
  assert.equal(explicit.score, 98);
  assert.equal(explicit.grade, "S");
  assert.equal(explicit.total, 20);
  assert.equal(explicit.judged, 20);
});

test("shared/render: hold override in penOf and single Latin char in jaHTML", () => {
  const holdPen = ADO_SHARED.penOf({ id: "usseewa", hold: true }, PEN);
  assert.equal(holdPen.none, true);
  assert.deepEqual(holdPen.keys, ["青"]);

  const singleLatin = ADO_SHARED.jaHTML("Aだよ");
  assert.equal(singleLatin.includes('class="kw"'), false);
  assert.ok(singleLatin.includes(">A</span>"));
});

test("js/penlight: SecurityError and maxRetries transition safely to unavailable", async () => {
  class SecErrWS {
    constructor() {
      const err = new Error("blocked");
      err.name = "SecurityError";
      throw err;
    }
  }
  const c1 = ADO_PENLIGHT.createPenlightClient({ WebSocketCtor: SecErrWS });
  assert.equal(c1.connect(), false);
  assert.equal(c1.state, "unavailable");

  let attempts = 0;
  class FailWS {
    constructor() {
      attempts++;
      this.readyState = 0;
    }
    close() {}
    fail() {
      this.readyState = 3;
      if (this.onclose) this.onclose({});
    }
  }
  const sockets = [];
  class TrackFailWS extends FailWS {
    constructor() {
      super();
      sockets.push(this);
    }
  }
  const c2 = ADO_PENLIGHT.createPenlightClient({
    WebSocketCtor: TrackFailWS,
    backoffBaseMs: 5,
    backoffMaxMs: 10,
    maxRetries: 2
  });
  c2.setEnabled(true);
  sockets[0].fail();
  await new Promise(r => setTimeout(r, 15));
  sockets[1].fail();
  await new Promise(r => setTimeout(r, 20));
  sockets[2].fail();
  assert.equal(attempts, 3);
  assert.equal(c2.state, "unavailable");
});

test("js/quiz-engine: segment merging, lineEnd callback, and nearest-target priority", () => {
  // Two adjacent wave lines with gap < 0.05 merge into 1 onset; third line with gap >= 0.05 starts new segment
  const targets = ADO_QUIZ.buildTargets({
    lines: [
      { t: 1.0, dur: 1.0, acts: ["wave"], sing: [], call: null },
      { t: 2.02, dur: 1.0, acts: ["wave"], sing: [], call: null },
      { t: 4.0, dur: 1.0, acts: ["wave"], sing: [], call: null }
    ],
    dur: 10,
    actMap: ADO_SHARED.ACT_MAP
  });
  assert.equal(targets.length, 2);
  assert.deepEqual(targets.map(t => t.t), [1.0, 4.0]);
  assert.equal(targets[0].label, "舉手揮動");

  // Nearest pending target wins, ignoring already consumed targets
  const custom = [
    { t: 10.0, act: "clap", kind: "beat", win: [0.08, 0.16], done: true, res: "perfect" },
    { t: 10.2, act: "clap", kind: "beat", win: [0.08, 0.16], done: false, res: null },
    { t: 10.4, act: "clap", kind: "beat", win: [0.08, 0.16], done: false, result: "miss" }
  ];
  const r = ADO_QUIZ.judgeTap({ targets: custom, t: 10.13 });
  assert.equal(r.hit, custom[1]);
  assert.equal(r.kind, "perfect");
  assert.ok(Math.abs(r.delta - -0.07) < 1e-6);
});
