// 每首歌的最後更新日（給 sitemap 的 lastmod 和結構化資料的 dateModified）
// 用 git blame 看這首歌在 songs.js 那一行、song-lyrics.js 和 song-lyrics-live.js 那一段，取最晚一次 commit 的日期。
// 只有那首歌的資料真的改了日期才會變，Google 才會相信 lastmod；換版型、改別首歌都不影響。
// 沒算進去：songs.js 裡多首共用的對照表（PEN、UT 這種一行列很多首的），改其中一首會讓整行的日期變，分不出是哪首。
// 拿不到歷史（不是 git、或 GitHub Actions 只抓了最新一個 commit）就回傳 null，由呼叫的人改用網站更新日。
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });

// commit 當地的日期（照 commit 時的時區，跟 CHANGELOG 寫的日期一致）
function localDate(epoch, tz) {
  const m = /^([+-])(\d\d)(\d\d)$/.exec(tz || "+0000");
  const off = m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
  return new Date((epoch + off * 60) * 1000).toISOString().slice(0, 10);
}

// 每一行最後被哪次 commit 改的日期；還沒 commit 的行是 null（當成今天）
function blameDates(root, file) {
  if (!fs.existsSync(path.join(root, file))) return [];
  const out = git(root, ["blame", "--line-porcelain", "--", file]);
  const commits = {}, dates = [];
  let sha = null;
  for (const line of out.split("\n")) {
    const head = /^([0-9a-f]{40}) \d+ \d+/.exec(line);
    if (head) { sha = head[1]; commits[sha] = commits[sha] || {}; continue; }
    if (line.startsWith("committer-time ")) commits[sha].time = +line.slice(15);
    else if (line.startsWith("committer-tz ")) commits[sha].tz = line.slice(13);
    else if (line.startsWith("\t")) {
      const c = commits[sha];
      dates.push(/^0+$/.test(sha) ? null : localDate(c.time, c.tz));
    }
  }
  return dates;
}

const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

export function songLastmod(root, ids) {
  try {
    if (git(root, ["rev-parse", "--is-shallow-repository"]).trim() === "true") return null;
  } catch { return null; }
  const today = new Date().toISOString().slice(0, 10);
  const result = Object.fromEntries(ids.map(id => [id, null]));
  const touch = (id, d) => { if (id in result) result[id] = later(result[id], d === null ? today : d); };

  // songs.js：一首一行（{ id: "xxx", ... }）
  const songsLines = fs.readFileSync(path.join(root, "songs.js"), "utf8").split("\n");
  const songsDates = blameDates(root, "songs.js");
  songsLines.forEach((l, i) => {
    const m = /^\s*\{ id: "([^"]+)"/.exec(l);
    if (m) touch(m[1], songsDates[i]);
  });

  // 歌詞：每首從 "id": "xxx" 那行開始，到下一首的 "id" 前一行；現場版的 id 是 xxx-live
  for (const file of ["song-lyrics.js", "song-lyrics-live.js"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split("\n"), dates = blameDates(root, file);
    let cur = null;
    lines.forEach((l, i) => {
      const m = /^ {4}"id": "([^"]+)"/.exec(l);
      if (m) cur = m[1].replace(/-live$/, "");
      if (cur) touch(cur, dates[i]);
    });
  }
  return result;
}
