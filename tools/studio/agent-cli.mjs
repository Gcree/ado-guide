#!/usr/bin/env node
// 呼叫 AI 命令列工具（agy／gemini／claude）做翻譯這類「丟一份說明、拿回 JSON」的工作
//
// 為什麼這樣設計：
// - 歌詞很長、又有引號和日文，直接塞進命令列在 Windows 很容易被拆壞，所以把完整說明寫成檔案，
//   命令列只放一句「去讀那個檔案照做」（純英數，任何殼層都不用跳脫）。
// - agy -p 有人回報「不是在真的終端機裡跑時，輸出會不見」，所以說明裡也要求它把結果另外寫進檔案；
//   標準輸出拿不到就讀那個檔案，兩個都沒有才算失敗（工作站會改成「複製提示、手動貼回」）。
//
// 先在自己的電腦上試哪一個能用：node tools/studio/agent-cli.mjs --probe
// 只試某一個：node tools/studio/agent-cli.mjs --probe agy
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const CONFIG = path.join(here, "config.json");

// {prompt} 會換成那一句「去讀檔案」的指示
export const PRESETS = {
  agy: ["agy", "-p", "{prompt}", "--output-format", "json"],
  gemini: ["gemini", "-p", "{prompt}", "--output-format", "json"],
  claude: ["claude", "-p", "{prompt}", "--output-format", "json"]
};

export function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch { return {}; }
}

function writeConfig(patch) {
  const c = { ...readConfig(), ...patch };
  fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2) + "\n");
  return c;
}

// 找到指令實際的位置；Windows 的 npm 全域指令多半是 .cmd，要經過 cmd.exe 才跑得動
export function which(cmd) {
  const r = process.platform === "win32"
    ? spawnSync("where", [cmd], { encoding: "utf8", windowsHide: true })
    : spawnSync("sh", ["-c", `command -v "${cmd}"`], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const all = r.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (process.platform !== "win32") return all[0] || null;
  return all.find(p => /\.(exe|cmd|bat)$/i.test(p)) || all[0] || null;
}

// 命令列只會放我們自己寫的那一句話；確認裡面沒有殼層特殊字元，才能安全地交給 cmd.exe
const SAFE_ARG = /^[\w .,:/\\=+-]*$/;

function spawnCli(argv, { cwd, timeoutSec }) {
  const exe = which(argv[0]);
  if (!exe) return Promise.resolve({ code: -1, out: "", err: `找不到指令 ${argv[0]}` });
  let cmd = exe, args = argv.slice(1), opts = { cwd, windowsHide: true };
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(exe)) {
    const bad = args.find(a => !SAFE_ARG.test(a));
    if (bad) return Promise.resolve({ code: -1, out: "", err: `參數含有 cmd.exe 會誤解的字元：${bad}` });
    cmd = process.env.ComSpec || "cmd.exe";
    args = ["/d", "/s", "/c", `"${[`"${exe}"`, ...args.map(a => (/\s/.test(a) ? `"${a}"` : a))].join(" ")}"`];
    opts.windowsVerbatimArguments = true;
  }
  return new Promise(resolve => {
    const p = spawn(cmd, args, { ...opts, env: { ...process.env, NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "", done = false;
    const timer = setTimeout(() => { if (!done) { err += `\n超過 ${timeoutSec} 秒，已停止`; p.kill(); } }, timeoutSec * 1000);
    p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("error", e => { done = true; clearTimeout(timer); resolve({ code: -1, out, err: err + e.message }); });
    p.on("close", code => { done = true; clearTimeout(timer); resolve({ code, out, err }); });
  });
}

// 從工具的輸出裡挖出我們要的 JSON：外面可能包一層 { result: "…" } 之類的信封，裡面可能有 ```json 圍欄
export function extractJson(text, isWanted) {
  const tryParse = s => { try { return JSON.parse(s); } catch { return undefined; } };
  const candidates = [];
  const pushText = s => {
    if (typeof s !== "string" || !s.trim()) return;
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) candidates.push(fence[1]);
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) candidates.push(s.slice(a, b + 1));
    candidates.push(s);
  };
  const walk = v => {
    if (v && typeof v === "object") { if (isWanted(v)) candidates.unshift(JSON.stringify(v)); Object.values(v).forEach(walk); }
    else pushText(v);
  };
  const whole = tryParse(text.trim());
  if (whole !== undefined) walk(whole);
  // stream-json：一行一個 JSON
  text.split(/\r?\n/).forEach(line => { const v = tryParse(line); if (v !== undefined) walk(v); });
  pushText(text);
  for (const c of candidates) {
    const v = tryParse(c.trim());
    if (v !== undefined && isWanted(v)) return v;
  }
  return null;
}

// 跑一次：說明寫進 jobDir/request.md，要求結果寫到 jobDir/result.json，也印在標準輸出
export async function runAgentJob({ command, jobDir, instructions, isWanted, timeoutSec = 180 }) {
  fs.mkdirSync(jobDir, { recursive: true });
  const relDir = path.relative(root, jobDir).split(path.sep).join("/");
  const resultFile = path.join(jobDir, "result.json");
  fs.rmSync(resultFile, { force: true });
  fs.writeFileSync(path.join(jobDir, "request.md"),
    `${instructions.trim()}\n\n## 交付方式\n\n- 把結果（只有 JSON）寫進檔案 \`${relDir}/result.json\`。\n- 回覆內容也只放同一份 JSON，不要其他文字。\n`);
  const prompt = `Read the file ${relDir}/request.md and do exactly what it says. Reply with the JSON only.`;
  const argv = command.map(a => a.replace("{prompt}", prompt));
  const t0 = Date.now();
  const r = await spawnCli(argv, { cwd: root, timeoutSec });
  const secs = Math.round((Date.now() - t0) / 100) / 10;
  fs.writeFileSync(path.join(jobDir, "cli.log"), `$ ${argv.join(" ")}\nexit ${r.code}，${secs} 秒\n\n--- stdout ---\n${r.out}\n\n--- stderr ---\n${r.err}\n`);
  let data = extractJson(r.out, isWanted), via = "stdout";
  if (!data && fs.existsSync(resultFile)) { data = extractJson(fs.readFileSync(resultFile, "utf8"), isWanted); via = "result.json"; }
  return { ok: !!data, data, via: data ? via : null, code: r.code, secs, stdoutEmpty: !r.out.trim(), err: r.err.trim().split("\n").slice(-5).join("\n"), log: path.join(jobDir, "cli.log") };
}

// ── 試用：拿一首已經有翻譯的歌的前幾句，請每個工具翻一次，對照現有的中文 ──
async function probe(only) {
  const require = createRequire(import.meta.url);
  const LYRICS = require(path.join(root, "song-lyrics.js"));
  const song = LYRICS.find(s => s.id === "odo") || LYRICS[0];
  const lines = song.lyrics.filter(l => l.jp && l.tr).slice(2, 6);
  const instructions = `# 翻譯測試

把下面 ${lines.length} 句日文歌詞翻成繁體中文（台灣用語、短句、像歌詞，不要解釋）。

${lines.map((l, i) => `${i + 1}. ${l.jp}`).join("\n")}

輸出格式（JSON）：{"lines":[{"n":1,"tr":"…"}]}，n 對應上面的編號，${lines.length} 句都要有。`;
  const isWanted = v => v && Array.isArray(v.lines) && v.lines.length === lines.length && v.lines.every(x => typeof x.tr === "string");

  const names = only ? [only] : Object.keys(PRESETS);
  console.log(`用〈${song.id}〉的 ${lines.length} 句歌詞試翻譯；每個工具最多等 3 分鐘。\n`);
  const results = [];
  for (const name of names) {
    const command = PRESETS[name] || readConfig().translate?.command;
    const exe = which(command[0]);
    if (!exe) { console.log(`– ${name}：沒裝（找不到 ${command[0]}）\n`); continue; }
    const ver = spawnSync(/\s/.test(exe) && process.platform === "win32" ? `"${exe}"` : exe, ["--version"], { encoding: "utf8", shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(exe), windowsHide: true, timeout: 20000 });
    console.log(`▶ ${name}（${exe}${ver.stdout ? `，${ver.stdout.trim().split("\n")[0]}` : ""}）`);
    const r = await runAgentJob({ command, jobDir: path.join(here, "work", "_probe", name), instructions, isWanted });
    if (r.ok) {
      console.log(`  ✓ 可以用：${r.secs} 秒，結果從 ${r.via} 拿到${r.via === "result.json" ? "（標準輸出是空的，靠檔案救回來）" : ""}`);
      r.data.lines.forEach((x, i) => console.log(`    ${lines[i].jp}\n      現有：${lines[i].tr}\n      ${name}：${x.tr}`));
      results.push({ name, command, secs: r.secs });
    } else {
      console.log(`  ✗ 拿不到結果（exit ${r.code}${r.stdoutEmpty ? "，標準輸出是空的" : ""}）`);
      if (r.err) console.log(`    ${r.err.replace(/\n/g, "\n    ")}`);
    }
    console.log(`  完整紀錄：${path.relative(root, r.log)}\n`);
  }
  if (!results.length) {
    console.log("沒有一個能直接用。把上面的紀錄檔貼給 Claude 看；工作站之後也會提供「複製提示、手動貼回」的方式。");
    return;
  }
  const pick = results.find(r => r.name === "agy") || results[0];
  writeConfig({ translate: { command: pick.command, timeoutSec: 180 } });
  console.log(`已把 ${pick.name} 設成翻譯工具 → tools/studio/config.json（只存在這台電腦）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === "--probe") await probe(args[1]);
  else console.log("用法：node tools/studio/agent-cli.mjs --probe [agy|gemini|claude]");
}
