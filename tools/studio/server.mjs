#!/usr/bin/env node
// 新歌工作站（Ado Studio）的本機伺服器：只聽 127.0.0.1，給自己的瀏覽器用
// - 開網站和對時工作台（專案資料夾當靜態網站），任何瀏覽器都能存檔，不用再選資料夾
// - 讀寫歌曲資料檔（只限下面 WRITABLE 這幾個），寫入前確認檔案還讀得出來、而且沒被別人先改過
// - 檢查（check-data、test-karaoke）、同步（git pull）、發布（commit＋push 到 main）
// 用法：node tools/studio/server.mjs [--open] [--port 5178]；Windows 點兩下「工作站.bat」，Mac 點兩下「工作站.command」
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { check, gitStatus, publish, sync, fetchSong, fetchAudio, analyze, align, translate, audioFile, commit, songsIndex, songDetail, saveLyrics, setMeta, importLyrics, PUBLISH_BRANCH as BRANCH } from "./core.mjs";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const LyricsStore = require(path.join(root, "tools/timing/lyrics-store.js"));

const args = process.argv.slice(2);
const argVal = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const PORT = Number(argVal("--port") || process.env.STUDIO_PORT || 5178);
const HOST = "127.0.0.1";
const START_PAGE = "/tools/studio/ui/";

// 可以寫入的檔案，和寫入前怎麼確認內容還是好的
const WRITABLE = {
  "songs.js": src => { const m = runUmd(src); if (!Array.isArray(m.SONGS) || !m.SONGS.length) throw new Error("songs.js 讀不出 SONGS"); },
  "i18n.js": src => { const m = runUmd(src); if (!m || typeof m.en !== "object" || typeof m.ja !== "object") throw new Error("i18n.js 讀不出 en／ja"); },
  "song-lyrics.js": src => { LyricsStore.parse(src, "mv"); },
  "song-lyrics-live.js": src => { LyricsStore.parse(src, "live"); }
};
// 不給瀏覽器讀的地方
const HIDDEN = [/^\.git(\/|$)/, /^node_modules(\/|$)/, /^tools\/studio\/work(\/|$)/, /^tools\/studio\/config\.json$/, /(^|\/)\.env/];

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav"
};

// 跑 UMD 檔（songs.js、i18n.js）拿到輸出，限時避免卡死
function runUmd(src) {
  const module = { exports: {} };
  vm.runInNewContext(src, { module, exports: module.exports, define: undefined, self: undefined, globalThis: {} }, { timeout: 2000 });
  return module.exports;
}

const hash = text => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

// ── HTTP ──
const send = (res, code, body, headers = {}) => {
  const json = typeof body !== "string";
  res.writeHead(code, { "Content-Type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(json ? JSON.stringify(body) : body);
};

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("內容太大")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// 只接受自己這台電腦、自己這個網址來的請求：擋掉其他網站偷偷呼叫本機 API（含 DNS rebinding）
const OK_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
function trusted(req) {
  if (!OK_HOSTS.has(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (req.method !== "GET" && req.method !== "HEAD") {
    if (origin && !OK_HOSTS.has(origin.replace(/^http:\/\//, ""))) return false;
    if (!(req.headers["content-type"] || "").startsWith("application/json")) return false;
  }
  return true;
}

// 寫檔：先寫暫存檔再換名字，寫到一半當掉也不會留下半個檔案
function writeAtomic(file, text) {
  const tmp = `${file}.studio-tmp`;
  fs.writeFileSync(tmp, text);
  try { fs.renameSync(tmp, file); } catch (e) { fs.writeFileSync(file, text); fs.rmSync(tmp, { force: true }); }
}

async function api(req, res, url) {
  const p = url.pathname;
  if (p === "/api/health") return send(res, 200, { ok: true, app: "ado-studio", version: 1, root: path.basename(root) });

  if (p === "/api/file") {
    const name = url.searchParams.get("name");
    if (!Object.hasOwn(WRITABLE, name)) return send(res, 403, { error: `不能讀寫 ${name}` });
    const file = path.join(root, name);
    if (req.method === "GET") {
      const text = fs.readFileSync(file, "utf8");
      return send(res, 200, text, { "Content-Type": "text/plain; charset=utf-8", "X-Hash": hash(text) });
    }
    if (req.method === "PUT") {
      const { content, base } = JSON.parse(await readBody(req));
      if (typeof content !== "string") return send(res, 400, { error: "沒有內容" });
      const now = fs.readFileSync(file, "utf8");
      if (base && base !== hash(now)) return send(res, 409, { error: `${name} 在你讀取之後被改過了（可能是別的分頁或 git pull）。請重新整理再存一次。` });
      try { WRITABLE[name](content); } catch (e) { return send(res, 422, { error: `寫入後的 ${name} 會壞掉，沒有寫入：${e.message}` }); }
      writeAtomic(file, content);
      console.log(`  寫入 ${name}`);
      return send(res, 200, { ok: true, hash: hash(content) });
    }
    return send(res, 405, { error: "不支援" });
  }

  if (p === "/api/status" && req.method === "GET") return send(res, 200, await gitStatus());
  // 新介面：歌單、一首歌的全部資料、存歌詞、存歌曲資料
  if (p === "/api/songs" && req.method === "GET") return send(res, 200, songsIndex());
  if (p === "/api/song" && req.method === "GET") {
    try { return send(res, 200, songDetail(url.searchParams.get("id"))); } catch (e) { return send(res, 404, { error: e.message }); }
  }
  if (p === "/api/lyrics" && req.method === "POST") {
    const { id, lyrics, base } = JSON.parse(await readBody(req));
    try {
      const r = saveLyrics(id, lyrics, base);
      const w = commit(r);
      if (w.written.length) console.log(`  寫入 ${id} 的歌詞：${r.changes.join("、")}`);
      return send(res, 200, { ok: true, changes: r.changes, warnings: r.warnings, written: w.written, base: r.base });
    } catch (e) {
      return send(res, e.conflict ? 409 : 200, { ok: false, error: e.message, conflict: !!e.conflict });
    }
  }
  // 貼上整首歌詞（可以不寫時間）；align：匯入後馬上自動對時（沒有時間時順便重補間奏）
  if (p === "/api/lyrics-import" && req.method === "POST") {
    const { id, text, align: doAlign, keepActs } = JSON.parse(await readBody(req));
    try {
      const r = importLyrics(id, String(text || ""), { keepActs: !!keepActs });
      commit(r);
      const out = { ok: true, changes: [...r.changes], warnings: [...r.warnings] };
      if (doAlign) {
        if (!audioFile(id)) await fetchAudio(id, { onLog: m => process.stdout.write(`    ${m}`) });
        const a = await align(id, { apply: true, rebuildGaps: !!r.untimed, onLog: m => process.stdout.write(`    ${m}`) });
        commit(a);
        out.changes.push(...a.changes);
        out.warnings = a.warnings;
      }
      console.log(`  ✓ ${id}：${out.changes.join("、")}`);
      return send(res, 200, out);
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message });
    }
  }
  if (p === "/api/meta" && req.method === "POST") {
    const { id, ...opts } = JSON.parse(await readBody(req));
    try {
      const r = setMeta(id, opts);
      const w = commit(r);
      if (w.written.length) console.log(`  寫入 ${id} 的歌曲資料：${r.changes.join("、")}`);
      return send(res, 200, { ok: true, changes: r.changes, warnings: r.warnings, written: w.written });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message });
    }
  }
  if (p === "/api/check" && req.method === "POST") return send(res, 200, await check());
  if (p === "/api/sync" && req.method === "POST") return send(res, 200, await sync());
  if (p === "/api/fetch" && req.method === "POST") {
    const { url, id, ja, cover, noAudio } = JSON.parse(await readBody(req));
    console.log(`  匯入：${url}`);
    try {
      const r = await fetchSong(url, { id: id || undefined, ja: ja || undefined, cover, noAudio }, { onLog: m => process.stdout.write(`    ${m}`) });
      const w = commit(r);
      console.log(`  ✓ 新增 ${r.summary.id}：${w.written.join("、")}`);
      return send(res, 200, { ok: true, ...r.summary, changes: r.changes, warnings: r.warnings, written: w.written });
    } catch (e) {
      console.log(`  ✗ ${e.message.split("\n")[0]}`);
      return send(res, 200, { ok: false, error: e.message });
    }
  }
  // 音訊分析：沒有音訊會先下載；apply 時寫進 BEAT（only: "beat"）或 BEAT＋CLIMAX
  if (p === "/api/analyze" && req.method === "POST") {
    const { id, apply, overwrite, only, bpm, climax } = JSON.parse(await readBody(req));
    try {
      if (!audioFile(id)) await fetchAudio(id, { onLog: m => process.stdout.write(`    ${m}`) });
      const r = await analyze(id, { apply, overwrite, only, bpm, climax, onLog: m => process.stdout.write(`    ${m}`) });
      const w = commit(r);
      if (w.written.length) console.log(`  ✓ 寫入 ${id} 的 ${r.changes.join("、")}`);
      const { files, ...rest } = r;
      return send(res, 200, { ok: true, ...rest, written: w.written });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message });
    }
  }
  // 自動對時、翻譯（沒有音訊會先下載）；apply 時寫回歌詞檔
  if ((p === "/api/align" || p === "/api/translate") && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const log = m => process.stdout.write(`    ${m}`);
    try {
      if (p === "/api/align" && !audioFile(body.id)) await fetchAudio(body.id, { onLog: log });
      const r = p === "/api/align"
        ? await align(body.id, { apply: !!body.apply, rebuildGaps: !!body.rebuildGaps, onLog: log })
        : await translate(body.id, { apply: !!body.apply, all: !!body.all, onLog: log });
      const w = commit(r);
      if (w.written.length) console.log(`  ✓ ${body.id}：${r.changes.join("、")}`);
      const { files, ...rest } = r;
      return send(res, 200, { ok: true, ...rest, written: w.written });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message });
    }
  }
  if (p === "/api/publish" && req.method === "POST") {
    const { message } = JSON.parse(await readBody(req));
    const msg = String(message || "").trim();
    if (!msg) return send(res, 400, { error: "要寫 commit 訊息" });
    console.log(`  發布：${msg.split("\n")[0]}`);
    const r = await publish(msg);
    console.log(r.ok ? `  ✓ 已推上 ${BRANCH}：${r.head}` : `  ✗ ${r.error}`);
    return send(res, 200, r);
  }
  return send(res, 404, { error: "沒有這個 API" });
}

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, ""); } catch { return send(res, 400, "網址錯誤"); }
  if (url.pathname === "/studio" || url.pathname === "/studio/") return send(res, 302, "", { Location: START_PAGE });
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return send(res, 403, "不行");
  const relPosix = path.relative(root, file).split(path.sep).join("/");
  if (HIDDEN.some(r => r.test(relPosix))) return send(res, 404, "找不到");
  let target = file;
  try {
    if (fs.statSync(target).isDirectory()) {
      if (!url.pathname.endsWith("/")) return send(res, 301, "", { Location: url.pathname + "/" + url.search });
      target = path.join(target, "index.html");
    }
    const data = fs.readFileSync(target);
    res.writeHead(200, { "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    send(res, 404, "找不到");
  }
}

const server = http.createServer(async (req, res) => {
  if (!trusted(req)) return send(res, 403, "只接受本機工作站的請求");
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

function openBrowser(u) {
  const [cmd, a] = process.platform === "win32" ? ["cmd", ["/c", "start", "", u]] : process.platform === "darwin" ? ["open", [u]] : ["xdg-open", [u]];
  spawn(cmd, a, { stdio: "ignore", detached: true, windowsHide: true }).on("error", () => {}).unref();
}

const startUrl = `http://localhost:${PORT}${START_PAGE}`;
server.on("error", async e => {
  if (e.code !== "EADDRINUSE") throw e;
  // 已經開著一個工作站：直接打開瀏覽器就好
  const r = await fetch(`http://localhost:${PORT}/api/health`).then(r => r.json()).catch(() => null);
  if (r && r.app === "ado-studio") {
    console.log(`工作站已經在跑了：${startUrl}`);
    if (args.includes("--open")) openBrowser(startUrl);
    process.exit(0);
  }
  console.error(`連接埠 ${PORT} 被別的程式占用了，可以用 --port 換一個，例如：node tools/studio/server.mjs --port 5179`);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`Ado 新歌工作站：${startUrl}`);
  console.log(`網站預覽：http://localhost:${PORT}/`);
  console.log("關掉這個視窗就會停止。\n");
  if (args.includes("--open")) openBrowser(startUrl);
});
