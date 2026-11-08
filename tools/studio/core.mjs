// 工作站的核心操作：介面（server.mjs）和命令列（cli.mjs）都用這一份，所以人按按鈕和 Claude 下指令做的事一模一樣
// 每個「改資料」的操作都只回傳「要寫的檔案內容＋變更摘要」，由 commit() 一次寫入；dryRun 時只回報不寫
// 寫入規則沿用 tools/timing/ 的 lyrics-store.js、song-meta-store.js：只改碰到的那幾行，排版不對就丟錯不冒險
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "../..");
const LyricsStore = require(path.join(root, "tools/timing/lyrics-store.js"));
const MetaStore = require(path.join(root, "tools/timing/song-meta-store.js"));

export const ACTS = LyricsStore.VALID_ACTS;
export const PEN_KEYS = MetaStore.PEN_KEYS;
const STATUS_ALIASES = { ok: "", official: "", 正式: "", sug: "sug", 暫定: "sug", free: "free", 自由: "free", hold: "hold", 整理中: "hold" };
export const STATUS_NAME = MetaStore.STATUS_NAME;

const FILES = ["songs.js", "i18n.js", "song-lyrics.js", "song-lyrics-live.js"];
const read = f => fs.readFileSync(path.join(root, f), "utf8");

// ── 讀 ──
export function load() {
  return loadFrom(Object.fromEntries(FILES.map(f => [f, read(f)])));
}

// 從檔案內容（而不是磁碟）建資料；串連多個操作時用（例如先新增歌曲、再匯入歌詞）
export function loadFrom(src) {
  const songs = MetaStore.evalUmd(src["songs.js"]);
  const lyrics = MetaStore.evalUmd(src["song-lyrics.js"]);
  const live = MetaStore.evalUmd(src["song-lyrics-live.js"]);
  return { src, songs, lyrics, live };
}

export const statusOf = s => (s.hold ? "hold" : s.sug ? "sug" : s.free ? "free" : "");
const lenToSec = len => len.split(":").reduce((a, b) => a * 60 + +b, 0);
export const fmtTime = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

function songOrThrow(db, id) {
  const s = db.songs.SONGS.find(x => x.id === id);
  if (!s) throw new Error(`沒有這首歌：${id}（用 list 看全部的 id）`);
  return s;
}

function lyricsEntry(db, id, live) {
  const list = live ? db.live : db.lyrics;
  const key = live ? `${id}-live` : id;
  const e = list.find(x => x.id === key);
  if (!e) throw new Error(live ? `${id} 還沒有現場版歌詞` : `song-lyrics.js 裡沒有 ${id}`);
  return JSON.parse(JSON.stringify(e));
}

export function list(db = load(), { status } = {}) {
  const { SONGS, BEAT, CLIMAX, PEN } = db.songs;
  return SONGS
    .filter(s => status == null || statusOf(s) === normStatus(status))
    .map(s => {
      const l = db.lyrics.find(x => x.id === s.id);
      return {
        id: s.id, ja: s.ja, status: statusOf(s), cover: !!s.cover, date: s.date, len: s.len,
        lines: l ? l.lyrics.length : 0, bpm: BEAT[s.id]?.[0] ?? null, climax: CLIMAX[s.id] ?? null, pen: PEN[s.id] || ""
      };
    });
}

export function show(id, db = load()) {
  const s = songOrThrow(db, id);
  const meta = MetaStore.readMeta(db.src["songs.js"], db.src["i18n.js"], id);
  const l = db.lyrics.find(x => x.id === id);
  const lv = db.live.find(x => x.id === `${id}-live`);
  const lines = l ? l.lyrics : [];
  const work = path.join(here, "work", id);
  return {
    id, ja: s.ja, zh: s.zh, en: s.en, ro: s.ro, yt: s.yt, len: s.len, date: s.date, cover: !!s.cover,
    status: meta.status, statusName: STATUS_NAME[meta.status], acts: meta.acts, tips: meta.tips,
    pen: meta.pen, penGuess: meta.penGuess, climax: meta.climax, liveVideo: meta.liveVideo,
    beat: db.songs.BEAT[id] || null, ut: db.songs.UT[id] || null,
    lyrics: {
      lines: lines.length,
      noTranslation: lines.filter(x => x.jp && !/^[（(].*[）)]$/.test(x.jp) && !(x.tr || "").trim()).length,
      withActs: lines.filter(x => x.acts && x.acts.length).length
    },
    live: lv ? { concert: lv.concert || "", yt: lv.youtubeId, lines: lv.lyrics.length } : null,
    research: fs.existsSync(path.join(root, "research", `${id}.json`)) ? `research/${id}.json` : null,
    analysis: fs.existsSync(work) ? fs.readdirSync(work) : []
  };
}

export function lyrics(id, { live = false, from = 1, to } = {}, db = load()) {
  songOrThrow(db, id);
  const e = lyricsEntry(db, id, live);
  return e.lyrics.map((l, i) => ({ n: i + 1, ...l })).filter(l => l.n >= from && (to == null || l.n <= to));
}

// ── 改 ──
// 每個操作回傳 { files: { 檔名: 新內容 }, changes: [說明], warnings: [] }

function normStatus(v) {
  if (v == null) return v;
  if (!(v in STATUS_ALIASES)) throw new Error(`狀態只能是 ok／sug／free／hold（收到 ${v}）`);
  return STATUS_ALIASES[v];
}

function normActs(v) {
  if (v == null) return v;
  const a = Array.isArray(v) ? v : v === "none" || v === "" ? [] : String(v).split(",").map(x => x.trim()).filter(Boolean);
  a.forEach(x => { if (!ACTS.includes(x)) throw new Error(`不認得的應援動作「${x}」，可以用：${ACTS.join(", ")}`); });
  return a;
}

// 歌曲資料：狀態、應援動作、應援重點、手燈、副歌高潮、LIVE 映像、BPM
export function setMeta(id, opts, db = load()) {
  songOrThrow(db, id);
  const cur = MetaStore.readMeta(db.src["songs.js"], db.src["i18n.js"], id);
  const m = { ...cur, tips: cur.tips.map(t => ({ ...t })) };
  if (opts.status != null) m.status = normStatus(opts.status);
  if (opts.acts != null) m.acts = normActs(opts.acts);
  if (opts.tips != null) m.tips = (Array.isArray(opts.tips) ? opts.tips : String(opts.tips).split("|")).map(t => (typeof t === "string" ? { zh: t.trim(), en: "", ja: "" } : t)).filter(t => t.zh);
  if (opts.tipsEn != null) String(opts.tipsEn).split("|").forEach((v, i) => { if (m.tips[i]) m.tips[i].en = v.trim(); });
  if (opts.tipsJa != null) String(opts.tipsJa).split("|").forEach((v, i) => { if (m.tips[i]) m.tips[i].ja = v.trim(); });
  if (opts.pen != null) {
    const p = String(opts.pen);
    m.penGuess = p.startsWith("?") || !!opts.penGuess;
    m.pen = p === "none" ? "" : p.replace(/^\?/, "");
  } else if (opts.penGuess != null) m.penGuess = !!opts.penGuess;
  if (opts.climax != null) m.climax = opts.climax === "none" ? null : Math.round(parseFloat(opts.climax) * 100) / 100;
  if (opts.liveYt != null || opts.liveConcert != null) {
    m.liveVideo = opts.liveYt === "none" ? null : { yt: opts.liveYt ?? cur.liveVideo?.yt ?? "", concert: opts.liveConcert ?? cur.liveVideo?.concert ?? "" };
  }
  const { errors, warnings } = MetaStore.validate(m);
  if (errors.length) throw new Error(errors.join("\n"));
  const r = MetaStore.applyMeta(db.src["songs.js"], db.src["i18n.js"], m);
  const files = {}, changes = [...r.changes];
  if (r.songsChanged) files["songs.js"] = r.songs;
  if (r.i18nChanged) files["i18n.js"] = r.i18n;

  if (opts.beat != null) {
    let beat = null;
    if (opts.beat !== "none") {
      beat = (Array.isArray(opts.beat) ? opts.beat : String(opts.beat).split(",")).map(Number);
      const [bpm, first, ok = 0] = beat;
      if (!(bpm >= 60 && bpm <= 220) || !(first >= 0) || ![0, 1].includes(ok)) throw new Error("BEAT 要寫成 BPM,第一小節秒數,可靠(0/1)，例如 195,0.124,1；BPM 在 60–220");
      beat = [bpm, first, ok];
    }
    const base = files["songs.js"] ?? db.src["songs.js"];
    const out = MetaStore.setMapEntry(base, "BEAT", id, beat);
    if (out !== base) { files["songs.js"] = out; changes.push(beat ? `BEAT：${beat[0]} BPM，第一小節 ${beat[1]}s，${beat[2] ? "可靠" : "不可靠"}` : "BEAT：移除"); }
  }
  return { files, changes, warnings };
}

// 新增一首歌（整理中）：songs.js 加一行、song-lyrics.js 加一筆空歌詞
export function addSong(o, db = load()) {
  const yt = String(o.yt || "").match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/|^)([\w-]{11})(?:[&?#]|$)/)?.[1];
  if (!/^[a-z0-9]+$/.test(o.id || "")) throw new Error("id 只能用小寫英文和數字，例如 shinka");
  if (!yt) throw new Error("--yt 要是 YouTube 網址或 11 碼 ID");
  if (!o.ja) throw new Error("要有 --ja（日文歌名）");
  if (!/^\d+:\d\d$/.test(o.len || "")) throw new Error("--len 要寫成 m:ss，例如 3:20");
  const date = o.date || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error("--date 要寫成 YYYY-MM-DD");
  if (db.songs.SONGS.some(s => s.yt === yt)) throw new Error(`這支影片已經在歌單裡了（${db.songs.SONGS.find(s => s.yt === yt).id}）`);
  const song = { id: o.id, ja: o.ja, zh: o.zh || o.ja, en: o.en || o.ro || o.ja, ro: o.ro || o.en || o.ja, date, yt, len: o.len, hold: true };
  if (o.cover) song.cover = true;
  const songsOut = MetaStore.addSong(db.src["songs.js"], song);
  const entry = { id: o.id, title: song.zh !== song.ja ? `${song.ja} (${song.zh})` : song.ja, youtubeId: yt, duration: lenToSec(o.len), lyrics: [] };
  const ly = LyricsStore.merge(db.src["song-lyrics.js"], entry);
  return {
    files: { "songs.js": songsOut, [ly.file]: ly.text },
    changes: [`新增〈${o.ja}〉（${o.id}，${yt}，${o.len}），狀態：整理中`, "song-lyrics.js 加一筆空歌詞"],
    warnings: ["還沒有歌詞：發布前要先匯入歌詞（lyrics-import）並對時"]
  };
}

// 改一首歌的歌詞：edits 是 [{ n, time?, by?, jp?, tr?, acts?, sing?, call?, how?, duration? }]，n 從 1 開始
export function editLines(id, edits, { live = false } = {}, db = load()) {
  const song = songOrThrow(db, id);
  const e = lyricsEntry(db, id, live);
  const changes = [];
  for (const ed of edits) {
    const l = e.lyrics[ed.n - 1];
    if (!l) throw new Error(`第 ${ed.n} 句不存在（共 ${e.lyrics.length} 句）`);
    const before = JSON.stringify(l);
    if (ed.time != null) l.time = round(typeof ed.time === "string" && /^[+-]/.test(ed.time) ? l.time + parseFloat(ed.time) : parseFloat(ed.time));
    if (ed.by != null) l.time = round(l.time + parseFloat(ed.by));
    for (const k of ["jp", "tr", "call", "how"]) if (ed[k] != null) { if (ed[k] === "") delete l[k]; else l[k] = ed[k]; }
    if (ed.duration != null) { if (ed.duration === "none" || ed.duration === "") delete l.duration; else l.duration = round(parseFloat(ed.duration)); }
    if (ed.acts != null) { const a = normActs(ed.acts); if (a.length) l.acts = a; else delete l.acts; }
    if (ed.sing != null) {
      const s = Array.isArray(ed.sing) ? ed.sing : ed.sing === "none" || ed.sing === "" ? [] : String(ed.sing).split(",").map(x => x.trim()).filter(Boolean);
      if (s.length) l.sing = s; else delete l.sing;
    }
    if (JSON.stringify(l) !== before) changes.push(`第 ${ed.n} 句：${describe(JSON.parse(before), l)}`);
  }
  return writeLyrics(e, song, live, db, changes);
}

// 整段平移：第 from 句到第 to 句都加 by 秒
export function shiftLines(id, { from = 1, to, by, live = false }, db = load()) {
  const e = lyricsEntry(db, id, live);
  const last = to ?? e.lyrics.length;
  const edits = [];
  for (let n = from; n <= last; n++) edits.push({ n, by });
  const r = editLines(id, edits, { live }, db);
  r.changes = r.changes.length ? [`第 ${from}–${last} 句時間 ${by > 0 ? "+" : ""}${by} 秒`] : [];
  return r;
}

// 整首換掉：lines 是 [{ time, jp, tr, acts?, sing?, call? }]，或「時間<Tab>日文<Tab>中文」的文字
export function importLyrics(id, input, { live = false, keepActs = false } = {}, db = load()) {
  const song = songOrThrow(db, id);
  // 現場版要先在對時工作台建好（需要演唱會名稱、影片），這裡只換歌詞
  const e = live ? lyricsEntry(db, id, true) : (() => { try { return lyricsEntry(db, id, false); } catch { return { id, title: song.ja, youtubeId: song.yt, duration: lenToSec(song.len), lyrics: [] }; } })();
  let lines = typeof input === "string" ? parseText(input) : input;
  if (!Array.isArray(lines)) lines = lines.lyrics;
  lines = lines.map(l => {
    const x = { time: round(+l.time), jp: l.jp || "", tr: l.tr || "" };
    for (const k of ["duration", "acts", "sing", "call", "how"]) if (l[k] != null && !(Array.isArray(l[k]) && !l[k].length)) x[k] = l[k];
    return x;
  });
  if (keepActs) lines.forEach((l, i) => { const o = e.lyrics[i]; if (o) for (const k of ["acts", "sing", "call", "how"]) if (o[k] && l[k] == null) l[k] = o[k]; });
  const old = e.lyrics.length;
  e.lyrics = lines;
  return writeLyrics(e, song, live, db, [`歌詞整首換掉：${old} 句 → ${lines.length} 句${keepActs ? "（保留同一行的應援）" : ""}`]);
}

function parseText(text) {
  return text.replace(/\r\n/g, "\n").split("\n").filter(s => s.trim()).map((row, i) => {
    const [t, jp, tr = ""] = row.split("\t");
    const time = /^\d+:\d/.test(t) ? t.split(":").reduce((a, b) => a * 60 + +b, 0) : parseFloat(t);
    if (!Number.isFinite(time) || jp == null) throw new Error(`第 ${i + 1} 行要寫成「時間<Tab>日文<Tab>中文」：${row}`);
    return { time, jp: jp.trim(), tr: tr.trim() };
  });
}

function writeLyrics(e, song, live, db, changes) {
  const { errors, warnings } = LyricsStore.validate(e, live ? null : song);
  if (errors.length) throw new Error(errors.slice(0, 15).join("\n"));
  const file = live ? "song-lyrics-live.js" : "song-lyrics.js";
  const r = LyricsStore.merge(db.src[file], e);
  return { files: r.unchanged ? {} : { [file]: r.text }, changes: r.unchanged ? [] : changes, warnings };
}

const round = v => Math.round(v * 1000) / 1000;
function describe(a, b) {
  const out = [];
  if (a.time !== b.time) out.push(`時間 ${a.time} → ${b.time}`);
  for (const k of ["jp", "tr", "call", "how"]) if (a[k] !== b[k]) out.push(`${k}「${b[k] ?? ""}」`);
  for (const k of ["acts", "sing"]) if (JSON.stringify(a[k] || []) !== JSON.stringify(b[k] || [])) out.push(`${k} ${(b[k] || []).join(",") || "（清空）"}`);
  if (a.duration !== b.duration) out.push(`duration ${b.duration ?? "（清空）"}`);
  return out.join("、");
}

// ── 寫入：先寫暫存檔再換名字；寫完自己再讀一次確認 ──
export function commit(result, { dryRun = false } = {}) {
  const names = Object.keys(result.files || {});
  if (dryRun || !names.length) return { ...result, written: [] };
  for (const name of names) {
    const file = path.join(root, name), tmp = `${file}.studio-tmp`;
    fs.writeFileSync(tmp, result.files[name]);
    try { fs.renameSync(tmp, file); } catch { fs.writeFileSync(file, result.files[name]); fs.rmSync(tmp, { force: true }); }
  }
  return { ...result, written: names };
}

// ── 檢查、git：介面的「發布」「同步」按鈕和命令列共用 ──
export const PUBLISH_BRANCH = process.env.STUDIO_BRANCH || "main"; // 發布只從這個分支推
const BRANCH = PUBLISH_BRANCH;
// 發布時會一起 commit 的路徑（其他檔案有改也不會被帶進去）
export const PUBLISH_PATHS = ["songs.js", "i18n.js", "song-lyrics.js", "song-lyrics-live.js", "research"];

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
export async function runChecks() {
  const steps = [];
  for (const [name, script] of [["資料檢查", "scripts/check-data.mjs"], ["卡拉OK測試", "scripts/test-karaoke.mjs"]]) {
    const r = await node(script);
    steps.push({ name, ok: r.code === 0, out: r.out.split("\n").slice(-40).join("\n") });
    if (r.code !== 0) break;
  }
  return { ok: steps.every(s => s.ok), steps };
}

export async function gitStatus() {
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
export async function publish(message) {
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
export async function sync() {
  const { branch } = await gitStatus();
  if (branch !== BRANCH) return { ok: false, error: `目前在「${branch}」分支，不是 ${BRANCH}。` };
  const r = await git("pull", "--rebase", "--autostash", "origin", BRANCH);
  if (r.code !== 0) { await git("rebase", "--abort"); return { ok: false, error: "同步失敗，請手動處理。", out: r.out }; }
  return { ok: true, out: r.out };
}

// 工作站自己的提醒（不擋發布）：例如有歌還沒有歌詞
export function notes(db = load()) {
  return db.songs.SONGS.filter(s => !(db.lyrics.find(x => x.id === s.id)?.lyrics.length)).map(s => `〈${s.ja}〉（${s.id}）還沒有歌詞，發布後網站會有一首沒歌詞的歌`);
}

export async function check() {
  return { ...(await runChecks()), notes: notes() };
}

// ── M1：從 YouTube 匯入新歌 ──
// 只認頻道「上傳」的字幕（info.subtitles），不收 YouTube 自動產生／自動翻譯的（automatic_captions）
const STUDIO_PY = path.join(here, "py");
export const WORK = path.join(here, "work");
const SUB_LANGS = { ja: ["ja", "ja-JP"], zh: ["zh-Hant", "zh-TW", "zh-HK"], zhHans: ["zh-Hans", "zh-CN", "zh"], en: ["en", "en-US", "en-GB"] };

export function studioConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(here, "config.json"), "utf8")); } catch { return {}; }
}

// yt-dlp 從哪裡叫：config.json 的 ytdlp → 工作站的 Python 環境（uv）→ PATH 上的 yt-dlp
export function ytdlpCommand() {
  const cfg = studioConfig().ytdlp;
  if (Array.isArray(cfg) && cfg.length) return cfg;
  if (fs.existsSync(path.join(STUDIO_PY, ".venv"))) return ["uv", "run", "--project", STUDIO_PY, "yt-dlp"];
  return ["yt-dlp"];
}

function runSplit(cmd, args, { onLog } = {}) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: root, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => { err += d; onLog?.(String(d)); });
    p.on("error", e => resolve({ code: -1, out, err: err + e.message }));
    p.on("close", code => resolve({ code, out, err }));
  });
}

async function ytdlp(args, opts) {
  const [cmd, ...pre] = ytdlpCommand();
  // YouTube 要跑 JS 驗證：用工作站自己的 Node，不用另外裝 deno
  const r = await runSplit(cmd, [...pre, "--js-runtimes", `node:${process.execPath}`, "--no-playlist", "--no-progress", ...args], opts);
  if (r.code !== 0) {
    const tail = r.err.trim().split("\n").slice(-6).join("\n");
    throw new Error(`yt-dlp 失敗（${r.code}）：\n${tail}\n\n常見原因：網路、影片不公開，或 yt-dlp 太舊（更新：uv lock --upgrade-package yt-dlp --project tools/studio/py && uv sync --project tools/studio/py）`);
  }
  return r;
}

export const youtubeId = url => String(url || "").match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/|\/live\/|^)([\w-]{11})(?:[&?#/]|$)/)?.[1] || null;

// 影片標題 → 日文歌名：拿掉【Ado】、Ado -、(Music Video)、MV 這些；「歌ってみた」視為翻唱
export function cleanTitle(title) {
  let t = String(title || "");
  const cover = /歌ってみた|歌いました|cover/i.test(t);
  const extra = [];
  const NOISE = /ado|music\s*video|\bmv\b|official|lyric|歌ってみた|歌いました|cover/i;
  const TIE = /主題歌|主題曲|挿入歌|\bOP\b|\bED\b|\bCM\b|テーマ|タイアップ|from |ドラマ|映画|アニメ/i;
  // 【Ado】【歌ってみた】這類標記拿掉；其他【】當補充資訊
  t = t.replace(/【([^】]*)】/g, (m, inner) => (NOISE.test(inner) ? " " : (extra.push(inner.trim()), " ")));
  // 括號：MV／Official 之類拿掉，主題曲之類當補充資訊
  t = t.replace(/[(（[［]([^)）\]］]*)[)）\]］]/g, (m, inner) => {
    if (NOISE.test(inner)) return " ";
    if (TIE.test(inner)) { extra.push(inner.trim()); return " "; }
    return m;
  });
  t = t.replace(/歌ってみた|歌いました/g, " ").replace(/\b(Official\s+)?(Music\s+Video|MV|Lyric\s+Video)\b/gi, " ");
  // Ado『曲名』／Ado「曲名」：曲名在引號裡
  const q = t.match(/[『「]([^』」]+)[』」]/);
  if (q && /^\s*(Ado)?\s*$/i.test(t.replace(q[0], ""))) t = q[1];
  t = t.replace(/^\s*Ado\s*[-–—|｜:：/／]?\s+/i, "").replace(/\s*[-–—|｜/／]\s*Ado\s*$/i, "");
  t = t.replace(/\s+/g, " ").replace(/^[\s\-–—|｜/／:：]+|[\s\-–—|｜/／:：]+$/g, "").trim();
  return { ja: t, cover, extra };
}

const toSec = s => s.split(":").reduce((a, b) => a * 60 + parseFloat(b), 0);
const r2 = v => Math.round(v * 100) / 100;

// WebVTT → [{ start, end, text }]；拿掉標籤、♪，相同文字連續的 cue 合成一個
export function parseVtt(text) {
  const cues = [];
  for (const block of String(text).replace(/\r/g, "").split(/\n{2,}/)) {
    const rows = block.split("\n");
    const i = rows.findIndex(l => l.includes("-->"));
    if (i < 0) continue;
    const [a, z] = rows[i].split("-->").map(x => toSec(x.trim().split(/\s+/)[0]));
    const t = rows.slice(i + 1).join(" ")
      .replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
      .replace(/[♪♫]/g, "").replace(/\s+/g, " ").trim();
    if (!t || !Number.isFinite(a) || !Number.isFinite(z)) continue;
    const prev = cues[cues.length - 1];
    if (prev && prev.text === t && a - prev.end < 0.3) prev.end = z;
    else cues.push({ start: a, end: z, text: t });
  }
  return cues;
}

// 官方日文字幕 → 歌詞；中文字幕依時間重疊對到每一句；空檔超過 6 秒補（間奏）／（尾奏）
export function lyricsFromSubs(ja, zh, duration) {
  const lines = [], trFrom = [];
  ja.forEach((c, k) => {
    let best = null, bestOv = 0;
    for (const z of zh || []) {
      const ov = Math.min(c.end, z.end) - Math.max(c.start, z.start);
      if (ov > bestOv) { bestOv = ov; best = z; }
    }
    const ok = best && bestOv >= 0.3 * Math.min(c.end - c.start, best.end - best.start);
    lines.push({ time: r2(c.start), jp: c.text, tr: ok ? best.text : "" });
    trFrom.push(ok ? "official" : null);
    const next = ja[k + 1], until = next ? next.start : duration;
    if (until - c.end > 6) {
      lines.push({ time: r2(c.end), jp: next ? "（間奏）" : "（尾奏）", tr: "", duration: r2(until - c.end) });
      trFrom.push(null);
    }
  });
  return { lines, trFrom };
}

// 貼網址 → 新增一首「整理中」的歌：歌曲資料用影片資訊，歌詞用官方字幕（有的話），音訊存到 work/<id>/
export async function fetchSong(url, o = {}, { dryRun = false, onLog = () => {} } = {}) {
  const vid = youtubeId(url);
  if (!vid) throw new Error("不是 YouTube 網址");
  const db = load();
  const dup = db.songs.SONGS.find(s => s.yt === vid);
  if (dup) throw new Error(`這支影片已經在歌單裡了：〈${dup.ja}〉（${dup.id}）`);
  const link = `https://www.youtube.com/watch?v=${vid}`;

  onLog("讀取影片資訊…\n");
  const info = JSON.parse((await ytdlp(["-J", "--skip-download", link])).out);
  const t = cleanTitle(info.title);
  const ja = o.ja || t.ja;
  const id = o.id || (/^[\x20-\x7e]+$/.test(ja) ? ja.toLowerCase().replace(/[^a-z0-9]/g, "") : "");
  if (!id) throw new Error(`歌名「${ja}」不是英文，請用 --id 指定網址用的英文 id（小寫英文和數字），例如 --id shinka`);
  if (db.songs.SONGS.some(s => s.id === id)) throw new Error(`id「${id}」已經有人用了`);
  const duration = Math.round(info.duration || 0);
  if (!duration) throw new Error("讀不到影片長度");
  const len = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, "0")}`;
  const d = info.release_date || info.upload_date || "";
  const date = /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : undefined;

  const dir = path.join(WORK, id);
  fs.mkdirSync(dir, { recursive: true });
  const keep = ["id", "title", "channel", "channel_id", "uploader", "duration", "upload_date", "release_date", "description", "webpage_url"];
  fs.writeFileSync(path.join(dir, "info.json"), JSON.stringify({ ...Object.fromEntries(keep.map(k => [k, info[k]])), subtitles: Object.keys(info.subtitles || {}), automatic_captions: Object.keys(info.automatic_captions || {}).length }, null, 2));

  // 頻道上傳的字幕
  const have = Object.keys(info.subtitles || {});
  const pick = Object.fromEntries(Object.entries(SUB_LANGS).map(([k, list]) => [k, list.find(l => have.includes(l)) || null]));
  const want = Object.values(pick).filter(Boolean);
  const cues = {};
  if (want.length) {
    onLog(`下載官方字幕：${want.join("、")}…\n`);
    await ytdlp(["--skip-download", "--write-subs", "--sub-langs", want.join(","), "--sub-format", "vtt", "-o", path.join(dir, "sub.%(ext)s"), link]);
    for (const [k, lang] of Object.entries(pick)) {
      const f = path.join(dir, `sub.${lang}.vtt`);
      if (lang && fs.existsSync(f)) cues[k] = parseVtt(fs.readFileSync(f, "utf8"));
    }
  }

  let audio = null;
  if (!dryRun && !o.noAudio) {
    onLog("下載音訊…\n");
    await ytdlp(["-f", "bestaudio", "-o", path.join(dir, "audio.%(ext)s"), link]);
    audio = fs.readdirSync(dir).find(f => f.startsWith("audio.")) || null;
  }

  // 歌曲＋歌詞（同一次寫入）
  const add = addSong({ id, yt: vid, ja, zh: o.zh, en: o.en, ro: o.ro, len, date, cover: o.cover ?? t.cover }, db);
  const changes = [...add.changes], warnings = [];
  const files = { ...add.files };
  let trFrom = [], builtLines = [];
  if (cues.ja?.length) {
    const built = lyricsFromSubs(cues.ja, cues.zh, duration);
    builtLines = built.lines;
    trFrom = built.trFrom;
    const db2 = loadFrom({ ...db.src, ...files });
    const imp = importLyrics(id, built.lines, {}, db2);
    Object.assign(files, imp.files);
    const nTr = trFrom.filter(Boolean).length, nJp = built.lines.filter(l => !/^（.*）$/.test(l.jp)).length;
    changes.splice(changes.indexOf("song-lyrics.js 加一筆空歌詞"), 1, `歌詞：官方日文字幕 ${nJp} 句${cues.zh ? `，官方中文對上 ${nTr} 句` : ""}`);
    if (!cues.zh) warnings.push(`沒有官方繁中字幕${cues.zhHans ? "（有簡中，可以參考）" : ""}：之後用 agy 翻（M3），或自己補`);
    else if (nTr < nJp) warnings.push(`有 ${nJp - nTr} 句沒對到官方中文`);
  } else {
    warnings.push("沒有官方日文字幕：用 lyrics-import 貼歌詞，之後 M3 會自動對時");
  }
  if (t.extra.length) warnings.push(`標題裡的其他資訊（可以寫進「合作」）：${t.extra.join("、")}`);

  // 有音訊就順便分析：新歌還沒有 BEAT／CLIMAX，直接填建議值（失敗不影響匯入）
  if (audio) {
    try {
      const a = await runAnalysis(id, { onLog });
      const cc = pickClimax(builtLines.length ? lyricClimax(builtLines, duration) : [], a.climaxAudio);
      let src = files["songs.js"];
      src = MetaStore.setMapEntry(src, "BEAT", id, [a.bpm, a.firstBar, a.barKnown ? 1 : 0]);
      if (cc[0] && cc[0].t > 0 && cc[0].t <= duration) src = MetaStore.setMapEntry(src, "CLIMAX", id, cc[0].t);
      files["songs.js"] = src;
      changes.push(`拍點：${a.bpm} BPM，第一小節 ${a.firstBar} 秒${a.barKnown ? "" : "（第一拍不確定）"}${cc[0] ? `；副歌高潮 ${fmtTime(cc[0].t)}（${cc[0].from}）` : ""}`);
      if (a.beat.octaveUncertain) warnings.push(`速度也可能是 ${a.beat.alternatives.map(x => x.bpm).join(" 或 ")}：到「歌曲資料」→ 分析音訊改選（命令列：analyze ${id} --bpm）`);
      if (!a.beat.reliable) warnings.push("拍點不太穩，BPM 要人確認（「歌曲資料」→ 分析音訊看細節）");
    } catch (e) {
      warnings.push(`音訊分析失敗（匯入照常完成）：${e.message.split("\n")[0]}`);
    }
  }

  const summary = { url: link, id, ja, title: info.title, channel: info.channel, len, date, subs: pick, audio, at: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, "fetch.json"), JSON.stringify({ ...summary, trFrom }, null, 2));
  return { files, changes, warnings, summary };
}

// ── M2：拍點、BPM、段落、副歌高潮 ──
// 音訊分析在 py/analyze.py（librosa）；這裡負責叫它、加上歌詞的線索、比對現有資料、寫回 BEAT／CLIMAX

// Python 從哪裡叫：config.json 的 python → 工作站的 Python 環境（uv）→ python3
export function pythonCommand() {
  const cfg = studioConfig().python;
  if (Array.isArray(cfg) && cfg.length) return cfg;
  if (fs.existsSync(path.join(STUDIO_PY, ".venv"))) return ["uv", "run", "--project", STUDIO_PY, "python"];
  return [process.platform === "win32" ? "python" : "python3"];
}

export function audioFile(id) {
  const dir = path.join(WORK, id);
  const f = fs.existsSync(dir) && fs.readdirSync(dir).find(x => /^audio\./.test(x) && !/\.part$/.test(x));
  return f ? path.join(dir, f) : null;
}

// 已經在歌單裡的歌，補下載音訊（分析、bench 用）
export async function fetchAudio(id, { onLog = () => {} } = {}) {
  const s = songOrThrow(load(), id);
  if (audioFile(id)) return audioFile(id);
  const dir = path.join(WORK, id);
  fs.mkdirSync(dir, { recursive: true });
  onLog(`下載〈${s.ja}〉的音訊…\n`);
  await ytdlp(["-f", "bestaudio", "-o", path.join(dir, "audio.%(ext)s"), `https://www.youtube.com/watch?v=${s.yt}`]);
  return audioFile(id);
}

// 跑音訊分析（有快取：音訊沒變、分析程式版本一樣就直接讀）
export async function runAnalysis(id, { fresh = false, onLog = () => {} } = {}) {
  const audio = audioFile(id);
  if (!audio) throw new Error(`還沒有 ${id} 的音訊：先跑 fetch-audio ${id}（要能連 YouTube）`);
  const out = path.join(WORK, id, "analysis.json");
  if (!fresh && fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(audio).mtimeMs) {
    try { const a = JSON.parse(fs.readFileSync(out, "utf8")); if (a.version === ANALYSIS_VERSION) return a; } catch {}
  }
  onLog("分析音訊（拍點、段落）…\n");
  const [cmd, ...pre] = pythonCommand();
  const r = await runSplit(cmd, [...pre, path.join(STUDIO_PY, "analyze.py"), audio, "--out", out]);
  if (r.code !== 0) throw new Error(`音訊分析失敗：\n${(r.err || r.out).trim().split("\n").slice(-8).join("\n")}`);
  return JSON.parse(fs.readFileSync(out, "utf8"));
}
const ANALYSIS_VERSION = 1;

// 歌詞找「最後一次副歌開頭」：後半段裡，跟前面某段連續重複最長的那句（最多三個候選）
// 用現有 78 首的 CLIMAX 量過：第一個候選對（差 1.5 秒內）60%，前三個裡有對的 77%
const normLine = s => String(s).replace(/[（(][^）)]*[）)]/g, "").replace(/[\s、。，,.!！?？…~〜ー\-「」『』"'’()]/g, "").toLowerCase();
export function lyricClimax(lines, duration) {
  const L = lines.map(l => ({ time: l.time, jp: l.jp, k: normLine(l.jp) })).filter(l => l.k);
  const same = (a, b) => a.k === b.k || (a.k.length >= 8 && a.k.slice(0, 8) === b.k.slice(0, 8));
  const n = L.length, cands = [];
  for (let c = 1; c < n; c++) {
    if (L[c].time < 0.55 * duration) continue;
    let run = 0;
    for (let j = 0; j < c; j++) { let m = 0; while (c + m < n && j + m < c && same(L[j + m], L[c + m])) m++; run = Math.max(run, m); }
    if (run >= 1) cands.push({ t: L[c].time, run, line: L[c].jp });
  }
  cands.sort((a, b) => b.run - a.run || b.t - a.t);
  const uniq = [];
  for (const x of cands) if (!uniq.some(u => Math.abs(u.t - x.t) < 5)) uniq.push(x);
  return uniq.slice(0, 3);
}

// 歌詞和音訊的候選合在一起：3 秒內算同一個，分數相加；有歌詞的用那句的開始時間
export function pickClimax(lyricC, audioC) {
  const all = [
    ...lyricC.map((c, i) => ({ t: c.t, score: 3 - i, from: "歌詞", note: c.line })),
    ...(audioC || []).slice(0, 3).map((c, i) => ({ t: c.t, score: i === 0 ? 2 : 1, from: "音訊", note: c.why }))
  ];
  const groups = [];
  for (const c of all) {
    const g = groups.find(g => Math.abs(g.t - c.t) < 3);
    if (g) { g.score += c.score; g.from.add(c.from); g.notes.push(c.note); if (c.from === "歌詞" && !g.lyric) { g.t = c.t; g.lyric = true; } }
    else groups.push({ t: c.t, score: c.score, from: new Set([c.from]), notes: [c.note], lyric: c.from === "歌詞" });
  }
  groups.sort((a, b) => b.score - a.score || b.t - a.t);
  return groups.map(g => ({ t: Math.round(g.t * 100) / 100, score: g.score, from: [...g.from].join("＋"), note: g.notes.filter(Boolean).join("／") }));
}

// 分析一首歌：回傳建議的 BEAT、CLIMAX、和現有資料的比較；apply 時寫回（現有值要 overwrite 才蓋）
export async function analyze(id, { apply = false, overwrite = false, only, bpm: chooseBpm, climax: chooseClimax, fresh = false, onLog } = {}, db = load()) {
  const s = songOrThrow(db, id);
  const a = await runAnalysis(id, { fresh, onLog });
  const l = db.lyrics.find(x => x.id === id);
  const lyricC = l && l.lyrics.length ? lyricClimax(l.lyrics, l.duration) : [];
  const climaxC = pickClimax(lyricC, a.climaxAudio);

  // 選用的速度：預設分析結果，也可以指定備選（例如兩倍速）
  let pick = { bpm: a.bpm, firstBar: a.firstBar, barKnown: a.barKnown };
  if (chooseBpm != null) {
    const alt = [pick, ...a.beat.alternatives].find(x => Math.abs(x.bpm - Number(chooseBpm)) < 0.6);
    if (!alt) throw new Error(`沒有 ${chooseBpm} BPM 這個選項；可以選：${[a.bpm, ...a.beat.alternatives.map(x => x.bpm)].join("、")}`);
    pick = alt;
  }
  const beat = [pick.bpm, pick.firstBar, pick.barKnown ? 1 : 0];
  const climax = chooseClimax != null ? Math.round(Number(chooseClimax) * 100) / 100 : climaxC[0]?.t ?? null;
  const cur = { beat: db.songs.BEAT[id] || null, climax: db.songs.CLIMAX[id] ?? null };

  const result = {
    id, ja: s.ja,
    suggest: { beat, climax },
    current: cur,
    beat: { ...a.beat, bpm: a.bpm, firstBar: a.firstBar, barKnown: a.barKnown },
    climaxCandidates: climaxC,
    sections: a.sections,
    files: {}, changes: [], warnings: []
  };
  if (!a.beat.reliable) result.warnings.push(`拍點不太穩（${Math.round(a.beat.inliers * 100)}% 的拍落在格子上，平均差 ${a.beat.rmsMs} 毫秒）：可能有變速、或是抒情歌，BPM 要人確認`);
  if (a.beat.octaveUncertain) result.warnings.push(`速度可能是 ${[a.bpm, ...a.beat.alternatives.map(x => x.bpm)].join(" 或 ")}（鼓的打法分不太出來）${a.beat.octavePick ? "，依小節第一拍最明顯的那個選了 " + a.bpm : ""}；不對的話改選另一個（命令列：--bpm）`);
  if (!pick.barKnown) result.warnings.push("小節第一拍不確定：BEAT 第三個值寫 0，網站只打拍、不標第一拍");

  if (apply) {
    let src = db.src["songs.js"];
    const setIf = (name, val, label, old) => {
      if (val == null) return;
      if (old != null && !overwrite) { if (JSON.stringify(old) !== JSON.stringify(val)) result.warnings.push(`${label} 已經有值（${JSON.stringify(old)}），沒有蓋掉；要蓋掉加 --overwrite`); return; }
      const next = MetaStore.setMapEntry(src, name, id, val);
      if (next !== src) { result.changes.push(`${label}：${old != null ? JSON.stringify(old) + " → " : ""}${JSON.stringify(val)}`); src = next; }
    };
    if (only !== "climax") setIf("BEAT", beat, "BEAT", cur.beat);
    if (only === "beat") { /* 只寫 BEAT */ }
    else if (climax != null && !(climax > 0 && climax <= lenToSec(s.len))) result.warnings.push(`副歌高潮 ${climax} 不在 MV 長度內，沒有寫入`);
    else setIf("CLIMAX", climax, "副歌高潮", cur.climax);
    if (src !== db.src["songs.js"]) result.files["songs.js"] = src;
  }
  return result;
}

// 拿現有（人工調好的）BEAT／CLIMAX 對答案，量分析準不準
export async function bench(ids, { download = false, fresh = false, onLog = () => {} } = {}) {
  const db = load();
  const list = (ids && ids.length ? ids : db.songs.SONGS.map(s => s.id)).filter(id => db.songs.BEAT[id] || db.songs.CLIMAX[id] != null);
  const rows = [];
  for (const id of list) {
    try {
      if (!audioFile(id)) { if (!download) { rows.push({ id, skip: "沒有音訊" }); continue; } await fetchAudio(id, { onLog }); }
      onLog(`[${rows.length + 1}/${list.length}] ${id}\n`);
      const r = await analyze(id, { fresh }, db);
      const row = { id, got: r.suggest.beat, want: r.current.beat, climax: r.suggest.climax, climaxWant: r.current.climax };
      const [wb, wf, wk] = r.current.beat || [];
      if (wb) {
        const [gb, gf] = r.suggest.beat;
        const near = (x, y) => Math.abs(x - y) / y < 0.01;
        row.bpm = near(gb, wb) ? "ok" : near(gb * 2, wb) || near(gb / 2, wb) ? "octave" : "wrong";
        row.bpmInAlts = row.bpm === "ok" || r.beat.alternatives.some(x => near(x.bpm, wb));
        if (row.bpm === "ok") {
          const P = 60 / wb, bar = 4 * P, mod = (x, m) => ((x % m) + m) % m;
          row.phaseMs = Math.round((mod(gf - wf + P / 2, P) - P / 2) * 1000);
          if (wk) row.bar = Math.abs(mod(gf - wf + bar / 2, bar) - bar / 2) < 0.06 ? "ok" : "wrong";
        }
      }
      if (r.current.climax != null) {
        const lyr = r.climaxCandidates.find(c => c.from.includes("歌詞"));
        row.climaxOk = r.suggest.climax != null && Math.abs(r.suggest.climax - r.current.climax) <= 1.5;
        row.climaxTop3 = r.climaxCandidates.slice(0, 3).some(c => Math.abs(c.t - r.current.climax) <= 1.5);
        row.climaxLyricOnly = !!lyr && Math.abs(lyricClimax(db.lyrics.find(x => x.id === id).lyrics, db.lyrics.find(x => x.id === id).duration)[0]?.t - r.current.climax) <= 1.5;
      }
      rows.push(row);
    } catch (e) { rows.push({ id, error: e.message.split("\n")[0] }); }
  }
  const done = rows.filter(r => !r.skip && !r.error);
  const cnt = f => done.filter(f).length;
  const phases = done.map(r => r.phaseMs).filter(v => v != null).sort((a, b) => a - b);
  const summary = {
    songs: done.length, skipped: rows.filter(r => r.skip).length, errors: rows.filter(r => r.error).length,
    bpm: { ok: cnt(r => r.bpm === "ok"), octave: cnt(r => r.bpm === "octave"), wrong: cnt(r => r.bpm === "wrong"), inAlternatives: cnt(r => r.bpmInAlts) },
    beatPhase: { within50ms: phases.filter(v => Math.abs(v) <= 50).length, of: phases.length, medianMs: phases.length ? phases[Math.floor(phases.length / 2)] : null },
    bar: { ok: cnt(r => r.bar === "ok"), of: cnt(r => r.bar) },
    climax: { ok: cnt(r => r.climaxOk), top3: cnt(r => r.climaxTop3), lyricOnly: cnt(r => r.climaxLyricOnly), of: cnt(r => r.climaxOk != null) }
  };
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, "bench.json"), JSON.stringify({ at: new Date().toISOString(), summary, rows }, null, 2));
  return { summary, rows };
}
