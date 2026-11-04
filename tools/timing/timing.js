// 歌詞對時工具：邊播 MV 邊按空白鍵，把時間打在每一句上；做好後下載 JSON，用 apply.mjs 寫回 song-lyrics.js
// 進度存在這台電腦（localStorage 的 timing:<id>），重新整理不會不見
(() => {
  const { SONGS } = window.ADO_SONGS;
  const LYRICS = window.SONG_LYRICS || [];
  const $ = id => document.getElementById(id);
  const songSel = $("song"), rateSel = $("rate"), lagIn = $("lag"), list = $("lines"), nowEl = $("now"), statusEl = $("status");
  const fmt = t => t == null ? "—" : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;
  const round = t => Math.round(t * 100) / 100;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toast = (() => { let h = 0; return msg => { $("toast").textContent = msg; $("toast").classList.add("show"); clearTimeout(h); h = setTimeout(() => $("toast").classList.remove("show"), 2200); }; })();
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

  // 歌單照推出日期排；有歌詞的標 ✓
  const songs = [...SONGS].sort((a, b) => a.date.localeCompare(b.date));
  const hasLy = id => { const b = LYRICS.find(x => x.id === id); return !!(b && b.lyrics && b.lyrics.length); };
  songSel.innerHTML = songs.map(s => `<option value="${s.id}">${hasLy(s.id) ? "✓" : "　"} ${esc(s.ja)}（${s.id}）</option>`).join("");

  let S = null, LINES = [], ORIG = [], sel = 0, playingIdx = -1;
  const lsKey = () => `timing:${S.id}`;
  function save() { store.set(lsKey(), JSON.stringify(LINES)); }
  function pick(id) {
    S = songs.find(s => s.id === id) || songs[0];
    songSel.value = S.id;
    store.set("timing-last", S.id);
    const built = LYRICS.find(x => x.id === S.id);
    ORIG = built && built.lyrics ? built.lyrics.map(l => ({ ...l })) : [];
    let saved = null;
    try { saved = JSON.parse(store.get(lsKey()) || "null"); } catch (e) {}
    LINES = saved && saved.length ? saved : ORIG.map(l => ({ ...l }));
    $("paste").hidden = LINES.length > 0;
    sel = Math.max(0, LINES.findIndex(l => l.time == null));
    if (sel < 0 || LINES.every(l => l.time != null)) sel = 0;
    render();
    loadVideo();
  }
  function render() {
    list.innerHTML = LINES.map((l, i) => {
      const prev = LINES.slice(0, i).reverse().find(x => x.time != null);
      const bad = l.time != null && prev && l.time < prev.time;
      const changed = ORIG[i] && ORIG[i].jp === l.jp && ORIG[i].time !== l.time;
      return `<li data-i="${i}" class="${i === sel ? "sel" : ""}${i === playingIdx ? " playing" : ""}${bad ? " bad" : ""}${changed ? " changed" : ""}"><span class="no">${i + 1}</span><span class="t${l.time == null ? " none" : ""}">${fmt(l.time)}</span><span class="jp" lang="ja">${esc(l.jp || "")}</span>${l.tr ? `<span class="tr">${esc(l.tr)}</span>` : ""}</li>`;
    }).join("");
    const done = LINES.filter(l => l.time != null).length, bad = list.querySelectorAll(".bad").length, changed = list.querySelectorAll(".changed").length;
    statusEl.innerHTML = `<b>${done}／${LINES.length}</b> 句有時間${changed ? `・改了 ${changed} 句` : ""}${bad ? `・<span class="warn">${bad} 句比上一句早，順序不對</span>` : ""}`;
    const el = list.children[sel];
    if (el) el.scrollIntoView({ block: "nearest" });
  }
  list.addEventListener("click", e => { const li = e.target.closest("li"); if (!li) return; sel = +li.dataset.i; render(); });

  // ── 播放器 ──
  let player = null, ready = false;
  const now = () => { try { return ready ? player.getCurrentTime() : 0; } catch (e) { return 0; } };
  function loadVideo() {
    if (!window.YT || !YT.Player) return;
    if (player && ready) { player.cueVideoById(S.yt); return; }
    if (player) return;
    player = new YT.Player("ytp", {
      videoId: S.yt,
      playerVars: { rel: 0, playsinline: 1, enablejsapi: 1, origin: location.origin },
      events: {
        onReady: () => { ready = true; player.setPlaybackRate(+rateSel.value); if (player.getVideoData().video_id !== S.yt) player.cueVideoById(S.yt); },
        onStateChange: e => { if (e.data === 1 || e.data === 5) player.setPlaybackRate(+rateSel.value); }
      }
    });
  }
  window.onYouTubeIframeAPIReady = loadVideo;
  const yts = document.createElement("script");
  yts.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(yts);
  rateSel.addEventListener("change", () => { if (ready) player.setPlaybackRate(+rateSel.value); });
  lagIn.value = store.get("timing-lag") || lagIn.value;
  lagIn.addEventListener("change", () => store.set("timing-lag", lagIn.value));

  // 現在播到哪一句：畫面上淡淡標出來，方便檢查
  (function tick() {
    const t = now();
    nowEl.textContent = fmt(t);
    let k = -1;
    LINES.forEach((l, i) => { if (l.time != null && t >= l.time) k = i; });
    if (k !== playingIdx) {
      list.children[playingIdx]?.classList.remove("playing");
      list.children[k]?.classList.add("playing");
      playingIdx = k;
    }
    requestAnimationFrame(tick);
  })();

  // ── 鍵盤 ──
  addEventListener("keydown", e => {
    if (!S || e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
    const l = LINES[sel];
    const step = e.shiftKey ? .2 : .05;
    if (e.key === " ") {
      e.preventDefault();
      if (!l || !ready) return;
      // 暫停時按到不算，不然會打上暫停那一刻的時間
      if (player.getPlayerState() !== 1) return toast("先播放影片（K 或點影片）再打點");
      // 速度放慢時，反應時間換算成影片秒數也要乘上速度
      l.time = round(Math.max(0, now() - (+lagIn.value || 0) / 1000 * +rateSel.value));
      sel = Math.min(LINES.length - 1, sel + 1);
    } else if (e.key === "Backspace") { e.preventDefault(); sel = Math.max(0, sel - 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); }
    else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(LINES.length - 1, sel + 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (l && l.time != null && ready) { player.seekTo(Math.max(0, l.time - 2), true); player.playVideo(); } }
    else if (e.key === "[" || e.key === "{") { if (l && l.time != null) l.time = round(Math.max(0, l.time - step)); }
    else if (e.key === "]" || e.key === "}") { if (l && l.time != null) l.time = round(l.time + step); }
    else if (e.key === "Delete") { if (l) l.time = null; }
    else if (e.key === "k" || e.key === "K") { if (ready) player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); return; }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); if (ready) player.seekTo(Math.max(0, now() + (e.key === "ArrowLeft" ? -2 : 2)), true); return; }
    else return;
    save(); render();
  });

  // ── 新歌：貼上歌詞 ──
  $("pasteOk").addEventListener("click", () => {
    LINES = $("pasteText").value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => { const [jp, tr = ""] = s.split("\t"); return { time: null, jp: jp.trim(), tr: tr.trim() }; });
    if (!LINES.length) return toast("沒有貼上任何一句");
    $("paste").hidden = true; sel = 0; save(); render();
  });

  // ── 輸出 ──
  // 歌曲資料（id、title、youtubeId、duration）照 songs.js 補；每句保留原本的 acts、sing、call
  function entry() {
    const built = LYRICS.find(x => x.id === S.id);
    const dur = S.len.split(":").reduce((a, b) => a * 60 + +b, 0);
    const lines = LINES.filter(l => l.time != null).sort((a, b) => a.time - b.time);
    return { ...(built || { id: S.id, title: S.ja, youtubeId: S.yt, duration: dur }), lyrics: lines };
  }
  function check() {
    const miss = LINES.filter(l => l.time == null).length;
    if (miss && !confirm(`還有 ${miss} 句沒有時間，輸出時會略過這些句子。要繼續嗎？`)) return false;
    const bad = list.querySelectorAll(".bad").length;
    if (bad && !confirm(`有 ${bad} 句比上一句早（紅色時間），輸出時會照時間重新排序，句子順序會變。要繼續嗎？`)) return false;
    return true;
  }
  $("copy").addEventListener("click", async () => {
    if (!check()) return;
    try { await navigator.clipboard.writeText(JSON.stringify(entry(), null, 2)); toast("已複製"); } catch (e) { prompt("複製這段 JSON：", JSON.stringify(entry())); }
  });
  $("save").addEventListener("click", () => {
    if (!check()) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(entry(), null, 2) + "\n"], { type: "application/json" }));
    a.download = `${S.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`已下載 ${S.id}.json，用 node tools/timing/apply.mjs ${S.id}.json 寫回 song-lyrics.js`);
  });
  $("reset").addEventListener("click", () => {
    if (!confirm("丟掉這首在這台電腦存的對時進度？")) return;
    store.set(lsKey(), null); pick(S.id);
  });
  songSel.addEventListener("change", () => pick(songSel.value));
  pick(new URLSearchParams(location.search).get("song") || store.get("timing-last") || songs[0].id);
})();
