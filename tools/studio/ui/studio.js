// Ado Studio 設計稿：用〈シンカ〉的真實歌詞、BPM、副歌高潮，加上假的波形、段落、信心分數、預測應援和情報包，
// 示範新介面長什麼樣子。之後 M4 會把對時工作台的功能逐一接進來，假資料換成 tools/studio/work/ 的分析結果。
// 版面像剪輯軟體：中間只放編輯（預覽＋浮動字幕、走帶、時間軸／歌詞表），補充資訊都在右邊的檢查器。
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const { SONGS, BEAT, CLIMAX, PEN } = window.ADO_SONGS;
  const LYRICS = window.SONG_LYRICS;

  const ID = "shinka";
  const S = SONGS.find(s => s.id === ID);
  const L = LYRICS.find(s => s.id === ID);
  const [BPM, FIRST_BAR, BEAT_OK] = BEAT[ID];
  const DUR = L.duration;
  const lines = L.lyrics.map((l, i, a) => ({
    ...l, i,
    end: l.duration ? l.time + l.duration : (a[i + 1] ? a[i + 1].time : DUR),
    gap: /^[（(].*[）)]$/.test(l.jp)
  }));

  // ── 假資料 ──
  const SEC_COLOR = { intro: "gray", verse: "blue", pre: "purple", chorus: "orange", bridge: "green" };
  const SECTIONS = [
    [0, 6.5, "intro", "前奏"], [6.5, 20.65, "intro", "間奏"], [20.65, 30.9, "verse", "主歌 A"], [30.9, 44.65, "pre", "導歌 B"],
    [44.65, 66.23, "chorus", "副歌"], [66.23, 74.9, "intro", "間奏"], [74.9, 84.7, "verse", "主歌 A"], [84.7, 98.75, "pre", "導歌 B"],
    [98.75, 119.91, "chorus", "副歌"], [119.91, 129.25, "intro", "間奏"], [129.25, 141.3, "bridge", "橋段 C"], [141.3, 148.08, "intro", "間奏"],
    [148.08, 167.9, "chorus", "副歌（最後）"], [167.9, 190.44, "bridge", "尾段"], [190.44, DUR, "intro", "尾奏"]
  ];
  const LOW = new Set([41, 45, 55, 59]), MID = new Set([12, 31, 43, 52, 58, 20]);
  lines.forEach(l => {
    l.conf = l.gap ? null : LOW.has(l.i) ? 0.3 + (l.i % 3) * 0.04 : MID.has(l.i) ? 0.58 + (l.i % 4) * 0.03 : 0.86 + (l.i % 5) * 0.025;
    l.trSrc = l.gap ? null : l.i % 7 === 3 ? "agy" : "official";
  });
  const ACTS = [];
  SECTIONS.forEach(([a, b, kind]) => {
    if (kind === "chorus") ACTS.push({ a, b, act: "wave", guess: true });
    if (kind === "intro" && b - a > 6 && a > 1) ACTS.push({ a: a + 0.5, b: b - 0.5, act: "clap", guess: true });
  });
  lines.filter(l => /Open Your Eyes/.test(l.jp)).forEach(l => ACTS.push({ a: l.time, b: l.end, act: "call", guess: true }));
  const STEPS = [["下載", "ok", "8 秒"], ["分離人聲", "ok", "21 秒"], ["拍點與段落", "ok", "6 秒"], ["字幕對齊", "ok", "38 秒"], ["翻譯", "ok", "官方字幕 56 句・agy 8 句"], ["應援預測", "run", ""]];
  // 情報包範例（之後讀 research/<id>.json；來源名稱是示意）
  const INTEL = {
    file: `research/${ID}.json`, by: "Claude", date: "2026-11-08",
    sources: [["note", "範例來源 A：演唱會應援整理"], ["X", "範例來源 B：現場心得串"]],
    items: [
      { title: "手燈色", now: "紅、白（預測）", next: "紅、白", src: 2 },
      { title: "第 47 句 Open Your Eyes", now: "喊聲（預測）", next: "喊聲「Open Your Eyes」", src: 1 },
      { title: "應援重點", now: "演唱會尚未公開演唱，目前沒有固定應援", next: "最後一次副歌舉手跟著揮", src: 1 }
    ]
  };

  const ACT_INFO = {
    sing: ["大合唱", "blue"], call: ["喊聲", "pink"], clap: ["拍手", "orange"], wave: ["揮手", "yellow"],
    jump: ["跳躍", "green"], gesture: ["手勢", "purple"], listen: ["安靜聽", "gray"]
  };
  const PEN_INFO = { 青: ["藍", "#5d9dfe"], 水: ["水藍", "#5fd4ff"], 白: ["白", "#f2efe8"], 赤: ["紅", "#ff4a5a"], 桃: ["粉紅", "#ff7ab8"], 紫: ["紫", "#a374ff"], 橙: ["橘", "#ff9a3c"], 黄: ["黃", "#ffd84a"], 緑: ["綠", "#4ee08a"], 彩: ["彩色", "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"] };
  const STATUS = { "": ["正式", "green"], sug: ["暫定建議", "yellow"], free: ["自由應援", "blue"], hold: ["整理中", "gray"] };

  const fmt = (t, cs = true) => {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${(cs ? s.toFixed(2) : Math.floor(s).toString()).padStart(cs ? 5 : 2, "0")}`;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = id => `<svg class="ic"><use href="#${id}"/></svg>`;
  const spb = 60 / BPM;
  const confClass = c => (c == null ? "" : c < 0.5 ? "low" : c < 0.75 ? "mid" : "high");
  const prop = (ic, k, v) => `<div class="prop"><div class="prop-k">${icon(ic)}${k}</div><div class="prop-v">${v}</div></div>`;
  const statusOf = s => (s.hold ? "hold" : s.sug ? "sug" : s.free ? "free" : "");

  // ── 狀態 ──
  let t = 151.2, playing = false, sel = 45, view = "tl", tab = "line", caption = true;
  let win = [128, 172];
  const red = lines.filter(l => confClass(l.conf) === "low").length, yellow = lines.filter(l => confClass(l.conf) === "mid").length;

  // ── 側欄 ──
  const groups = [
    ["處理中", [{ s: S, prog: 83, red }, { s: { id: "next", ja: "（下一首新歌）" }, prog: 22 }]],
    ["整理中", SONGS.filter(s => statusOf(s) === "hold").map(s => ({ s }))],
    ["暫定建議", SONGS.filter(s => statusOf(s) === "sug").map(s => ({ s }))],
    ["正式", SONGS.filter(s => statusOf(s) === "" && s.id !== ID).map(s => ({ s }))]
  ];
  $("songList").innerHTML = groups.map(([name, items]) => `
    <div class="group"><span>${name}</span><span>${items.length}</span></div>
    ${items.slice(0, name === "正式" ? 10 : 6).map(({ s, prog, red }) => `
      <div class="page${s.id === ID ? " on" : ""}">${icon("i-music")}<span class="t">${esc(s.ja)}</span>
        <span class="end">${red ? `<span class="pill red" style="height:18px;line-height:18px;font-size:11px">${red}</span>` : ""}${prog != null ? `<span class="ring" style="--p:${prog}" title="${prog}%"></span>` : ""}</span>
      </div>`).join("")}`).join("");

  $("crumbTitle").textContent = S.ja;
  $("phTitle").textContent = S.ja;
  $("confCount").innerHTML = `<span class="pill red">${red} 句要檢查</span> <span class="pill yellow">${yellow} 句中信心</span>`;

  // ── 預覽：影片依可用空間縮成 16:9 ──
  function fitVideo() {
    const m = $("monitor"), cs = getComputedStyle(m);
    const w = m.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = m.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const vw = Math.max(160, Math.min(w, (h * 16) / 9));
    $("video").style.width = `${vw}px`;
    $("video").style.height = `${(vw * 9) / 16}px`;
  }

  function drawMonitor() {
    const i = lines.findIndex(l => t >= l.time && t < l.end);
    const cur = lines[i];
    const cap = $("caption");
    cap.hidden = !caption || !cur || cur.gap;
    if (cur) {
      $("curJp").textContent = cur.jp;
      $("curTr").textContent = cur.tr || "";
      cap.classList.toggle("low", confClass(cur.conf) === "low");
    }
    const sec = SECTIONS.find(([a, b]) => t >= a && t < b);
    const acts = ACTS.filter(a => t >= a.a && t < a.b);
    $("ovTags").innerHTML = (sec ? `<span class="pill">${sec[3]}</span>` : "") +
      acts.map(a => `<span class="pill${a.guess ? " guess" : ""}"><i class="sw" style="background:var(--${ACT_INFO[a.act][1]});box-shadow:none"></i>${ACT_INFO[a.act][0]}${a.guess ? "・預測" : ""}</span>`).join("");
    $("ovTc").textContent = fmt(t);
    $("tc").innerHTML = `${fmt(t)}<small> / ${fmt(DUR, false)}</small>`;
    const beats = Math.max(0, (t - FIRST_BAR) / spb);
    $("bbBar").textContent = `${Math.floor(beats / 4) + 1}.${Math.floor(beats % 4) + 1}`;
  }

  // ── 時間軸 ──
  const tl = $("tl");
  const x = time => ((time - win[0]) / (win[1] - win[0])) * 100;
  const span = (a, b) => `left:${x(a)}%;width:${Math.max(0, x(b) - x(a))}%`;

  function drawTimeline() {
    $("zoomLab").textContent = `${fmt(win[0], false)}–${fmt(win[1], false)}`;
    let r = "";
    for (let s = Math.ceil(win[0] / 2) * 2; s < win[1]; s += 2) r += `<span style="left:${x(s)}%">${s % 10 === 0 ? fmt(s, false) : ""}</span>`;
    $("ruler").innerHTML = r;
    $("trSec").innerHTML = SECTIONS.filter(([a, b]) => b > win[0] && a < win[1]).map(([a, b, kind, name]) =>
      `<div class="sec" style="${span(a, b - 0.15)};background:var(--${SEC_COLOR[kind]}-bg)">${name}</div>`).join("") +
      (CLIMAX[ID] ? `<div class="climax" style="left:${x(CLIMAX[ID])}%" title="副歌高潮 ${fmt(CLIMAX[ID])}"></div>` : "");
    let b = "";
    const n0 = Math.ceil((win[0] - FIRST_BAR) / spb), n1 = Math.floor((win[1] - FIRST_BAR) / spb);
    for (let n = n0; n <= n1; n++) b += `<i class="beat${n % 4 === 0 ? " bar" : ""}" style="left:${x(FIRST_BAR + n * spb)}%"></i>`;
    $("trBeat").innerHTML = b;
    $("trLyr").innerHTML = lines.filter(l => l.end > win[0] && l.time < win[1]).map(l => {
      const c = { low: " c-low", mid: " c-mid" }[confClass(l.conf)] || "";
      const isCur = t >= l.time && t < l.end;
      return `<div class="ly${l.gap ? " gap" : ""}${c}${l.i === sel ? " on" : ""}${isCur ? " cur" : ""}" data-i="${l.i}" style="${span(l.time, l.end - 0.08)}" title="${esc(l.jp)}">${esc(l.jp)}${l.gap ? "" : `<em>${esc(l.tr || "")}</em><small>${fmt(l.time)}</small>`}</div>`;
    }).join("");
    $("trAct").innerHTML = ACTS.filter(a => a.b > win[0] && a.a < win[1]).map(a =>
      `<div class="act${a.guess ? " guess" : ""}" style="${span(a.a, a.b)};background:var(--${ACT_INFO[a.act][1]})" title="${ACT_INFO[a.act][0]}${a.guess ? "（預測）" : ""}"></div>`).join("");
    drawOverview();
    drawWave();
    placePlayhead();
  }

  function drawOverview() {
    const o = v => (v / DUR) * 100;
    $("trOv").innerHTML =
      SECTIONS.map(([a, b, kind]) => `<i class="ov-sec" style="left:${o(a)}%;width:${o(b - a)}%;background:var(--${SEC_COLOR[kind]}-bg)"></i>`).join("") +
      lines.filter(l => ["low", "mid"].includes(confClass(l.conf))).map(l => `<i class="${confClass(l.conf) === "low" ? "ov-red" : "ov-mid"}" style="left:${o(l.time)}%"></i>`).join("") +
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
    if (!w) return;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const past = css.getPropertyValue("--accent").trim(), future = css.getPropertyValue("--ink-3").trim();
    const px = (x(t) / 100) * w;
    for (let i = 0; i < w; i += 3) {
      const time = win[0] + (i / w) * (win[1] - win[0]);
      const v = ENV[Math.floor(time * 20)] || 0;
      const bh = Math.max(1, v * (h - 14));
      g.fillStyle = i < px ? past : future;
      g.globalAlpha = i < px ? 0.75 : 0.5;
      g.fillRect(i, (h - bh) / 2, 2, bh);
    }
  }

  function placePlayhead() {
    const lab = tl.querySelector(".tl-lab").getBoundingClientRect().width;
    const w = tl.getBoundingClientRect().width - lab;
    const act = $("trAct");
    $("playhead").style.left = `${lab + (x(t) / 100) * w}px`;
    $("playhead").style.height = `${act.offsetTop + act.offsetHeight}px`;
  }

  // ── 歌詞表 ──
  function drawTable() {
    const actPills = l => ACTS.filter(a => l.time < a.b && l.end > a.a).map(a => `<span class="pill ${ACT_INFO[a.act][1]}${a.guess ? " guess" : ""}">${ACT_INFO[a.act][0]}</span>`).join(" ");
    const confPill = l => ({ low: '<span class="pill red">要檢查</span>', mid: '<span class="pill yellow">中</span>', high: '<span class="pill green">高</span>' }[confClass(l.conf)] || "");
    $("tableView").innerHTML = `<table class="table"><thead><tr>
        <th class="n">#</th><th>${icon("i-clock")}時間</th><th>${icon("i-text")}日文</th><th>${icon("i-lang")}中文</th><th>${icon("i-hand")}應援</th><th>${icon("i-status")}信心</th>
      </tr></thead><tbody>${lines.map(l => `<tr data-i="${l.i}" class="${l.i === sel ? "on" : ""}${l.gap ? " gaprow" : ""}">
        <td class="n">${l.i + 1}</td><td class="t mono">${fmt(l.time)}</td><td>${esc(l.jp)}</td><td class="trc">${esc(l.tr || "")}</td><td>${l.gap ? "" : actPills(l)}</td><td>${confPill(l)}</td>
      </tr>`).join("")}</tbody></table>`;
    const row = $("tableView").querySelector("tr.on");
    if (row) row.scrollIntoView({ block: "nearest" });
  }

  // ── 檢查器 ──
  function lineTab() {
    const l = lines[sel];
    const cc = confClass(l.conf), pct = l.conf == null ? 0 : Math.round(l.conf * 100);
    const color = { low: "red", mid: "yellow", high: "green" }[cc] || "gray";
    const acts = ACTS.filter(a => l.time < a.b && l.end > a.a);
    const sec = SECTIONS.find(([a, b]) => l.time >= a && l.time < b);
    const prev = lines[sel - 1], next = lines[sel + 1];
    return `
      <h2>${esc(l.jp)}</h2>
      <div class="sub">第 ${l.i + 1} 句，共 ${lines.length} 句・${fmt(l.time)} – ${fmt(l.end)}</div>
      ${prop("i-clock", "開始時間", `<div class="time-edit"><button class="nudge" title="提早 0.2 秒（Shift+[）">−.2</button><button class="nudge" title="提早 0.05 秒（[）">−.05</button><input value="${l.time.toFixed(2)}"><button class="nudge" title="延後 0.05 秒（]）">+.05</button><button class="nudge" title="延後 0.2 秒（Shift+]）">+.2</button></div>`)}
      ${prop("i-status", "對齊信心", l.conf == null ? '<span class="muted">—</span>' : `<span class="meter"><i style="width:${pct}%;background:var(--${color})"></i></span><span class="pill ${color}">${pct}${cc === "low" ? "・要檢查" : ""}</span>`)}
      ${prop("i-layers", "段落", sec ? `<span class="pill ${SEC_COLOR[sec[2]]}">${sec[3]}</span>` : "—")}
      ${prop("i-lang", "中文來源", l.trSrc === "official" ? '<span class="pill green">官方字幕</span>' : l.trSrc === "agy" ? '<span class="pill yellow">agy 翻譯・待確認</span>' : "—")}
      ${prop("i-hand", "應援", `<div class="acts">${Object.entries(ACT_INFO).map(([k, [name, c]], n) => {
        const a = acts.find(x => x.act === k);
        return `<button class="act-pill${a ? (a.guess ? " guess" : " on") : ""}" style="--c:var(--${c});--c-bg:var(--${c}-bg)" title="快捷鍵 ${n + 1}${a?.guess ? "；預測，點一下確認" : ""}"><i class="sw"></i>${name}</button>`;
      }).join("")}</div>`)}
      ${cc === "low" ? `<div class="mini-callout">${icon("i-alert")}<div>尾音拉長、和聲重疊，自動對齊不確定。按 Enter 從這句前 2 秒試聽，確認後按 [ ] 微調。</div></div>` : ""}
      <div class="block-label">日文</div>
      <textarea class="edit jp" rows="1">${esc(l.jp)}</textarea>
      <div class="block-label">中文</div>
      <textarea class="edit" rows="1">${esc(l.tr || "")}</textarea>
      <div class="block-label">觀眾要唱的字</div>
      <input class="field-input" placeholder="空白＝整句；指定的字用逗號分開">
      <div class="block-label">喊聲</div>
      <input class="field-input" placeholder="空白" value="${acts.some(a => a.act === "call") ? esc(l.jp) : ""}">
      <div class="divider"></div>
      <div class="block-label">前後句</div>
      ${[prev, next].filter(Boolean).map(x => `<div class="src" data-i="${x.i}" style="cursor:pointer"><span class="mono muted">${fmt(x.time)}</span><span class="t">${esc(x.jp)}</span></div>`).join("")}
      <div class="peek-actions">
        <button class="btn" style="box-shadow:inset 0 0 0 1px var(--line-2)">${icon("i-play")}試聽這句 <span class="kbd">Enter</span></button>
      </div>`;
  }

  function songTab() {
    const penRaw = PEN[ID] || "", guess = penRaw.startsWith("?"), pen = penRaw.replace(/^\?/, "");
    const [stName, stColor] = STATUS[statusOf(S)];
    return `
      <div class="peek-icon">${icon("i-music")}</div>
      <h2>${esc(S.ja)}</h2>
      <div class="sub">${esc(S.en)}・${S.id}${S.cover ? "・翻唱" : ""}</div>
      ${prop("i-status", "狀態", `<span class="pill ${stColor}">${stName}</span>`)}
      ${prop("i-clock", "長度", `${S.len}<span class="muted">・${lines.filter(l => !l.gap).length} 句</span>`)}
      ${prop("i-metro", "BPM", `${BPM}<span class="muted">・第一小節 ${FIRST_BAR}s</span>${BEAT_OK ? "" : '<span class="pill yellow">拍點待確認</span>'}`)}
      ${prop("i-flag", "副歌高潮", CLIMAX[ID] ? fmt(CLIMAX[ID]) : '<span class="muted">空白</span>')}
      ${prop("i-light", "手燈", [...pen].map(k => `<span class="pill${guess ? " guess" : ""}"><i class="sw" style="background:${PEN_INFO[k][1]}"></i>${PEN_INFO[k][0]}</span>`).join("") + (guess ? '<span class="muted">預測</span>' : ""))}
      ${prop("i-person", "作詞作曲", esc((S.credit?.w || []).join("、") || "—"))}
      ${prop("i-tv", "合作", esc(S.tie || "—"))}
      ${prop("i-cal", "發布", S.date)}
      ${prop("i-hash", "MV", `<span class="mono muted">${S.yt}</span>`)}
      <div class="mini-callout">${icon("i-alert")}<div><b>${red} 句對齊信心低</b>、${yellow} 句中信心。先試聽紅色的句子，確認時間再發布。</div></div>
      <div class="block-label">處理進度</div>
      <div class="checklist">${STEPS.map(([n, st, note]) => `<div class="${st === "ok" ? "ok" : st === "run" ? "run" : "todo-step"}">${icon(st === "ok" ? "i-check-circle" : st === "run" ? "i-loader" : "i-circle")}${n}<small>${note}</small></div>`).join("")}</div>
      <div class="block-label">應援重點</div>
      <ul class="bullets">${(S.tips || []).map(x => `<li>${esc(x)}</li>`).join("") || '<li class="muted">空白</li>'}</ul>`;
  }

  function intelTab() {
    return `
      <div class="peek-icon" style="background:var(--yellow-bg);color:var(--yellow)">${icon("i-inbox")}</div>
      <h2>情報包</h2>
      <div class="sub"><span class="mono">${INTEL.file}</span>・${INTEL.by} 整理・${INTEL.date}</div>
      <div class="mini-callout yellow">${icon("i-info")}<div>這是示意：來源名稱和內容都是假的。之後 Claude 推上來的情報包會顯示在這裡，逐項比對、勾選採用。</div></div>
      <div class="block-label">來源</div>
      ${INTEL.sources.map(([kind, name]) => `<div class="src">${icon("i-ext")}<span class="t">${esc(name)}</span><span class="pill">${kind}</span></div>`).join("")}
      <div class="block-label">建議變更（${INTEL.items.length}）</div>
      ${INTEL.items.map(it => `<div class="intel">
        <div class="intel-head"><b>${esc(it.title)}</b><span class="pill ${it.src > 1 ? "green" : "yellow"}">${it.src} 個來源</span></div>
        <div class="diff"><span>目前</span><del>${esc(it.now)}</del><span>情報</span><div><ins>${esc(it.next)}</ins></div></div>
        <div class="acts-row"><button class="btn" style="box-shadow:inset 0 0 0 1px var(--line-2);color:var(--ink)">採用</button><button class="btn">略過</button></div>
      </div>`).join("")}
      <div class="peek-actions"><button class="btn primary">全部採用</button></div>`;
  }

  function drawInsp() {
    document.querySelectorAll("#peekTabs .tab").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    $("insp").innerHTML = tab === "song" ? songTab() : tab === "intel" ? intelTab() : lineTab();
  }

  // ── 互動 ──
  function select(i, seek = true) {
    sel = i;
    tab = "line";
    if (seek) t = lines[i].time;
    if (t < win[0] || t > win[1]) { const w = win[1] - win[0]; win = [Math.max(0, t - w * 0.3), Math.max(0, t - w * 0.3) + w]; }
    drawAll();
  }
  $("trLyr").addEventListener("click", e => { const el = e.target.closest(".ly"); if (el) select(+el.dataset.i); });
  $("tableView").addEventListener("click", e => { const el = e.target.closest("tr[data-i]"); if (el) select(+el.dataset.i); });
  $("insp").addEventListener("click", e => { const el = e.target.closest(".src[data-i]"); if (el) select(+el.dataset.i); });
  $("btnNextRed").addEventListener("click", () => {
    const next = lines.find(l => l.i > sel && confClass(l.conf) === "low") || lines.find(l => confClass(l.conf) === "low");
    if (next) select(next.i);
  });
  $("peekTabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) { tab = b.dataset.tab; drawInsp(); } });
  document.querySelectorAll(".view").forEach(b => b.addEventListener("click", () => {
    view = b.dataset.view;
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v === b));
    $("tl").hidden = view !== "tl";
    $("tableView").hidden = view !== "table";
    drawAll();
  }));
  $("btnCaption").classList.add("on");
  $("btnCaption").addEventListener("click", () => { caption = !caption; $("btnCaption").classList.toggle("on", caption); drawMonitor(); });
  $("trOv").addEventListener("click", e => {
    const r = e.currentTarget.getBoundingClientRect();
    t = ((e.clientX - r.left) / r.width) * DUR;
    const half = (win[1] - win[0]) / 2;
    win = [Math.max(0, t - half), Math.max(0, t - half) + half * 2];
    drawMonitor(); drawTimeline();
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
    drawMonitor();
    if (view === "tl") drawTimeline();
    requestAnimationFrame(tick);
  }
  $("btnTheme").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("studio-theme", next); } catch (e) {}
    drawWave();
  });
  addEventListener("resize", () => { fitVideo(); drawWave(); placePlayhead(); });
  addEventListener("keydown", e => {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "c" || e.key === "C") $("btnCaption").click();
    if (e.key === "g" || e.key === "G") $("btnNextRed").click();
  });

  function drawAll() {
    drawMonitor();
    if (view === "tl") drawTimeline(); else drawTable();
    drawInsp();
  }
  fitVideo();
  drawAll();
})();
