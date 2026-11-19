#!/usr/bin/env node
// 新歌工作站（Ado Studio）的本機伺服器：只聽 127.0.0.1，給自己的瀏覽器用
// - 開網站和工作站介面（專案資料夾當靜態網站），任何瀏覽器都能存檔，不用再選資料夾
// - 讀寫歌曲資料檔都透過 core.mjs（以 writeLock 序列化、寫入前檢查並原子替換）
// - 檢查（check-data、test-karaoke）、同步（git pull）、發布（commit＋push 到 main）
// 用法：node tools/studio/server.mjs [--open] [--port 5178]；Windows 點兩下「工作站.bat」，Mac 點兩下「工作站.command」
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  check, gitStatus, publish, sync, fetchSong, fetchAudio, analyze, align,
  vocalEnvelope, translate, audioFile, commit, songsIndex, songDetail,
  saveLyrics, setMeta, importLyrics, fixOverlaps, withWriteLock, cleanupChildren,
  PUBLISH_BRANCH as BRANCH
} from "./core.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

const args = process.argv.slice(2);
const portIdx = args.indexOf("--port");
const rawPort = portIdx >= 0 ? (args[portIdx + 1] ?? "") : (process.env.STUDIO_PORT || "5178");
const PORT = Number(rawPort);
const HOST = "127.0.0.1";
const START_PAGE = "/tools/studio/ui/";

// 不給瀏覽器讀的地方
const HIDDEN = [
  /^\.git(\/|$)/i,
  /^\.claude(\/|$)/i,
  /^node_modules(\/|$)/i,
  /^tools\/studio\/work(\/|$)/i,
  /^tools\/studio\/py\/\.venv(\/|$)/i,
  /^tools\/studio\/config\.json$/i,
  /(^|\/)\.env/i
];

export function isHiddenPath(relPosix) {
  const norm = String(relPosix || "").replace(/^\/+/, "");
  return HIDDEN.some(r => r.test(norm));
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav"
};

function securityHeaders(pathname = "") {
  const h = {
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer"
  };
  if (pathname === "/tools/studio" || pathname.startsWith("/tools/studio/") || pathname.startsWith("/api/")) {
    h["X-Frame-Options"] = "DENY";
  }
  return h;
}

// ── HTTP ──
const send = (res, code, body, headers = {}, pathname = "") => {
  const json = typeof body !== "string";
  res.writeHead(code, {
    "Content-Type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(pathname),
    ...headers
  });
  res.end(json ? JSON.stringify(body) : body);
};

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("內容太大"), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req, { allowEmpty = false } = {}) {
  const raw = await readBody(req);
  if (allowEmpty && !raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("JSON 格式錯誤"), { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw Object.assign(new Error("JSON 內容必須是物件"), { status: 400 });
  }
  return parsed;
}

// 只接受自己這台電腦、自己這個網址來的請求：擋掉其他網站偷偷呼叫本機 API（含 DNS rebinding 與 CSRF）
export function trusted(req, port = PORT) {
  const okHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const okOrigins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  if (!okHosts.has(req.headers.host)) return false;

  const rawUrl = String(req.url || "/");
  let pathname = "";
  try { pathname = new URL(rawUrl, `http://${req.headers.host}`).pathname; }
  catch { pathname = rawUrl.split("?")[0]; }

  const secFetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (pathname.startsWith("/api/") && secFetchSite === "cross-site") return false;

  const origin = req.headers.origin;
  if (origin !== undefined && !okOrigins.has(origin)) return false;

  if (req.method !== "GET" && req.method !== "HEAD") {
    if (!origin && secFetchSite !== "same-origin") return false;
    const ct = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (ct !== "application/json") return false;
  }
  return true;
}

const DEFAULT_OPS = { importLyrics, fixOverlaps, commit, audioFile, fetchAudio, align };

async function api(req, res, url, ops = DEFAULT_OPS) {
  const p = url.pathname;
  if (p === "/api/health") return send(res, 200, { ok: true, app: "ado-studio", version: 1, root: path.basename(root) }, {}, p);
  if (p === "/api/status" && req.method === "GET") return send(res, 200, await gitStatus(), {}, p);
  // 新介面：歌單、一首歌的全部資料、存歌詞、存歌曲資料
  if (p === "/api/songs" && req.method === "GET") return send(res, 200, songsIndex(), {}, p);
  if (p === "/api/song" && req.method === "GET") {
    try { return send(res, 200, songDetail(url.searchParams.get("id")), {}, p); }
    catch (e) { return send(res, 404, { error: e.message }, {}, p); }
  }
  if (p === "/api/lyrics" && req.method === "POST") {
    const { id, lyrics, base, live } = await readJson(req);
    try {
      return await withWriteLock(() => {
        const r = saveLyrics(id, lyrics, base, undefined, live || null);
        const w = commit(r);
        if (w.written.length) console.log(`  寫入 ${id} 的歌詞：${r.changes.join("、")}`);
        return send(res, 200, { ok: true, changes: r.changes, warnings: r.warnings, written: w.written, base: r.base }, {}, p);
      });
    } catch (e) {
      return send(res, e.conflict ? 409 : 200, { ok: false, error: e.message, conflict: !!e.conflict }, {}, p);
    }
  }
  // 貼上整首歌詞（可以不寫時間）；align：匯入後馬上自動對時（沒有時間時順便重補間奏）
  if (p === "/api/lyrics-import" && req.method === "POST") {
    const { id, text, lines, align: doAlign, keepActs, live } = await readJson(req);
    if (doAlign && live) {
      return send(res, 200, { ok: false, error: "現場版目前不支援自動對時，請只匯入歌詞" }, {}, p);
    }
    try {
      const r = await withWriteLock(() => {
        const liveMeta = live && typeof live === "object" ? live : null;
        const resImport = ops.importLyrics(id, Array.isArray(lines) ? lines : String(text || ""), {
          live: !!live,
          liveMeta,
          keepActs: !!keepActs
        });
        ops.commit(resImport);
        return resImport;
      });
      const out = { ok: true, changes: [...r.changes], warnings: [...r.warnings] };
      if (doAlign) {
        if (!ops.audioFile(id)) await ops.fetchAudio(id, { onLog: m => process.stdout.write(`    ${m}`) });
        const a = await ops.align(id, { apply: true, rebuildGaps: !!r.untimed, autoCommit: true, onLog: m => process.stdout.write(`    ${m}`) });
        out.changes.push(...a.changes);
        out.warnings = a.warnings;
      }
      console.log(`  ✓ ${id}：${out.changes.join("、")}`);
      return send(res, 200, out, {}, p);
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message }, {}, p);
    }
  }
  if (p === "/api/fix-overlaps" && req.method === "POST") {
    const { id, live, gap } = await readJson(req);
    try {
      return await withWriteLock(() => {
        const r = ops.fixOverlaps(id, { live: !!live, gap: gap ?? 0.02 });
        const w = ops.commit(r);
        if (w.written.length) console.log(`  ✓ ${id}：${r.changes.join("、")}`);
        const { files, ...rest } = r;
        return send(res, 200, { ok: true, ...rest, written: w.written }, {}, p);
      });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message }, {}, p);
    }
  }
  if (p === "/api/meta" && req.method === "POST") {
    const { id, ...opts } = await readJson(req);
    try {
      return await withWriteLock(() => {
        const r = setMeta(id, opts);
        const w = commit(r);
        if (w.written.length) console.log(`  寫入 ${id} 的歌曲資料：${r.changes.join("、")}`);
        return send(res, 200, { ok: true, changes: r.changes, warnings: r.warnings, written: w.written }, {}, p);
      });
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message }, {}, p);
    }
  }
  if (p === "/api/check" && req.method === "POST") {
    await readJson(req, { allowEmpty: true });
    return send(res, 200, await check(), {}, p);
  }
  if (p === "/api/sync" && req.method === "POST") {
    await readJson(req, { allowEmpty: true });
    return send(res, 200, await withWriteLock(() => sync()), {}, p);
  }
  if (p === "/api/fetch" && req.method === "POST") {
    const { url: videoUrl, id, ja, cover, noAudio } = await readJson(req);
    console.log(`  匯入：${videoUrl}`);
    try {
      const r = await fetchSong(videoUrl, { id: id || undefined, ja: ja || undefined, cover, noAudio }, { autoCommit: true, onLog: m => process.stdout.write(`    ${m}`) });
      console.log(`  ✓ 新增 ${r.summary.id}：${(r.written || []).join("、")}`);
      return send(res, 200, { ok: true, ...r.summary, changes: r.changes, warnings: r.warnings, written: r.written || [] }, {}, p);
    } catch (e) {
      console.log(`  ✗ ${e.message.split("\n")[0]}`);
      return send(res, 200, { ok: false, error: e.message }, {}, p);
    }
  }
  // 音訊分析：沒有音訊會先下載；apply 時寫進 BEAT（only: "beat"）或 BEAT＋CLIMAX
  if (p === "/api/analyze" && req.method === "POST") {
    const { id, apply, overwrite, only, bpm, climax } = await readJson(req);
    try {
      if (!audioFile(id)) await fetchAudio(id, { onLog: m => process.stdout.write(`    ${m}`) });
      const r = await analyze(id, { apply, overwrite, only, bpm, climax, autoCommit: !!apply, onLog: m => process.stdout.write(`    ${m}`) });
      const written = r.written || [];
      if (written.length) console.log(`  ✓ 寫入 ${id} 的 ${r.changes.join("、")}`);
      const { files, ...rest } = r;
      return send(res, 200, { ok: true, ...rest, written }, {}, p);
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message }, {}, p);
    }
  }
  // 人聲音量曲線（貼齊聲音用）：沒有音訊會先下載，沒有人聲會先分離
  if (p === "/api/vocal-env" && req.method === "POST") {
    const { id } = await readJson(req);
    try {
      if (!audioFile(id)) await fetchAudio(id, { onLog: m => process.stdout.write(`    ${m}`) });
      const env = await vocalEnvelope(id, { onLog: m => process.stdout.write(`    ${m}`) });
      return send(res, 200, { ok: true, ...env }, {}, p);
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message }, {}, p);
    }
  }
  // 自動對時、翻譯（沒有音訊會先下載）；apply 時寫回歌詞檔
  if ((p === "/api/align" || p === "/api/translate") && req.method === "POST") {
    const body = await readJson(req);
    const log = m => process.stdout.write(`    ${m}`);
    try {
      if (p === "/api/align" && !audioFile(body.id)) await fetchAudio(body.id, { onLog: log });
      const r = p === "/api/align"
        ? await align(body.id, { apply: !!body.apply, rebuildGaps: !!body.rebuildGaps, autoCommit: !!body.apply, onLog: log })
        : await translate(body.id, { apply: !!body.apply, all: !!body.all, autoCommit: !!body.apply, onLog: log });
      const written = r.written || [];
      if (written.length) console.log(`  ✓ ${body.id}：${r.changes.join("、")}`);
      const { files, ...rest } = r;
      return send(res, 200, { ok: true, ...rest, written }, {}, p);
    } catch (e) {
      return send(res, 200, { ok: false, error: e.message }, {}, p);
    }
  }
  if (p === "/api/publish" && req.method === "POST") {
    const { message, changelog } = await readJson(req);
    const msg = String(message || "").trim();
    if (!msg) return send(res, 400, { error: "要寫 commit 訊息" }, {}, p);
    console.log(`  發布：${msg.split("\n")[0]}`);
    const r = await withWriteLock(() => publish(msg, { changelog }));
    console.log(r.ok ? `  ✓ 已推上 ${BRANCH}：${r.head}` : `  ✗ ${r.error}`);
    return send(res, 200, r, {}, p);
  }
  return send(res, 404, { error: "沒有這個 API" }, {}, p);
}

function serveStatic(req, res, url, rootDir = root) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "不支援", {}, url.pathname);
  let rel;
  try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, ""); } catch { return send(res, 400, "網址錯誤", {}, url.pathname); }
  if (rel.includes("\0")) return send(res, 400, "網址錯誤", {}, url.pathname);
  if (url.pathname === "/studio" || url.pathname === "/studio/") return send(res, 302, "", { Location: START_PAGE }, url.pathname);

  const rootReal = fs.realpathSync(rootDir);
  const file = path.resolve(rootReal, rel);
  if (file !== rootReal && !file.startsWith(rootReal + path.sep)) return send(res, 403, "不行", {}, url.pathname);
  const relLex = path.relative(rootReal, file).split(path.sep).join("/");
  if (isHiddenPath(relLex)) return send(res, 404, "找不到", {}, url.pathname);

  try {
    let targetReal = fs.realpathSync(file);
    if (targetReal !== rootReal && !targetReal.startsWith(rootReal + path.sep)) return send(res, 403, "不行", {}, url.pathname);
    if (isHiddenPath(path.relative(rootReal, targetReal).split(path.sep).join("/"))) return send(res, 404, "找不到", {}, url.pathname);

    if (fs.statSync(targetReal).isDirectory()) {
      if (!url.pathname.endsWith("/")) return send(res, 301, "", { Location: url.pathname + "/" + url.search }, url.pathname);
      const idxPath = path.join(targetReal, "index.html");
      targetReal = fs.realpathSync(idxPath);
      if (targetReal !== rootReal && !targetReal.startsWith(rootReal + path.sep)) return send(res, 403, "不行", {}, url.pathname);
      if (isHiddenPath(path.relative(rootReal, targetReal).split(path.sep).join("/"))) return send(res, 404, "找不到", {}, url.pathname);
    }

    const data = fs.readFileSync(targetReal);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(targetReal).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      ...securityHeaders(url.pathname)
    });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    send(res, 404, "找不到", {}, url.pathname);
  }
}

export function createStudioServer({ port = PORT, rootDir = root, ops } = {}) {
  const activeOps = ops ? { ...DEFAULT_OPS, ...ops } : DEFAULT_OPS;
  if (port !== 0 && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error(`無效的連接埠：${port}`);
  }
  const server = http.createServer(async (req, res) => {
    const activePort = port > 0 ? port : (server.address()?.port || req.socket?.localPort || PORT);
    const rawPathname = String(req.url || "/").split("?")[0];
    if (!trusted(req, activePort)) return send(res, 403, "只接受本機工作站的請求", {}, rawPathname);
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch {
      return send(res, 400, { error: "網址格式錯誤" }, {}, rawPathname);
    }
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, res, url, activeOps);
      return serveStatic(req, res, url, rootDir);
    } catch (e) {
      const code = e.status || 500;
      if (code >= 500) console.error(e);
      if (!res.headersSent) send(res, code, { error: e.message }, {}, url.pathname);
    }
  });
  server.requestTimeout = 0;
  return server;
}

function openBrowser(u) {
  const [cmd, a] = process.platform === "win32" ? ["cmd", ["/c", "start", "", u]] : process.platform === "darwin" ? ["open", [u]] : ["xdg-open", [u]];
  spawn(cmd, a, { stdio: "ignore", detached: true, windowsHide: true }).on("error", () => {}).unref();
}

const isMain = Boolean(process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (isMain) {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    console.error(`無效的連接埠：${rawPort}（必須是 1–65535 的整數）`);
    process.exit(1);
  }
  const server = createStudioServer({ port: PORT, rootDir: root });
  const startUrl = `http://localhost:${PORT}${START_PAGE}`;
  server.on("error", async e => {
    if (e.code !== "EADDRINUSE") throw e;
    // 已經開著一個工作站：直接打開瀏覽器就好
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`).then(res => res.json()).catch(() => null);
    if (r && r.app === "ado-studio") {
      console.log(`工作站已經在跑了：${startUrl}`);
      if (args.includes("--open")) openBrowser(startUrl);
      process.exit(0);
    }
    console.error(`連接埠 ${PORT} 被別的程式占用了，可以用 --port 換一個，例如：node tools/studio/server.mjs --port 5179`);
    process.exit(1);
  });

  const shutdown = () => {
    cleanupChildren();
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  server.listen(PORT, HOST, () => {
    console.log(`Ado 新歌工作站：${startUrl}`);
    console.log(`網站預覽：http://localhost:${PORT}/`);
    console.log("關掉這個視窗就會停止。\n");
    if (args.includes("--open")) openBrowser(startUrl);
  });
}
