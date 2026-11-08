#!/usr/bin/env node
// 工作站的命令列：介面上能做的事，這裡都能用一行指令做（給人用，也給 Claude 用）
// 跟介面用同一套 core.mjs，所以檢查、寫入規則完全一樣。說明：node tools/studio/cli.mjs help
import fs from "node:fs";
import * as core from "./core.mjs";

const HELP = `新歌工作站命令列：node tools/studio/cli.mjs <指令> [參數]

  共通參數：--dry-run 只顯示會改什麼、不寫入；--json 輸出 JSON（給程式／Claude 讀）

查看
  list [--status ok|sug|free|hold]          歌單（id、歌名、狀態、句數、BPM、副歌高潮、手燈）
  show <id>                                 一首歌的完整資料、歌詞統計、情報包、分析快取
  lyrics <id> [--from N] [--to M] [--live]  逐句列出（編號、時間、日文、中文、應援）

新增
  fetch <YouTube 網址> [--id <id>] [--ja 歌名] [--zh 中文] [--en 英文] [--ro 羅馬拼音] [--cover] [--no-audio]
                                            貼網址匯入新歌：讀影片資訊、官方日文／繁中字幕當歌詞初稿、音訊存到 tools/studio/work/<id>/
                                            日文歌名要給 --id（網址用的英文）；--dry-run 只下載資訊和字幕來看，不改歌單
  add --id <id> --yt <網址或ID> --ja <日文歌名> --len m:ss [--zh 中文] [--en 英文] [--ro 羅馬拼音] [--date YYYY-MM-DD] [--cover]
                                            新增一首「整理中」的歌（songs.js＋空的歌詞）

拍點與副歌高潮（音訊分析）
  analyze <id> [--apply] [--overwrite] [--bpm 195] [--climax 148.08] [--fresh]
                                            從 work/<id>/ 的音訊算 BPM、第一小節、段落、副歌高潮候選，和現有資料比較
                                            --apply 寫進 BEAT／CLIMAX（已經有值要加 --overwrite）；--bpm 選兩倍／一半速度的備選
  fetch-audio <id>                          已經在歌單裡的歌，補下載音訊
  bench [id …] [--download] [--fresh]       拿現有的 BEAT／CLIMAX 對答案，量分析準不準（結果存 tools/studio/work/bench.json）

歌曲資料
  meta <id> [--status ok|sug|free|hold] [--acts clap,wave|none] [--tips "重點1|重點2"] [--tips-en "…|…"] [--tips-ja "…|…"]
            [--pen 赤白|?赤白|none] [--climax 148.08|none] [--live-yt <ID|none>] [--live-concert "名稱"] [--beat 195,0.124,1|none]
                                            手燈色開頭加 ? ＝ 預測（網站不顯示）

歌詞
  line <id> <N> [--time 12.3|+0.05|-0.1] [--jp …] [--tr …] [--acts call,sing|none] [--sing 字1,字2|none] [--call …] [--how …] [--duration 秒|none] [--live]
                                            改第 N 句（從 1 開始）
  lines <id> --file edits.json [--live]     一次改很多句；edits.json＝[{"n":3,"tr":"…","acts":["clap"]}, …]（--file - 從標準輸入讀）
  shift <id> --by 0.3 [--from N] [--to M] [--live]
                                            整段平移時間
  lyrics-import <id> --file 歌詞.json|.tsv [--keep-acts] [--live]
                                            整首換掉；.tsv 每行「時間<Tab>日文<Tab>中文」，.json 是 [{time,jp,tr,…}]

檢查與發布
  check                                     資料檢查＋卡拉OK測試＋工作站提醒
  status                                    git：目前分支、歌曲資料有哪些變更
  sync                                      從 GitHub 拉最新（只能在 main）
  publish -m "commit 訊息"                  檢查 → 只 commit 歌曲資料 → 推上 main

應援動作：${core.ACTS.join(", ")}
手燈色：${core.PEN_KEYS.join("")}（青 水 白 赤 桃 紫 橙 黄 緑 彩）
`;

// ── 參數 ──
function parse(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-m") { opt.m = argv[++i]; continue; }
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || (next.startsWith("--") && !/^--?\d/.test(next))) opt[key] = true;
    else { opt[key] = next; i++; }
  }
  return { pos, opt };
}

const readInput = f => (f === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(f, "utf8"));
const need = (v, msg) => { if (v == null || v === true) throw new Error(msg); return v; };
const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${name} 要是數字（收到 ${v}）`); return n; };

// ── 輸出 ──
function out(opt, data, text) {
  if (opt.json) console.log(JSON.stringify(data, null, 2));
  else console.log(text);
}

function report(opt, r) {
  const data = { ok: true, dryRun: !!opt.dryRun, changes: r.changes, warnings: r.warnings || [], written: r.written || [] };
  const lines = [];
  if (!r.changes.length) lines.push("沒有變更。");
  else lines.push(...r.changes.map(c => `• ${c}`));
  (r.warnings || []).forEach(w => lines.push(`提醒：${w}`));
  if (r.changes.length) lines.push(opt.dryRun ? "（--dry-run：沒有寫入）" : `已寫入：${r.written.join("、")}。記得 check，再 publish 或 commit。`);
  out(opt, data, lines.join("\n"));
}

const STATUS = { "": "正式", sug: "暫定", free: "自由", hold: "整理中" };
const pad = (s, n) => { s = String(s); const w = [...s].reduce((a, c) => a + (/[ᄀ-￿]/.test(c) ? 2 : 1), 0); return s + " ".repeat(Math.max(0, n - w)); };

async function main() {
  const { pos, opt } = parse(process.argv.slice(2));
  const [cmd, id, arg2] = pos;
  const write = r => report(opt, core.commit(r, { dryRun: !!opt.dryRun }));

  switch (cmd) {
    case undefined: case "help": case "-h": console.log(HELP); return;

    case "list": {
      const rows = core.list(undefined, { status: opt.status === true ? undefined : opt.status });
      return out(opt, rows, rows.map(r => `${pad(r.id, 14)}${pad(STATUS[r.status], 8)}${pad(r.lines + " 句", 8)}${pad(r.bpm ? r.bpm + " BPM" : "—", 11)}${pad(r.pen || "—", 6)}${r.ja}${r.cover ? "（翻唱）" : ""}`).join("\n") + `\n共 ${rows.length} 首`);
    }

    case "show": {
      const s = core.show(need(id, "要給 id，例如 show shinka"));
      return out(opt, s, [
        `〈${s.ja}〉${s.id}　${s.statusName}${s.cover ? "・翻唱" : ""}`,
        `MV ${s.yt}　長度 ${s.len}　發布 ${s.date}`,
        `應援動作：${s.acts.join(", ") || "—"}`,
        `應援重點：${s.tips.map(t => t.zh).join("／") || "—"}`,
        `手燈：${s.pen || "—"}${s.penGuess ? "（預測，不顯示）" : ""}　副歌高潮：${s.climax ?? "—"}　BEAT：${s.beat ? s.beat.join(", ") : "—"}`,
        `LIVE 映像：${s.liveVideo ? `${s.liveVideo.concert}（${s.liveVideo.yt}）` : "—"}`,
        `歌詞：${s.lyrics.lines} 句，沒翻譯 ${s.lyrics.noTranslation} 句，有逐句應援 ${s.lyrics.withActs} 句${s.live ? `；現場版 ${s.live.lines} 句` : ""}`,
        `情報包：${s.research || "—"}　分析快取：${s.analysis.join(", ") || "—"}`
      ].join("\n"));
    }

    case "lyrics": {
      const rows = core.lyrics(need(id, "要給 id"), { live: !!opt.live, from: opt.from ? num(opt.from, "--from") : 1, to: opt.to ? num(opt.to, "--to") : undefined });
      return out(opt, rows, rows.map(l => {
        const extra = [l.acts?.length ? `[${l.acts.join(",")}]` : "", l.sing ? `唱:${l.sing.join(",")}` : "", l.call ? `喊:${l.call}` : ""].filter(Boolean).join(" ");
        return `${String(l.n).padStart(3)}  ${core.fmtTime(l.time)}  ${l.jp}${l.tr ? `　｜${l.tr}` : ""}${extra ? `　${extra}` : ""}`;
      }).join("\n"));
    }

    case "fetch": {
      const url = need(id, "要給 YouTube 網址，例如 fetch https://youtu.be/xxxxxxxxxxx --id shinka");
      const onLog = opt.json ? () => {} : m => process.stderr.write(`  ${m}`);
      const r = await core.fetchSong(url, { id: opt.id === true ? undefined : opt.id, ja: opt.ja, zh: opt.zh, en: opt.en, ro: opt.ro, cover: opt.cover ? true : undefined, noAudio: !!opt.noAudio }, { dryRun: !!opt.dryRun, onLog });
      const res = core.commit(r, { dryRun: !!opt.dryRun });
      if (opt.json) return out(opt, { ok: true, dryRun: !!opt.dryRun, ...r.summary, changes: r.changes, warnings: r.warnings, written: res.written }, "");
      report(opt, res);
      console.log(`\n下一步：node tools/studio/cli.mjs lyrics ${r.summary.id}　看歌詞初稿；在工作台打開 ?song=${r.summary.id} 對時`);
      return;
    }

    case "fetch-audio": {
      const f = await core.fetchAudio(need(id, "要給 id"), { onLog: m => process.stderr.write(`  ${m}`) });
      return out(opt, { ok: true, file: f }, `音訊：${f}`);
    }

    case "analyze": {
      need(id, "要給 id，例如 analyze shinka");
      const r = await core.analyze(id, {
        apply: !!opt.apply, overwrite: !!opt.overwrite, fresh: !!opt.fresh,
        bpm: opt.bpm === true ? undefined : opt.bpm, climax: opt.climax === true ? undefined : opt.climax,
        onLog: opt.json ? undefined : m => process.stderr.write(`  ${m}`)
      });
      const res = core.commit(r, { dryRun: !!opt.dryRun });
      if (opt.json) { const { files, ...rest } = r; return out(opt, { ok: true, ...rest, written: res.written }, ""); }
      const b = r.beat, cur = r.current;
      console.log([
        `〈${r.ja}〉`,
        `BPM ${b.bpm}${b.alternatives.length ? `（備選：${b.alternatives.map(x => `${x.bpm}`).join("、")}）` : ""}　第一小節 ${b.firstBar} 秒　第一拍${b.barKnown ? "確定" : "不確定"}`,
        `　拍點穩定度：${Math.round(b.inliers * 100)}% 落在格子上，平均差 ${b.rmsMs} 毫秒${b.reliable ? "" : "（不穩）"}`,
        `副歌高潮候選：${r.climaxCandidates.slice(0, 3).map(c => `${core.fmtTime(c.t)}（${c.from}）`).join("、") || "—"}`,
        `段落：${r.sections.map(s => `${s.label}${s.chorus ? "★" : ""} ${core.fmtTime(s.start)}`).join("　")}`,
        "",
        `建議　BEAT ${JSON.stringify(r.suggest.beat)}　CLIMAX ${r.suggest.climax ?? "—"}`,
        `現在　BEAT ${cur.beat ? JSON.stringify(cur.beat) : "—"}　CLIMAX ${cur.climax ?? "—"}`
      ].join("\n"));
      if (opt.apply) report(opt, res);
      else r.warnings.forEach(w => console.log(`提醒：${w}`));
      if (!opt.apply) console.log(`\n要寫進去：analyze ${id} --apply${cur.beat || cur.climax != null ? " --overwrite" : ""}`);
      return;
    }

    case "bench": {
      const ids = pos.slice(1);
      const r = await core.bench(ids, { download: !!opt.download, fresh: !!opt.fresh, onLog: opt.json ? () => {} : m => process.stderr.write(`  ${m}`) });
      if (opt.json) return out(opt, r, "");
      const s = r.summary;
      console.log([
        `分析了 ${s.songs} 首（沒有音訊略過 ${s.skipped}、失敗 ${s.errors}）`,
        `BPM：對 ${s.bpm.ok}、差兩倍 ${s.bpm.octave}、錯 ${s.bpm.wrong}；正確答案在備選裡 ${s.bpm.inAlternatives}`,
        `拍點位置（BPM 對的歌）：${s.beatPhase.within50ms}/${s.beatPhase.of} 首差 50 毫秒內，中位數 ${s.beatPhase.medianMs} 毫秒`,
        `小節第一拍：${s.bar.ok}/${s.bar.of} 對`,
        `副歌高潮（差 1.5 秒內）：合併 ${s.climax.ok}/${s.climax.of}，前三個候選 ${s.climax.top3}/${s.climax.of}，只看歌詞 ${s.climax.lyricOnly}/${s.climax.of}`,
        "",
        ...r.rows.filter(x => x.error || (x.bpm && x.bpm !== "ok") || x.bar === "wrong" || x.climaxOk === false).map(x =>
          `  ${x.id.padEnd(14)}${x.error ? "失敗：" + x.error : `BPM ${x.got?.[0]}／${x.want?.[0] ?? "—"} ${x.bpm || ""}${x.bar === "wrong" ? "　第一拍錯" : ""}${x.climaxOk === false ? `　高潮 ${x.climax}／${x.climaxWant}` : ""}`}`),
        "",
        "完整結果：tools/studio/work/bench.json（貼給 Claude 看）"
      ].join("\n"));
      return;
    }

    case "add":
      return write(core.addSong({ id: opt.id, yt: opt.yt, ja: opt.ja, zh: opt.zh, en: opt.en, ro: opt.ro, len: opt.len, date: opt.date, cover: !!opt.cover }));

    case "meta": {
      need(id, "要給 id");
      const o = {};
      for (const k of ["status", "acts", "tips", "tipsEn", "tipsJa", "pen", "climax", "liveYt", "liveConcert", "beat"]) if (opt[k] != null && opt[k] !== true) o[k] = opt[k];
      if (opt.penGuess) o.penGuess = true;
      if (!Object.keys(o).length) throw new Error("沒有要改的東西（看 help 的 meta）");
      return write(core.setMeta(id, o));
    }

    case "line": {
      need(id, "要給 id"); const n = num(need(arg2, "要給句子編號，例如 line shinka 12 --tr …"), "句子編號");
      const ed = { n };
      for (const k of ["time", "jp", "tr", "acts", "sing", "call", "how", "duration"]) if (opt[k] != null && opt[k] !== true) ed[k] = opt[k];
      return write(core.editLines(id, [ed], { live: !!opt.live }));
    }

    case "lines": {
      const edits = JSON.parse(readInput(need(opt.file, "要給 --file edits.json（或 --file - 從標準輸入）")));
      return write(core.editLines(need(id, "要給 id"), edits, { live: !!opt.live }));
    }

    case "shift":
      return write(core.shiftLines(need(id, "要給 id"), {
        by: num(need(opt.by, "要給 --by 秒數"), "--by"), from: opt.from ? num(opt.from, "--from") : 1, to: opt.to ? num(opt.to, "--to") : undefined, live: !!opt.live
      }));

    case "lyrics-import": {
      const f = need(opt.file, "要給 --file");
      const text = readInput(f);
      const input = /\.json$/i.test(f) || text.trim().startsWith("[") || text.trim().startsWith("{") ? JSON.parse(text) : text;
      return write(core.importLyrics(need(id, "要給 id"), input, { live: !!opt.live, keepActs: !!opt.keepActs }));
    }

    case "check": {
      const r = await core.check();
      out(opt, r, [...r.steps.map(s => `${s.ok ? "✓" : "✗"} ${s.name}${s.ok ? "" : "\n" + s.out}`), ...r.notes.map(n => `提醒：${n}`)].join("\n"));
      if (!r.ok) process.exitCode = 1;
      return;
    }

    case "status": {
      const r = await core.gitStatus();
      return out(opt, r, `分支：${r.branch}（發布用 ${r.publishBranch}）\n${r.changed.length ? r.changed.map(c => `  ${c.status.padEnd(2)} ${c.file}`).join("\n") : "  歌曲資料沒有變更"}${r.ahead ? `\n還有 ${r.ahead} 個 commit 沒推上去` : ""}`);
    }

    case "sync": {
      const r = await core.sync();
      out(opt, r, r.ok ? `已同步\n${r.out}` : `${r.error}\n${r.out || ""}`);
      if (!r.ok) process.exitCode = 1;
      return;
    }

    case "publish": {
      const r = await core.publish(need(opt.m, "要給 -m \"commit 訊息\""));
      out(opt, r, [...(r.log || []).map(s => `${s.ok ? "✓" : "✗"} ${s.name}${s.ok ? "" : "\n" + (s.out || "").split("\n").slice(-12).join("\n")}`), r.ok ? `已推上：${r.head}` : r.error].join("\n"));
      if (!r.ok) process.exitCode = 1;
      return;
    }

    default:
      throw new Error(`不認得的指令「${cmd}」，用 help 看全部指令`);
  }
}

main().catch(e => {
  const opt = parse(process.argv.slice(2)).opt;
  if (opt.json) console.log(JSON.stringify({ ok: false, error: e.message }, null, 2));
  else console.error(`✗ ${e.message}`);
  process.exitCode = 1;
});
