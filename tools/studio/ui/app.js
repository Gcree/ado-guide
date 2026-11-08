// Ado Studio：新歌工作站的介面（用 node tools/studio/server.mjs 開）
// 版面像剪輯軟體：左邊歌單、中間只放編輯（預覽＋浮動字幕、走帶、時間軸／歌詞表）、右邊檢查器（句子／歌曲／情報）
// 資料都經過伺服器（/api/…），寫入規則跟命令列共用 tools/studio/core.mjs
// 編輯在記憶體裡的草稿上做（可復原、自動存在這台電腦），按「存檔」才寫回歌詞檔；存檔時會確認檔案沒被別人先改過
(function () {
  "use strict";

  // ── 小工具 ──
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = id => `<svg class="ic"><use href="#${id}"/></svg>`;
  const fmt = (t, cs = true) => {
    t = Math.max(0, t || 0);
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${(cs ? s.toFixed(2) : Math.floor(s).toString()).padStart(cs ? 5 : 2, "0")}`;
  };
  const r3 = v => Math.round(v * 1000) / 1000;
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  async function api(url, body) {
    const opts = body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const r = await fetch(url, opts);
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = `伺服器回應 ${r.status}`;
    j.status = r.status;
    return j;
  }
  let toastTimer = 0;
  function toast(msg, ms = 2600) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), ms);
  }

  const GAP = /^[（(](間奏|尾奏|前奏)[^）)]*[）)]$/;
  const isGap = l => GAP.test(l.jp || "");
  const ACT_INFO = {
    sing: ["大合唱", "blue"], call: ["喊聲", "pink"], clap: ["拍手", "orange"], wave: ["揮手", "yellow"],
    jump: ["跳躍", "green"], gesture: ["手勢", "purple"], listen: ["安靜聽", "gray"]
  };
  const ACT_KEYS = Object.keys(ACT_INFO);
  const PEN_INFO = { 青: ["藍", "#5d9dfe"], 水: ["水藍", "#5fd4ff"], 白: ["白", "#f2efe8"], 赤: ["紅", "#ff4a5a"], 桃: ["粉紅", "#ff7ab8"], 紫: ["紫", "#a374ff"], 橙: ["橘", "#ff9a3c"], 黄: ["黃", "#ffd84a"], 緑: ["綠", "#4ee08a"], 彩: ["彩色", "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"] };
  const STATUS = { "": ["正式", "green"], sug: ["暫定建議", "yellow"], free: ["自由應援", "blue"], hold: ["整理中", "gray"] };
  const GROUPS = [["hold", "整理中"], ["sug", "暫定建議"], ["free", "自由應援"], ["", "正式"]];
  const LEVEL = { high: ["高", "green"], ok: ["已確認", "green"], mid: ["中", "yellow"], low: ["要檢查", "red"], none: ["沒對上", "red"] };
  const SEC_COLORS = ["gray", "blue", "purple", "green", "brown", "pink"];

  // ── 狀態 ──
  let songs = [];          // 側欄歌單
  let D = null;            // 目前這首歌的全部資料（/api/song）
  let L = [];              // 歌詞草稿（另外帶 _lvl 信心、_tr 中文來源，存檔時不會寫進去）
  let base = null;         // 讀取時的檔案指紋（存檔時比對）
  let savedJSON = "";      // 檔案裡的版本，用來判斷有沒有改
  let sel = new Set(), anchor = 0;
  let view = "tl", tab = "line", caption = true, follow = true, snap = true, loopOn = false;
  let win = [0, 30];
  let history = [], future = [];
  let importing = null;

  let ver = null;           // null＝MV 版；{ yt, concert }＝現場版
  let liveDur = 0;          // 現場版長度（播放器知道影片長度後會更新）
  const DUR = () => (D ? (ver ? liveDur : D.duration) : 0);
  const clean = lines => lines.map(l => {
    const x = { time: l.time, jp: l.jp, tr: l.tr || "" };
    if (l.duration != null) x.duration = l.duration;
    for (const k of ["acts", "sing"]) if (Array.isArray(l[k]) && l[k].length) x[k] = l[k].slice();
    for (const k of ["call", "how"]) if (l[k]) x[k] = l[k];
    return x;
  });
  const endOf = i => (L[i].duration != null ? L[i].time + L[i].duration : L[i + 1] ? L[i + 1].time : DUR());
  const curIndex = t => { let k = -1; for (let i = 0; i < L.length; i++) { if (L[i].time <= t) k = i; else break; } return k >= 0 && t < endOf(k) ? k : -1; };
  const lvlOf = l => (l._lvl === "none" ? "low" : l._lvl);
  const isRed = l => !isGap(l) && (l._lvl === "low" || l._lvl === "none");

  // ── 播放器：YouTube，載不到就用模擬時鐘（還是可以編輯時間軸） ──
  const player = (() => {
    let yt = null, ready = false, mode = "none", rate = 1;
    const fake = { t: 0, playing: false, last: 0 };
    const tick = () => { if (fake.playing) { const n = performance.now(); fake.t = Math.min(DUR(), fake.t + ((n - fake.last) / 1000) * rate); fake.last = n; if (fake.t >= DUR()) fake.playing = false; } };
    function loadApi() {
      if (window.YT && window.YT.Player) return Promise.resolve();
      return new Promise(res => {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        window.onYouTubeIframeAPIReady = () => res();
        s.onerror = () => res();
        document.head.appendChild(s);
        setTimeout(res, 6000);
      });
    }
    async function load(videoId) {
      fake.t = 0; fake.playing = false;
      await loadApi();
      if (!(window.YT && window.YT.Player)) { useFake(); return; }
      if (!yt) {
        yt = new YT.Player("yt", {
          videoId,
          playerVars: { controls: 0, rel: 0, modestbranding: 1, playsinline: 1, disablekb: 1, iv_load_policy: 3, fs: 0 },
          events: { onReady: () => { ready = true; mode = "yt"; yt.setPlaybackRate(rate); $("video").classList.add("ready"); } }
        });
        setTimeout(() => { if (!ready) useFake(); }, 8000);
      } else if (ready) {
        yt.cueVideoById(videoId);
      }
    }
    function useFake() {
      if (mode === "yt") return;
      mode = "fake";
      $("ph").innerHTML = `<div style="text-align:center;font-size:15px;font-weight:500;line-height:1.7;padding:20px;letter-spacing:normal">YouTube 載入不了<br><span style="opacity:.7;font-size:13px">先用模擬時鐘：時間軸、打點照常可以用，只是沒有畫面和聲音</span></div>`;
    }
    return {
      load,
      mode: () => mode,
      time() { if (mode === "yt") { try { return yt.getCurrentTime() || 0; } catch (e) { return 0; } } tick(); return fake.t; },
      playing() { if (mode === "yt") { try { return yt.getPlayerState() === 1; } catch (e) { return false; } } return fake.playing; },
      play() { if (mode === "yt") yt.playVideo(); else { fake.last = performance.now(); fake.playing = true; } },
      pause() { if (mode === "yt") yt.pauseVideo(); else { tick(); fake.playing = false; } },
      seek(t) { t = Math.max(0, Math.min(DUR(), t)); if (mode === "yt") yt.seekTo(t, true); else { fake.t = t; fake.last = performance.now(); } },
      rate(r) { rate = r; if (mode === "yt") yt.setPlaybackRate(r); },
      duration() { if (mode === "yt") { try { return yt.getDuration() || 0; } catch (e) { return 0; } } return 0; }
    };
  })();

  // ── 歌單 ──
  async function loadSongs() {
    songs = await api("/api/songs");
    renderSongList();
  }

  function renderSongList() {
    const q = $("search").value.trim().toLowerCase();
    const match = s => !q || s.id.includes(q) || (s.ja || "").toLowerCase().includes(q);
    const groups = GROUPS.map(([st, name]) => [name, songs.filter(s => s.status === st && match(s))]);
    let html = "";
    if (importing) html += `<div class="group"><span>匯入中</span></div><div class="page importing">${icon("i-loader")}<span class="t">${esc(importing)}</span></div>`;
    for (const [name, list] of groups) {
      if (!list.length) continue;
      html += `<div class="group"><span>${name}</span><span>${list.length}</span></div>` + list.map(s => `
        <div class="page${D && D.song.id === s.id ? " on" : ""}" data-id="${s.id}" title="${esc(s.id)}">${icon("i-music")}<span class="t">${esc(s.ja)}</span>
          <span class="end">${s.low ? `<span class="pill red" style="height:18px;line-height:18px;font-size:11px">${s.low}</span>` : ""}${store.get(`studio-draft:${s.id}`) ? '<span class="dirty" title="有沒存的草稿" style="padding:0 4px">草稿</span>' : ""}</span>
        </div>`).join("");
    }
    $("songList").innerHTML = html || '<div class="empty-note">找不到</div>';
  }

  // ── 開一首歌 ──
  async function openSong(id, { keepView = false } = {}) {
    const d = await api(`/api/song?id=${encodeURIComponent(id)}`);
    if (d.error) { toast(d.error); return; }
    D = d;
    if (!keepView) ver = null;
    if (ver && !d.lives.some(x => x.yt === ver.yt)) ver = null;
    loadVersion();
    renderVersions();
    store.set("studio-last", id);
    if (location.hash.slice(1) !== id) history_replace(id);
    $("oldLink").href = `/tools/timing/?song=${encodeURIComponent(id)}`;
    if (!keepView) {
      win = [0, Math.min(30, DUR() || 30)];
      const first = L.findIndex(l => !isGap(l));
      sel = new Set([Math.max(0, first)]); anchor = Math.max(0, first);
      $("video").classList.remove("ready");
      $("ph").textContent = d.song.ja;
      player.load(ver ? ver.yt : d.song.yt);
    }
    checkDraft();
    renderAll();
  }

  // 目前版本（MV／現場）的歌詞、指紋、長度
  function loadVersion() {
    if (!ver) {
      base = D.base;
      L = D.lyrics.map(l => ({ ...l }));
      attachSources();
    } else {
      const same = D.live && D.live.youtubeId === ver.yt;
      base = D.live.base;
      L = same ? D.live.lyrics.map(l => ({ ...l, _lvl: null, _tr: null })) : [];
      liveDur = Math.max(same ? D.live.duration || 0 : 0, D.duration, L.length ? L[L.length - 1].time + 10 : 0);
    }
    savedJSON = JSON.stringify(clean(L));
    history = []; future = [];
  }
  function renderVersions() {
    const sel = $("verSel");
    sel.hidden = !D.lives.length;
    sel.innerHTML = `<option value="">MV 版</option>` + D.lives.map(x => `<option value="${x.yt}">現場：${esc(x.concert)}${x.official ? "（官方映像）" : ""}${D.live.youtubeId === x.yt ? " ●" : ""}</option>`).join("");
    sel.value = ver ? ver.yt : "";
  }
  async function switchVersion(yt) {
    ver = yt ? D.lives.find(x => x.yt === yt) || null : null;
    loadVersion();
    win = [0, Math.min(30, DUR() || 30)];
    sel = new Set(L.length ? [0] : []); anchor = 0;
    $("video").classList.remove("ready");
    player.load(ver ? ver.yt : D.song.yt);
    checkDraft();
    if (ver && !L.length) {
      const other = D.live.youtubeId && D.live.youtubeId !== ver.yt ? `這首的現場版目前是「${D.live.concert || D.live.youtubeId}」，存檔會換成這一場。` : "";
      showBanner(`「${ver.concert}」還沒有現場版時間軸。${other}`, [["從 MV 複製歌詞（先用 MV 的時間，再整段平移、打點）", copyFromMv]]);
    }
    renderAll();
  }
  function copyFromMv() {
    pushHistory();
    L = D.lyrics.map(l => ({ ...l, _lvl: null, _tr: null }));
    liveDur = Math.max(liveDur, L.length ? L[L.length - 1].time + 10 : 0);
    sel = new Set([0]); anchor = 0;
    hideBanner();
    changed();
    toast(`已從 MV 複製 ${L.length} 句：選全部（點第一句再 Shift＋End）整段平移，或一句句打點`, 5000);
  }
  const history_replace = id => { try { window.history.replaceState(null, "", `#${id}`); } catch (e) {} };

  // 信心、中文來源：用日文對回每一句（之後改了順序也對得上）
  function attachSources() {
    const lv = new Map();
    for (const x of D.timing?.lines || []) { if (!lv.has(x.jp)) lv.set(x.jp, []); lv.get(x.jp).push(x.level); }
    const off = new Map();
    for (const x of D.sources?.lines || []) if (x.tr === "official") off.set(x.jp, (off.get(x.jp) || 0) + 1);
    for (const l of L) {
      const a = lv.get(l.jp);
      l._lvl = a && a.length ? a.shift() : null;
      const t = D.translated?.[l.jp];
      l._tr = !l.tr ? null : t && t.tr === l.tr ? "agy" : off.get(l.jp) ? "official" : null;
      if (l._tr === "official") off.set(l.jp, off.get(l.jp) - 1);
    }
  }

  // ── 草稿：每次修改自動存在這台電腦 ──
  const draftKey = () => `studio-draft:${D.song.id}${ver ? `:live:${ver.yt}` : ""}`;
  function saveDraft() {
    if (!D) return;
    const now = JSON.stringify(clean(L));
    if (now === savedJSON) store.set(draftKey(), null);
    else store.set(draftKey(), JSON.stringify({ base, lines: L, at: Date.now() }));
  }
  function checkDraft() {
    const raw = store.get(draftKey());
    hideBanner();
    if (!raw) return;
    let dr;
    try { dr = JSON.parse(raw); } catch (e) { store.set(draftKey(), null); return; }
    if (JSON.stringify(clean(dr.lines)) === savedJSON) { store.set(draftKey(), null); return; }
    const when = new Date(dr.at).toLocaleString("zh-TW", { hour12: false });
    const stale = dr.base !== base;
    showBanner(`這首有沒存的草稿（${when}）${stale ? "，但歌詞檔之後被改過了（例如自動對時或命令列）：還原會蓋掉那些修改" : ""}。`, [
      ["還原草稿", () => { pushHistory(); L = dr.lines.map(l => ({ ...l })); hideBanner(); changed(); toast("已還原草稿，記得存檔"); }],
      ["丟掉", () => { store.set(draftKey(), null); hideBanner(); renderSongList(); }]
    ], stale ? "red" : "");
  }
  function showBanner(text, actions = [], cls = "") {
    const b = $("banner");
    b.className = `banner ${cls}`;
    b.innerHTML = `<span>${esc(text)}</span><span class="sp"></span>`;
    for (const [label, fn] of actions) {
      const btn = document.createElement("button");
      btn.className = "btn outline";
      btn.textContent = label;
      btn.onclick = fn;
      b.appendChild(btn);
    }
    b.hidden = false;
    fitVideo();
  }
  function hideBanner() { $("banner").hidden = true; fitVideo(); }

  // ── 修改：先記一步（可復原），改完重畫、存草稿 ──
  function pushHistory() {
    history.push(JSON.stringify(L));
    if (history.length > 300) history.shift();
    future = [];
  }
  function undo() { if (!history.length) return; future.push(JSON.stringify(L)); L = JSON.parse(history.pop()); changed(); }
  function redo() { if (!future.length) return; history.push(JSON.stringify(L)); L = JSON.parse(future.pop()); changed(); }
  function changed({ insp = true } = {}) {
    for (const i of [...sel]) if (i >= L.length) sel.delete(i);
    if (!sel.size && L.length) sel.add(Math.min(anchor, L.length - 1));
    saveDraft();
    renderHeader();
    if (view === "tl") drawTimeline(); else drawTable();
    if (insp && !$("insp").contains(document.activeElement)) drawInsp();
    checkOrder();
    renderCounts();
  }
  const selected = () => [...sel].sort((a, b) => a - b);

  function setTimes(map) { // map: index → time；手動改過的句子算「已確認」
    for (const [i, t] of map) { L[i].time = r3(Math.max(0, Math.min(DUR(), t))); if (!isGap(L[i])) L[i]._lvl = "ok"; }
  }
  function punch() {
    if (!L.length) return;
    const i = anchor;
    const t = player.time() - (Number($("lag").value) || 0) / 1000;
    pushHistory();
    setTimes(new Map([[i, t]]));
    const next = Math.min(L.length - 1, i + 1);
    sel = new Set([next]); anchor = next;
    changed();
  }
  function nudge(d) {
    if (!sel.size) return;
    pushHistory();
    setTimes(new Map(selected().map(i => [i, L[i].time + d])));
    changed();
  }
  function toggleAct(a) {
    const ids = selected().filter(i => !isGap(L[i]));
    if (!ids.length) return;
    pushHistory();
    const all = ids.every(i => (L[i].acts || []).includes(a));
    for (const i of ids) {
      const s = new Set(L[i].acts || []);
      all ? s.delete(a) : s.add(a);
      L[i].acts = ACT_KEYS.filter(k => s.has(k));
      if (!L[i].acts.length) delete L[i].acts;
    }
    changed();
  }
  function clearActs() {
    pushHistory();
    for (const i of selected()) { delete L[i].acts; delete L[i].sing; delete L[i].call; delete L[i].how; }
    changed();
  }
  function insertAfter(i) {
    pushHistory();
    const t = i < 0 ? 0 : L[i + 1] ? (L[i].time + L[i + 1].time) / 2 : Math.min(DUR(), L[i].time + 2);
    L.splice(i + 1, 0, { time: r3(t), jp: "", tr: "", _lvl: "ok" });
    sel = new Set([i + 1]); anchor = i + 1;
    changed();
    setTimeout(() => document.querySelector("#insp textarea.jp")?.focus(), 0);
  }
  function deleteSelected() {
    const ids = selected();
    if (!ids.length || !confirm(`刪除 ${ids.length} 句？（可以按復原救回來）`)) return;
    pushHistory();
    for (const i of ids.reverse()) L.splice(i, 1);
    anchor = Math.min(ids[ids.length - 1], L.length - 1);
    sel = new Set([Math.max(0, anchor)]);
    changed();
  }
  function sortByTime() {
    pushHistory();
    const idx = L.map((l, i) => i).sort((a, b) => L[a].time - L[b].time || a - b);
    L = idx.map(i => L[i]);
    sel = new Set([0]); anchor = 0;
    changed();
  }

  // 時間順序亂掉時提醒（存檔會被擋下來）
  function checkOrder() {
    if (!$("banner").hidden && !$("banner").dataset.order) return;
    const bad = L.findIndex((l, i) => i > 0 && l.time < L[i - 1].time);
    if (bad > 0) {
      showBanner(`第 ${bad + 1} 句（${fmt(L[bad].time)}）比上一句早，存檔前要排好。`, [["依時間排序", () => { $("banner").dataset.order = ""; hideBanner(); sortByTime(); }]], "red");
      $("banner").dataset.order = "1";
    } else if ($("banner").dataset.order) { $("banner").dataset.order = ""; hideBanner(); }
  }

  // ── 存檔 ──
  async function save() {
    if (!D || JSON.stringify(clean(L)) === savedJSON) { toast("沒有要存的修改"); return true; }
    const bad = L.findIndex((l, i) => i > 0 && l.time < L[i - 1].time);
    if (bad > 0) { toast(`第 ${bad + 1} 句比上一句早，先排好再存`); return false; }
    if (ver && D.live.youtubeId && D.live.youtubeId !== ver.yt && !confirm(`這首的現場版目前是「${D.live.concert || D.live.youtubeId}」。一首歌只存一場現場版，存檔會換成「${ver.concert}」。繼續？`)) return false;
    $("btnSave").disabled = true;
    const r = await api("/api/lyrics", { id: D.song.id, lyrics: clean(L), base, live: ver ? { yt: ver.yt, concert: ver.concert, duration: Math.round(liveDur) } : undefined });
    if (!r.ok) {
      renderHeader();
      if (r.conflict) {
        showBanner(r.error, [["重新載入（草稿保留在這台電腦）", () => openSong(D.song.id)]], "red");
      } else alert(`存檔失敗：\n${r.error}`);
      return false;
    }
    base = r.base;
    savedJSON = JSON.stringify(clean(L));
    store.set(draftKey(), null);
    if (ver) { D.live = { ...D.live, youtubeId: ver.yt, concert: ver.concert, base: r.base, lyrics: clean(L), duration: Math.round(liveDur) }; renderVersions(); }
    renderHeader(); renderSongList();
    toast(`已存檔：${r.changes.join("、") || "沒有變更"}${r.warnings?.length ? `（${r.warnings[0]}）` : ""}`);
    return true;
  }

  // ── 畫面 ──
  function renderHeader() {
    const dirty = D && JSON.stringify(clean(L)) !== savedJSON;
    $("dirty").hidden = !dirty;
    $("btnSave").disabled = !dirty;
    $("btnUndo").disabled = !history.length;
    $("btnRedo").disabled = !future.length;
    $("crumbTitle").textContent = D ? `${D.song.ja}${ver ? `（現場：${ver.concert}）` : ""}` : "選一首歌";
    $("crumbGroup").textContent = D ? STATUS[D.song.status][0] : "—";
    document.title = D ? `${dirty ? "● " : ""}${D.song.ja}｜Ado Studio` : "Ado Studio";
    document.querySelectorAll("#songList .page").forEach(p => p.classList.toggle("on", !!D && p.dataset.id === D.song.id));
  }
  function renderCounts() {
    const red = L.filter(isRed).length, mid = L.filter(l => l._lvl === "mid").length;
    $("confCount").innerHTML = (red ? `<span class="pill red">${red} 句要檢查</span> ` : "") + (mid ? `<span class="pill yellow">${mid} 句中信心</span>` : "");
    $("btnNextRed").disabled = !red;
  }
  function renderAll() {
    renderHeader();
    renderSongList();
    if (view === "tl") drawTimeline(); else drawTable();
    drawInsp();
    renderCounts();
    checkOrder();
    fitVideo();
  }

  // 預覽：影片依可用空間縮成 16:9
  function fitVideo() {
    const m = $("monitor"), cs = getComputedStyle(m);
    const w = m.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const h = m.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const vw = Math.max(160, Math.min(w, (h * 16) / 9));
    $("video").style.width = `${vw}px`;
    $("video").style.height = `${(vw * 9) / 16}px`;
  }

  // ── 時間軸 ──
  const span = () => win[1] - win[0];
  const x = t => ((t - win[0]) / span()) * 100;
  const pos = (a, b) => `left:${x(a)}%;width:${Math.max(0, x(b) - x(a))}%`;
  const trackWidth = () => $("trLyr").clientWidth || 1;
  const timeAt = (el, clientX) => { const r = el.getBoundingClientRect(); return win[0] + ((clientX - r.left) / r.width) * span(); };
  const beat = () => (ver ? null : D?.song.beat || null);
  const climax = () => (ver ? null : D?.song.climax ?? null);
  function sections() {
    if (ver) return [];
    const secs = D?.analysis?.sections || [];
    const labels = [...new Set(secs.map(s => s.label))];
    return secs.map(s => ({ ...s, name: s.chorus ? "副歌" : `段落 ${s.label}`, color: s.chorus ? "orange" : SEC_COLORS[labels.indexOf(s.label) % SEC_COLORS.length] }));
  }

  function drawTimeline() {
    if (!D) { ["ruler", "trSec", "trBeat", "trLyr", "trAct", "trOv"].forEach(id => ($(id).innerHTML = "")); return; }
    $("zoomLab").textContent = `${fmt(win[0], false)}–${fmt(win[1], false)}`;
    const step = span() > 120 ? 10 : span() > 50 ? 5 : 2;
    let r = "";
    for (let s = Math.ceil(win[0] / step) * step; s < win[1]; s += step) r += `<span style="left:${x(s)}%">${s % (step * 5) === 0 || step >= 5 ? fmt(s, false) : ""}</span>`;
    $("ruler").innerHTML = r;

    const cx = climax();
    $("trSec").innerHTML = (sections().filter(s => s.end > win[0] && s.start < win[1]).map(s =>
      `<div class="sec" style="${pos(s.start, s.end - 0.1)};background:var(--${s.color}-bg)">${s.name}</div>`).join("") ||
      `<span class="empty-note" style="position:absolute;left:6px;top:6px">${ver ? "現場版沒有段落分析" : D.hasAudio ? "還沒分析：歌曲分頁 →「分析音訊」" : "沒有音訊：匯入時會下載"}</span>`) +
      (cx != null ? `<div class="climax" style="left:${x(cx)}%" title="副歌高潮 ${fmt(cx)}"></div>` : "");

    const bt = beat();
    let b = "";
    if (bt) {
      const P = 60 / bt[0];
      const n0 = Math.ceil((win[0] - bt[1]) / P), n1 = Math.floor((win[1] - bt[1]) / P);
      if ((n1 - n0) < 1500) for (let n = n0; n <= n1; n++) b += `<i class="beat${bt[2] && ((n % 4) + 4) % 4 === 0 ? " bar" : ""}" style="left:${x(bt[1] + n * P)}%"></i>`;
    }
    $("trBeat").innerHTML = b;

    const cur = curIndex(player.time());
    $("trLyr").innerHTML = L.map((l, i) => {
      const end = endOf(i);
      if (end < win[0] || l.time > win[1]) return "";
      const lv = l._lvl;
      const c = isGap(l) ? " gap" : lv === "low" || lv === "none" ? " c-low" : lv === "mid" ? " c-mid" : lv === "ok" ? " ok" : lv === "high" ? "" : " plain";
      return `<div class="ly${c}${sel.has(i) ? " sel" : ""}${i === cur ? " cur" : ""}" data-i="${i}" style="${pos(l.time, end - 0.06)}" title="${i + 1}. ${esc(l.jp)}">${esc(l.jp || "（空白）")}${isGap(l) ? "" : `<em>${esc(l.tr || "")}</em><small>${fmt(l.time)}</small>`}</div>`;
    }).join("");

    // 應援：每句的動作，一種動作一條細線
    $("trAct").innerHTML = L.map((l, i) => {
      const sg = sugFor(l);
      if (sg) { const end = endOf(i); if (end < win[0] || l.time > win[1]) return ""; return `<div class="act-block guess" style="${pos(l.time, end - 0.06)};top:4px;background:var(--${ACT_INFO[sg.acts[0]]?.[1] || "gray"})" title="建議：${sg.acts.map(a => ACT_INFO[a]?.[0]).join("、")}（${esc(sg.why)}）"></div>`; }
      if (!l.acts || !l.acts.length) return "";
      const end = endOf(i);
      if (end < win[0] || l.time > win[1]) return "";
      return l.acts.map((a, k) => `<div class="act-block" style="${pos(l.time, end - 0.06)};top:${4 + k * 6}px;background:var(--${ACT_INFO[a]?.[1] || "gray"})" title="${ACT_INFO[a]?.[0] || a}${l.call ? `：${esc(l.call)}` : ""}"></div>`).join("");
    }).join("");

    drawOverview();
    drawWave();
    placePlayhead(player.time());
  }

  function drawOverview() {
    const d = DUR() || 1, o = v => (v / d) * 100;
    $("trOv").innerHTML =
      sections().map(s => `<i class="ov-sec" style="left:${o(s.start)}%;width:${o(s.end - s.start)}%;background:var(--${s.color}-bg)"></i>`).join("") +
      L.map(l => (isRed(l) ? `<i class="ov-red" style="left:${o(l.time)}%"></i>` : l._lvl === "mid" ? `<i class="ov-mid" style="left:${o(l.time)}%"></i>` : "")).join("") +
      (climax() != null ? `<i class="ov-climax" style="left:${o(climax())}%"></i>` : "") +
      `<i class="ov-win" style="left:${o(win[0])}%;width:${o(span())}%"></i><i class="ov-now" id="ovNow" style="left:${o(player.time())}%"></i>`;
  }

  function drawWave() {
    const cv = $("wave"), dpr = devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext("2d");
    g.scale(dpr, dpr);
    const env = ver ? null : D?.analysis?.envelope;
    if (!env) { g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--ink-3"); g.font = "12px sans-serif"; g.fillText(D ? "還沒分析音訊，沒有波形" : "", 8, h / 2 + 4); return; }
    const css = getComputedStyle(document.documentElement);
    const now = player.time(), px = (x(now) / 100) * w;
    for (let i = 0; i < w; i += 3) {
      const t = win[0] + (i / w) * span();
      const v = (env.values[Math.floor(t / env.hop)] || 0) / 100;
      const bh = Math.max(1, v * (h - 12));
      g.fillStyle = i < px ? css.getPropertyValue("--accent") : css.getPropertyValue("--ink-3");
      g.globalAlpha = i < px ? 0.75 : 0.5;
      g.fillRect(i, (h - bh) / 2, 2, bh);
    }
  }

  function placePlayhead(t) {
    const tl = $("tl"), lab = tl.querySelector(".tl-lab").getBoundingClientRect().width;
    const w = tl.getBoundingClientRect().width - lab, act = $("trAct");
    const px = x(t);
    $("playhead").style.display = px < 0 || px > 100 ? "none" : "";
    $("playhead").style.left = `${lab + (px / 100) * w}px`;
    $("playhead").style.height = `${act.offsetTop + act.offsetHeight}px`;
    const ov = $("ovNow");
    if (ov) ov.style.left = `${(t / (DUR() || 1)) * 100}%`;
  }

  function setWin(a, s) {
    s = Math.max(4, Math.min(Math.max(10, DUR() + 4), s));
    a = Math.max(-1, Math.min(DUR() + 2 - s, a));
    win = [a, a + s];
    drawTimeline();
  }
  const zoom = (f, at) => { const c = at ?? player.time(); const s = span() * f; setWin(c - ((c - win[0]) / span()) * s, s); };
  const ensureVisible = t => { if (t < win[0] || t > win[1]) setWin(t - span() * 0.25, span()); };

  // ── 歌詞表 ──
  function drawTable() {
    if (!D) { $("tableView").innerHTML = ""; return; }
    const cur = curIndex(player.time());
    $("tableView").innerHTML = `<table class="table"><thead><tr>
      <th class="n">#</th><th>${icon("i-clock")}時間</th><th>${icon("i-text")}日文</th><th>${icon("i-lang")}中文</th><th>${icon("i-hand")}應援</th><th>${icon("i-status")}信心</th>
    </tr></thead><tbody>${L.map((l, i) => `<tr data-i="${i}" class="${sel.has(i) ? "on" : ""}${isGap(l) ? " gaprow" : ""}${i === cur ? " cur" : ""}">
      <td class="n">${i + 1}</td><td class="t mono">${fmt(l.time)}</td><td>${esc(l.jp)}</td><td class="trc">${esc(l.tr || "")}${l._tr === "agy" ? ' <span class="pill yellow">agy</span>' : ""}</td>
      <td>${(l.acts || []).map(a => `<span class="pill ${ACT_INFO[a]?.[1] || ""}">${ACT_INFO[a]?.[0] || a}</span>`).join(" ")}${l.call ? ` <span class="muted">「${esc(l.call)}」</span>` : ""}</td>
      <td>${!isGap(l) && LEVEL[l._lvl] ? `<span class="pill ${LEVEL[l._lvl][1]}">${LEVEL[l._lvl][0]}</span>` : ""}</td>
    </tr>`).join("")}</tbody></table>`;
    const row = $("tableView").querySelector("tr.on");
    if (row) row.scrollIntoView({ block: "nearest" });
  }

  // ── 檢查器 ──
  const prop = (ic, k, v) => `<div class="prop"><div class="prop-k">${icon(ic)}${k}</div><div class="prop-v">${v}</div></div>`;
  function drawInsp() {
    document.querySelectorAll("#peekTabs .tab").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    const n = researchItems().length;
    $("intelCount").hidden = !n;
    $("intelCount").textContent = n;
    if (!D) { $("insp").innerHTML = `<div class="empty-state">從左邊選一首歌，或貼上 YouTube 網址匯入新歌。</div>`; return; }
    $("insp").innerHTML = tab === "song" ? songTab() : tab === "intel" ? intelTab() : lineTab();
    if (tab === "song") bindSongTab();
  }

  function lineTab() {
    const ids = selected();
    if (!ids.length) return `<div class="empty-state">點時間軸或歌詞表上的一句。</div>`;
    if (ids.length > 1) {
      const acts = ACT_KEYS.map((k, n) => { const all = ids.every(i => (L[i].acts || []).includes(k)); return `<button class="act-pill${all ? " on" : ""}" data-act="${k}" style="--c:var(--${ACT_INFO[k][1]});--c-bg:var(--${ACT_INFO[k][1]}-bg)" title="快捷鍵 ${n + 1}"><i class="sw"></i>${ACT_INFO[k][0]}</button>`; }).join("");
      return `<h2>已選 ${ids.length} 句</h2><div class="sub">第 ${ids[0] + 1}–${ids[ids.length - 1] + 1} 句・${fmt(L[ids[0]].time)} – ${fmt(endOf(ids[ids.length - 1]))}</div>
        ${prop("i-clock", "整段平移", `<div class="time-edit"><button class="nudge" data-nudge="-0.2">−.2</button><button class="nudge" data-nudge="-0.05">−.05</button><input class="inline-input" id="shiftBy" placeholder="+1.5"><button class="nudge" data-nudge="0.05">+.05</button><button class="nudge" data-nudge="0.2">+.2</button></div>`)}
        ${prop("i-hand", "應援", `<div class="acts">${acts}</div>`)}
        <div class="peek-actions"><button class="btn outline" data-op="clearActs">清除應援</button><button class="btn danger" data-op="delete">${icon("i-trash")}刪除這 ${ids.length} 句</button></div>
        <div class="hint" style="margin-top:12px">Shift＋點：選一段；Ctrl／⌘＋點：加選。</div>`;
    }
    const i = ids[0], l = L[i];
    const lv = LEVEL[l._lvl];
    const sec = sections().find(s => l.time >= s.start && l.time < s.end);
    const prev = L[i - 1], next = L[i + 1];
    const acts = ACT_KEYS.map((k, n) => `<button class="act-pill${(l.acts || []).includes(k) ? " on" : ""}" data-act="${k}" style="--c:var(--${ACT_INFO[k][1]});--c-bg:var(--${ACT_INFO[k][1]}-bg)" title="快捷鍵 ${n + 1}"><i class="sw"></i>${ACT_INFO[k][0]}</button>`).join("");
    return `
      <h2>${esc(l.jp || "（空白）")}</h2>
      <div class="sub">第 ${i + 1} 句，共 ${L.length} 句・${fmt(l.time)} – ${fmt(endOf(i))}</div>
      ${prop("i-clock", "開始時間", `<div class="time-edit"><button class="nudge" data-nudge="-0.2" title="Shift+[">−.2</button><button class="nudge" data-nudge="-0.05" title="[">−.05</button><input id="timeIn" value="${l.time.toFixed(2)}"><button class="nudge" data-nudge="0.05" title="]">+.05</button><button class="nudge" data-nudge="0.2" title="Shift+]">+.2</button></div>`)}
      ${isGap(l) ? "" : prop("i-status", "對齊信心", lv ? `<span class="pill ${lv[1]}">${lv[0]}</span>${l._lvl === "low" || l._lvl === "none" ? '<span class="muted">按 Enter 試聽確認</span>' : ""}` : '<span class="muted">—</span>')}
      ${prop("i-layers", "段落", sec ? `<span class="pill ${sec.color}">${sec.name}</span>` : '<span class="muted">—</span>')}
      ${isGap(l) ? "" : prop("i-lang", "中文來源", l._tr === "official" ? '<span class="pill green">官方字幕</span>' : l._tr === "agy" ? '<span class="pill yellow">agy 翻譯・待確認</span>' : '<span class="muted">—</span>')}
      ${isGap(l) ? "" : prop("i-hand", "應援", `<div class="acts">${acts}</div>`)}
      ${(() => { const sg = sugFor(l); return sg ? `<div class="suggest">建議：<b>${sg.acts.map(a => ACT_INFO[a]?.[0]).join("、")}</b><button class="btn outline" data-op="adoptSug">採用</button><span class="why">${esc(sg.why)}；只是候選，請對照現場資料</span></div>` : ""; })()}
      <div class="block-label">日文</div>
      <textarea class="edit jp" rows="1" data-field="jp">${esc(l.jp)}</textarea>
      ${isGap(l) ? "" : `<div class="block-label">中文</div><textarea class="edit" rows="1" data-field="tr">${esc(l.tr || "")}</textarea>
      <div class="block-label">觀眾要唱的字 <span>逗號分開；空白＝整句</span></div><input class="field-input" data-field="sing" value="${esc((l.sing || []).join(", "))}" placeholder="空白">
      <div class="block-label">喊聲</div><input class="field-input" data-field="call" value="${esc(l.call || "")}" placeholder="例如 Hey!">
      <div class="block-label">動作說明</div><input class="field-input" data-field="how" value="${esc(l.how || "")}" placeholder="例如 跟著節奏輕輕搖">`}
      <div class="peek-actions">
        <button class="btn outline" data-op="preview">${icon("i-play")}試聽這句 <span class="kbd">Enter</span></button>
        <button class="btn outline" data-op="now">設為目前時間</button>
      </div>
      <div class="peek-actions">
        <button class="btn" data-op="insert">${icon("i-plus")}下面加一句</button>
        ${isGap(l) ? "" : `<button class="btn" data-op="split" title="在日文的游標位置拆開（沒有游標時從中間的空白拆）">拆成兩句</button>`}
        <button class="btn danger" data-op="delete">${icon("i-trash")}刪除</button>
      </div>
      <div class="divider"></div>
      <div class="block-label">前後句</div>
      ${[prev && [i - 1, prev], next && [i + 1, next]].filter(Boolean).map(([k, x]) => `<div class="src" data-go="${k}" style="cursor:pointer"><span class="mono muted">${fmt(x.time)}</span><span class="t">${esc(x.jp)}</span></div>`).join("")}`;
  }

  // 歌曲分頁的表單（存在記憶體，按「存歌曲資料」才寫）
  let meta = null, analysisView = null;
  function metaFromSong() {
    const s = D.song;
    return { status: s.status, pen: s.pen, penGuess: s.penGuess, acts: s.acts.slice(), tips: s.tips.map(t => ({ ...t })), climax: s.climax, liveYt: s.liveVideo?.yt || "", liveConcert: s.liveVideo?.concert || "" };
  }
  function songTab() {
    if (!meta || meta._id !== D.song.id) { meta = metaFromSong(); meta._id = D.song.id; analysisView = null; }
    const s = D.song, m = meta, bt = s.beat;
    const pens = D.pens.map(k => { const at = m.pen.indexOf(k); return `<button class="pen-btn${at >= 0 ? " on" : ""}" data-pen="${k}"><i style="background:${PEN_INFO[k][1]}"></i>${PEN_INFO[k][0]}${at >= 0 ? `<b>${at + 1}</b>` : ""}</button>`; }).join("");
    const acts = ACT_KEYS.map(k => `<button class="act-pill${m.acts.includes(k) ? " on" : ""}" data-sact="${k}" style="--c:var(--${ACT_INFO[k][1]});--c-bg:var(--${ACT_INFO[k][1]}-bg)"><i class="sw"></i>${ACT_INFO[k][0]}</button>`).join("");
    const a = analysisView;
    return `
      <div class="peek-icon">${icon("i-music")}</div>
      <h2>${esc(s.ja)}</h2>
      <div class="sub">${esc(s.en)}・${s.id}${s.cover ? "・翻唱" : ""}・${s.len}・${s.date}</div>
      ${prop("i-status", "狀態", `<div class="status-seg">${Object.entries(STATUS).map(([k, [name, c]]) => `<button data-status="${k}" class="${m.status === k ? "on" : ""}" style="--c-bg:var(--${c}-bg)">${name}</button>`).join("")}</div>`)}
      ${prop("i-light", "手燈", `<div class="acts">${pens}</div>`)}
      ${prop("", "", `<label class="hint"><input type="checkbox" id="penGuess" ${m.penGuess ? "checked" : ""}> 只是預測（網站不顯示）</label>`)}
      ${prop("i-hand", "應援動作", `<div class="acts">${acts}</div>`)}
      <div class="block-label">應援重點 <button class="btn" data-op="addTip">${icon("i-plus")}新增</button></div>
      ${m.tips.map((t, i) => `<div class="tip-row"><input class="field-input" data-tip="${i}" data-k="zh" value="${esc(t.zh)}" placeholder="中文"><input class="field-input sm" data-tip="${i}" data-k="en" value="${esc(t.en)}" placeholder="English（選填）"><input class="field-input sm" data-tip="${i}" data-k="ja" value="${esc(t.ja)}" placeholder="日本語（選填）"><button class="btn x" data-deltip="${i}">${icon("i-x")}</button></div>`).join("") || '<div class="hint">沒有</div>'}
      ${prop("i-flag", "副歌高潮", `<input class="inline-input" id="climaxIn" value="${m.climax ?? ""}" placeholder="秒"><button class="btn" data-op="climaxNow">用目前時間</button>`)}
      ${prop("i-tv", "LIVE 映像", `<input class="inline-input" id="liveYt" style="width:110px" value="${esc(m.liveYt)}" placeholder="YouTube ID"><input class="inline-input" id="liveConcert" style="width:150px" value="${esc(m.liveConcert)}" placeholder="演唱會">`)}
      <div class="peek-actions"><button class="btn primary" data-op="saveMeta">存歌曲資料</button><button class="btn" data-op="resetMeta">還原</button></div>

      <div class="divider"></div>
      <div class="block-label">拍點 <span>${bt ? `BEAT [${bt.join(", ")}]` : "沒有 BEAT"}</span></div>
      ${a ? `<div class="kv">
          <span>BPM</span><div class="acts">${a.options.map((o, i) => `<button class="chip${i === a.pick ? " on" : ""}" data-bpm="${i}">${o.bpm}${i ? "" : "（建議）"}</button>`).join("")}</div>
          <span>第一小節</span><b>${a.options[a.pick].firstBar} 秒，第一拍${a.options[a.pick].barKnown ? "確定" : "不確定"}</b>
          <span>穩定度</span><span>${Math.round(a.beat.inliers * 100)}% 的拍落在格子上，平均差 ${a.beat.rmsMs} 毫秒${a.beat.reliable ? "" : "（不穩）"}</span>
          <span>副歌高潮</span><div class="acts">${a.climax.slice(0, 3).map(c => `<button class="chip" data-climax="${c.t}" title="${esc(c.note || "")}">${fmt(c.t)}（${esc(c.from)}）</button>`).join("") || "找不到"}</div>
        </div>
        ${a.warnings.map(w => `<div class="hint" style="color:var(--yellow)">• ${esc(w)}</div>`).join("")}
        <div class="peek-actions"><button class="btn outline" data-op="writeBeat">寫入 BEAT</button></div>`
        : `<div class="peek-actions"><button class="btn outline" data-op="analyze">${icon("i-metro")}分析音訊</button><span class="hint">算 BPM、第一小節、副歌高潮候選${D.hasAudio ? "" : "（會先下載音訊）"}</span></div>`}

      <div class="divider"></div>
      ${ver ? `<div class="mini-callout yellow">${icon("i-info")}<div>現在是現場版「${esc(ver.concert)}」。自動對時、翻譯、分析音訊、應援建議只做 MV 版；現場版可以「從 MV 複製歌詞」再整段平移、打點。</div></div>
      <div class="peek-actions"><button class="btn outline" data-op="copyMv">從 MV 複製歌詞</button></div>` : sugBlock()}
      <div class="block-label">自動處理</div>
      <div class="peek-actions">
        <button class="btn outline" data-op="align">${icon("i-wand")}自動對時</button>
        <button class="btn outline" data-op="translate">${icon("i-lang")}翻譯缺的中文</button>
        <button class="btn outline" data-op="paste">${icon("i-text")}貼上歌詞</button>
      </div>
      <div class="kv">
        <span>音訊</span><span>${D.hasAudio ? "有" : "沒有"}${D.hasVocals ? "・人聲已分離" : ""}</span>
        <span>對時</span><span>${D.timing ? `自動對時（${esc(D.timing.model)}）` : D.sources ? "官方字幕" : "人工"}</span>
        <span>作詞作曲</span><span>${esc((s.credit?.w || []).join("、") || "—")}</span>
        <span>合作</span><span>${esc(s.tie || "—")}</span>
      </div>`;
  }
  function bindSongTab() {
    const box = $("insp");
    box.querySelector("#penGuess")?.addEventListener("change", e => (meta.penGuess = e.target.checked));
    box.querySelector("#climaxIn")?.addEventListener("input", e => (meta.climax = e.target.value === "" ? null : Number(e.target.value)));
    box.querySelector("#liveYt")?.addEventListener("input", e => (meta.liveYt = e.target.value.trim()));
    box.querySelector("#liveConcert")?.addEventListener("input", e => (meta.liveConcert = e.target.value));
    box.querySelectorAll("[data-tip]").forEach(el => el.addEventListener("input", () => (meta.tips[+el.dataset.tip][el.dataset.k] = el.value)));
  }

  // 情報包（research/<id>.json）：逐項比對、採用
  const normJp = s => String(s || "").replace(/[（(][^）)]*[）)]/g, "").replace(/[\s、。，,.!！?？…「」『』]/g, "");
  const skipKey = () => `studio-intel-skip:${D.song.id}`;
  function researchItems() {
    const R = D?.research;
    if (!R) return [];
    const skip = new Set(JSON.parse(store.get(skipKey()) || "[]"));
    const items = [];
    const nowPen = (D.song.penGuess ? "?" : "") + D.song.pen;
    if (R.pen?.colors?.length && R.pen.colors.join("") !== D.song.pen) items.push({ key: "pen", title: "手燈色", now: nowPen ? [...D.song.pen].map(k => PEN_INFO[k]?.[0]).join("、") + (D.song.penGuess ? "（預測）" : "") : "（沒有）", next: R.pen.colors.map(k => PEN_INFO[k]?.[0] || k).join("、"), src: R.pen.src, sure: R.pen.sure });
    if (R.status != null && R.status !== D.song.status && STATUS[R.status]) items.push({ key: "status", title: "狀態", now: STATUS[D.song.status][0], next: STATUS[R.status][0], src: R.statusSrc, sure: true });
    if (Array.isArray(R.tips) && R.tips.length && JSON.stringify(R.tips) !== JSON.stringify(D.song.tips.map(t => t.zh))) items.push({ key: "tips", title: "應援重點", now: D.song.tips.map(t => t.zh).join("／") || "（沒有）", next: R.tips.join("／"), sure: true });
    (R.lines || []).forEach((x, k) => {
      const i = L.findIndex(l => normJp(l.jp) === normJp(x.jp));
      const l = L[i];
      const nextActs = (x.acts || []).join(",");
      if (l && (l.acts || []).join(",") === nextActs && (l.call || "") === (x.call || "")) return;
      items.push({ key: `line:${k}`, title: i >= 0 ? `第 ${i + 1} 句 ${x.jp}` : `${x.jp}（對不到歌詞）`, line: i, data: x,
        now: l ? ((l.acts || []).map(a => ACT_INFO[a]?.[0] || a).join("、") || "（沒有）") + (l.call ? `「${l.call}」` : "") : "—",
        next: (x.acts || []).map(a => ACT_INFO[a]?.[0] || a).join("、") + (x.call ? `「${x.call}」` : ""), src: x.src, sure: x.sure });
    });
    return items.filter(it => !skip.has(it.key));
  }
  function intelTab() {
    const R = D.research;
    if (!R) return `<div class="peek-icon" style="background:var(--yellow-bg);color:var(--yellow)">${icon("i-inbox")}</div><h2>情報包</h2>
      <div class="empty-state">這首還沒有情報包。請 Claude 查現場應援、手燈色，整理成 <span class="mono">research/${D.song.id}.json</span> 推上來；按上面的「同步」後就會出現在這裡，可以逐項比對、採用。</div>`;
    const items = researchItems();
    const srcName = i => { const s = R.sources?.[i]; return s ? esc(s.who || s.kind || `來源 ${i + 1}`) : ""; };
    return `<div class="peek-icon" style="background:var(--yellow-bg);color:var(--yellow)">${icon("i-inbox")}</div>
      <h2>情報包</h2>
      <div class="sub"><span class="mono">research/${D.song.id}.json</span>${R.updated ? `・${esc(R.updated)}` : ""}</div>
      <div class="block-label">來源</div>
      ${(R.sources || []).map(s => `<div class="src">${icon("i-ext")}<span class="t">${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.who || s.url)}</a>` : esc(s.who || "")}</span><span class="pill">${esc(s.kind || "")}</span></div>`).join("") || '<div class="hint">沒有寫來源</div>'}
      ${R.notes ? `<div class="mini-callout yellow">${icon("i-info")}<div>${esc(R.notes)}</div></div>` : ""}
      <div class="block-label">建議變更（${items.length}）</div>
      ${items.map(it => `<div class="intel">
        <div class="intel-head"><b>${esc(it.title)}</b><span class="pill ${it.sure ? "green" : "yellow"}">${it.sure ? "多個來源" : "待確認"}</span></div>
        <div class="diff"><span>目前</span><del>${esc(it.now)}</del><span>情報</span><div><ins>${esc(it.next)}</ins></div></div>
        ${(it.src || []).length ? `<div class="hint">來源：${it.src.map(srcName).join("、")}</div>` : ""}
        <div class="acts-row"><button class="btn outline" data-adopt="${esc(it.key)}"${it.line === -1 ? " disabled" : ""}>採用</button><button class="btn" data-skip="${esc(it.key)}">略過</button></div>
      </div>`).join("") || '<div class="hint">都採用或略過了。</div>'}
      ${items.length > 1 ? `<div class="peek-actions"><button class="btn primary" data-op="adoptAll">全部採用</button></div>` : ""}`;
  }
  async function adopt(key, { quiet = false } = {}) {
    const R = D.research, id = D.song.id;
    if (key.startsWith("line:")) {
      const x = R.lines[+key.slice(5)];
      const i = L.findIndex(l => normJp(l.jp) === normJp(x.jp));
      if (i < 0) return false;
      pushHistory();
      if (x.acts) { L[i].acts = ACT_KEYS.filter(k => x.acts.includes(k)); if (!L[i].acts.length) delete L[i].acts; }
      if (x.call != null) { if (x.call) L[i].call = x.call; else delete L[i].call; }
      if (x.sing != null) { if (x.sing.length) L[i].sing = x.sing; else delete L[i].sing; }
      changed({ insp: false });
      return true;
    }
    const body = key === "pen" ? { id, pen: R.pen.colors.join("") } : key === "status" ? { id, status: R.status === "" ? "ok" : R.status } : { id, tips: R.tips };
    const r = await api("/api/meta", body);
    if (!r.ok) { alert(r.error); return false; }
    if (!quiet) toast(r.changes.join("、") || "沒有變更");
    await refreshMeta();
    return true;
  }

  // 只重讀歌曲資料（不動歌詞草稿）
  async function refreshMeta() {
    const d = await api(`/api/song?id=${encodeURIComponent(D.song.id)}`);
    if (d.error) return;
    D = { ...d, lyrics: D.lyrics };
    meta = null;
    loadSongs();
    if (view === "tl") drawTimeline();
    drawInsp();
  }

  // ── 檢查器的按鈕 ──
  $("insp").addEventListener("click", async e => {
    const t = e.target.closest("button, [data-go]");
    if (!t || !D) return;
    const ids = selected(), i = ids[0];
    if (t.dataset.go != null) return select(+t.dataset.go, { seek: true });
    if (t.dataset.nudge) return nudge(Number(t.dataset.nudge));
    if (t.dataset.act) return toggleAct(t.dataset.act);
    if (t.dataset.adopt) { if (await adopt(t.dataset.adopt)) drawInsp(); return; }
    if (t.dataset.skip) { const s = new Set(JSON.parse(store.get(skipKey()) || "[]")); s.add(t.dataset.skip); store.set(skipKey(), JSON.stringify([...s])); return drawInsp(); }
    // 歌曲分頁
    if (t.dataset.status != null) { meta.status = t.dataset.status; return drawInsp(); }
    if (t.dataset.pen) { const k = t.dataset.pen; meta.pen = meta.pen.includes(k) ? meta.pen.replace(k, "") : meta.pen + k; return drawInsp(); }
    if (t.dataset.sact) { const k = t.dataset.sact; meta.acts = meta.acts.includes(k) ? meta.acts.filter(a => a !== k) : ACT_KEYS.filter(a => a === k || meta.acts.includes(a)); return drawInsp(); }
    if (t.dataset.deltip != null) { meta.tips.splice(+t.dataset.deltip, 1); return drawInsp(); }
    if (t.dataset.bpm != null) { analysisView.pick = +t.dataset.bpm; return drawInsp(); }
    if (t.dataset.climax) { meta.climax = Number(t.dataset.climax); return drawInsp(); }
    switch (t.dataset.op) {
      case "preview": return preview();
      case "now": pushHistory(); setTimes(new Map([[i, player.time()]])); return changed();
      case "insert": return insertAfter(i);
      case "delete": return deleteSelected();
      case "clearActs": return clearActs();
      case "addTip": meta.tips.push({ zh: "", en: "", ja: "" }); return drawInsp();
      case "climaxNow": meta.climax = Math.round(player.time() * 100) / 100; return drawInsp();
      case "resetMeta": meta = null; return drawInsp();
      case "saveMeta": return saveMeta();
      case "analyze": return runAnalyze();
      case "writeBeat": return writeBeat();
      case "align": return runJob("align");
      case "translate": return runJob("translate");
      case "paste": return openPaste();
      case "copyMv": return L.length && !confirm("用 MV 的歌詞取代現場版目前的內容？（可以復原）") ? undefined : copyFromMv();
      case "split": return splitLine(i);
      case "adoptSug": return adoptSuggestions([i]);
      case "adoptAllSug": return adoptSuggestions(L.map((l, k) => k).filter(k => sugFor(L[k])));
      case "songSug": meta.tips = D.songSuggestion.tips.map(zh => ({ zh, en: "", ja: "" })); return drawInsp();
      case "adoptAll": { for (const it of researchItems()) await adopt(it.key, { quiet: true }); toast("已採用全部建議：應援動作改在歌詞草稿上，記得存檔"); return drawInsp(); }
    }
  });
  $("insp").addEventListener("change", e => {
    if (e.target.id === "timeIn") {
      const v = e.target.value.trim();
      const t = /^\d+:\d/.test(v) ? v.split(":").reduce((a, b) => a * 60 + +b, 0) : Number(v);
      if (!Number.isFinite(t)) { toast("時間要寫成秒數或 m:ss"); return drawInsp(); }
      pushHistory(); setTimes(new Map([[selected()[0], t]])); changed();
    }
    if (e.target.id === "shiftBy") {
      const d = Number(e.target.value);
      if (Number.isFinite(d) && d) nudge(d);
    }
  });
  // 打字：第一次輸入時記一步，之後只更新（不重畫檢查器，游標不會跳掉）
  let typingSnap = false;
  $("insp").addEventListener("focusin", () => (typingSnap = false));
  $("insp").addEventListener("input", e => {
    const f = e.target.dataset.field;
    if (!f || !D) return;
    const i = selected()[0];
    if (!typingSnap) { pushHistory(); typingSnap = true; }
    const v = e.target.value;
    if (f === "sing") { const a = v.split(/[,，、]/).map(s => s.trim()).filter(Boolean); if (a.length) L[i].sing = a; else delete L[i].sing; }
    else if (f === "call" || f === "how") { if (v.trim()) L[i][f] = v; else delete L[i][f]; }
    else { L[i][f] = v; if (f === "tr") L[i]._tr = null; }
    if (e.target.tagName === "TEXTAREA") { e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }
    changed({ insp: false });
  });

  async function saveMeta() {
    const m = meta;
    if (m.climax != null && !(m.climax > 0 && m.climax <= DUR())) { toast("副歌高潮要在 MV 長度內"); return; }
    const body = {
      id: D.song.id, status: m.status === "" ? "ok" : m.status, acts: m.acts.length ? m.acts : "none",
      tips: m.tips.filter(t => t.zh.trim()), pen: m.pen ? (m.penGuess ? "?" : "") + m.pen : "none",
      climax: m.climax == null ? "none" : m.climax
    };
    if (m.liveYt || m.liveConcert) { body.liveYt = m.liveYt || "none"; body.liveConcert = m.liveConcert; } else if (D.song.liveVideo) body.liveYt = "none";
    const r = await api("/api/meta", body);
    if (!r.ok) { alert(`還不能存：\n${r.error}`); return; }
    toast(r.changes.length ? `已存：${r.changes.join("、")}` : "跟檔案裡一樣，沒有變更");
    await refreshMeta();
  }

  async function runAnalyze() {
    toast("分析中…（沒有音訊會先下載，第一次大約半分鐘）", 60000);
    const r = await api("/api/analyze", { id: D.song.id });
    if (!r.ok) { toast(""); alert(`分析失敗：\n${r.error}`); return; }
    toast("分析完成");
    analysisView = { beat: r.beat, options: [{ bpm: r.beat.bpm, firstBar: r.beat.firstBar, barKnown: r.beat.barKnown }, ...r.beat.alternatives], pick: 0, climax: r.climaxCandidates, warnings: r.warnings };
    const d = await api(`/api/song?id=${encodeURIComponent(D.song.id)}`);
    if (!d.error) { D.analysis = d.analysis; D.hasAudio = d.hasAudio; }
    drawTimeline(); drawInsp();
  }
  async function writeBeat() {
    const o = analysisView.options[analysisView.pick];
    const next = `[${o.bpm}, ${o.firstBar}, ${o.barKnown ? 1 : 0}]`;
    if (!confirm(`〈${D.song.ja}〉的 BEAT\n${D.song.beat ? `[${D.song.beat.join(", ")}]` : "（沒有）"} → ${next}\n\n寫入 songs.js？`)) return;
    const r = await api("/api/analyze", { id: D.song.id, apply: true, overwrite: true, only: "beat", bpm: o.bpm });
    if (!r.ok) { alert(r.error); return; }
    toast(r.changes.join("、") || "沒有變更");
    const keep = analysisView;
    await refreshMeta();
    analysisView = keep;
    drawInsp();
  }
  async function runJob(kind) {
    if (JSON.stringify(clean(L)) !== savedJSON) {
      if (!confirm("有還沒存的修改。要先存檔再繼續嗎？")) return;
      if (!(await save())) return;
    }
    const missing = L.filter(l => !isGap(l) && l.jp && !(l.tr || "").trim()).length;
    if (kind === "translate" && !missing) { toast("每一句都有中文了"); return; }
    if (!confirm(kind === "align" ? `把〈${D.song.ja}〉的日文歌詞對到人聲上，寫回每句的時間？\n（沒有音訊會先下載；第一次會下載模型，沒有顯卡要幾分鐘）` : `把沒有中文的 ${missing} 句交給 agy 翻譯，寫進歌詞檔？（之後請看過再發布）`)) return;
    toast(kind === "align" ? "自動對時中…" : "翻譯中…", 600000);
    const r = await api(kind === "align" ? "/api/align" : "/api/translate", { id: D.song.id, apply: true });
    toast("");
    if (!r.ok) { alert(`${kind === "align" ? "自動對時" : "翻譯"}失敗：\n${r.error}`); return; }
    await openSong(D.song.id, { keepView: true });
    showBanner(`${r.changes.join("、") || "沒有變更"}${r.warnings?.length ? `。${r.warnings.join("；")}` : ""}`, [["知道了", hideBanner]]);
    loadSongs();
  }

  // ── 應援建議（只是候選；量過的命中率寫在說明裡） ──
  function sugFor(l) {
    if (ver || !D?.suggestions || (l.acts && l.acts.length) || isGap(l)) return null;
    return D.suggestions.find(x => x.jp === l.jp) || null;
  }
  function sugBlock() {
    const n = L.filter(sugFor).length, ss = D.songSuggestion;
    if (!n && !ss) return "";
    return `<div class="block-label">應援建議 <span>只是候選</span></div>
      ${n ? `<div class="suggest">${n} 句可能有應援（時間軸上的斜線）<button class="btn outline" data-op="adoptAllSug">全部採用到草稿</button><span class="why">依歌詞特徵：括號裡的和聲 71%、英文重複句 32%、出現 3 次以上 23% 在現有歌曲裡有應援</span></div>` : ""}
      ${ss && !meta.tips.length ? `<div class="suggest">應援重點：「${esc(ss.tips[0])}」<button class="btn outline" data-op="songSug">用這個寫法</button><span class="why">${esc(ss.why)}</span></div>` : ""}`;
  }
  function adoptSuggestions(ids) {
    ids = ids.filter(k => sugFor(L[k]));
    if (!ids.length) return;
    if (D.song.status === "" && !confirm(`〈${D.song.ja}〉是「正式」狀態，採用的應援存檔後會直接顯示在網站上。確定要採用 ${ids.length} 句建議？`)) return;
    pushHistory();
    for (const k of ids) L[k].acts = sugFor(L[k]).acts.slice();
    changed();
    toast(`已採用 ${ids.length} 句建議，記得存檔`);
  }
  let lastCaret = null;
  $("insp").addEventListener("keyup", e => { if (e.target.matches("textarea.jp")) lastCaret = { i: anchor, pos: e.target.selectionStart }; });
  $("insp").addEventListener("mouseup", e => { if (e.target.matches("textarea.jp")) lastCaret = { i: anchor, pos: e.target.selectionStart }; });
  function splitAt(text, pos) {
    if (pos != null && pos > 0 && pos < text.length) return [text.slice(0, pos).trim(), text.slice(pos).trim()];
    const mid = text.length / 2;
    let best = -1;
    for (let k = 0; k < text.length; k++) if (/[\s　]/.test(text[k]) && (best < 0 || Math.abs(k - mid) < Math.abs(best - mid))) best = k;
    return best > 0 ? [text.slice(0, best).trim(), text.slice(best + 1).trim()] : null;
  }
  function splitLine(i) {
    const l = L[i];
    const caret = lastCaret && lastCaret.i === i ? lastCaret.pos : null;
    const jp = splitAt(l.jp, caret) || [l.jp.slice(0, Math.ceil(l.jp.length / 2)), l.jp.slice(Math.ceil(l.jp.length / 2))];
    const tr = splitAt(l.tr || "", null) || [l.tr || "", ""];
    pushHistory();
    const mid = r3((l.time + endOf(i)) / 2);
    const second = { time: mid, jp: jp[1], tr: tr[1], _lvl: "ok" };
    L[i] = { ...l, jp: jp[0], tr: tr[0] };
    delete L[i].sing;
    L.splice(i + 1, 0, second);
    lastCaret = null;
    changed();
    toast("拆成兩句：第二句的時間先放在中間，請打點確認");
  }

  // ── 貼上整首歌詞 ──
  function openPaste() {
    $("pasteText").value = L.map(l => `${l.time.toFixed(2)}\t${l.jp}\t${l.tr || ""}`).join("\n");
    $("pasteAlign").checked = false;
    $("pasteKeep").checked = true;
    $("pasteDlg").showModal();
    $("pasteText").focus();
  }
  // Tab 鍵在文字框裡打 Tab，不要跳走
  $("pasteText").addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.target, a = el.selectionStart;
    el.value = el.value.slice(0, a) + "\t" + el.value.slice(el.selectionEnd);
    el.selectionStart = el.selectionEnd = a + 1;
  });
  $("pasteDlg").addEventListener("close", async () => {
    if ($("pasteDlg").returnValue !== "ok") return;
    const text = $("pasteText").value;
    if (!text.trim()) return;
    if (JSON.stringify(clean(L)) !== savedJSON && !confirm("有還沒存的修改，貼上會取代整首（草稿會丟掉）。繼續？")) return;
    const doAlign = $("pasteAlign").checked;
    toast(doAlign ? "匯入並自動對時中…" : "匯入中…", 600000);
    const r = await api("/api/lyrics-import", { id: D.song.id, text, align: doAlign, keepActs: $("pasteKeep").checked });
    toast("");
    if (!r.ok) { alert(`匯入失敗：\n${r.error}`); return; }
    store.set(draftKey(), null);
    await openSong(D.song.id, { keepView: true });
    showBanner(`${r.changes.join("、")}${r.warnings?.length ? `。${r.warnings.join("；")}` : ""}`, [["知道了", hideBanner]]);
  });

  // ── 選取、播放 ──
  function select(i, { seek = false, add = false, range = false } = {}) {
    if (i < 0 || i >= L.length) return;
    if (range) { const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]; sel = new Set(Array.from({ length: b - a + 1 }, (_, k) => a + k)); }
    else if (add) { sel.has(i) && sel.size > 1 ? sel.delete(i) : sel.add(i); anchor = i; }
    else { sel = new Set([i]); anchor = i; }
    if (seek) { player.seek(L[i].time); ensureVisible(L[i].time); }
    if (tab !== "line") tab = "line";
    if (view === "tl") drawTimeline(); else drawTable();
    drawInsp();
  }
  let loopRange = null;
  function preview() { const i = anchor; if (!L[i]) return; player.seek(Math.max(0, L[i].time - 2)); player.play(); }
  function toggleLoop() {
    loopOn = !loopOn;
    $("btnLoop").classList.toggle("on", loopOn);
    $("btnLoop").classList.add("on-toggle");
    if (loopOn) { loopRange = [L[anchor].time, endOf(anchor)]; player.seek(loopRange[0]); player.play(); } else loopRange = null;
  }
  function nextRed(dir = 1) {
    const n = L.length;
    for (let k = 1; k <= n; k++) { const i = (anchor + dir * k + n) % n; if (isRed(L[i])) return select(i, { seek: true }); }
  }

  // ── 時間軸的滑鼠操作：點選、拖曳改時間、點空白處跳轉、滾輪捲動／縮放 ──
  let drag = null;
  $("trLyr").addEventListener("pointerdown", e => {
    const el = e.target.closest(".ly");
    if (!el) { player.seek(timeAt($("trLyr"), e.clientX)); return; }
    const i = +el.dataset.i;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { select(i, { range: e.shiftKey, add: e.ctrlKey || e.metaKey }); return; }
    if (!sel.has(i)) select(i);
    drag = { i, x0: e.clientX, moved: false, orig: new Map(selected().map(k => [k, L[k].time])), snap: JSON.stringify(L) };
    $("trLyr").setPointerCapture(e.pointerId); // 選取時時間軸會重畫，抓在外框上
  });
  $("trLyr").addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < 4) return;
    drag.moved = true;
    let dt = (dx / trackWidth()) * span();
    const bt = beat();
    if (snap && bt && !e.altKey) { // 吸附：拖的那句對齊最近的拍
      const P = 60 / bt[0], t = drag.orig.get(drag.i) + dt;
      dt = bt[1] + Math.round((t - bt[1]) / P) * P - drag.orig.get(drag.i);
    }
    const ids = selected(), lo = ids[0], hi = ids[ids.length - 1];
    const min = lo > 0 ? L[lo - 1].time + 0.01 : 0, max = hi < L.length - 1 ? L[hi + 1].time - 0.01 : DUR();
    dt = Math.max(min - drag.orig.get(lo), Math.min(max - drag.orig.get(hi), dt));
    for (const [k, t] of drag.orig) L[k].time = r3(t + dt);
    drawTimeline();
  });
  $("trLyr").addEventListener("pointerup", () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) { player.seek(L[d.i].time); drawTimeline(); return; }
    history.push(d.snap); future = [];
    for (const k of d.orig.keys()) if (!isGap(L[k])) L[k]._lvl = "ok";
    changed();
  });
  for (const id of ["ruler", "trSec", "trBeat", "trWave", "trAct"]) $(id).addEventListener("click", e => { if (D) player.seek(timeAt($(id), e.clientX)); });
  $("trOv").addEventListener("click", e => {
    const r = e.currentTarget.getBoundingClientRect(), t = ((e.clientX - r.left) / r.width) * DUR();
    player.seek(t);
    setWin(t - span() / 2, span());
  });
  $("tl").addEventListener("wheel", e => {
    if (!D) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, timeAt($("trLyr"), e.clientX));
    else setWin(win[0] + ((e.deltaX || e.deltaY) / trackWidth()) * span(), span());
  }, { passive: false });
  $("tableView").addEventListener("click", e => {
    const tr = e.target.closest("tr[data-i]");
    if (tr) select(+tr.dataset.i, { seek: !e.shiftKey && !e.ctrlKey && !e.metaKey, range: e.shiftKey, add: e.ctrlKey || e.metaKey });
  });

  // ── 上方按鈕 ──
  $("btnPlay").onclick = () => (player.playing() ? player.pause() : player.play());
  $("btnPrev").onclick = () => select(Math.max(0, anchor - 1), { seek: true });
  $("btnNext").onclick = () => select(Math.min(L.length - 1, anchor + 1), { seek: true });
  $("btnPunch").onclick = punch;
  $("btnLoop").onclick = toggleLoop;
  $("btnCaption").onclick = () => { caption = !caption; $("btnCaption").classList.toggle("on", caption); };
  $("btnSnap").onclick = () => { snap = !snap; $("btnSnap").classList.toggle("on", snap); toast(snap ? "拖曳會吸附拍點（按住 Alt 暫時不吸）" : "拖曳不吸附"); };
  $("btnFollow").onclick = () => { follow = !follow; $("btnFollow").classList.toggle("on", follow); };
  $("btnZoomIn").onclick = () => zoom(1 / 1.4);
  $("btnZoomOut").onclick = () => zoom(1.4);
  $("btnNextRed").onclick = () => nextRed(1);
  $("btnUndo").onclick = undo;
  $("btnRedo").onclick = redo;
  $("btnSave").onclick = save;
  $("rateSeg").onclick = e => { const b = e.target.closest("[data-rate]"); if (!b) return; player.rate(Number(b.dataset.rate)); $("rateSeg").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); };
  $("lag").value = store.get("studio-lag") || 150;
  $("lag").onchange = () => store.set("studio-lag", $("lag").value);
  $("btnTheme").onclick = () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("studio-theme", next);
    drawWave();
  };
  document.querySelectorAll(".view").forEach(b => b.addEventListener("click", () => {
    view = b.dataset.view;
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("on", v === b));
    $("tl").hidden = view !== "tl";
    $("tableView").hidden = view !== "table";
    if (view === "tl") drawTimeline(); else drawTable();
  }));
  $("peekTabs").addEventListener("click", e => { const b = e.target.closest(".tab"); if (b) { tab = b.dataset.tab; drawInsp(); } });
  $("songList").addEventListener("click", e => { const p = e.target.closest(".page[data-id]"); if (p && (!D || p.dataset.id !== D.song.id)) openSong(p.dataset.id); });
  $("search").addEventListener("input", renderSongList);
  $("verSel").addEventListener("change", e => switchVersion(e.target.value));
  // 網址的 #id 變了（上一頁、手動改網址）就換歌
  addEventListener("hashchange", () => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id && songs.some(x => x.id === id) && (!D || D.song.id !== id)) openSong(id);
  });

  // 檢查、同步、發布
  $("btnCheck").onclick = async () => {
    $("checkText").textContent = "檢查中…";
    const r = await api("/api/check", {});
    $("checkDot").style.background = r.ok ? "var(--green)" : "var(--red)";
    $("checkText").textContent = r.ok ? "檢查通過" : "檢查沒過";
    $("btnCheck").title = (r.steps || []).map(s => `${s.ok ? "✓" : "✗"} ${s.name}`).join("\n") + (r.notes?.length ? `\n${r.notes.join("\n")}` : "");
    if (!r.ok) alert((r.steps || []).filter(s => !s.ok).map(s => `✗ ${s.name}\n${s.out}`).join("\n\n"));
    else if (r.notes?.length) toast(r.notes[0], 5000);
  };
  $("btnSync").onclick = async () => {
    if (D && JSON.stringify(clean(L)) !== savedJSON && !confirm("有還沒存的修改（草稿會留在這台電腦）。繼續同步？")) return;
    toast("同步中…", 30000);
    const r = await api("/api/sync", {});
    if (!r.ok) { toast(""); alert(`同步失敗：\n${r.error}${r.out ? `\n\n${r.out}` : ""}`); return; }
    toast("已同步");
    await loadSongs();
    if (D) await openSong(D.song.id, { keepView: true });
  };
  $("btnPublish").onclick = async () => {
    if (D && JSON.stringify(clean(L)) !== savedJSON) {
      if (!confirm("有還沒存的修改，要先存檔再發布嗎？")) return;
      if (!(await save())) return;
    }
    const st = await api("/api/status");
    if (st.branch !== st.publishBranch) { alert(`目前在「${st.branch}」分支，工作站只從 ${st.publishBranch} 發布。`); return; }
    if (!st.changed.length && !st.ahead) { toast("歌曲資料沒有變更，不用發布"); return; }
    $("pubBranch").textContent = st.publishBranch;
    $("pubFiles").textContent = st.changed.map(c => `${c.status.padEnd(2)} ${c.file}`).join("\n") + (st.ahead ? `${st.changed.length ? "\n" : ""}（還有 ${st.ahead} 個上次沒推上去的 commit）` : "");
    $("pubMsg").value = D ? `fix(songs): 更新〈${D.song.ja}〉` : "fix(songs): 更新歌曲資料";
    // 網站看得到的檔案有變：預設寫更新日誌（README 的規則）
    const visible = st.changed.some(c => /^(songs\.js|song-lyrics(-live)?\.js|i18n\.js)$/.test(c.file)) && !st.changed.some(c => c.file === "CHANGELOG.md");
    $("pubLogOn").checked = visible;
    $("pubLog").value = D ? `〈${D.song.ja}〉更新${ver ? "現場版" : ""}歌詞與應援資料` : "";
    $("pubLogVer").textContent = "同一天的併進當天那一版，不然第三碼 +1";
    $("pubDlg").showModal();
  };
  $("pubDlg").addEventListener("close", async () => {
    if ($("pubDlg").returnValue !== "ok") return;
    const msg = $("pubMsg").value.trim() || "-";
    const changelog = $("pubLogOn").checked ? $("pubLog").value.trim() : "";
    $("btnPublish").disabled = true;
    toast("檢查、發布中…", 120000);
    const r = await api("/api/publish", { message: msg, changelog });
    $("btnPublish").disabled = false;
    toast("");
    if (r.ok) toast(`已發布：${r.head}，約 2 分鐘後網站更新`, 6000);
    else alert(`${r.error}\n\n${(r.log || []).map(s => `${s.ok ? "✓" : "✗"} ${s.name}${s.ok ? "" : `\n${(s.out || "").split("\n").slice(-10).join("\n")}`}`).join("\n")}`);
  });

  // 匯入新歌：網址 → id → 匯入
  $("importForm").addEventListener("submit", e => {
    e.preventDefault();
    if (!$("importUrl").value.trim()) return;
    $("importMore").hidden = false;
    $("importId").focus();
  });
  $("importMore").addEventListener("submit", async e => {
    e.preventDefault();
    const url = $("importUrl").value.trim(), id = $("importId").value.trim();
    if (!url || importing) return;
    importing = "讀影片資訊、字幕、音訊…";
    $("importMore").hidden = true;
    renderSongList();
    const r = await api("/api/fetch", { url, id });
    importing = null;
    if (!r.ok) { renderSongList(); alert(`匯入失敗：\n${r.error}`); $("importMore").hidden = false; return; }
    $("importUrl").value = ""; $("importId").value = "";
    await loadSongs();
    await openSong(r.id);
    showBanner(`已匯入〈${r.ja}〉：${r.changes.join("；")}${r.warnings.length ? `。提醒：${r.warnings.join("；")}` : ""}`, [["知道了", hideBanner]]);
  });

  // ── 鍵盤（跟舊版對時工作台一樣） ──
  addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
    if (typing) { if (e.key === "Escape") e.target.blur(); return; }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod || !D) return;
    const k = e.key;
    if (k === " ") { e.preventDefault(); punch(); }
    else if (k === "k" || k === "K") player.playing() ? player.pause() : player.play();
    else if (k === "Enter") { e.preventDefault(); preview(); }
    else if (k === "ArrowUp") { e.preventDefault(); select(Math.max(0, anchor - 1), { seek: true, range: e.shiftKey }); }
    else if (k === "ArrowDown") { e.preventDefault(); select(Math.min(L.length - 1, anchor + 1), { seek: true, range: e.shiftKey }); }
    else if (k === "ArrowLeft" || k === "j" || k === "J") player.seek(player.time() - 2);
    else if (k === "ArrowRight" || k === "l" || k === "L") player.seek(player.time() + 2);
    else if (k === "[" || k === "{") nudge(e.shiftKey ? -0.2 : -0.05);
    else if (k === "]" || k === "}") nudge(e.shiftKey ? 0.2 : 0.05);
    else if (/^[1-7]$/.test(k)) toggleAct(ACT_KEYS[+k - 1]);
    else if (k === "0") clearActs();
    else if (k === "g") nextRed(1);
    else if (k === "G") nextRed(-1);
    else if (k === "r" || k === "R") toggleLoop();
    else if (k === "c" || k === "C") $("btnCaption").click();
    else if (k === "s" || k === "S") $("btnSnap").click();
    else if (k === "e" || k === "E") { e.preventDefault(); tab = "line"; drawInsp(); document.querySelector("#insp textarea.jp")?.focus(); }
    else if (k === "/") { e.preventDefault(); $("search").focus(); }
    else if (k === "End" && e.shiftKey) { e.preventDefault(); select(L.length - 1, { range: true }); }
    else if (k === "Home" && e.shiftKey) { e.preventDefault(); select(0, { range: true }); }
  });
  addEventListener("beforeunload", e => { if (D && JSON.stringify(clean(L)) !== savedJSON) { saveDraft(); } });
  addEventListener("resize", () => { fitVideo(); drawWave(); placePlayhead(player.time()); });

  // ── 每一格：時間碼、字幕、播放指針、跟著走、循環 ──
  let lastCur = -2, lastWave = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!D) return;
    const t = player.time();
    if (ver) { const d = player.duration(); if (d > 0 && Math.abs(d - liveDur) > 1) { liveDur = Math.ceil(d); drawTimeline(); } }
    if (loopRange && t >= loopRange[1]) player.seek(loopRange[0]);
    $("tc").innerHTML = `${fmt(t)}<small> / ${fmt(DUR(), false)}</small>`;
    $("ovTc").textContent = fmt(t);
    const bt = beat();
    $("bb").textContent = bt ? `第 ${Math.floor(Math.max(0, t - bt[1]) / (240 / bt[0])) + 1} 小節` : "";
    const ci = curIndex(t);
    if (ci !== lastCur) {
      lastCur = ci;
      const l = L[ci];
      $("caption").hidden = !caption || !l || isGap(l);
      if (l) { $("curJp").textContent = l.jp; $("curTr").textContent = l.tr || ""; $("caption").classList.toggle("low", isRed(l)); }
      const sec = sections().find(s => t >= s.start && t < s.end);
      $("ovTags").innerHTML = (sec ? `<span class="pill">${sec.name}</span>` : "") + (l?.acts || []).map(a => `<span class="pill"><i class="sw" style="background:var(--${ACT_INFO[a]?.[1] || "gray"});box-shadow:none"></i>${ACT_INFO[a]?.[0] || a}</span>`).join("");
      if (view === "tl" && !drag) { $("trLyr").querySelectorAll(".ly.cur").forEach(x => x.classList.remove("cur")); $("trLyr").querySelector(`.ly[data-i="${ci}"]`)?.classList.add("cur"); }
      if (view === "table") $("tableView").querySelectorAll("tr").forEach(r => r.classList.toggle("cur", +r.dataset.i === ci));
    } else if ($("caption").hidden === caption && L[ci] && !isGap(L[ci])) $("caption").hidden = !caption;
    if (view === "tl" && !drag) {
      if (follow && player.playing() && (t > win[1] - span() * 0.12 || t < win[0])) setWin(t - span() * 0.2, span());
      else { placePlayhead(t); if (now - lastWave > 250 && player.playing()) { lastWave = now; drawWave(); } }
    }
  }

  // ── 開始 ──
  (async function start() {
    const h = await api("/api/health").catch(() => null);
    if (!h || h.app !== "ado-studio") {
      document.body.innerHTML = `<div class="empty-state" style="padding:40px">要用工作站打開這個頁面：Windows 點兩下「工作站.bat」，Mac 點兩下「工作站.command」。</div>`;
      return;
    }
    await loadSongs();
    const want = decodeURIComponent(location.hash.slice(1)) || store.get("studio-last");
    if (want && songs.some(s => s.id === want)) await openSong(want);
    else renderAll();
    requestAnimationFrame(frame);
  })();
})();
