// Ado Studio 設計稿：用〈シンカ〉的真實歌詞、BPM、副歌高潮，加上假的波形、段落、信心分數和預測應援，
// 示範新介面長什麼樣子。之後 M4 會把對時工作台的功能逐一接進來，假資料換成 tools/studio/work/ 的分析結果。
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const { SONGS, BEAT, CLIMAX, PEN } = window.ADO_SONGS;
  const LYRICS = window.SONG_LYRICS;

  const ID = "shinka";
  const S = SONGS.find(s => s.id === ID);
  const L = LYRICS.find(s => s.id === ID);
  const [BPM, FIRST_BAR] = BEAT[ID];
  const DUR = L.duration;
  const lines = L.lyrics.map((l, i, a) => ({
    ...l, i,
    end: l.duration ? l.time + l.duration : (a[i + 1] ? a[i + 1].time : DUR),
    gap: /^[（(].*[）)]$/.test(l.jp)
  }));

  // ── 假資料 ──
  // 段落（之後由 librosa／allin1 算）
  const SECTIONS = [
    [0, 6.5, "intro", "前奏"], [6.5, 20.65, "intro", "間奏"], [20.65, 30.9, "verse", "主歌 A"], [30.9, 44.65, "pre", "導歌 B"],
    [44.65, 66.23, "chorus", "副歌"], [66.23, 74.9, "intro", "間奏"], [74.9, 84.7, "verse", "主歌 A"], [84.7, 98.75, "pre", "導歌 B"],
    [98.75, 119.91, "chorus", "副歌"], [119.91, 129.25, "intro", "間奏"], [129.25, 141.3, "bridge", "橋段 C"], [141.3, 148.08, "intro", "間奏"],
    [148.08, 167.9, "chorus", "副歌（最後）"], [167.9, 190.44, "bridge", "尾段"], [190.44, DUR, "intro", "尾奏"]
  ];
  // 信心（之後由對齊結果算）：大部分高，尾音拉長、和聲疊、太快的句子低
  const LOW = new Set([41, 45, 55, 59]), MID = new Set([12, 31, 43, 52, 58, 20]);
  lines.forEach(l => {
    l.conf = l.gap ? null : LOW.has(l.i) ? 0.3 + (l.i % 3) * 0.04 : MID.has(l.i) ? 0.58 + (l.i % 4) * 0.03 : 0.86 + (l.i % 5) * 0.025;
    l.trSrc = l.gap ? null : l.i % 7 === 3 ? "agy" : "official";
  });
  // 預測的應援（之後由段落＋規則算）
  const ACTS = [];
  SECTIONS.forEach(([a, b, kind]) => {
    if (kind === "chorus") ACTS.push({ a, b, act: "wave", guess: true });
    if (kind === "intro" && b - a > 6 && a > 1) ACTS.push({ a: a + 0.5, b: b - 0.5, act: "clap", guess: true });
  });
  lines.filter(l => /Open Your Eyes/.test(l.jp)).forEach(l => ACTS.push({ a: l.time, b: l.end, act: "call", guess: true }));

  const ACT_INFO = {
    sing: ["大合唱", "--a-sing"], call: ["喊聲", "--a-call"], clap: ["拍手", "--a-clap"], wave: ["揮手", "--a-wave"],
    jump: ["跳躍", "--a-jump"], gesture: ["手勢", "--a-gesture"], listen: ["安靜聽", "--a-listen"]
  };
  const PEN_HEX = { 青: "#5d9dfe", 水: "#5fd4ff", 白: "#f2efe8", 赤: "#ff4a5a", 桃: "#ff7ab8", 紫: "#a374ff", 橙: "#ff9a3c", 黄: "#ffd84a", 緑: "#4ee08a" };

  const fmt = (t, cs = true) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${(cs ? s.toFixed(2) : Math.floor(s).toString()).padStart(cs ? 5 : 2, "0")}`;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const spb = 60 / BPM;

  // ── 狀態 ──
  let t = 151.2, playing = false, sel = 45;
  let win = [128, 172];

  // ── 處理流程 ──
  const STEPS = [["下載", "done"], ["分離人聲", "done"], ["拍點與段落", "done"], ["字幕對齊", "done"], ["翻譯", "done"], ["應援預測", "run"]];
  $("pipeline").innerHTML = STEPS.map(([name, st], i) =>
    `${i ? '<i class="step-sep"></i>' : ""}<div class="step ${st}"><span class="st">${st === "done" ? '<svg class="ic"><use href="#i-check"/></svg>' : ""}</span>${name}</div>`).join("");

  // ── 左：歌曲清單（狀態用真的 songs.js；「處理中」是假的） ──
  const statusOf = s => (s.hold ? "hold" : s.sug ? "sug" : s.free ? "free" : "ok");
  const groups = [
    ["處理中", [{ s: S, prog: 0.83, red: 4 }, { s: { id: "newsong", ja: "（下一首新歌）" }, prog: 0.22 }]],
    ["整理中", SONGS.filter(s => statusOf(s) === "hold").map(s => ({ s }))],
    ["暫定建議", SONGS.filter(s => statusOf(s) === "sug").map(s => ({ s }))],
    ["正式", SONGS.filter(s => statusOf(s) === "ok" && s.id !== ID).map(s => ({ s }))]
  ];
  $("songList").innerHTML = groups.map(([name, items]) => `
    <div class="group"><span class="label">${name}</span><span class="mono" style="color:var(--ink-3);font-size:11px">${items.length}</span></div>
    ${items.slice(0, name === "正式" ? 8 : 6).map(({ s, prog, red }) => `
      <div class="song${s.id === ID ? " on" : ""}">
        <div class="t">${esc(s.ja)}</div>
        <div class="m">${s.id}${BEAT[s.id] ? ` · ${BEAT[s.id][0]} BPM` : ""}</div>
        <div class="r">${prog != null ? `<span class="bar"><i style="width:${prog * 100}%"></i></span>` : ""}${red ? `<span class="tag bad">${red}</span>` : ""}</div>
      </div>`).join("")}`).join("");

  // ── 中：歌名、數字 ──
  $("phTitle").textContent = S.ja;
  $("songTitle").textContent = S.ja;
  $("songSub").textContent = `${S.id} · ${(S.credit?.w || []).join("、")} · ${S.tie || ""}`;
  const pen = (PEN[ID] || "").replace(/^\?/, "");
  const guess = (PEN[ID] || "").startsWith("?");
  $("facts").innerHTML = [
    [BPM, "BPM"], [FIRST_BAR.toFixed(3) + "s", "第一小節"], [S.len, "長度"], [CLIMAX[ID] ? fmt(CLIMAX[ID]) : "—", "副歌高潮"],
    [lines.filter(l => !l.gap).length, "句"]
  ].map(([v, k]) => `<div class="fact"><b>${v}</b><span>${k}</span></div>`).join("") +
    `<div class="fact"><span class="pens">${[...pen].map(k => `<i class="pen${guess ? " guess" : ""}" style="background:${PEN_HEX[k] || "#888"}"></i>`).join("")}</span><span>手燈${guess ? "（預測）" : ""}</span></div>`;

  const red = lines.filter(l => l.conf != null && l.conf < 0.5).length, yellow = lines.filter(l => l.conf != null && l.conf >= 0.5 && l.conf < 0.75).length;
  $("redCount").innerHTML = `<span class="tag bad">${red} 句要檢查</span> <span class="tag warn">${yellow} 句中信心</span> <button class="btn ghost sm">下一個紅色 <span class="kbd">G</span></button>`;

  // ── 時間軸 ──
  const tl = $("tl");
  const x = time => ((time - win[0]) / (win[1] - win[0])) * 100;
  const span = (a, b) => `left:${x(a)}%;width:${Math.max(0, x(b) - x(a))}%`;

  function drawTimeline() {
    $("zoomLab").textContent = `${fmt(win[0], false)}–${fmt(win[1], false)}`;
    let r = "";
    for (let s = Math.ceil(win[0] / 2) * 2; s < win[1]; s += 2) r += `<span class="${s % 10 === 0 ? "major" : ""}" style="left:${x(s)}%">${s % 10 === 0 ? fmt(s, false) : ""}</span>`;
    $("ruler").innerHTML = r;

    $("trSec").innerHTML = SECTIONS.filter(([a, b]) => b > win[0] && a < win[1]).map(([a, b, kind, name]) =>
      `<div class="sec ${kind}" style="${span(a, b)};background:var(--sec-${kind})">${name}</div>`).join("") +
      (CLIMAX[ID] ? `<div class="climax" style="left:${x(CLIMAX[ID])}%" title="副歌高潮 ${fmt(CLIMAX[ID])}"></div>` : "");

    let b = "";
    const n0 = Math.ceil((win[0] - FIRST_BAR) / spb), n1 = Math.floor((win[1] - FIRST_BAR) / spb);
    for (let n = n0; n <= n1; n++) {
      const bar = n % 4 === 0;
      b += `<i class="beat${bar ? " bar" : ""}" style="left:${x(FIRST_BAR + n * spb)}%"></i>`;
    }
    $("trBeat").innerHTML = b;

    $("trLyr").innerHTML = lines.filter(l => l.end > win[0] && l.time < win[1]).map(l => {
      const c = l.conf == null ? "" : l.conf < 0.5 ? " c-low" : l.conf < 0.75 ? " c-mid" : "";
      const isCur = t >= l.time && t < l.end;
      return `<div class="ly${l.gap ? " gap" : ""}${c}${l.i === sel ? " on" : ""}${isCur ? " cur" : ""}" data-i="${l.i}" style="${span(l.time, l.end - 0.06)}" title="${esc(l.jp)}">${esc(l.jp)}${l.gap ? "" : `<em>${esc(l.tr || "")}</em><small>${fmt(l.time)}</small>`}</div>`;
    }).join("");

    $("trAct").innerHTML = ACTS.filter(a => a.b > win[0] && a.a < win[1]).map(a =>
      `<div class="act${a.guess ? " guess" : ""}" style="${span(a.a, a.b)};background:var(${ACT_INFO[a.act][1]})" title="${ACT_INFO[a.act][0]}${a.guess ? "（預測）" : ""}"></div>`).join("");

    drawOverview();
    drawWave();
    placePlayhead();
  }

  function drawOverview() {
    const o = v => (v / DUR) * 100;
    $("trOv").innerHTML =
      SECTIONS.map(([a, b, kind]) => `<i class="ov-sec" style="left:${o(a)}%;width:${o(b - a)}%;background:var(--sec-${kind})"></i>`).join("") +
      lines.filter(l => l.conf != null && l.conf < 0.75).map(l => `<i class="${l.conf < 0.5 ? "ov-red" : "ov-mid"}" style="left:${o(l.time)}%"></i>`).join("") +
      (CLIMAX[ID] ? `<i class="ov-climax" style="left:${o(CLIMAX[ID])}%"></i>` : "") +
      `<i class="ov-win" style="left:${o(win[0])}%;width:${o(win[1] - win[0])}%"></i><i class="ov-now" style="left:${o(t)}%"></i>`;
  }

  // 假波形：有歌詞的地方比較大聲，每拍有一點起伏
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ENV = Array.from({ length: Math.ceil(DUR * 20) }, (_, k) => {
    const time = k / 20, l = lines.find(l => time >= l.time && time < l.end);
    const sec = SECTIONS.find(([a, b]) => time >= a && time < b);
    const base = l && !l.gap ? 0.55 : 0.12;
    const boost = sec && sec[2] === "chorus" ? 0.25 : 0;
    const beat = 0.12 * Math.max(0, Math.cos(((time - FIRST_BAR) / spb) * Math.PI * 2));
    return Math.min(1, base + boost + beat + rnd() * 0.25);
  });

  function drawWave() {
    const cv = $("wave"), dpr = devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const past = css.getPropertyValue("--accent").trim(), future = css.getPropertyValue("--ink-3").trim();
    const px = x(t) / 100 * w;
    for (let i = 0; i < w; i += 3) {
      const time = win[0] + (i / w) * (win[1] - win[0]);
      const v = ENV[Math.floor(time * 20)] || 0;
      const bh = Math.max(1, v * Math.min(h - 10, 96));
      g.fillStyle = i < px ? past : future;
      g.globalAlpha = i < px ? 0.9 : 0.55;
      g.fillRect(i, (h - bh) / 2, 2, bh);
    }
  }

  function placePlayhead() {
    const lab = tl.querySelector(".tl-lab").getBoundingClientRect().width;
    const w = tl.getBoundingClientRect().width - lab;
    const act = $("trAct");
    $("playhead").style.left = `${lab + (x(t) / 100) * w}px`;
    $("playhead").style.bottom = "auto";
    $("playhead").style.height = `${act.offsetTop + act.offsetHeight}px`;
  }

  // ── 現在這句、走帶 ──
  function drawNow() {
    const i = lines.findIndex(l => t >= l.time && t < l.end);
    const cur = lines[i] || lines[0];
    $("curJp").textContent = cur.jp;
    $("curTr").textContent = cur.tr || "";
    $("nexts").innerHTML = lines.slice(i + 1, i + 4).map(l => `<div><span class="mono">${fmt(l.time)}</span>${esc(l.jp)}</div>`).join("");
    const m = Math.floor(t / 60), s = (t % 60).toFixed(2).padStart(5, "0");
    $("tc").innerHTML = `${m}:${s}<small> / ${fmt(DUR, false)}</small>`;
    const beats = Math.max(0, (t - FIRST_BAR) / spb);
    $("bbBar").textContent = `${String(Math.floor(beats / 4) + 1).padStart(3, "0")}.${Math.floor(beats % 4) + 1}`;
  }

  // ── 右：選取的句子 ──
  function drawInsp() {
    const l = lines[sel];
    const confPct = l.conf == null ? 0 : Math.round(l.conf * 100);
    const confColor = l.conf == null ? "var(--line)" : l.conf < 0.5 ? "var(--bad)" : l.conf < 0.75 ? "var(--warn)" : "var(--ok)";
    const active = new Set(ACTS.filter(a => l.time < a.b && l.end > a.a).map(a => a.act));
    $("insp").innerHTML = `
      <div class="field-head"><span class="label">第 ${l.i + 1} 句 / ${lines.length}</span><span class="hint mono">${fmt(l.time)} – ${fmt(l.end)}</span></div>
      <div class="field">
        <span class="label">開始時間</span>
        <div class="time-edit">
          <button class="nudge">−0.2</button><button class="nudge">−0.05</button>
          <input class="mono" value="${l.time.toFixed(2)}">
          <button class="nudge">+0.05</button><button class="nudge">+0.2</button>
        </div>
      </div>
      <div class="field">
        <div class="field-head"><span class="label">對齊信心</span><span class="mono" style="color:${confColor};font-weight:600">${l.conf == null ? "—" : confPct}</span></div>
        <div class="conf"><div class="meter"><i style="width:${confPct}%;background:${confColor}"></i></div></div>
        <span class="hint">${l.conf != null && l.conf < 0.5 ? "尾音拉長、和聲重疊，自動對齊不確定，請試聽這句確認。" : "stable-ts 和網路來源的時間差不到 0.3 秒。"}</span>
      </div>
      <div class="divider"></div>
      <div class="field">
        <span class="label">日文</span>
        <textarea class="txt jp" rows="2">${esc(l.jp)}</textarea>
      </div>
      <div class="field">
        <div class="field-head"><span class="label">中文</span>${l.trSrc === "official" ? '<span class="tag ok">官方字幕</span>' : l.trSrc === "agy" ? '<span class="tag warn">agy 翻譯・待確認</span>' : ""}</div>
        <textarea class="txt" rows="2">${esc(l.tr || "")}</textarea>
      </div>
      <div class="divider"></div>
      <div class="field">
        <div class="field-head"><span class="label">應援</span><span class="hint">斜線是預測，點一下確認</span></div>
        <div class="acts">${Object.entries(ACT_INFO).map(([k, [name, v]], n) =>
          `<button class="actbtn${active.has(k) ? " on" : ""}" style="--c:var(${v})"><i class="sw" style="background:var(${v})"></i>${name}<span class="kbd k">${n + 1}</span></button>`).join("")}</div>
      </div>
      <div class="field">
        <span class="label">觀眾要唱的字</span>
        <input class="input" placeholder="留空＝整句；指定的字用逗號分開">
      </div>
      <div class="field">
        <span class="label">喊聲</span>
        <input class="input" placeholder="例如：Open Your Eyes" value="${active.has("call") ? esc(l.jp) : ""}">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn" style="flex:1;justify-content:center"><svg class="ic"><use href="#i-play"/></svg>試聽這句 <span class="kbd">Enter</span></button>
      </div>`;
  }

  // ── 互動 ──
  $("trLyr").addEventListener("click", e => {
    const el = e.target.closest(".ly");
    if (!el) return;
    sel = +el.dataset.i;
    t = lines[sel].time;
    drawAll();
  });
  $("trOv").addEventListener("click", e => {
    const r = e.currentTarget.getBoundingClientRect();
    t = ((e.clientX - r.left) / r.width) * DUR;
    const half = (win[1] - win[0]) / 2;
    win = [Math.max(0, t - half), Math.max(0, t - half) + half * 2];
    drawNow(); drawTimeline();
  });
  $("btnPlay").addEventListener("click", () => {
    playing = !playing;
    $("btnPlay").querySelector("use").setAttribute("href", playing ? "#i-pause" : "#i-play");
    if (playing) { last = performance.now(); requestAnimationFrame(tick); }
  });
  let last = 0;
  function tick(now) {
    if (!playing) return;
    t = Math.min(DUR, t + (now - last) / 1000);
    last = now;
    if (t > win[1] - 6) win = [t - 10, t + 34];
    drawNow(); drawTimeline();
    requestAnimationFrame(tick);
  }
  $("btnTheme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("studio-theme", next); } catch (e) {}
    drawWave();
  });
  addEventListener("resize", () => { drawWave(); placePlayhead(); });

  function drawAll() { drawNow(); drawTimeline(); drawInsp(); }
  drawAll();
})();
