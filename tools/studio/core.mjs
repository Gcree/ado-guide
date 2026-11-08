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
  const src = Object.fromEntries(FILES.map(f => [f, read(f)]));
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
