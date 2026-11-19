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
