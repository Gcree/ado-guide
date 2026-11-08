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

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const LyricsStore = require(path.join(root, "tools/timing/lyrics-store.js"));

const args = process.argv.slice(2);
const argVal = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const PORT = Number(argVal("--port") || process.env.STUDIO_PORT || 5178);
const HOST = "127.0.0.1";
const BRANCH = process.env.STUDIO_BRANCH || "main"; // 發布只從這個分支推
const START_PAGE = "/tools/timing/";

// 可以寫入的檔案，和寫入前怎麼確認內容還是好的
const WRITABLE = {
  "songs.js": src => { const m = runUmd(src); if (!Array.isArray(m.SONGS) || !m.SONGS.length) throw new Error("songs.js 讀不出 SONGS"); },
  "i18n.js": src => { const m = runUmd(src); if (!m || typeof m.en !== "object" || typeof m.ja !== "object") throw new Error("i18n.js 讀不出 en／ja"); },
  "song-lyrics.js": src => { LyricsStore.parse(src, "mv"); },
  "song-lyrics-live.js": src => { LyricsStore.parse(src, "live"); }
};
// 發布時會一起 commit 的路徑（其他檔案有改也不會被帶進去）
const PUBLISH_PATHS = ["songs.js", "i18n.js", "song-lyrics.js", "song-lyrics-live.js", "research"];
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

// 跑指令，回傳 { code, out }（stdout、stderr 合在一起，照順序）
function run(cmd, cmdArgs, opts = {}) {
  return new Promise(resolve => {
    const p = spawn(cmd, cmdArgs, { cwd: root, env: { ...process.env, LANG: "C.UTF-8", GIT_TERMINAL_PROMPT: "0" }, windowsHide: true, ...opts });
    let out = "";
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (out += d));
    p.on("error", e => resolve({ code: -1, out: out + e.message }));
    p.on("close", code => resolve({ code, out: out.replace(/\s+$/, "") }));
  });
}
const git = (...a) => run("git", a);
const node = (...a) => run(process.execPath, a);

// ── 檢查：跟 GitHub Actions 發布前一樣 ──
async function runChecks() {
  const steps = [];
  for (const [name, script] of [["資料檢查", "scripts/check-data.mjs"], ["卡拉OK測試", "scripts/test-karaoke.mjs"]]) {
    const r = await node(script);
    steps.push({ name, ok: r.code === 0, out: r.out.split("\n").slice(-40).join("\n") });
    if (r.code !== 0) break;
  }
  return { ok: steps.every(s => s.ok), steps };
}

async function gitStatus() {
  const branch = (await git("rev-parse", "--abbrev-ref", "HEAD")).out;
  // -z：用 NUL 分隔、檔名不加引號（中文檔名也不會變成 \345…）；改名（R／C）後面會多一筆舊檔名，跳過
  const parts = (await git("status", "--porcelain=v1", "-z", "-uall", "--", ...PUBLISH_PATHS)).out.split("\0").filter(Boolean);
  const changed = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i].slice(0, 2), file = parts[i].slice(3);
    changed.push({ status: status.trim(), file });
    if (/[RC]/.test(status[0])) i++;
  }
  const stat = (await git("diff", "--stat", "HEAD", "--", ...PUBLISH_PATHS)).out;
  // 上次發布 commit 了但沒推上去（網路斷、衝突）的 commit 數
  const r = await git("rev-list", "--count", `origin/${BRANCH}..HEAD`);
  const ahead = r.code === 0 ? Number(r.out) || 0 : 0;
  return { branch, publishBranch: BRANCH, changed, stat, ahead };
}

// ── 發布：檢查 → 只 commit 資料檔 → 拉遠端最新（rebase）→ 推上 main ──
async function publish(message) {
  const log = [];
  const step = (name, r) => { log.push({ name, ok: r.code === 0, out: r.out }); return r.code === 0; };
  const fail = error => ({ ok: false, error, log });

  const { branch, changed, ahead } = await gitStatus();
  if (branch !== BRANCH) return fail(`目前在「${branch}」分支，工作站只從 ${BRANCH} 發布。請先切回 ${BRANCH}。`);
  if (!changed.length && !ahead) return fail("歌曲資料沒有變更，不用發布。");

  const checks = await runChecks();
  checks.steps.forEach(s => log.push(s));
  if (!checks.ok) return fail("檢查沒過，沒有發布。請看下面的訊息修正後再試。");

  // 沒有新變更、只是上次沒推上去的話，直接跳到拉最新＋推
  if (changed.length) {
    const files = changed.map(c => c.file);
    if (!step("加入變更", await git("add", "--", ...files))) return fail("git add 失敗");
    if (!step("commit", await git("commit", "-m", message, "--", ...files))) return fail("commit 失敗");
  }

  if (!step("拉遠端最新", await git("pull", "--rebase", "--autostash", "origin", BRANCH))) {
    await git("rebase", "--abort");
    return fail("遠端有改到同樣的地方，自動合併失敗。commit 留在本機了，請手動處理衝突後再按發布。");
  }
  if (!step("推上 GitHub", await git("push", "origin", BRANCH))) return fail("push 失敗（網路或權限）。commit 留在本機，可以再按一次發布。");
  const head = (await git("log", "-1", "--format=%h %s")).out;
  return { ok: true, head, log };
}

// 同步：拉遠端最新（例如 Claude 推上來的情報包）
async function sync() {
  const { branch } = await gitStatus();
  if (branch !== BRANCH) return { ok: false, error: `目前在「${branch}」分支，不是 ${BRANCH}。` };
  const r = await git("pull", "--rebase", "--autostash", "origin", BRANCH);
  if (r.code !== 0) { await git("rebase", "--abort"); return { ok: false, error: "同步失敗，請手動處理。", out: r.out }; }
  return { ok: true, out: r.out };
}

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
  if (p === "/api/check" && req.method === "POST") return send(res, 200, await runChecks());
  if (p === "/api/sync" && req.method === "POST") return send(res, 200, await sync());
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
