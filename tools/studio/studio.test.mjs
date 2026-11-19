import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import * as core from "./core.mjs";
import { isHiddenPath, trusted, createStudioServer } from "./server.mjs";
import { extractJson, which } from "./agent-cli.mjs";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const SongMetaStore = require(path.join(here, "song-meta-store.js"));
const LyricsStore = require(path.join(here, "lyrics-store.js"));

const MOCK_SONGS_JS = `(function (root, factory) {
  module.exports = factory();
})(this, function () {
  "use strict";
  const SONGS = [
    { id: "alpha", ja: "アルファ", zh: "Alpha", en: "Alpha", ro: "Alpha", date: "2025-01-01", yt: "aaaaaaaaaaa", len: "3:00", acts: ["sing"], tips: ["第一條重點"]  },
    // 翻唱
    { id: "beta", ja: "ベータ", zh: "Beta", en: "Beta", ro: "Beta", date: "2025-02-01", yt: "bbbbbbbbbbb", len: "2:00", hold: true, cover: true  }
  ];
  const UT = {};
  const PEN = { alpha: "赤" };
  const BEAT = { alpha: [120, 0.5, 1] };
  const CLIMAX = { alpha: 120.5 };
  const LIVE_VIDEOS = {
    alpha: { yt: "lllllllllll", concert: "武道館 (2025)" }
    // 結尾註解
  };
  const LIVES = {};
  return { SONGS, UT, PEN, BEAT, CLIMAX, LIVE_VIDEOS, LIVES };
});`;

const MOCK_I18N_JS = `(function (root, factory) {
  module.exports = factory();
})(this, function () {
  return {
    en: {
      "第一條重點": "First tip"
      // trailing comment
    },
    ja: {
      "第一條重點": "最初のポイント"

    }
  };
});`;

const MOCK_LYRICS_JS = `(function (root, factory) {
  module.exports = factory();
})(this, function () {
  var SONGS = [
  {
    "id": "alpha",
    "title": "アルファ",
    "youtubeId": "aaaaaaaaaaa",
    "duration": 180,
    "lyrics": [
      {
        "time": 10,
        "jp": "歌おう",
        "tr": "唱吧",
        "acts": [
          "sing"
        ],
        "sing": [
          "歌おう"
        ]
      }
    ]
  }
];

  return SONGS;
});`;

test("SongMetaStore: validate 嚴格檢查 climax < dur、手燈色與應援重點", () => {
  const base = {
    id: "alpha",
    status: "",
    acts: ["sing"],
    tips: [{ zh: "重點", en: "Tip", ja: "ポイント" }],
    pen: "赤青",
    penGuess: false,
    climax: 179.9,
    liveVideo: { yt: "12345678901", concert: "Tokyo" },
    len: "3:00"
  };
  assert.deepEqual(SongMetaStore.validate(base).errors, []);

  // climax >= dur (180s) 或 <= 0 都要擋下
  assert.ok(SongMetaStore.validate({ ...base, climax: 180 }).errors.some(e => e.includes("副歌高潮")));
  assert.ok(SongMetaStore.validate({ ...base, climax: 185 }).errors.some(e => e.includes("副歌高潮")));
  assert.ok(SongMetaStore.validate({ ...base, climax: 0 }).errors.some(e => e.includes("副歌高潮")));
  assert.ok(SongMetaStore.validate({ ...base, climax: NaN }).errors.some(e => e.includes("副歌高潮")));
  assert.ok(SongMetaStore.validate({ ...base, pen: "赤赤" }).errors.some(e => e.includes("重複")));
  assert.ok(SongMetaStore.validate({ ...base, pen: "黒" }).errors.some(e => e.includes("不認得的顏色")));
  assert.ok(SongMetaStore.validate({ ...base, tips: [] }).errors.some(e => e.includes("至少要有一條")));
});

test("SongMetaStore: setMapEntry 支援清空為 {} 再重新插入、跳脫引號與 $& 字元", () => {
  let src = SongMetaStore.setMapEntry(MOCK_SONGS_JS, "PEN", "alpha", null);
  assert.match(src, /const PEN = \{\};/);
  assert.deepEqual(SongMetaStore.evalUmd(src).PEN, {});

  src = SongMetaStore.setMapEntry(src, "PEN", "alpha", '赤"$&$$');
  assert.equal(SongMetaStore.evalUmd(src).PEN.alpha, '赤"$&$$');

  src = SongMetaStore.setMapEntry(src, "PEN", "beta", "青");
  assert.deepEqual(SongMetaStore.evalUmd(src).PEN, { alpha: '赤"$&$$', beta: "青" });

  // 刪除第一項，留下第二項
  src = SongMetaStore.setMapEntry(src, "PEN", "alpha", null);
  assert.deepEqual(SongMetaStore.evalUmd(src).PEN, { beta: "青" });
});

test("SongMetaStore: applyMeta 處理註解行、$& 特殊字元並驗證寫回結果", () => {
  const m = SongMetaStore.readMeta(MOCK_SONGS_JS, MOCK_I18N_JS, "alpha");
  m.pen = "青水";
  m.penGuess = true;
  m.climax = 140.25;
  m.tips = [
    { zh: "第一條重點", en: "Updated $& tip", ja: "更新 $& ポイント" },
    { zh: "新增重點 $& $$", en: "New $& $$", ja: "新規 $& $$" }
  ];
  m.liveVideo = { yt: "zzzzzzzzzzz", concert: "巨蛋 $& (2026)" };

  const res = SongMetaStore.applyMeta(MOCK_SONGS_JS, MOCK_I18N_JS, m);
  const after = SongMetaStore.readMeta(res.songs, res.i18n, "alpha");
  assert.equal(after.pen, "青水");
  assert.equal(after.penGuess, true);
  assert.equal(after.climax, 140.25);
  assert.equal(after.tips.length, 2);
  assert.equal(after.tips[0].en, "Updated $& tip");
  assert.equal(after.tips[1].zh, "新增重點 $& $$");
  assert.equal(after.tips[1].en, "New $& $$");
  assert.equal(after.tips[1].ja, "新規 $& $$");
  assert.deepEqual(after.liveVideo, { yt: "zzzzzzzzzzz", concert: "巨蛋 $& (2026)" });

  // 移除 LIVE_VIDEOS（後面有註解行時也不能壞）
  after.liveVideo = null;
  const res2 = SongMetaStore.applyMeta(res.songs, res.i18n, after);
  assert.equal(SongMetaStore.readMeta(res2.songs, res2.i18n, "alpha").liveVideo, null);

  // i18n.js 缺少符合縮排的結尾 } 時應明確丟錯
  assert.throws(() => {
    SongMetaStore.applyMeta(MOCK_SONGS_JS, "module.exports = {\n    en: {\n  },\n    ja: {\n    }\n};", m);
  }, /結尾/);
});

test("LyricsStore: validate 檢查 time 有限數、duration > 0 與非空 sing", () => {
  const song = { id: "alpha", yt: "aaaaaaaaaaa", len: "3:00" };
  const baseEntry = {
    id: "alpha",
    youtubeId: "aaaaaaaaaaa",
    duration: 180,
    lyrics: [{ time: 10, jp: "歌おう", tr: "唱吧", duration: 2.5, acts: ["sing"], sing: ["歌おう"] }]
  };
  assert.deepEqual(LyricsStore.validate(baseEntry, song).errors, []);

  assert.ok(LyricsStore.validate({ ...baseEntry, lyrics: [{ time: Infinity, jp: "a", tr: "b" }] }, song).errors.length > 0);
  assert.ok(LyricsStore.validate({ ...baseEntry, lyrics: [{ time: 10, jp: "a", tr: "b", duration: 0 }] }, song).errors.some(e => e.includes("duration")));
  assert.ok(LyricsStore.validate({ ...baseEntry, lyrics: [{ time: 10, jp: "a", tr: "b", duration: -1 }] }, song).errors.some(e => e.includes("duration")));
  assert.ok(LyricsStore.validate({ ...baseEntry, lyrics: [{ time: 10, jp: "a", tr: "b", duration: NaN }] }, song).errors.some(e => e.includes("duration")));
  assert.ok(LyricsStore.validate({ ...baseEntry, lyrics: [{ time: 10, jp: "歌おう", tr: "唱吧", sing: [""] }] }, song).errors.some(e => e.includes("空字串")));
  assert.ok(LyricsStore.validate({ ...baseEntry, lyrics: [{ time: 10, jp: "歌おう", tr: "唱吧", sing: ["   "] }] }, song).errors.some(e => e.includes("空字串")));
});

test("core.mjs: assertSongId 阻擋路徑穿越與非法字元", async () => {
  assert.equal(core.assertSongId("odo"), "odo");
  assert.equal(core.assertSongId("0"), "0");
  for (const bad of ["", "../etc", "a/b", "a\\b", "Odo", "odo-live", "odo_1", "..", ".", null, undefined]) {
    assert.throws(() => core.assertSongId(bad), /無效的歌曲 id/);
  }
  assert.throws(() => core.show("../package"), /無效的歌曲 id/);
  assert.throws(() => core.songDetail("../package"), /無效的歌曲 id/);
  assert.throws(() => core.audioFile("../package"), /無效的歌曲 id/);
  await assert.rejects(() => core.runAnalysis("../package"), /無效的歌曲 id/);
  await assert.rejects(() => core.separateVocals("../package"), /無效的歌曲 id/);
  await assert.rejects(() => core.vocalEnvelope("../package"), /無效的歌曲 id/);
  await assert.rejects(() => core.align("../package"), /無效的歌曲 id/);
  await assert.rejects(() => core.translate("../package"), /無效的歌曲 id/);
  await assert.rejects(() => core.fetchSong("https://youtu.be/12345678901", { id: "../evil" }), /無效的歌曲 id/);
});

test("core.mjs: withWriteLock 嚴格依序執行且支援錯誤恢復與重入", async () => {
  const order = [];
  const p1 = core.withWriteLock(async () => {
    order.push("1-start");
    await new Promise(r => setTimeout(r, 25));
    // 測試鎖內重入不會死結
    await core.withWriteLock(async () => {
      order.push("1-inner");
    });
    order.push("1-end");
    return "ok1";
  });
  const p2 = core.withWriteLock(async () => {
    order.push("2-throw");
    throw new Error("boom");
  });
  const p3 = core.withWriteLock(async () => {
    order.push("3-after-error");
    return "ok3";
  });

  assert.equal(await p1, "ok1");
  await assert.rejects(p2, /boom/);
  assert.equal(await p3, "ok3");
  assert.deepEqual(order, ["1-start", "1-inner", "1-end", "2-throw", "3-after-error"]);
});

test("core.mjs: parseText 前後空白時間、saveLyrics duration 檢查、Object.hasOwn 與 songsIndex 欄位", () => {
  const db = core.loadFrom({
    "songs.js": MOCK_SONGS_JS,
    "i18n.js": MOCK_I18N_JS,
    "song-lyrics.js": MOCK_LYRICS_JS,
    "song-lyrics-live.js": MOCK_LYRICS_JS.replace(/SONGS/g, "LIVE_SONGS")
  });

  // parseText: 時間欄位開頭有空白的 m:ss 應正確換算成秒數（1:23 -> 83，不能誤算成 1）
  const imp = core.importLyrics("alpha", " 1:23\t新しい朝\t嶄新的早晨\n2:00.5\t光\t光", {}, db);
  const parsed = LyricsStore.parse(imp.files["song-lyrics.js"], "mv");
  assert.equal(parsed.songs[0].lyrics[0].time, 83);
  assert.equal(parsed.songs[0].lyrics[1].time, 120.5);

  // saveLyrics / tidyLines: 拒絕非正數 duration
  assert.throws(() => {
    core.saveLyrics("alpha", [{ time: 10, jp: "歌おう", tr: "唱吧", duration: 0 }], undefined, db);
  }, /duration/);
  assert.throws(() => {
    core.saveLyrics("alpha", [{ time: 10, jp: "歌おう", tr: "唱吧", duration: -3 }], undefined, db);
  }, /duration/);

  // setMeta: Object.hasOwn 擋下原型鏈屬性（例如 toString）
  assert.throws(() => {
    core.setMeta("alpha", { status: "toString" }, db);
  }, /狀態只能是/);

  // songsIndex: 包含 zh, en, ro, alias
  const idx = core.songsIndex(db);
  assert.equal(idx[0].id, "alpha");
  assert.equal(idx[0].zh, "Alpha");
  assert.equal(idx[0].en, "Alpha");
  assert.equal(idx[0].ro, "Alpha");
  assert.ok(Array.isArray(idx[0].alias));
});

test("server.mjs: isHiddenPath 與 trusted(req) 安全檢查", () => {
  for (const hidden of [
    ".git", ".git/config", ".GIT/HEAD",
    ".claude", ".claude/settings.json", ".CLAUDE/x",
    "node_modules/pkg/index.js", "NODE_MODULES/x",
    "tools/studio/work/odo/audio.webm",
    "tools/studio/py/.venv/bin/python", "tools/studio/py/.VENV/pyvenv.cfg",
    "tools/studio/config.json", "tools/studio/CONFIG.JSON",
    ".env", ".ENV.local", "sub/.env"
  ]) {
    assert.equal(isHiddenPath(hidden), true, `應隱藏 ${hidden}`);
  }
  for (const ok of ["index.html", "songs.js", "tools/studio/ui/app.js", "assets/stage3d.js"]) {
    assert.equal(isHiddenPath(ok), false, `不應隱藏 ${ok}`);
  }

  // DNS rebinding / Host 檢查
  assert.equal(trusted({ method: "GET", url: "/api/health", headers: { host: "evil.com:5178" } }, 5178), false);
  assert.equal(trusted({ method: "GET", url: "/api/health", headers: { host: "127.0.0.1:9999" } }, 5178), false);
  assert.equal(trusted({ method: "GET", url: "/api/health", headers: { host: "127.0.0.1:5178" } }, 5178), true);

  // Sec-Fetch-Site: cross-site 在任何 /api/*（含 GET）都要拒絕
  assert.equal(trusted({
    method: "GET",
    url: "/api/songs",
    headers: { host: "127.0.0.1:5178", "sec-fetch-site": "cross-site" }
  }, 5178), false);

  // 修改型 POST /api/* 必須有合法 Origin（或 Sec-Fetch-Site: same-origin）且 Content-Type: application/json
  assert.equal(trusted({
    method: "POST",
    url: "/api/meta",
    headers: { host: "127.0.0.1:5178", "content-type": "application/json" }
  }, 5178), false);
  assert.equal(trusted({
    method: "POST",
    url: "/api/meta",
    headers: { host: "127.0.0.1:5178", origin: "http://localhost:5178.evil.com", "content-type": "application/json" }
  }, 5178), false);
  assert.equal(trusted({
    method: "POST",
    url: "/api/meta",
    headers: { host: "127.0.0.1:5178", origin: "null", "sec-fetch-site": "same-origin", "content-type": "application/json" }
  }, 5178), false);
  assert.equal(trusted({
    method: "POST",
    url: "/api/meta",
    headers: { host: "127.0.0.1:5178", origin: "http://127.0.0.1:5178", "content-type": "text/plain" }
  }, 5178), false);
  assert.equal(trusted({
    method: "POST",
    url: "/api/meta",
    headers: { host: "127.0.0.1:5178", origin: "http://127.0.0.1:5178", "content-type": "application/json; charset=utf-8" }
  }, 5178), true);
  assert.equal(trusted({
    method: "POST",
    url: "/api/meta",
    headers: { host: "localhost:5178", "sec-fetch-site": "same-origin", "content-type": "application/json" }
  }, 5178), true);
});

test("server.mjs: HTTP 整合測試（安全標頭、移除 /api/file、壞 JSON 400、符號連結越界阻擋）", async t => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ado-studio-test-"));
  const outsideFile = path.join(os.tmpdir(), `ado-outside-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(outsideFile, "outside-secret");
  t.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.rmSync(outsideFile, { force: true });
  });

  fs.writeFileSync(path.join(tmpRoot, "index.html"), "<!doctype html><title>home</title>");
  fs.mkdirSync(path.join(tmpRoot, "tools", "studio", "ui"), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, "tools", "studio", "ui", "index.html"), "<!doctype html><title>studio</title>");
  fs.writeFileSync(path.join(tmpRoot, ".env"), "SECRET=1");
  fs.mkdirSync(path.join(tmpRoot, ".claude"), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, ".claude", "settings.json"), "{}");
  fs.symlinkSync(outsideFile, path.join(tmpRoot, "escape.txt"));
  fs.symlinkSync(path.join(tmpRoot, ".env"), path.join(tmpRoot, "env-link.txt"));

  const server = createStudioServer({ port: 0, rootDir: tmpRoot });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  // 1. /api/health 與安全標頭
  const rHealth = await fetch(`${base}/api/health`);
  assert.equal(rHealth.status, 200);
  assert.equal(rHealth.headers.get("x-content-type-options"), "nosniff");
  assert.equal(rHealth.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(rHealth.headers.get("referrer-policy"), "no-referrer");
  assert.equal(rHealth.headers.get("x-frame-options"), "DENY");
  const jHealth = await rHealth.json();
  assert.equal(jHealth.app, "ado-studio");

  // 2. /tools/studio/ui/ 有 X-Frame-Options: DENY，首頁 /index.html 也有基本安全標頭
  const rStudio = await fetch(`${base}/tools/studio/ui/`);
  assert.equal(rStudio.status, 200);
  assert.equal(rStudio.headers.get("x-frame-options"), "DENY");
  const rHome = await fetch(`${base}/index.html`);
  assert.equal(rHome.status, 200);
  assert.equal(rHome.headers.get("x-content-type-options"), "nosniff");

  // 3. 已移除的 /api/file 回傳 404
  const rFile = await fetch(`${base}/api/file?name=songs.js`);
  assert.equal(rFile.status, 404);

  // 4. 壞掉的 JSON 回傳 400（不是 500）
  const rBadJson = await fetch(`${base}/api/meta`, {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json"
    },
    body: "{bad json"
  });
  assert.equal(rBadJson.status, 400);

  // 5. 壞掉的百分比編碼網址回傳 400
  const rBadUrl = await fetch(`${base}/%E0%A4%A`);
  assert.equal(rBadUrl.status, 400);

  // 6. 隱藏目錄與符號連結逃逸阻擋
  const rClaude = await fetch(`${base}/.claude/settings.json`);
  assert.equal(rClaude.status, 404);
  const rEnvLink = await fetch(`${base}/env-link.txt`);
  assert.equal(rEnvLink.status, 404);
  const rEscape = await fetch(`${base}/escape.txt`);
  assert.equal(rEscape.status, 403);
});

test("agent-cli.mjs: extractJson 與 which 安全性", () => {
  const isWanted = v => v && Array.isArray(v.lines);
  assert.deepEqual(extractJson('```json\n{"lines":[{"n":1,"tr":"好"}]}\n```', isWanted), { lines: [{ n: 1, tr: "好" }] });
  assert.deepEqual(extractJson('{"result":"Here:\\n{\\"lines\\":[]}"}', isWanted), { lines: [] });
  // 含有引號與分號的惡意指令名稱不會被執行且回傳 null
  assert.equal(which('node"; echo INJECTED #'), null);
});

test("core.mjs: importLyrics 支援現場版建立與替換（liveMeta / keepActs）", () => {
  const db = core.loadFrom({
    "songs.js": MOCK_SONGS_JS,
    "i18n.js": MOCK_I18N_JS,
    "song-lyrics.js": MOCK_LYRICS_JS,
    "song-lyrics-live.js": MOCK_LYRICS_JS.replace(/SONGS/g, "LIVE_SONGS")
  });

  // 未提供 liveMeta 且沒有 <id>-live 時應明確报错
  assert.throws(() => {
    core.importLyrics("beta", "1.00\t歌う\t唱", { live: true }, db);
  }, /還沒有現場版歌詞/);

  // 帶 liveMeta 建立全新的 beta-live 並寫入 song-lyrics-live.js（且照 id 排序）
  const created = core.importLyrics("beta", "5.00\t最初の歌\t第一句\n12.00\t次の歌\t第二句", {
    live: true,
    liveMeta: { yt: "zzzzzzzzzzz", concert: "武道館 (2026)", duration: 150 }
  }, db);
  assert.ok(created.files["song-lyrics-live.js"]);
  const parsed1 = LyricsStore.parse(created.files["song-lyrics-live.js"], "live");
  const betaLive = parsed1.songs.find(x => x.id === "beta-live");
  assert.ok(betaLive);
  assert.equal(betaLive.baseId, "beta");
  assert.equal(betaLive.type, "live");
  assert.equal(betaLive.concert, "武道館 (2026)");
  assert.equal(betaLive.youtubeId, "zzzzzzzzzzz");
  assert.equal(betaLive.duration, 150);
  assert.equal(betaLive.lyrics.length, 2);

  // 已存在 alpha-live 時，--live 匯入可保留同一句的應援（keepActs）
  const dbWithAlphaLive = core.loadFrom({
    "songs.js": MOCK_SONGS_JS,
    "i18n.js": MOCK_I18N_JS,
    "song-lyrics.js": MOCK_LYRICS_JS,
    "song-lyrics-live.js": created.files["song-lyrics-live.js"]
  });
  const seeded = core.importLyrics("alpha", [
    { time: 3, jp: "叫べ", tr: "喊吧", acts: ["call"], call: "Hey!" }
  ], {
    live: true,
    liveMeta: { yt: "lllllllllll", concert: "武道館 (2025)", duration: 180 }
  }, dbWithAlphaLive);
  const db2 = core.loadFrom({
    "songs.js": MOCK_SONGS_JS,
    "i18n.js": MOCK_I18N_JS,
    "song-lyrics.js": MOCK_LYRICS_JS,
    "song-lyrics-live.js": seeded.files["song-lyrics-live.js"]
  });
  const updated = core.importLyrics("alpha", "4.50\t叫べ\t喊吧", { live: true, keepActs: true }, db2);
  const alphaLive = LyricsStore.parse(updated.files["song-lyrics-live.js"], "live").songs.find(x => x.id === "alpha-live");
  assert.equal(alphaLive.lyrics[0].time, 4.5);
  assert.deepEqual(alphaLive.lyrics[0].acts, ["call"]);
  assert.equal(alphaLive.lyrics[0].call, "Hey!");
});

test("core.mjs: fixOverlaps 修剪重疊 duration 並維持非重疊行不變", () => {
  const overlapLiveJs = `(function (root, factory) {
  module.exports = factory();
})(this, function () {
  var LIVE_SONGS = [
  {
    "id": "alpha-live",
    "baseId": "alpha",
    "type": "live",
    "concert": "武道館 (2025)",
    "youtubeId": "lllllllllll",
    "duration": 180,
    "lyrics": [
      {
        "time": 10,
        "jp": "重疊超過0.05",
        "tr": "A",
        "duration": 5.5
      },
      {
        "time": 15,
        "jp": "緊貼下一句不重疊",
        "tr": "B",
        "duration": 5
      },
      {
        "time": 20,
        "jp": "極窄間隔重疊",
        "tr": "C",
        "duration": 1.2
      },
      {
        "time": 20.01,
        "jp": "最後一句",
        "tr": "D"
      }
    ]
  }
];

  return LIVE_SONGS;
});`;
  const db = core.loadFrom({
    "songs.js": MOCK_SONGS_JS,
    "i18n.js": MOCK_I18N_JS,
    "song-lyrics.js": MOCK_LYRICS_JS,
    "song-lyrics-live.js": overlapLiveJs
  });

  assert.throws(() => core.fixOverlaps("../evil", { live: true }, db), /無效的歌曲 id/);

  const res = core.fixOverlaps("alpha", { live: true, gap: 0.02 }, db);
  assert.equal(res.fixedCount, 2);
  assert.ok(res.files["song-lyrics-live.js"]);
  const fixedEntry = LyricsStore.parse(res.files["song-lyrics-live.js"], "live").songs[0];
  assert.equal(fixedEntry.lyrics[0].duration, 4.98);
  assert.equal(fixedEntry.lyrics[1].duration, 5); // 非重疊的緊貼行不動
  assert.equal(fixedEntry.lyrics[2].duration, 0.01); // avail=0.01 < gap=0.02 時仍保證為正且不重疊

  // 冪等：再跑一次應回報 0 筆修改
  const dbAfter = core.loadFrom({
    "songs.js": MOCK_SONGS_JS,
    "i18n.js": MOCK_I18N_JS,
    "song-lyrics.js": MOCK_LYRICS_JS,
    "song-lyrics-live.js": res.files["song-lyrics-live.js"]
  });
  const res2 = core.fixOverlaps("alpha", { live: true }, dbAfter);
  assert.equal(res2.fixedCount, 0);
  assert.deepEqual(res2.files, {});
});

test("server.mjs: /api/lyrics-import (live + align 拒絕) 與 /api/fix-overlaps", async t => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ado-studio-api-"));
  t.after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(tmpRoot, "index.html"), "<!doctype html>");

  let memLiveJs = MOCK_LYRICS_JS.replace(/SONGS/g, "LIVE_SONGS");
  const makeMemDb = () => core.loadFrom({
    "songs.js": MOCK_SONGS_JS,
    "i18n.js": MOCK_I18N_JS,
    "song-lyrics.js": MOCK_LYRICS_JS,
    "song-lyrics-live.js": memLiveJs
  });
  const mockOps = {
    importLyrics: (id, input, opts) => core.importLyrics(id, input, opts, makeMemDb()),
    fixOverlaps: (id, opts) => core.fixOverlaps(id, opts, makeMemDb()),
    commit: r => {
      if (r.files?.["song-lyrics-live.js"]) {
        memLiveJs = r.files["song-lyrics-live.js"];
        return { ...r, written: ["song-lyrics-live.js"] };
      }
      return { ...r, written: [] };
    }
  };

  const server = createStudioServer({ port: 0, rootDir: tmpRoot, ops: mockOps });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body) => fetch(`${base}${p}`, {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }).then(r => r.json());

  // 1. live + align 應被拒絕
  const rReject = await post("/api/lyrics-import", {
    id: "beta",
    text: "10.00\tテスト\t測試",
    align: true,
    live: { yt: "zzzzzzzzzzz", concert: "武道館 (2026)", duration: 150 }
  });
  assert.equal(rReject.ok, false);
  assert.match(rReject.error, /現場版目前不支援自動對時/);

  // 2. live 匯入含重疊 duration 的歌詞
  const rLiveImp = await post("/api/lyrics-import", {
    id: "beta",
    lines: [
      { time: 10, jp: "歌う", tr: "唱", duration: 6 },
      { time: 15, jp: "次", tr: "下一句" }
    ],
    live: { yt: "zzzzzzzzzzz", concert: "武道館 (2026)", duration: 150 }
  });
  assert.equal(rLiveImp.ok, true);

  // 3. /api/fix-overlaps 修剪現場版重疊
  const rFix = await post("/api/fix-overlaps", { id: "beta", live: true, gap: 0.02 });
  assert.equal(rFix.ok, true);
  assert.equal(rFix.fixedCount, 1);
  assert.deepEqual(rFix.written, ["song-lyrics-live.js"]);
  const betaLive = LyricsStore.parse(memLiveJs, "live").songs.find(x => x.id === "beta-live");
  assert.equal(betaLive.lyrics[0].duration, 4.98);
});

test("預留曲目（upcoming: true, yt: '', len: ''）：SongMetaStore、LyricsStore 與 core.mjs 相容性", () => {
  const placeholderSongsJs = `(function (root, factory) {
  module.exports = factory();
})(this, function () {
  "use strict";
  const SONGS = [
    { id: "gamma", ja: "ガンマ", zh: "Gamma", en: "Gamma", ro: "Gamma", date: "2026-12-23", yt: "", len: "", hold: true, upcoming: true  },
    // 翻唱
    { id: "delta", ja: "デルタ", zh: "Delta", en: "Delta", ro: "Delta", date: "2026-12-23", yt: "", len: "", hold: true, cover: true, upcoming: true  }
  ];
  const UT = {};
  const PEN = {};
  const BEAT = {};
  const CLIMAX = {};
  const LIVE_VIDEOS = {
  };
  const LIVES = {};
  return { SONGS, UT, PEN, BEAT, CLIMAX, LIVE_VIDEOS, LIVES };
});`;
  const placeholderLyricsJs = `(function (root, factory) {
  module.exports = factory();
})(this, function () {
  var SONGS = [
  {
    "id": "gamma",
    "title": "ガンマ",
    "youtubeId": "",
    "duration": 0,
    "lyrics": []
  },
  {
    "id": "delta",
    "title": "デルタ",
    "youtubeId": "",
    "duration": 0,
    "lyrics": []
  }
];

  return SONGS;
});`;

  // 1. SongMetaStore.readMeta / validate / applyMeta 保留 upcoming 與 len: ""
  const metaGamma = SongMetaStore.readMeta(placeholderSongsJs, MOCK_I18N_JS, "gamma");
  assert.equal(metaGamma.status, "hold");
  assert.equal(metaGamma.len, "");
  assert.equal(metaGamma.upcoming, true);
  assert.deepEqual(SongMetaStore.validate(metaGamma).errors, []);
  assert.ok(SongMetaStore.validate({ ...metaGamma, climax: 30 }).errors.some(e => e.includes("副歌高潮")));

  metaGamma.pen = "赤";
  metaGamma.penGuess = true;
  const appliedGamma = SongMetaStore.applyMeta(placeholderSongsJs, MOCK_I18N_JS, metaGamma);
  const afterGamma = SongMetaStore.evalUmd(appliedGamma.songs).SONGS.find(s => s.id === "gamma");
  assert.equal(afterGamma.upcoming, true);
  assert.equal(afterGamma.hold, true);
  assert.equal(afterGamma.yt, "");
  assert.equal(afterGamma.len, "");
  assert.equal(SongMetaStore.readMeta(appliedGamma.songs, appliedGamma.i18n, "gamma").pen, "赤");

  const metaDelta = SongMetaStore.readMeta(appliedGamma.songs, appliedGamma.i18n, "delta");
  metaDelta.status = "free";
  const appliedDelta = SongMetaStore.applyMeta(appliedGamma.songs, appliedGamma.i18n, metaDelta);
  const afterDelta = SongMetaStore.evalUmd(appliedDelta.songs).SONGS.find(s => s.id === "delta");
  assert.equal(afterDelta.free, true);
  assert.equal(afterDelta.cover, true);
  assert.equal(afterDelta.upcoming, true);
  assert.equal(afterDelta.hold, undefined);

  // 2. LyricsStore.validate：僅在 !youtubeId && !lyrics.length 時允許 duration === 0
  const placeholderSong = { id: "delta", yt: "", len: "", hold: true, cover: true, upcoming: true };
  const placeholderEntry = { id: "delta", youtubeId: "", duration: 0, lyrics: [] };
  assert.deepEqual(LyricsStore.validate(placeholderEntry, placeholderSong).errors, []);

  assert.ok(LyricsStore.validate({ id: "delta", youtubeId: "xxxxxxxxxxx", duration: 0, lyrics: [] }, { id: "delta", yt: "xxxxxxxxxxx", len: "3:00" }).errors.some(e => e.includes("duration")));
  assert.ok(LyricsStore.validate({ id: "delta", youtubeId: "", duration: 0, lyrics: [{ time: 1, jp: "あ", tr: "a" }] }, placeholderSong).errors.some(e => e.includes("duration")));
  assert.ok(LyricsStore.validate(placeholderEntry, { id: "delta", yt: "xxxxxxxxxxx", len: "3:00" }).errors.some(e => e.includes("YouTube ID")));

  // 3. core.mjs：songsIndex、songDetail、saveLyrics 與 addSong 處理 yt: "" / len: ""
  const db = core.loadFrom({
    "songs.js": placeholderSongsJs,
    "i18n.js": MOCK_I18N_JS,
    "song-lyrics.js": placeholderLyricsJs,
    "song-lyrics-live.js": placeholderLyricsJs.replace(/SONGS/g, "LIVE_SONGS")
  });
  const idx = core.songsIndex(db);
  assert.equal(idx[0].len, "");
  assert.equal(idx[0].upcoming, true);

  const detail = core.songDetail("delta", db);
  assert.equal(detail.duration, 0);
  assert.equal(detail.song.yt, "");
  assert.equal(detail.song.len, "");
  assert.equal(detail.song.upcoming, true);

  const savedEmpty = core.saveLyrics("delta", [], undefined, db);
  assert.deepEqual(savedEmpty.files, {});

  const added = core.addSong({ id: "epsilon", yt: "eeeeeeeeeee", ja: "イプシロン", len: "3:15", date: "2026-11-20" }, db);
  assert.ok(added.files["songs.js"]);

  // 4. SongMetaStore.applyMeta 保留 collab: true（含純合作與合作翻唱）
  const collabSongsJs = `(function (root, factory) {
  module.exports = factory();
})(this, function () {
  "use strict";
  const SONGS = [
    { id: "sakura", ja: "桜日和とタイムマシン with 初音ミク", zh: "桜日和とタイムマシン with 初音ミク", en: "Sakura Biyori", ro: "Sakura Biyori", date: "2024-10-24", yt: "n1234567890", len: "5:05", hold: true, collab: true  },
    // 翻唱
    { id: "vivahappy", ja: "ビバハピ", zh: "ビバハピ", en: "ビバハピ", ro: "Viva Happy", date: "2023-03-31", yt: "eXy6ZSEIAX0", len: "3:33", hold: true, cover: true, collab: true  }
  ];
  const UT = {};
  const PEN = {};
  const BEAT = {};
  const CLIMAX = {};
  const LIVE_VIDEOS = {
  };
  const LIVES = {};
  return { SONGS, UT, PEN, BEAT, CLIMAX, LIVE_VIDEOS, LIVES };
});`;
  const mSakura = SongMetaStore.readMeta(collabSongsJs, MOCK_I18N_JS, "sakura");
  mSakura.status = "free";
  const resSakura = SongMetaStore.applyMeta(collabSongsJs, MOCK_I18N_JS, mSakura);
  const afterSakura = SongMetaStore.evalUmd(resSakura.songs).SONGS.find(s => s.id === "sakura");
  assert.equal(afterSakura.free, true);
  assert.equal(afterSakura.collab, true);
  assert.equal(afterSakura.hold, undefined);
  assert.match(resSakura.songs, /\{ id: "sakura",[^\n]*free: true, collab: true  \}/);

  const mViva = SongMetaStore.readMeta(resSakura.songs, resSakura.i18n, "vivahappy");
  mViva.status = "free";
  const resViva = SongMetaStore.applyMeta(resSakura.songs, resSakura.i18n, mViva);
  const afterViva = SongMetaStore.evalUmd(resViva.songs).SONGS.find(s => s.id === "vivahappy");
  assert.equal(afterViva.free, true);
  assert.equal(afterViva.cover, true);
  assert.equal(afterViva.collab, true);
  assert.match(resViva.songs, /\{ id: "vivahappy",[^\n]*free: true, cover: true, collab: true  \}/);
});
