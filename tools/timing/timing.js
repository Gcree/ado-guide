// ==========================================================================
// Ado 應援指南・歌詞對時工作台 (Timing Studio)
// 剪輯軟體風格專業對時核心腳本 (Multi-track Timeline Engine)
// 支援【官方 MV 版】與【現場 LIVE 版】獨立對時、一鍵從 MV 複製歌詞
// ==========================================================================
(async () => {
  "use strict";

  const $ = id => document.getElementById(id);

  // ── 輔助函式 ──
  const TIMELINE_PAD = 14; // 時間軸左側安全邊界，確保 00:00 指針完整可見不被遮擋

  const fmt = (t, showMs = true) => {
    if (t == null || isNaN(t)) return "—";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    const mStr = String(m).padStart(2, "0");
    const sStr = String(s).padStart(2, "0");
    const msStr = String(ms).padStart(2, "0");
    if (!showMs) return `${mStr}:${sStr}`;
    return `${mStr}:${sStr}.${msStr}`;
  };

  const parseTime = str => {
    if (!str) return null;
    str = String(str).trim();
    if (/^\d+(\.\d+)?$/.test(str)) return Math.max(0, +str);
    const parts = str.split(":");
    if (parts.length === 2) {
      const m = +parts[0], s = +parts[1];
      if (!isNaN(m) && !isNaN(s)) return Math.max(0, m * 60 + s);
    }
    return null;
  };

  const round = t => Math.round(t * 100) / 100;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const toast = (() => {
    let timer = 0;
    return msg => {
      const el = $("toast");
      if (!el) return;
      el.textContent = msg;
      el.classList.add("show");
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove("show"), 2800);
    };
  })();

  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };

  // ── 資料安全載入器 (若全域變數未注入，主動 fetch 補救) ──
  async function loadDataSources() {
    let SONGS = window.ADO_SONGS?.SONGS;
    let LYRICS = window.SONG_LYRICS;

    if (!SONGS || !SONGS.length) {
      console.warn("window.ADO_SONGS 尚未存在，嘗試由 fetch 載入 songs.js...");
      try {
        const res = await fetch("../../songs.js?t=" + Date.now());
        if (res.ok) {
          const txt = await res.text();
          const f = new Function("root", txt + "\nreturn root.ADO_SONGS;");
          const mod = f({});
          if (mod && mod.SONGS) {
            window.ADO_SONGS = mod;
            SONGS = mod.SONGS;
          }
        }
      } catch (e) {
        console.error("fetch ../../songs.js 失敗:", e);
      }
    }

    if (!LYRICS || !LYRICS.length) {
      console.warn("window.SONG_LYRICS 尚未存在，嘗試由 fetch 載入 song-lyrics.js...");
      try {
        const res = await fetch("../../song-lyrics.js?t=" + Date.now());
        if (res.ok) {
          const txt = await res.text();
          const f = new Function("root", txt + "\nreturn root.SONG_LYRICS || root.SONGS;");
          const mod = f({});
          if (Array.isArray(mod)) {
            window.SONG_LYRICS = mod;
            LYRICS = mod;
          }
        }
      } catch (e) {
        console.error("fetch ../../song-lyrics.js 失敗:", e);
      }
    }

    return {
      SONGS: SONGS || window.ADO_SONGS?.SONGS || [],
      LYRICS: LYRICS || window.SONG_LYRICS || []
    };
  }

  const { SONGS, LYRICS } = await loadDataSources();
  // 已發布的現場版時間軸（song-lyrics-live.js，網站用 baseId 對應歌曲）
  const LIVE_LYRICS = Array.isArray(window.SONG_LYRICS_LIVE) ? window.SONG_LYRICS_LIVE : [];

  // 若依然拿不到歌曲資料，顯示警示橫幅
  const dataLoadErrorBanner = $("dataLoadErrorBanner");
  if (!SONGS.length) {
    if (dataLoadErrorBanner) dataLoadErrorBanner.style.display = "block";
    console.error("嚴重錯誤：無法載入 songs.js 歌曲清單");
  } else {
    if (dataLoadErrorBanner) dataLoadErrorBanner.style.display = "none";
  }

  // ── DOM 元素 ──
  const songSelect = $("songSelect") || $("song");
  const rateSelect = $("rateSelect") || $("rate");
  const lagInput = $("lagInput") || $("lag");
  const lyricsCueList = $("lyricsCueList") || $("lines");
  const punchFlash = $("punchFlash");
  const liveSubOverlay = $("liveSubOverlay");
  const liveSubBadge = $("liveSubBadge");
  const liveSubJp = $("liveSubJp");
  const liveSubTr = $("liveSubTr");
  const songInfoBadge = $("songInfoBadge");

  // 版本切換
  const btnVersionMv = $("btnVersionMv");
  const btnVersionLive = $("btnVersionLive");
  const liveConcertSelect = $("liveConcertSelect");
  const liveHelperBanner = $("liveHelperBanner");
  const btnCloneFromMv = $("btnCloneFromMv");

  // 走帶
  const tcNow = $("tcNow") || $("now");
  const tcTotal = $("tcTotal");
  const btnSeekStart = $("btnSeekStart");
  const btnRewind2 = $("btnRewind2");
  const btnPrevLine = $("btnPrevLine");
  const btnPlayPause = $("btnPlayPause");
  const playIcon = $("playIcon");
  const pauseIcon = $("pauseIcon");
  const btnNextLine = $("btnNextLine");
  const btnForward2 = $("btnForward2");
  const btnPreviewLine = $("btnPreviewLine");
  const btnPunch = $("btnPunch");

  // 導讀提示
  const prompterTargetText = $("prompterTargetText");
  const prompterNextText = $("prompterNextText");

  // 統計與檢查器
  const statsSummary = $("statsSummary") || $("status");
  const statsDetails = $("statsDetails");
  const statsProgressFill = $("statsProgressFill");
  const inspectorTitle = $("inspectorTitle");
  const inspectorTimeLabel = $("inspectorTimeLabel");
  const manualTimeInput = $("manualTimeInput");
  const btnStepMinus20 = $("btnStepMinus20");
  const btnStepMinus5 = $("btnStepMinus5");
  const btnStepPlus5 = $("btnStepPlus5");
  const btnStepPlus20 = $("btnStepPlus20");
  const btnSetNowTime = $("btnSetNowTime");
  const btnClearTime = $("btnClearTime");
  const btnEditLine = $("btnEditLine");
  const btnAddLine = $("btnAddLine");
  const btnDeleteLine = $("btnDeleteLine");

  // 時間軸
  const timelineViewport = $("timelineViewport");
  const timelineContentLayer = $("timelineContentLayer");
  const timelineRulerTrack = $("timelineRulerTrack");
  const rulerCanvas = $("rulerCanvas");
  const trackSubtitles = $("trackSubtitles");
  const trackWaveform = $("trackWaveform");
  const waveCanvas = $("waveCanvas");
  const playheadCursor = $("playheadCursor");
  const playheadHead = $("playheadHead");
  const timelineDragTooltip = $("timelineDragTooltip");
  const timelinePointerTime = $("timelinePointerTime");
  const zoomSlider = $("zoomSlider");
  const btnZoomIn = $("btnZoomIn");
  const btnZoomOut = $("btnZoomOut");
  const btnZoomFit = $("btnZoomFit");
  const btnZoomFocus = $("btnZoomFocus");
  const chkFollowPlayhead = $("chkFollowPlayhead");
  const subClipCount = $("subClipCount");

  // 彈窗
  const modalPaste = $("modalPaste");
  const btnPasteModal = $("btnPasteModal");
  const btnClosePasteModal = $("btnClosePasteModal");
  const btnCancelPaste = $("btnCancelPaste");
  const btnConfirmPaste = $("btnConfirmPaste");
  const pasteInputText = $("pasteInputText");

  const modalEditLine = $("modalEditLine");
  const editLineModalTitle = $("editLineModalTitle");
  const btnCloseEditModal = $("btnCloseEditModal");
  const btnCancelEdit = $("btnCancelEdit");
  const btnSaveEdit = $("btnSaveEdit");
  const editJpInput = $("editJpInput");
  const editTrInput = $("editTrInput");

  const modalAddLine = $("modalAddLine");
  const btnCloseAddModal = $("btnCloseAddModal");
  const btnCancelAdd = $("btnCancelAdd");
  const btnSaveAdd = $("btnSaveAdd");
  const addJpInput = $("addJpInput");
  const addTrInput = $("addTrInput");
  const addTimeInput = $("addTimeInput");

  const modalHotkeys = $("modalHotkeys");
  const btnHotkeys = $("btnHotkeys");
  const btnCloseHotkeysModal = $("btnCloseHotkeysModal");
  const btnCloseHotkeys = $("btnCloseHotkeys");

  // 應援動作工具列元素
  const inspectorActsRow = $("inspectorActsRow");
  const inspectorActDetails = $("inspectorActDetails");
  const actSingField = $("actSingField");
  const actCallField = $("actCallField");
  const actHowField = $("actHowField");
  const inputActSing = $("inputActSing");
  const inputActCall = $("inputActCall");
  const inputActHow = $("inputActHow");
  const btnFillSingAll = $("btnFillSingAll");
  const btnClearActs = $("btnClearActs");

  const modalEditActButtons = $("modalEditActButtons");
  const modalEditSingGroup = $("modalEditSingGroup");
  const modalEditCallGroup = $("modalEditCallGroup");
  const editSingInput = $("editSingInput");
  const editCallInput = $("editCallInput");
  const editHowInput = $("editHowInput");

  const ACT_MAP = {
    sing:    { name: "大合唱", icon: "🎤" },
    call:    { name: "喊聲",   icon: "🗣" },
    clap:    { name: "拍手",   icon: "👏" },
    wave:    { name: "揮手",   icon: "👋" },
    jump:    { name: "跳躍",   icon: "🦘" },
    gesture: { name: "手勢",   icon: "👉" },
    listen:  { name: "安靜聽", icon: "🎧" }
  };
  const ACT_KEYS = ["sing", "call", "clap", "wave", "jump", "gesture", "listen"];

  // 頂部動作
  const btnReset = $("btnReset") || $("reset");
  const btnCopy = $("btnCopy") || $("copy");
  const btnDownload = $("btnDownload") || $("save");

  // ── 歌曲狀態 ──
  const songs = [...SONGS].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const hasLyricsData = id => {
    const b = LYRICS.find(x => x.id === id);
    return !!(b && b.lyrics && b.lyrics.length);
  };

  // 填入歌曲選單（標記是否有 Live 現場版）
  if (songSelect) {
    songSelect.innerHTML = songs.map(s => {
      const hasLy = hasLyricsData(s.id);
      const hasLive = Boolean(s.liveVideo || (s.lives && s.lives.length));
      return `<option value="${s.id}">${hasLy ? "✓ " : "　 "}${esc(s.ja)}（${s.id}）${hasLive ? " 🎤Live" : ""}</option>`;
    }).join("");
  }

  let S = null;
  let currentVersionMode = "mv"; // "mv" | "live"
  let currentLiveItem = null; // { concert: "...", yt: "...", offset: ... }
  let liveList = []; // 當前歌曲所有可選現場版

  let songDuration = 200; // 秒
  let durationFromVideo = false; // 現場版：已從 YouTube 播放器取得影片實際長度
  let LINES = [];
  let ORIG = [];
  let sel = 0;
  let selectedIndices = new Set([0]); // 多重選取的句子集合
  let playingIdx = -1;
  let zoom = 45; // 像素/秒 (px/s)
  let userScrollUntil = 0; // 使用者手動捲動時間軸後，暫停自動跟隨 2 秒
  let followPlayhead = true;
  let isScrubbing = false;
  let isDraggingClip = false;
  let editingLineIndex = -1;

  // 只更新選取狀態、不重繪（新增／切分／複製後同步多選集合用）
  function setSel(idx) {
    sel = LINES.length ? Math.max(0, Math.min(LINES.length - 1, idx)) : 0;
    selectedIndices = new Set([sel]);
  }

  function selectSingle(idx) {
    if (!LINES.length) return;
    setSel(idx);
    renderAll();
  }

  const isModalOpen = () => !!document.querySelector(".modal-overlay.active");
  const closeAllModals = () => document.querySelectorAll(".modal-overlay.active").forEach(m => m.classList.remove("active"));

  function toggleSelect(idx) {
    if (!LINES.length) return;
    if (selectedIndices.has(idx)) {
      if (selectedIndices.size > 1) {
        selectedIndices.delete(idx);
        sel = [...selectedIndices][0];
      }
    } else {
      selectedIndices.add(idx);
      sel = idx;
    }
    renderAll();
  }

  function selectRange(fromIdx, toIdx) {
    if (!LINES.length) return;
    const min = Math.max(0, Math.min(fromIdx, toIdx));
    const max = Math.min(LINES.length - 1, Math.max(fromIdx, toIdx));
    selectedIndices.clear();
    for (let i = min; i <= max; i++) {
      selectedIndices.add(i);
    }
    sel = toIdx;
    renderAll();
  }

  function selectAll() {
    if (!LINES.length) return;
    selectedIndices.clear();
    for (let i = 0; i < LINES.length; i++) {
      selectedIndices.add(i);
    }
    renderAll();
    toast(`已全選 ${selectedIndices.size} 句歌詞`);
  }

  const activeYtId = () => {
    if (currentVersionMode === "live" && currentLiveItem) {
      return currentLiveItem.yt;
    }
    return S ? S.yt : "";
  };

  const lsKey = () => {
    if (!S) return "timing:default";
    if (currentVersionMode === "live" && currentLiveItem) {
      return `timing:${S.id}:live:${currentLiveItem.yt}`;
    }
    return `timing:${S.id}`;
  };

  function save() {
    if (!S) return;
    store.set(lsKey(), JSON.stringify(LINES));
  }

  // ── 歷史紀錄堆疊 (Undo / Redo History Engine) ──
  const MAX_HISTORY = 60;
  let undoStack = [];
  let redoStack = [];

  function recordSnapshot() {
    return {
      lines: JSON.parse(JSON.stringify(LINES)),
      sel: sel,
      selectedIndices: new Set(selectedIndices)
    };
  }

  function pushHistory() {
    undoStack.push(recordSnapshot());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = []; // 有新操作時清空重做堆疊
    updateUndoRedoUI();
  }

  function undo() {
    if (!undoStack.length) {
      toast("已無上一步可復原");
      return;
    }
    const current = recordSnapshot();
    redoStack.push(current);
    const prev = undoStack.pop();

    LINES = prev.lines;
    sel = Math.min(prev.sel, LINES.length - 1);
    selectedIndices = prev.selectedIndices ? new Set(prev.selectedIndices) : new Set([sel]);
    save();
    renderAll();
    updateUndoRedoUI();
    toast(`↩ 已復原（上一步），目前選中第 ${sel + 1} 句`);
  }

  function redo() {
    if (!redoStack.length) {
      toast("已無下一步可重做");
      return;
    }
    const current = recordSnapshot();
    undoStack.push(current);
    const next = redoStack.pop();

    LINES = next.lines;
    sel = Math.min(next.sel, LINES.length - 1);
    selectedIndices = next.selectedIndices ? new Set(next.selectedIndices) : new Set([sel]);
    save();
    renderAll();
    updateUndoRedoUI();
    toast(`↪ 已重做（下一步），目前選中第 ${sel + 1} 句`);
  }

  function updateUndoRedoUI() {
    const btnUndo = $("btnUndo");
    const btnRedo = $("btnRedo");
    if (btnUndo) {
      btnUndo.disabled = undoStack.length === 0;
      btnUndo.style.opacity = undoStack.length === 0 ? "0.35" : "1";
    }
    if (btnRedo) {
      btnRedo.disabled = redoStack.length === 0;
      btnRedo.style.opacity = redoStack.length === 0 ? "0.35" : "1";
    }
  }

  // ── 播放器封裝 ──
  let ytPlayer = null;
  let playerReady = false;
  let playerError = false;
  let isSimulatedPlaying = false;
  let simTime = 0;
  let simLastTime = 0;
  let lastSeekTime = null;

  function getCurrentTime() {
    if (ytPlayer && playerReady && !playerError && typeof ytPlayer.getCurrentTime === "function") {
      try {
        const ytT = ytPlayer.getCurrentTime();
        if (typeof ytT === "number" && !isNaN(ytT)) {
          if (lastSeekTime != null && Math.abs(ytT - lastSeekTime) > 0.5 && getPlayerState() !== 1) {
            return lastSeekTime;
          }
          lastSeekTime = null;
          return ytT;
        }
      } catch (e) {}
    }
    if (isSimulatedPlaying) {
      const n = performance.now();
      simTime += (n - simLastTime) / 1000 * (+rateSelect?.value || 1);
      simLastTime = n;
      if (simTime > songDuration) simTime = songDuration;
    }
    return simTime;
  }

  function getPlayerState() {
    if (ytPlayer && playerReady && !playerError && typeof ytPlayer.getPlayerState === "function") {
      try { return ytPlayer.getPlayerState(); } catch (e) { return -1; }
    }
    return isSimulatedPlaying ? 1 : 2;
  }

  function play() {
    if (ytPlayer && playerReady && !playerError && typeof ytPlayer.playVideo === "function") {
      try { ytPlayer.playVideo(); return; } catch (e) {}
    }
    isSimulatedPlaying = true;
    simLastTime = performance.now();
    updatePlayPauseUI();
  }

  function pause() {
    if (ytPlayer && playerReady && !playerError && typeof ytPlayer.pauseVideo === "function") {
      try { ytPlayer.pauseVideo(); return; } catch (e) {}
    }
    isSimulatedPlaying = false;
    updatePlayPauseUI();
  }

  // allowSeekAhead=false：拖曳指針途中用的快速 seek（YouTube 不重新緩衝），放開時再精準 seek 一次
  function seekTo(sec, allowSeekAhead = true) {
    sec = Math.max(0, Math.min(songDuration, sec));
    lastSeekTime = sec;
    simTime = sec;
    simLastTime = performance.now();
    if (ytPlayer && playerReady && !playerError && typeof ytPlayer.seekTo === "function") {
      try { ytPlayer.seekTo(sec, allowSeekAhead); } catch (e) {}
    }
    updatePlayheadUI(sec);
  }

  function updatePlayPauseUI() {
    const isPlay = getPlayerState() === 1;
    if (playIcon) playIcon.style.display = isPlay ? "none" : "block";
    if (pauseIcon) pauseIcon.style.display = isPlay ? "block" : "none";
  }

  function loadVideo() {
    const ytId = activeYtId();
    if (!ytId || !window.YT || !YT.Player) return;

    if (ytPlayer && playerReady) {
      try {
        ytPlayer.cueVideoById(ytId);
        return;
      } catch (e) {}
    }
    if (ytPlayer) return;

    try {
      const origin = location.protocol.startsWith("http") ? location.origin : undefined;
      ytPlayer = new YT.Player("ytp", {
        videoId: ytId,
        playerVars: {
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: origin
        },
        events: {
          onReady: () => {
            playerReady = true;
            if (rateSelect) ytPlayer.setPlaybackRate(+rateSelect.value);
            if (ytPlayer.getVideoData && ytPlayer.getVideoData().video_id !== ytId) {
              ytPlayer.cueVideoById(ytId);
            }
            updatePlayPauseUI();
          },
          onStateChange: e => {
            if (e.data === 1 || e.data === 5) {
              if (rateSelect) ytPlayer.setPlaybackRate(+rateSelect.value);
            }
            updatePlayPauseUI();
          },
          onError: () => {
            playerError = true;
            console.warn("YouTube 影片無法在目前環境內嵌播放，已啟用虛擬時鐘輔助對時");
          }
        }
      });
    } catch (e) {
      console.warn("YouTube Player 初始化警告，使用虛擬時鐘:", e);
    }
  }

  // 現場版：以 YouTube 影片實際長度為準（MV 的 len 不適用）
  function syncDurationFromPlayer() {
    if (currentVersionMode !== "live" || durationFromVideo || !ytPlayer || !playerReady || playerError) return;
    try {
      if (ytPlayer.getVideoData?.().video_id !== activeYtId()) return;
      const d = ytPlayer.getDuration?.();
      if (!(d > 0)) return;
      durationFromVideo = true;
      if (Math.abs(d - songDuration) < 0.05) return;
      songDuration = round(d);
      if (tcTotal) tcTotal.textContent = fmt(songDuration);
      renderTimeline();
      updatePlayheadUI(getCurrentTime());
    } catch (e) {}
  }
  setInterval(syncDurationFromPlayer, 1000);

  window.onYouTubeIframeAPIReady = loadVideo;
  if (!window.YT) {
    const yts = document.createElement("script");
    yts.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(yts);
  }

  // ── 一鍵從 MV 版複製歌詞 (保留文字與動作，清空時間或套用基準偏移) ──
  function cloneLyricsFromMv(applyOffset = false) {
    const built = LYRICS.find(x => x.id === S.id);
    const mvLyrics = built && built.lyrics ? built.lyrics : [];
    if (!mvLyrics.length) {
      toast("官方 MV 版目前也沒有歌詞資料，請先為 MV 版貼上歌詞");
      return;
    }

    pushHistory();
    const offset = (applyOffset && currentLiveItem?.offset) ? Number(currentLiveItem.offset) || 0 : 0;
    LINES = mvLyrics.map(l => ({
      ...l,
      time: applyOffset ? (l.time != null ? round(Math.max(0, l.time + offset)) : null) : null
    }));

    setSel(0);
    save();
    renderAll();

    if (applyOffset) {
      toast(`已從 MV 複製 ${LINES.length} 句歌詞，並套用基準偏移 ${offset > 0 ? "+" : ""}${offset}s！`);
    } else {
      toast(`已從 MV 複製 ${LINES.length} 句歌詞！時間已歸零，請播放現場影片開始打點。`);
    }
  }

  // ── 選歌與版本切換 ──
  function pickSong(id, requestedMode = null, requestedLiveYt = null) {
    if (!songs.length) return;
    if (loopOn) { loopOn = false; btnLoopLine?.classList.remove("loop-on"); }
    undoStack = [];
    redoStack = [];
    updateUndoRedoUI();

    S = songs.find(s => s.id === id) || songs[0];
    if (songSelect) songSelect.value = S.id;
    store.set("timing-last", S.id);

    // 整合這首歌的所有 Live 場次
    liveList = [];
    if (S.liveVideo) {
      liveList.push({
        concert: S.liveVideo.concert || "官方現場版",
        yt: S.liveVideo.yt,
        offset: S.liveVideo.offset,
        isOfficial: true
      });
    }
    if (S.lives && S.lives.length) {
      S.lives.forEach(l => {
        if (!liveList.some(item => item.yt === l.yt)) {
          liveList.push({
            concert: l.concert || "LIVE 音源",
            yt: l.yt,
            offset: 0,
            isOfficial: false
          });
        }
      });
    }

    // 版本按鈕可用性
    if (liveList.length > 0) {
      if (btnVersionLive) {
        btnVersionLive.disabled = false;
        btnVersionLive.innerHTML = `🎤 現場 LIVE 版 (${liveList.length})`;
      }
    } else {
      if (btnVersionLive) {
        btnVersionLive.disabled = true;
        btnVersionLive.innerHTML = `🎤 無現場版`;
      }
      requestedMode = "mv";
    }

    // 決定使用 MV 還是 LIVE 模式
    if (requestedMode) {
      currentVersionMode = (requestedMode === "live" && liveList.length > 0) ? "live" : "mv";
    } else {
      // 保持之前的選擇，或若沒有 live 則自動 mv
      if (currentVersionMode === "live" && !liveList.length) {
        currentVersionMode = "mv";
      }
    }

    if (btnVersionMv) btnVersionMv.classList.toggle("active", currentVersionMode === "mv");
    if (btnVersionLive) btnVersionLive.classList.toggle("active", currentVersionMode === "live");

    // 計算總時長
    if (S.len && S.len.includes(":")) {
      const parts = S.len.split(":");
      songDuration = parts.reduce((acc, v) => acc * 60 + +v, 0);
    } else {
      songDuration = 210;
    }

    // LIVE 模式初始化
    if (currentVersionMode === "live") {
      currentLiveItem = liveList.find(x => x.yt === requestedLiveYt) || liveList[0];

      if (liveConcertSelect) {
        liveConcertSelect.innerHTML = liveList.map(l => `<option value="${l.yt}">${esc(l.concert)}</option>`).join("");
        liveConcertSelect.value = currentLiveItem.yt;
        liveConcertSelect.style.display = liveList.length > 1 ? "inline-block" : "none";
      }

      if (songInfoBadge) {
        songInfoBadge.textContent = `${S.id.toUpperCase()} • LIVE • ${currentLiveItem.concert}`;
      }
      if (btnCloneFromMv) btnCloneFromMv.style.display = "inline-flex";

      // 檢查 localStorage 中該場 Live 的儲存進度
      let saved = null;
      try {
        saved = JSON.parse(store.get(lsKey()) || "null");
      } catch (e) {}

      // 已發布的現場版資料：同一首歌、同一支影片才帶入（換場次不能沿用別場的時間）
      const liveBuilt = LIVE_LYRICS.find(x => (x.baseId || x.id.replace(/-live$/, "")) === S.id && x.youtubeId === currentLiveItem.yt);
      ORIG = liveBuilt && liveBuilt.lyrics ? liveBuilt.lyrics.map(l => ({ ...l })) : [];

      LINES = (Array.isArray(saved) && saved.length > 0) ? saved : ORIG.map(l => ({ ...l }));

      // 現場版長度和 MV 不同：先用「MV 長度、已發布長度、最後一句 +10 秒」中最長的暫代，
      // 播放器載入影片後會改成影片實際長度（syncDurationFromPlayer）
      const lastTime = LINES.reduce((m, l) => (l.time != null && l.time > m ? l.time : m), 0);
      songDuration = Math.max(songDuration, liveBuilt?.duration || 0, lastTime ? lastTime + 10 : 0);

      // 如果完全沒有資料，顯示引導橫幅
      if (!LINES.length) {
        showLiveHelperBanner();
      } else {
        if (liveHelperBanner) liveHelperBanner.style.display = "none";
      }

    } else {
      // MV 模式初始化
      currentLiveItem = null;
      if (liveConcertSelect) liveConcertSelect.style.display = "none";
      if (btnCloneFromMv) btnCloneFromMv.style.display = "none";
      if (liveHelperBanner) liveHelperBanner.style.display = "none";

      if (songInfoBadge) {
        songInfoBadge.textContent = `${S.id.toUpperCase()} • MV 原版 • ${fmt(songDuration, false)}`;
      }

      const built = LYRICS.find(x => x.id === S.id);
      ORIG = built && built.lyrics ? built.lyrics.map(l => ({ ...l })) : [];

      let saved = null;
      try {
        saved = JSON.parse(store.get(lsKey()) || "null");
      } catch (e) {}

      LINES = (Array.isArray(saved) && saved.length > 0) ? saved : ORIG.map(l => ({ ...l }));
    }

    durationFromVideo = false;
    if (tcTotal) tcTotal.textContent = fmt(songDuration);

    sel = Math.max(0, LINES.findIndex(l => l.time == null));
    if (sel < 0 || LINES.every(l => l.time != null)) sel = 0;
    selectedIndices = new Set([sel]);

    renderAll();
    loadVideo();
    seekTo(0);
  }

  // 顯示現場版導讀橫幅
  function showLiveHelperBanner() {
    if (!liveHelperBanner || !currentLiveItem) return;
    const offset = Number(currentLiveItem.offset) || 0;

    liveHelperBanner.innerHTML = `
      <div class="live-helper-header">
        <span>🎤 目前正在對時【現場 LIVE 版】（${esc(currentLiveItem.concert)}）</span>
        <span style="font-weight: normal; color: #fecdd3;">現場演出與 MV 前奏/間奏長度不同</span>
      </div>
      <p style="margin: 0; font-size: 11.5px; color: var(--text-muted); line-height: 1.5;">
        歌詞可以直接從 MV 版複製過來（保留日文、中譯與應援動作），再邊聽現場演唱會邊按空白鍵打點：
      </p>
      <div class="live-helper-actions">
        <button id="btnCloneFromMvBanner" class="live-helper-btn">
          📥 一鍵從 MV 版複製歌詞（文字保留，時間清空重新打點）
        </button>
        ${offset ? `
          <button id="btnOffsetFromMvBanner" class="live-helper-btn" style="border-color: #8b5cf6; background: #1c1330;">
            📐 帶入 MV 時間＋基準偏移 (${offset > 0 ? "+" : ""}${offset}s)
          </button>
        ` : ""}
      </div>
    `;

    liveHelperBanner.style.display = "flex";

    $("btnCloneFromMvBanner")?.addEventListener("click", () => cloneLyricsFromMv(false));
    $("btnOffsetFromMvBanner")?.addEventListener("click", () => cloneLyricsFromMv(true));
  }

  // ── 畫面整體渲染 ──
  function renderAll() {
    renderLyricsList();
    renderInspector();
    renderTimeline();
    updatePrompter();
  }

  // 1. 歌詞列表渲染
  function renderLyricsList() {
    if (!lyricsCueList) return;

    if (!LINES.length) {
      if (currentVersionMode === "live") {
        showLiveHelperBanner();
        lyricsCueList.innerHTML = "";
      } else {
        lyricsCueList.innerHTML = `
          <li style="padding: 28px 16px; text-align: center; color: var(--text-muted); list-style: none;">
            <p style="margin: 0 0 12px 0; font-size: 13.5px;">此歌曲（<b>${esc(S?.ja || "")}</b>）在歌庫中尚未建置歌詞資料。</p>
            <button id="btnAutoOpenPaste" class="btn primary" style="padding: 6px 14px; font-size: 12.5px;">點此貼上歌詞開始對時</button>
          </li>
        `;
        $("btnAutoOpenPaste")?.addEventListener("click", () => {
          btnPasteModal?.click();
        });
      }

      if (statsSummary) statsSummary.innerHTML = `<b>0 / 0</b> 句已對時`;
      if (statsDetails) statsDetails.innerHTML = currentVersionMode === "live" ? `(尚未匯入歌詞)` : `尚無歌詞`;
      if (statsProgressFill) statsProgressFill.style.width = `0%`;
      return;
    }

    if (liveHelperBanner && LINES.length > 0) {
      liveHelperBanner.style.display = "none";
    }

    lyricsCueList.innerHTML = LINES.map((l, i) => {
      const prev = LINES.slice(0, i).reverse().find(x => x.time != null);
      const bad = l.time != null && prev && l.time < prev.time;
      const origItem = ORIG[i];
      const changed = origItem && origItem.jp === l.jp && origItem.time !== l.time;
      const isSel = selectedIndices.has(i);
      const isPlay = i === playingIdx;
      const actsHtml = (l.acts && l.acts.length)
        ? l.acts.map(a => `<span class="act-tag ${a}" title="${ACT_MAP[a]?.name || a}">${ACT_MAP[a]?.icon || ""} ${ACT_MAP[a]?.name || a.toUpperCase()}</span>`).join("")
        : "";
      const singHtml = (l.sing && l.sing.length)
        ? `<span class="cue-sing-tag" title="大合唱片段：${esc(l.sing.join("、"))}">[唱: ${esc(l.sing.join(" / "))}]</span>`
        : "";
      const callHtml = l.call
        ? `<span class="cue-call-tag" title="喊聲台詞：${esc(l.call)}">[喊: ${esc(l.call)}]</span>`
        : "";
      const howHtml = l.how
        ? `<span style="font-size: 10px; color: var(--text-faint); margin-left: 4px;" title="動作備註：${esc(l.how)}">💡</span>`
        : "";

      return `
        <li class="cue-item ${isSel ? "selected" : ""} ${isPlay ? "playing" : ""} ${bad ? "bad" : ""} ${changed ? "changed" : ""}" data-i="${i}" draggable="true">
          <span class="cue-drag-grip" title="按住上下拖曳調整歌詞順序">⋮⋮</span>
          <span class="cue-idx">${i + 1}</span>
          <span class="cue-time ${l.time == null ? "none" : ""}">${fmt(l.time)}</span>
          <div class="cue-texts">
            <span class="cue-jp" lang="ja">${esc(l.jp || "")}${actsHtml}${singHtml}${callHtml}${howHtml}</span>
            ${l.tr ? `<span class="cue-tr">${esc(l.tr)}</span>` : ""}
          </div>
          <div class="cue-actions">
            <button class="btn icon-only cue-play-btn" data-action="preview" data-i="${i}" style="padding: 2px 6px; font-size: 10px;" title="從這句播放">▶</button>
            <button class="btn icon-only cue-clear-btn" data-action="clear" data-i="${i}" style="padding: 2px 6px; font-size: 10px;" title="清除時間">✕</button>
          </div>
        </li>
      `;
    }).join("");

    // 統計計算
    const timedCount = LINES.filter(l => l.time != null).length;
    const totalCount = LINES.length;
    const actsCount = LINES.filter(l => l.acts && l.acts.length > 0).length;
    const badCount = lyricsCueList.querySelectorAll(".bad").length;
    const changedCount = lyricsCueList.querySelectorAll(".changed").length;

    if (statsSummary) {
      statsSummary.innerHTML = `<b>${timedCount} / ${totalCount}</b> 句已對時 ${currentVersionMode === "live" ? `<span style="color: #f43f5e; font-size: 11px;">[LIVE 現場版]</span>` : ""}`;
    }
    let detailText = [];
    if (actsCount) detailText.push(`<span style="color: #38bdf8; font-weight: 600;">🏷️ ${actsCount} 句有應援</span>`);
    if (changedCount) detailText.push(`改動 ${changedCount} 句`);
    if (badCount) detailText.push(`<span style="color: var(--bad); font-weight: 700;">⚠ ${badCount} 句順序顛倒</span>`);
    if (statsDetails) statsDetails.innerHTML = detailText.join("・");

    const percent = totalCount > 0 ? Math.round((timedCount / totalCount) * 100) : 0;
    if (statsProgressFill) statsProgressFill.style.width = `${percent}%`;

    // 捲動至當前選中項
    const selEl = lyricsCueList.children[sel];
    if (selEl && !isDraggingClip) {
      selEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  // 2. 選中句微調工具箱渲染
  function renderInspector() {
    if (!inspectorTitle || !inspectorTimeLabel || !manualTimeInput) return;
    if (selectedIndices.size > 1) {
      const sorted = [...selectedIndices].sort((a, b) => a - b);
      const minIdx = sorted[0];
      const maxIdx = sorted[sorted.length - 1];
      inspectorTitle.innerHTML = `已選取：<b>${selectedIndices.size}</b> 句 (#${minIdx + 1} ~ #${maxIdx + 1}) <span class="multi-sel-badge">多重選取</span>`;
      inspectorTimeLabel.textContent = `${selectedIndices.size} 句整體微調`;
      manualTimeInput.value = "";
      manualTimeInput.placeholder = "批次平移";
      updateInspectorActsUI();
      return;
    }
    manualTimeInput.placeholder = "秒數 / mm:ss";
    const l = LINES[sel];
    if (!l) {
      inspectorTitle.innerHTML = "無選取句";
      inspectorTimeLabel.textContent = "—";
      manualTimeInput.value = "";
      updateInspectorActsUI();
      return;
    }
    inspectorTitle.innerHTML = `選取：<b>#${sel + 1}</b> <span style="font-weight: 400; color: #cbd5e1;">${esc(l.jp || "")}</span>`;
    inspectorTimeLabel.textContent = fmt(l.time);
    manualTimeInput.value = l.time != null ? l.time : "";
    updateInspectorActsUI();
  }

  // 應援動作工具箱更新
  function updateInspectorActsUI() {
    if (!inspectorActsRow) return;
    const isMulti = selectedIndices.size > 1;
    const targetIdx = isMulti ? [...selectedIndices][0] : sel;
    const l = LINES[targetIdx];

    if (!l && !isMulti) {
      inspectorActsRow.style.opacity = "0.4";
      inspectorActsRow.style.pointerEvents = "none";
      if (inspectorActDetails) inspectorActDetails.style.display = "none";
      return;
    }
    inspectorActsRow.style.opacity = "1";
    inspectorActsRow.style.pointerEvents = "auto";

    let activeActs = new Set();
    if (isMulti) {
      const targets = [...selectedIndices];
      ACT_KEYS.forEach(act => {
        if (targets.every(i => LINES[i] && Array.isArray(LINES[i].acts) && LINES[i].acts.includes(act))) {
          activeActs.add(act);
        }
      });
    } else if (l) {
      activeActs = new Set(Array.isArray(l.acts) ? l.acts : []);
    }

    inspectorActsRow.querySelectorAll("[data-act]").forEach(btn => {
      const act = btn.dataset.act;
      const isActive = activeActs.has(act);
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });

    if (inspectorActDetails) {
      if (isMulti || !l) {
        inspectorActDetails.style.display = "none";
      } else {
        const hasSing = activeActs.has("sing");
        const hasCall = activeActs.has("call");
        const hasAny = activeActs.size > 0;
        inspectorActDetails.style.display = hasAny ? "flex" : "none";
        if (actSingField) actSingField.style.display = hasSing ? "flex" : "none";
        if (actCallField) actCallField.style.display = hasCall ? "flex" : "none";
        if (actHowField) actHowField.style.display = hasAny ? "flex" : "none";

        if (inputActSing) inputActSing.value = Array.isArray(l.sing) ? l.sing.join(", ") : "";
        if (inputActCall) inputActCall.value = l.call || "";
        if (inputActHow) inputActHow.value = l.how || "";
      }
    }
  }

  // 切換選中句之應援動作
  function toggleActOnSelected(act) {
    if (sel < 0 || !LINES[sel]) return;
    pushHistory();

    const targets = selectedIndices.size > 0 ? Array.from(selectedIndices) : [sel];
    const allHave = targets.every(idx => {
      const line = LINES[idx];
      return line && Array.isArray(line.acts) && line.acts.includes(act);
    });

    targets.forEach(idx => {
      const line = LINES[idx];
      if (!line) return;
      let acts = Array.isArray(line.acts) ? [...line.acts] : [];
      if (allHave) {
        acts = acts.filter(a => a !== act);
      } else {
        if (!acts.includes(act)) acts.push(act);
      }
      if (acts.length) {
        line.acts = acts;
      } else {
        delete line.acts;
        delete line.sing;
        delete line.call;
        delete line.how;
      }
    });

    save();
    renderAll();
    toast(`${allHave ? "移除" : "加上"}【${ACT_MAP[act]?.name || act}】標籤 (${targets.length} 句)`);
  }

  // 清除選中句之所有應援動作
  function clearActsOnSelected() {
    if (sel < 0 || !LINES[sel]) return;
    pushHistory();
    const targets = selectedIndices.size > 0 ? Array.from(selectedIndices) : [sel];
    targets.forEach(idx => {
      const line = LINES[idx];
      if (!line) return;
      delete line.acts;
      delete line.sing;
      delete line.call;
      delete line.how;
    });
    save();
    renderAll();
    toast(`已清除 ${targets.length} 句的應援動作標籤`);
  }

  // 3. 導讀提示更新
  function updatePrompter() {
    if (!prompterTargetText || !prompterNextText) return;
    const cur = LINES[sel];
    const nxt = LINES[sel + 1];

    if (cur) {
      const actPrefix = (cur.acts && cur.acts.length)
        ? cur.acts.map(a => `<span class="act-tag ${a}" style="margin: 0 4px 0 0;">${ACT_MAP[a]?.icon || ""} ${ACT_MAP[a]?.name || a}</span>`).join("")
        : "";
      prompterTargetText.innerHTML = `<b>#${sel + 1}</b> ${actPrefix}${esc(cur.jp || "")} ${cur.tr ? `<span style="color: #93c5fd; font-weight: normal;">(${esc(cur.tr)})</span>` : ""}`;
    } else {
      prompterTargetText.textContent = "— (已至最後)";
    }

    if (nxt) {
      const nxtPrefix = (nxt.acts && nxt.acts.length)
        ? nxt.acts.map(a => `<span class="act-tag ${a}" style="margin: 0 4px 0 0;">${ACT_MAP[a]?.icon || ""} ${ACT_MAP[a]?.name || a}</span>`).join("")
        : "";
      prompterNextText.innerHTML = `<b>#${sel + 2}</b> ${nxtPrefix}${esc(nxt.jp || "")} ${nxt.tr ? `<span style="color: #93c5fd; font-weight: normal;">(${esc(nxt.tr)})</span>` : ""}`;
    } else {
      prompterNextText.textContent = "— (結尾)";
    }
  }

  // 4. 時間軸渲染 (Ruler, Clips, Waveform)
  // ── 字幕塊幾何：所有「結尾在哪」的判斷都走這裡，畫面、拖曳、循環才會一致 ──
  const MIN_CLIP = 0.2; // 字幕塊最短 0.2 秒
  const IMPLICIT_MAX_GAP = 8; // 沒設 duration 時，距離下一句 ≤ 8 秒就延伸到下一句

  function nextTimedIdx(i) {
    for (let j = i + 1; j < LINES.length; j++) if (LINES[j].time != null) return j;
    return -1;
  }
  function prevTimedIdx(i) {
    for (let j = i - 1; j >= 0; j--) if (LINES[j].time != null) return j;
    return -1;
  }
  function clipDuration(i) {
    const l = LINES[i];
    if (!l || l.time == null) return 0;
    if (l.duration != null && l.duration > 0) return l.duration;
    const n = nextTimedIdx(i);
    if (n >= 0 && LINES[n].time > l.time) {
      const gap = LINES[n].time - l.time;
      return gap <= IMPLICIT_MAX_GAP ? gap : 4.5;
    }
    return 3.5;
  }
  const clipEnd = i => LINES[i].time + clipDuration(i);

  function renderTimeline() {
    if (!timelineViewport || !timelineContentLayer) return;
    const totalWidth = Math.max(timelineViewport.clientWidth, songDuration * zoom + TIMELINE_PAD + 120);
    timelineContentLayer.style.width = `${totalWidth}px`;

    renderCanvases();
    renderSubtitleClips();
    renderLoopRegion();
  }

  // 刻度尺與波形只畫「目前看得到的範圍」：整首歌一張畫布在高倍率時會超過瀏覽器畫布上限而變空白
  function renderCanvases() {
    renderRuler();
    renderWaveform();
  }

  let canvasRaf = 0;
  function scheduleCanvasRender() {
    if (canvasRaf) return;
    canvasRaf = requestAnimationFrame(() => { canvasRaf = 0; renderCanvases(); });
  }

  function prepVisibleCanvas(canvas, height) {
    const dpr = window.devicePixelRatio || 1;
    const viewLeft = timelineViewport ? timelineViewport.scrollLeft : 0;
    const viewWidth = timelineViewport ? timelineViewport.clientWidth : 800;
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = `${viewLeft}px`;
    canvas.style.width = `${viewWidth}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== Math.round(viewWidth * dpr)) canvas.width = Math.round(viewWidth * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, height);
    // 之後用「內容層座標」作畫：x 直接用 TIMELINE_PAD + t * zoom
    ctx.translate(-viewLeft, 0);
    const t0 = Math.max(0, (viewLeft - TIMELINE_PAD) / zoom);
    const t1 = Math.min(songDuration, (viewLeft + viewWidth - TIMELINE_PAD) / zoom);
    return { ctx, t0, t1 };
  }

  function rulerSteps() {
    if (zoom >= 250) return [1, 0.1];
    if (zoom >= 100) return [2, 0.5];
    if (zoom >= 50) return [5, 1];
    if (zoom >= 25) return [10, 2];
    if (zoom >= 12) return [30, 5];
    if (zoom >= 5) return [60, 15];
    return [120, 30];
  }

  // 4.1 時間刻度尺
  function renderRuler() {
    if (!rulerCanvas) return;
    const height = 28;
    const { ctx, t0, t1 } = prepVisibleCanvas(rulerCanvas, height);
    const [majorStep, minorStep] = rulerSteps();

    ctx.font = '10px ui-monospace, "Cascadia Code", Consolas, monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    const startK = Math.floor(t0 / minorStep);
    const endK = Math.ceil(t1 / minorStep);
    const ratio = Math.round(majorStep / minorStep);
    for (let k = startK; k <= endK; k++) {
      const t = k * minorStep;
      if (t < 0 || t > songDuration) continue;
      const x = TIMELINE_PAD + t * zoom;
      const isMajor = k % ratio === 0;
      ctx.strokeStyle = isMajor ? "rgba(148, 163, 184, 0.4)" : "rgba(148, 163, 184, 0.18)";
      ctx.lineWidth = isMajor ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x, height - (isMajor ? 12 : 6));
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = "#94a3b8";
        ctx.fillText(zoom >= 250 ? fmt(t) : fmt(t, false), x + 4, 10);
      }
    }
  }

  // 4.2 參考波形與打點標記軌
  function renderWaveform() {
    if (!waveCanvas) return;
    const height = 54;
    const { ctx, t0, t1 } = prepVisibleCanvas(waveCanvas, height);
    const centerY = height / 2;
    ctx.fillStyle = currentVersionMode === "live" ? "rgba(244, 63, 94, 0.2)" : "rgba(14, 165, 233, 0.22)";

    const barWidth = 3;
    const gap = 1.5;
    const pitch = barWidth + gap;
    const iStart = Math.floor((t0 * zoom) / pitch);
    const iEnd = Math.ceil((t1 * zoom) / pitch);
    for (let i = iStart; i <= iEnd; i++) {
      const x = TIMELINE_PAD + i * pitch;
      const t = (x - TIMELINE_PAD) / zoom;
      const seed = Math.sin(t * 1.8) * Math.cos(t * 0.45) * Math.sin(t * 5.2);
      const amp = Math.min(1, Math.max(0.12, Math.abs(seed) * 0.8 + 0.15));
      const h = amp * (height - 12);
      ctx.fillRect(x, centerY - h / 2, barWidth, h);
    }

    LINES.forEach((l, idx) => {
      if (l.time == null || l.time < t0 - 1 || l.time > t1 + 1) return;
      const x = TIMELINE_PAD + l.time * zoom;
      ctx.save();
      ctx.translate(x, 7);
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 5);
      ctx.lineTo(-5, 0);
      ctx.closePath();
      if (selectedIndices.has(idx)) {
        ctx.fillStyle = "#ff334b";
        ctx.shadowColor = "rgba(255, 51, 75, 0.8)";
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = currentVersionMode === "live" ? "#f43f5e" : "#02b4f5";
        ctx.shadowColor = currentVersionMode === "live" ? "rgba(244, 63, 94, 0.5)" : "rgba(2, 180, 245, 0.5)";
        ctx.shadowBlur = 4;
      }
      ctx.fill();
      ctx.restore();
    });
  }

  // 4.3 字幕軌道區塊 (Clips)
  // clipDrag：拖曳中的狀態，讓重繪時保留「拖曳中」樣式
  let clipDrag = null;

  function renderSubtitleClips() {
    if (!trackSubtitles) return;
    trackSubtitles.innerHTML = "";
    let count = 0;
    let lastTime = -Infinity;
    const frag = document.createDocumentFragment();

    LINES.forEach((l, i) => {
      if (l.time == null) return;
      count++;

      const duration = clipDuration(i);
      const width = Math.max(6, duration * zoom);
      const left = TIMELINE_PAD + l.time * zoom;
      const bad = l.time < lastTime;
      lastTime = Math.max(lastTime, l.time);
      const isSel = selectedIndices.has(i);
      const isPlay = i === playingIdx;
      const inDrag = clipDrag && clipDrag.active && clipDrag.indices.has(i);
      const sizeCls = width < 28 ? "tiny" : (width < 70 ? "narrow" : "");
      let dragCls = "";
      if (inDrag) {
        if (clipDrag.mode === "move") dragCls = "dragging moving";
        else if (clipDrag.mode === "trim-left") dragCls = "dragging resizing-left";
        else dragCls = "dragging resizing-right resizing-active";
      }
      const rollCls = clipDrag && clipDrag.active && clipDrag.rollIdx === i ? "rolling" : "";

      const clip = document.createElement("div");
      clip.className = `timeline-clip ${isSel ? "selected" : ""} ${isPlay ? "playing" : ""} ${bad ? "bad" : ""} ${sizeCls} ${dragCls} ${rollCls}`;
      clip.style.left = `${left}px`;
      clip.style.width = `${width}px`;
      clip.dataset.i = i;
      clip.title = `#${i + 1} ${l.jp || ""}\n${fmt(l.time)} → ${fmt(l.time + duration)}（${duration.toFixed(2)}s）\n拖曳塊身移動・拖左右邊緣修剪・Alt+拖邊緣＝連動前後句`;

      const timeLabel = inDrag && clipDrag.mode !== "move"
        ? `${fmt(l.time)} ➔ ${fmt(l.time + duration)}`
        : fmt(l.time);

      clip.innerHTML = `
        <div class="clip-handle-left" data-handle="left" data-i="${i}"></div>
        <div class="clip-header-bar" style="${currentVersionMode === "live" ? "background: #be123c;" : ""}">
          <span class="clip-id-tag">#${i + 1}${(l.acts && l.acts.length) ? ` <span style="font-size:8.5px; opacity:0.95; font-weight:800; color:#38bdf8;">[${l.acts.map(a => ACT_MAP[a]?.icon || a).join("")}]</span>` : ""}</span>
          <span class="clip-time-tag">${timeLabel}</span>
          <button class="clip-split-btn" data-action="split" data-i="${i}" title="將此句切半分段 (快捷鍵 C)">✂️</button>
        </div>
        <div class="clip-body">
          <span class="clip-text-jp" lang="ja">${esc(l.jp || "")}</span>
          ${l.tr ? `<span class="clip-text-tr">${esc(l.tr)}</span>` : ""}
        </div>
        <div class="clip-handle-right" data-handle="right" data-i="${i}"></div>
      `;
      frag.appendChild(clip);
    });

    trackSubtitles.appendChild(frag);
    if (subClipCount) subClipCount.textContent = `${count} 塊`;
  }

  // 5. 播放指針與更新迴圈
  function updatePlayheadUI(t) {
    if (tcNow) tcNow.textContent = fmt(t);
    if (timelinePointerTime) timelinePointerTime.textContent = fmt(t);

    const x = TIMELINE_PAD + t * zoom;
    if (playheadCursor) playheadCursor.style.transform = `translateX(${x}px)`;

    let k = -1;
    LINES.forEach((l, i) => {
      if (l.time != null && t >= l.time) k = i;
    });

    if (k !== playingIdx) {
      playingIdx = k;
      document.querySelectorAll(".cue-item.playing").forEach(el => el.classList.remove("playing"));
      document.querySelectorAll(".timeline-clip.playing").forEach(el => el.classList.remove("playing"));

      if (k >= 0) {
        const itemEl = lyricsCueList?.querySelector(`.cue-item[data-i="${k}"]`);
        if (itemEl) itemEl.classList.add("playing");
        const clipEl = trackSubtitles?.querySelector(`.timeline-clip[data-i="${k}"]`);
        if (clipEl) clipEl.classList.add("playing");
      }
    }

    // 更新監視器即時字幕
    if (liveSubOverlay && liveSubJp && liveSubTr && liveSubBadge) {
      if (k >= 0 && LINES[k]) {
        const cur = LINES[k];
        let nxtTime = Infinity;
        for (let j = k + 1; j < LINES.length; j++) {
          if (LINES[j].time != null) { nxtTime = LINES[j].time; break; }
        }
        const lineDur = cur.duration || Math.min(6, nxtTime - cur.time);
        const isVisible = t >= cur.time && (t <= cur.time + lineDur);

        if (isVisible) {
          liveSubOverlay.style.opacity = "1";
          liveSubOverlay.style.transform = "translateX(-50%) translateY(0)";
          liveSubJp.textContent = cur.jp || "";
          liveSubTr.textContent = cur.tr || "";

          if (cur.acts && cur.acts.length) {
            liveSubBadge.style.display = "inline-flex";
            liveSubBadge.textContent = cur.acts.map(a => ACT_MAP[a] ? `${ACT_MAP[a].icon} ${ACT_MAP[a].name}` : a).join(" • ");
          } else {
            liveSubBadge.style.display = "none";
          }
        } else {
          liveSubOverlay.style.opacity = "0.2";
          liveSubOverlay.style.transform = "translateX(-50%) translateY(4px)";
          liveSubJp.innerHTML = `<span class="live-sub-empty">♪（間奏）♪</span>`;
          liveSubTr.textContent = "";
          liveSubBadge.style.display = "none";
        }
      } else {
        liveSubOverlay.style.opacity = "0.2";
        liveSubJp.innerHTML = `<span class="live-sub-empty">♪（前奏）♪</span>`;
        liveSubTr.textContent = "";
        liveSubBadge.style.display = "none";
      }
    }

    // 時間軸自動捲動跟隨
    if (followPlayhead && getPlayerState() === 1 && !isScrubbing && !isDraggingClip && timelineViewport && performance.now() > userScrollUntil) {
      const scrollLeft = timelineViewport.scrollLeft;
      const viewWidth = timelineViewport.clientWidth;
      const buffer = 140;

      if (x > scrollLeft + viewWidth - buffer || x < scrollLeft) {
        timelineViewport.scrollLeft = Math.max(0, x - 100);
      }
    }
  }

  (function tick() {
    const t = getCurrentTime();
    // 拖曳或拉長字幕塊時，指針堅定停留在原定點，不受心跳更新干擾！
    if (!isDraggingClip) {
      updatePlayheadUI(t);
    }
    requestAnimationFrame(tick);
  })();

  // ── 打點核心動作 (Punch In) ──
  function doPunch() {
    if (!S || !LINES.length) return;
    const l = LINES[sel];
    if (!l) return;

    pushHistory();

    const curT = getCurrentTime();
    const isPlaying = getPlayerState() === 1;

    // 若播放中，扣除反應時間；若暫停中，精確採用指針所在時間
    const lagSec = isPlaying ? (+lagInput?.value || 0) / 1000 * (+rateSelect?.value || 1) : 0;
    const punchTime = round(Math.max(0, curT - lagSec));
    l.time = punchTime;

    if (punchFlash) {
      punchFlash.classList.add("active");
      setTimeout(() => punchFlash.classList.remove("active"), 120);
    }

    const completedIdx = sel;

    // 若原本處於暫停，打點後自動開始播放影片，方便接續對時
    if (!isPlaying) {
      play();
    }

    // ★★★ 自動切換到下一個歌詞！ ★★★
    if (sel < LINES.length - 1) {
      sel = sel + 1;
      selectedIndices = new Set([sel]);
      toast(`已記錄第 ${completedIdx + 1} 句（${fmt(punchTime)}），已自動切換至第 ${sel + 1} 句 👉`);
    } else {
      toast(`已記錄最後一句（${fmt(punchTime)}），全曲對時完成！🎉`);
    }

    save();
    renderAll();
  }

  function stepSelectedTime(delta, forceToast = false) {
    if (!selectedIndices.size) return;
    if (![...selectedIndices].some(i => LINES[i] && LINES[i].time != null)) {
      toast("選取的句子還沒有時間，無法微調；先按空白鍵打點");
      return;
    }
    pushHistory();
    let count = 0;
    selectedIndices.forEach(idx => {
      const l = LINES[idx];
      if (l && l.time != null) {
        l.time = round(Math.max(0, l.time + delta));
        count++;
      }
    });
    save();
    renderAll();
    if (selectedIndices.size > 1 || forceToast) {
      toast(`已將選取的 ${count} 句歌詞整體微調 ${delta > 0 ? "+" : ""}${delta} 秒`);
    }
  }

  // ── 時間軸互動事件 ──
  const DRAG_THRESHOLD_PX = 4;   // 超過才算拖曳，手抖不會改到時間
  const SNAP_PX = 8;             // 磁吸距離（螢幕像素）
  let snapEnabled = store.get("timing-snap") !== "0";

  const pxToTime = clientX => {
    const rect = timelineContentLayer.getBoundingClientRect();
    return (clientX - rect.left - TIMELINE_PAD) / zoom;
  };

  function showTooltipAt(t, html) {
    if (!timelineDragTooltip) return;
    timelineDragTooltip.style.display = "block";
    timelineDragTooltip.style.left = `${TIMELINE_PAD + t * zoom + 12}px`;
    timelineDragTooltip.innerHTML = html;
  }
  function hideDragGuides() {
    if (timelineDragTooltip) timelineDragTooltip.style.display = "none";
    const snapLine = $("timelineSnapLine");
    if (snapLine) snapLine.style.display = "none";
  }
  function showSnapLine(t) {
    const snapLine = $("timelineSnapLine");
    if (!snapLine) return;
    if (t == null) { snapLine.style.display = "none"; return; }
    snapLine.style.display = "block";
    snapLine.style.transform = `translateX(${TIMELINE_PAD + t * zoom}px)`;
  }

  // 磁吸目標：播放指針、其他字幕塊的起點與終點、循環區間
  function collectSnapTargets(exclude) {
    const targets = [{ t: round(getCurrentTime()), label: "指針" }];
    LINES.forEach((l, i) => {
      if (l.time == null || exclude.has(i)) return;
      targets.push({ t: l.time, label: `#${i + 1} 起點` });
      targets.push({ t: round(clipEnd(i)), label: `#${i + 1} 終點` });
    });
    return targets;
  }
  function findSnap(times, targets) {
    const thr = SNAP_PX / zoom;
    let best = null;
    for (const t of times) {
      for (const tg of targets) {
        const d = tg.t - t;
        if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.delta))) {
          best = { delta: d, at: tg.t, label: tg.label };
        }
      }
    }
    return best;
  }

  // ── 指針拖曳 (Scrub)：刻度尺、指針頭、波形軌都能拖；Shift 磁吸到字幕邊界 ──
  function startScrub(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    isScrubbing = true;
    const wasPlaying = getPlayerState() === 1;
    if (wasPlaying) pause();
    let lastT = 0;

    const scrubTo = ev => {
      let t = Math.max(0, Math.min(songDuration, pxToTime(ev.clientX)));
      let label = "";
      if (ev.shiftKey) {
        const s = findSnap([t], collectSnapTargets(new Set()).slice(1));
        if (s) { t = s.at; label = `🧲 ${s.label}　`; }
      }
      showSnapLine(label ? t : null);
      lastT = t;
      seekTo(t, false);
      showTooltipAt(t, `${label}${fmt(t)}`);
    };
    scrubTo(e);

    const onUp = () => {
      isScrubbing = false;
      hideDragGuides();
      seekTo(lastT, true);
      if (wasPlaying) play();
      window.removeEventListener("mousemove", scrubTo);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", scrubTo);
    window.addEventListener("mouseup", onUp);
  }

  timelineRulerTrack?.addEventListener("mousedown", startScrub);
  trackWaveform?.addEventListener("mousedown", startScrub);
  playheadHead?.addEventListener("mousedown", e => { e.stopPropagation(); startScrub(e); });

  // 只更新選取相關的畫面（拖曳開始時不重建時間軸 DOM）
  function renderSelectionOnly() {
    renderLyricsList();
    renderInspector();
    updatePrompter();
    trackSubtitles?.querySelectorAll(".timeline-clip").forEach(el => {
      el.classList.toggle("selected", selectedIndices.has(+el.dataset.i));
    });
    renderWaveform();
  }

  if (trackSubtitles) {
    trackSubtitles.addEventListener("mousedown", e => {
      if (e.button !== 0) return;
      const clip = e.target.closest(".timeline-clip");

      // ── A. 點擊在字幕軌空白處：框選多選 (Marquee) ──
      if (!clip) {
        e.preventDefault();
        const marqueeBox = $("timelineMarqueeBox");
        if (!marqueeBox || !timelineContentLayer) return;
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        const rect = timelineContentLayer.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;
        const baseSelection = additive ? new Set(selectedIndices) : new Set();
        let moved = false;

        const onMarqueeMove = ev => {
          const curX = ev.clientX - rect.left;
          const curY = ev.clientY - rect.top;
          if (!moved && Math.abs(curX - startX) < DRAG_THRESHOLD_PX && Math.abs(curY - startY) < DRAG_THRESHOLD_PX) return;
          moved = true;
          const boxLeft = Math.min(startX, curX);
          const boxTop = Math.min(startY, curY);
          const boxWidth = Math.abs(curX - startX);
          const boxHeight = Math.abs(curY - startY);
          marqueeBox.style.display = "block";
          marqueeBox.style.left = `${boxLeft}px`;
          marqueeBox.style.top = `${boxTop}px`;
          marqueeBox.style.width = `${boxWidth}px`;
          marqueeBox.style.height = `${boxHeight}px`;

          const trackTop = trackSubtitles.offsetTop;
          const newSet = new Set(baseSelection);
          const allClips = trackSubtitles.querySelectorAll(".timeline-clip");
          allClips.forEach(el => {
            const cLeft = el.offsetLeft, cTop = trackTop + el.offsetTop;
            const cRight = cLeft + el.offsetWidth, cBottom = cTop + el.offsetHeight;
            if (!(boxLeft + boxWidth < cLeft || boxLeft > cRight || boxTop + boxHeight < cTop || boxTop > cBottom)) {
              newSet.add(+el.dataset.i);
            }
          });
          if (newSet.size > 0) {
            selectedIndices = newSet;
            sel = Math.min(...newSet);
            allClips.forEach(el => el.classList.toggle("selected", selectedIndices.has(+el.dataset.i)));
            renderInspector();
          }
        };

        const onMarqueeUp = ev => {
          marqueeBox.style.display = "none";
          window.removeEventListener("mousemove", onMarqueeMove);
          window.removeEventListener("mouseup", onMarqueeUp);
          if (!moved) {
            // 單擊空白處：像剪輯軟體一樣把指針移過去；有多選就收回成單選
            if (!additive && selectedIndices.size > 1) setSel(sel);
            seekTo(Math.max(0, Math.min(songDuration, pxToTime(ev.clientX))));
          }
          renderAll();
        };

        window.addEventListener("mousemove", onMarqueeMove);
        window.addEventListener("mouseup", onMarqueeUp);
        return;
      }

      // ── B. 點擊在字幕塊上 ──
      const idx = +clip.dataset.i;

      if (e.target.closest(".clip-split-btn")) {
        e.stopPropagation();
        openSplitModal(idx);
        return;
      }
      if (e.shiftKey) { selectRange(sel, idx); return; }
      if (e.ctrlKey || e.metaKey) { toggleSelect(idx); return; }

      e.preventDefault();
      const handle = e.target.closest("[data-handle]")?.dataset.handle;
      const mode = handle === "left" ? "trim-left" : handle === "right" ? "trim-right" : "move";

      // 修剪一次只動一塊；移動時若點的是已選群組就整組移動
      if (mode !== "move" || !selectedIndices.has(idx)) setSel(idx);
      else sel = idx;
      renderSelectionOnly();

      startClipDrag(e, idx, mode);
    });

    trackSubtitles.addEventListener("dblclick", e => {
      const clip = e.target.closest(".timeline-clip");
      if (!clip || e.target.closest(".clip-split-btn")) return;
      const idx = +clip.dataset.i;
      setSel(idx);
      const l = LINES[idx];
      if (l && l.time != null) {
        seekTo(l.time);
        play();
      }
      renderAll();
    });
  }

  // ── 字幕塊拖曳引擎：移動 / 修剪起點 / 修剪終點 / Alt 滾動編輯 ──
  function startClipDrag(e, idx, mode) {
    const snapshot = recordSnapshot();
    const startX = e.clientX;
    const l = LINES[idx];
    if (!l || l.time == null) return;

    const group = mode === "move"
      ? [...selectedIndices].filter(k => LINES[k] && LINES[k].time != null).sort((a, b) => a - b)
      : [idx];
    const groupSet = new Set(group);
    const orig = new Map(group.map(k => [k, { time: LINES[k].time, duration: LINES[k].duration, dur: clipDuration(k) }]));
    const origStart = l.time;
    const origEnd = clipEnd(idx);
    const hadExplicit = l.duration != null && l.duration > 0;

    // 鄰居（依清單順序）：移動或修剪都不越過前後句，順序不會顛倒
    const firstIdx = group[0], lastIdx = group[group.length - 1];
    const prevI = prevTimedIdx(firstIdx);
    const nextI = nextTimedIdx(lastIdx);
    const prev0 = prevI >= 0 ? { time: LINES[prevI].time, duration: LINES[prevI].duration, end: clipEnd(prevI) } : null;
    const next0 = nextI >= 0 ? { time: LINES[nextI].time, duration: LINES[nextI].duration, end: clipEnd(nextI) } : null;
    const snapTargets = collectSnapTargets(groupSet);

    clipDrag = { active: false, mode, indices: groupSet, rollIdx: -1 };
    isDraggingClip = true;
    let cancelled = false;
    let lastSummary = "";

    const restoreOrig = () => {
      orig.forEach((o, k) => {
        LINES[k].time = o.time;
        if (o.duration === undefined) delete LINES[k].duration; else LINES[k].duration = o.duration;
      });
      if (prevI >= 0) { if (prev0.duration === undefined) delete LINES[prevI].duration; else LINES[prevI].duration = prev0.duration; }
      if (nextI >= 0) {
        LINES[nextI].time = next0.time;
        if (next0.duration === undefined) delete LINES[nextI].duration; else LINES[nextI].duration = next0.duration;
      }
    };

    const apply = ev => {
      const dx = ev.clientX - startX;
      if (!clipDrag.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        clipDrag.active = true;
      }
      restoreOrig();
      const dt = dx / zoom;
      const useSnap = snapEnabled !== ev.shiftKey; // Shift 暫時反轉磁吸
      const roll = ev.altKey && mode !== "move";
      clipDrag.rollIdx = -1;
      let snap = null;

      if (mode === "move") {
        const gStart = orig.get(firstIdx).time;
        const gEnd = Math.max(...group.map(k => orig.get(k).time + orig.get(k).dur));
        let delta = dt;
        if (useSnap) {
          const edges = [];
          group.forEach(k => { edges.push(orig.get(k).time + delta, orig.get(k).time + orig.get(k).dur + delta); });
          snap = findSnap(edges, snapTargets);
          if (snap) delta += snap.delta;
        }
        // 不越過前一句起點、不越過下一句起點；也不出界
        const lo = Math.max(-gStart, prev0 ? prev0.time + 0.05 - gStart : -Infinity);
        const hi = Math.min(songDuration - gEnd, next0 ? next0.time - 0.05 - orig.get(lastIdx).time : Infinity);
        const clamped = Math.max(lo, Math.min(hi, delta));
        if (clamped !== delta) snap = null;
        delta = clamped;
        group.forEach(k => {
          const o = orig.get(k);
          LINES[k].time = round(o.time + delta);
          // 原本靠「延伸到下一句」決定長度的：仍碰得到下一句就維持自動延伸，否則固定原本長度，畫面才不會伸縮
          if (o.duration == null && k === lastIdx) {
            const reachesNext = next0 && o.time + delta + o.dur >= next0.time - 0.005 && next0.time - (o.time + delta) <= IMPLICIT_MAX_GAP;
            if (!reachesNext) LINES[k].duration = round(o.dur);
          }
        });
        lastSummary = group.length > 1
          ? `🚚 ${group.length} 句 ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}s`
          : `#${idx + 1} ${fmt(LINES[idx].time)}（${delta >= 0 ? "+" : ""}${delta.toFixed(2)}s）`;
      } else if (mode === "trim-left") {
        let ns = origStart + dt;
        if (useSnap) { snap = findSnap([ns], snapTargets); if (snap) ns = snap.at; }
        // 前一句是「自動延伸」且剛好接著這句：本來就會跟著縮放，等同自動滾動編輯
        const prevAuto = prev0 && prev0.duration == null && Math.abs(prev0.end - origStart) < 0.01;
        const prevFloor = prev0 ? ((roll || prevAuto) ? prev0.time + MIN_CLIP : Math.min(prev0.end, origStart)) : 0;
        const lo = Math.max(0, prevFloor);
        const hi = origEnd - MIN_CLIP;
        const clamped = Math.max(lo, Math.min(hi, ns));
        if (clamped !== ns) snap = null;
        ns = round(clamped);
        LINES[idx].time = ns;
        const implicitTouch = !hadExplicit && next0 && Math.abs(origEnd - next0.time) < 0.01 && next0.time - ns <= IMPLICIT_MAX_GAP;
        if (!implicitTouch) LINES[idx].duration = round(origEnd - ns);
        if ((roll || prevAuto) && prev0) {
          if (!prevAuto) LINES[prevI].duration = round(ns - prev0.time);
          clipDrag.rollIdx = prevI;
        }
        lastSummary = `#${idx + 1} 起點 ${fmt(ns)}（長 ${(origEnd - ns).toFixed(2)}s）${(roll || prevAuto) ? "・連動前一句" : ""}`;
      } else {
        let ne = origEnd + dt;
        if (useSnap) { snap = findSnap([ne], snapTargets); if (snap) ne = snap.at; }
        const lo = origStart + MIN_CLIP;
        const hi = next0 ? (roll ? next0.end - MIN_CLIP : Math.max(next0.time, origEnd)) : songDuration;
        const clamped = Math.max(lo, Math.min(hi, ne));
        if (clamped !== ne) snap = null;
        ne = round(clamped);
        LINES[idx].duration = round(ne - origStart);
        if (roll && next0) {
          LINES[nextI].time = ne;
          if (next0.duration != null) LINES[nextI].duration = round(next0.end - ne);
          clipDrag.rollIdx = nextI;
        }
        // 剛好接到下一句起點時改回「自動延伸」，之後移動下一句時會自動跟著
        if (next0 && Math.abs(ne - LINES[nextI].time) < 0.005 && LINES[nextI].time - origStart <= IMPLICIT_MAX_GAP) {
          delete LINES[idx].duration;
        }
        lastSummary = `#${idx + 1} 終點 ${fmt(ne)}（長 ${(ne - origStart).toFixed(2)}s）${roll ? "・連動下一句" : ""}`;
      }

      renderSubtitleClips();
      showSnapLine(snap ? snap.at : null);
      const anchorT = mode === "trim-right" ? clipEnd(idx) : LINES[idx].time;
      showTooltipAt(anchorT, snap
        ? `<span style="color:#facc15;font-weight:800;">🧲 ${snap.label}</span>　${lastSummary}`
        : lastSummary);
      if (inspectorTimeLabel) inspectorTimeLabel.textContent = fmt(LINES[sel]?.time);
    };

    const onKey = ev => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        cancelled = true;
        finish();
      }
    };

    const finish = () => {
      window.removeEventListener("mousemove", apply);
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("keydown", onKey, true);
      isDraggingClip = false;
      hideDragGuides();
      const wasActive = clipDrag.active;
      clipDrag = null;

      if (cancelled) {
        restoreOrig();
        renderAll();
        toast("已取消拖曳");
        return;
      }
      if (!wasActive) {
        // 只是點一下：選取而已，不改任何時間
        renderAll();
        return;
      }
      const changed = JSON.stringify(snapshot.lines) !== JSON.stringify(LINES);
      if (changed) {
        undoStack.push(snapshot);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
        updateUndoRedoUI();
        save();
        toast(`${lastSummary}・Ctrl+Z 可復原`);
      }
      renderAll();
    };

    window.addEventListener("mousemove", apply);
    window.addEventListener("mouseup", finish);
    window.addEventListener("keydown", onKey, true);
  }

  // ── I / O：把選取句的起點 / 終點設到播放指針（終點或起點固定不動） ──
  function setInPoint() {
    const l = LINES[sel];
    if (!l) return;
    const t = round(getCurrentTime());
    pushHistory();
    if (l.time != null) {
      const end = clipEnd(sel);
      const explicit = l.duration != null && l.duration > 0;
      l.time = t;
      if (explicit) {
        if (end - t >= MIN_CLIP) l.duration = round(end - t);
        else delete l.duration;
      }
    } else {
      l.time = t;
    }
    save();
    renderAll();
    toast(`#${sel + 1} 起點設為 ${fmt(t)}`);
  }

  function setOutPoint() {
    const l = LINES[sel];
    if (!l || l.time == null) return toast("這句還沒有起點，先打點或按 I");
    const t = round(getCurrentTime());
    if (t - l.time < MIN_CLIP) return toast("指針要在這句起點之後才能設終點");
    pushHistory();
    l.duration = round(t - l.time);
    save();
    renderAll();
    toast(`#${sel + 1} 終點設為 ${fmt(t)}（長 ${l.duration.toFixed(2)}s）`);
  }

  function toggleSnap(force) {
    snapEnabled = force != null ? force : !snapEnabled;
    store.set("timing-snap", snapEnabled ? "1" : "0");
    const chk = $("chkSnap");
    if (chk) chk.checked = snapEnabled;
    toast(snapEnabled ? "🧲 磁吸對齊：開（拖曳時按住 Shift 暫時關閉）" : "磁吸對齊：關（拖曳時按住 Shift 暫時開啟）");
  }
  const chkSnap = $("chkSnap");
  if (chkSnap) {
    chkSnap.checked = snapEnabled;
    chkSnap.addEventListener("change", () => toggleSnap(chkSnap.checked));
  }

  // ── 縮放：對數刻度滑桿，錨點（指針或滑鼠位置）縮放前後停在畫面同一處 ──
  const ZOOM_MIN = 2, ZOOM_MAX = 400;
  const zoomToSlider = z => Math.round(1000 * Math.log(z / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN));
  const sliderToZoom = v => ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, v / 1000);
  if (zoomSlider) { zoomSlider.min = 0; zoomSlider.max = 1000; zoomSlider.step = 1; zoomSlider.value = zoomToSlider(zoom); }

  function setZoom(newZoom, anchorT, anchorX) {
    if (!timelineViewport) return;
    const old = zoom;
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
    if (zoomSlider) zoomSlider.value = zoomToSlider(zoom);
    if (anchorT == null) {
      // 預設以指針為錨；指針不在畫面內就以畫面中央為錨
      const pt = getCurrentTime();
      const px = TIMELINE_PAD + pt * old - timelineViewport.scrollLeft;
      if (px >= 0 && px <= timelineViewport.clientWidth) { anchorT = pt; anchorX = px; }
      else {
        anchorX = timelineViewport.clientWidth / 2;
        anchorT = (timelineViewport.scrollLeft + anchorX - TIMELINE_PAD) / old;
      }
    }
    renderTimeline();
    timelineViewport.scrollLeft = Math.max(0, TIMELINE_PAD + anchorT * zoom - anchorX);
    renderCanvases();
    updatePlayheadUI(getCurrentTime());
  }
  const zoomBy = factor => setZoom(zoom * factor);

  if (timelineViewport) {
    timelineViewport.addEventListener("wheel", e => {
      if (e.ctrlKey || e.altKey) {
        e.preventDefault();
        const rect = timelineViewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const tAtMouse = (timelineViewport.scrollLeft + mouseX - TIMELINE_PAD) / zoom;
        setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), tAtMouse, mouseX);
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        timelineViewport.scrollLeft += e.deltaY;
        userScrollUntil = performance.now() + 2000;
      } else {
        userScrollUntil = performance.now() + 2000;
      }
    }, { passive: false });
    timelineViewport.addEventListener("scroll", scheduleCanvasRender, { passive: true });
  }

  if (zoomSlider) zoomSlider.addEventListener("input", () => setZoom(sliderToZoom(+zoomSlider.value)));
  if (btnZoomIn) btnZoomIn.addEventListener("click", () => zoomBy(1.4));
  if (btnZoomOut) btnZoomOut.addEventListener("click", () => zoomBy(1 / 1.4));

  function zoomToFit() {
    if (!timelineViewport) return;
    const viewWidth = timelineViewport.clientWidth - TIMELINE_PAD - 30;
    setZoom(viewWidth / songDuration, 0, TIMELINE_PAD);
    timelineViewport.scrollLeft = 0;
    renderCanvases();
  }
  function zoomToSelection() {
    const idxs = [...selectedIndices].filter(k => LINES[k] && LINES[k].time != null);
    if (!idxs.length || !timelineViewport) return toast("選取句還沒有時間");
    const s = Math.min(...idxs.map(k => LINES[k].time));
    const e2 = Math.max(...idxs.map(k => clipEnd(k)));
    const span = Math.max(2, e2 - s + 1.5);
    const viewWidth = timelineViewport.clientWidth;
    setZoom(Math.min(ZOOM_MAX, (viewWidth * 0.8) / span), s, viewWidth * 0.1);
  }
  btnZoomFit?.addEventListener("click", zoomToFit);
  btnZoomFocus?.addEventListener("click", zoomToSelection);

  if (chkFollowPlayhead) {
    chkFollowPlayhead.addEventListener("change", () => {
      followPlayhead = chkFollowPlayhead.checked;
    });
  }

  // ── 版本切換按鈕事件 ──
  btnVersionMv?.addEventListener("click", () => {
    if (currentVersionMode === "mv") return;
    pickSong(S.id, "mv");
  });

  btnVersionLive?.addEventListener("click", () => {
    if (currentVersionMode === "live") return;
    pickSong(S.id, "live");
  });

  liveConcertSelect?.addEventListener("change", () => {
    pickSong(S.id, "live", liveConcertSelect.value);
  });

  btnCloneFromMv?.addEventListener("click", () => {
    if (LINES.length > 0 && !confirm("確定從 MV 版重新複製歌詞覆蓋目前進度？目前打點時間將清空。")) {
      return;
    }
    cloneLyricsFromMv(false);
  });

  // ── 歌詞列表點擊與操作 ──
  if (lyricsCueList) {
    lyricsCueList.addEventListener("click", e => {
      const li = e.target.closest("li.cue-item");
      if (!li) return;
      const i = +li.dataset.i;

      const btn = e.target.closest("button");
      if (btn) {
        const action = btn.dataset.action;
        if (action === "preview") {
          sel = i;
          const l = LINES[i];
          if (l && l.time != null) {
            seekTo(Math.max(0, l.time - 2));
            play();
          }
          renderAll();
          return;
        }
        if (action === "clear") {
          pushHistory();
          LINES[i].time = null;
          save();
          renderAll();
          return;
        }
      }

      if (e.shiftKey) {
        selectRange(sel, i);
      } else if (e.ctrlKey || e.metaKey) {
        toggleSelect(i);
      } else {
        selectSingle(i);
      }
    });

    lyricsCueList.addEventListener("dblclick", e => {
      const li = e.target.closest("li.cue-item");
      if (!li) return;
      const i = +li.dataset.i;
      selectSingle(i);
      const l = LINES[i];
      if (l && l.time != null) {
        seekTo(Math.max(0, l.time - 2));
        play();
      }
      renderAll();
    });

    // ── 歌詞清單上下拖曳排序 (Drag & Drop Reordering) ──
    let dragSrcIdx = null;

    lyricsCueList.addEventListener("dragstart", e => {
      const li = e.target.closest("li.cue-item");
      if (!li) return;
      dragSrcIdx = +li.dataset.i;
      li.classList.add("dragging-source");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(dragSrcIdx));
    });

    lyricsCueList.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const li = e.target.closest("li.cue-item");
      if (!li) return;
      const rect = li.getBoundingClientRect();
      const isAbove = (e.clientY - rect.top) < (rect.height / 2);
      li.classList.toggle("drop-target-above", isAbove);
      li.classList.toggle("drop-target-below", !isAbove);
    });

    lyricsCueList.addEventListener("dragleave", e => {
      const li = e.target.closest("li.cue-item");
      if (!li) return;
      li.classList.remove("drop-target-above", "drop-target-below");
    });

    lyricsCueList.addEventListener("drop", e => {
      e.preventDefault();
      const li = e.target.closest("li.cue-item");
      if (!li || dragSrcIdx === null) return;
      const targetIdx = +li.dataset.i;
      const rect = li.getBoundingClientRect();
      const isAbove = (e.clientY - rect.top) < (rect.height / 2);

      li.classList.remove("drop-target-above", "drop-target-below");

      let insertAt = isAbove ? targetIdx : targetIdx + 1;
      if (dragSrcIdx < insertAt) {
        insertAt--;
      }

      if (insertAt !== dragSrcIdx) {
        pushHistory();
        const [moved] = LINES.splice(dragSrcIdx, 1);
        LINES.splice(insertAt, 0, moved);
        selectSingle(insertAt);
        save();
        renderAll();
        toast(`已將第 ${dragSrcIdx + 1} 句移動至第 ${insertAt + 1} 句位置`);
      }
      dragSrcIdx = null;
    });

    lyricsCueList.addEventListener("dragend", () => {
      dragSrcIdx = null;
      document.querySelectorAll(".cue-item").forEach(el => {
        el.classList.remove("dragging-source", "drop-target-above", "drop-target-below");
      });
    });
  }

  // ── 依時間自動重新排序 (Auto Sort By Time) ──
  function autoSortByTime() {
    if (!LINES.length) return;
    pushHistory();

    const currentLead = LINES[sel];

    // 有時間的句子按 time 從小到大排序；若時間相同按原順序；沒時間的排在後面
    LINES.sort((a, b) => {
      if (a.time == null && b.time == null) return 0;
      if (a.time == null) return 1;
      if (b.time == null) return -1;
      return a.time - b.time;
    });

    const newIdx = LINES.indexOf(currentLead);
    selectSingle(newIdx >= 0 ? newIdx : 0);
    save();
    renderAll();
    toast("已依時間從小到大重新排序整首歌詞！順序顛倒問題已解決 🎉");
  }

  $("btnAutoSort")?.addEventListener("click", autoSortByTime);

  // ── 上移 / 下移微調 ──
  function moveLine(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= LINES.length || toIdx < 0 || toIdx >= LINES.length || fromIdx === toIdx) return;
    pushHistory();
    const [item] = LINES.splice(fromIdx, 1);
    LINES.splice(toIdx, 0, item);
    selectSingle(toIdx);
    save();
    renderAll();
    toast(`已移動至第 ${toIdx + 1} 句`);
  }

  $("btnMoveUp")?.addEventListener("click", () => moveLine(sel, sel - 1));
  $("btnMoveDown")?.addEventListener("click", () => moveLine(sel, sel + 1));

  // ── 走帶控制按鈕 ──
  if (btnSeekStart) btnSeekStart.addEventListener("click", () => seekTo(0));
  if (btnRewind2) btnRewind2.addEventListener("click", () => seekTo(getCurrentTime() - 2));
  if (btnForward2) btnForward2.addEventListener("click", () => seekTo(getCurrentTime() + 2));
  if (btnPrevLine) {
    btnPrevLine.addEventListener("click", () => {
      selectSingle(Math.max(0, sel - 1));
    });
  }
  if (btnNextLine) {
    btnNextLine.addEventListener("click", () => {
      selectSingle(Math.min(LINES.length - 1, sel + 1));
    });
  }
  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", () => {
      getPlayerState() === 1 ? pause() : play();
    });
  }
  if (btnPreviewLine) {
    btnPreviewLine.addEventListener("click", () => {
      const l = LINES[sel];
      if (l && l.time != null) {
        seekTo(Math.max(0, l.time - 2));
        play();
      } else {
        toast("這句還沒有打點時間");
      }
    });
  }
  if (btnPunch) btnPunch.addEventListener("click", doPunch);

  // ── 檢查器按鈕 ──
  if (btnStepMinus20) btnStepMinus20.addEventListener("click", () => stepSelectedTime(-0.2));
  if (btnStepMinus5) btnStepMinus5.addEventListener("click", () => stepSelectedTime(-0.05));
  if (btnStepPlus5) btnStepPlus5.addEventListener("click", () => stepSelectedTime(0.05));
  if (btnStepPlus20) btnStepPlus20.addEventListener("click", () => stepSelectedTime(0.2));

  if (btnSetNowTime) {
    btnSetNowTime.addEventListener("click", () => {
      const l = LINES[sel];
      if (!l) return;
      pushHistory();
      const completedIdx = sel;
      l.time = round(getCurrentTime());

      // ★★★ 自動切換到下一個歌詞！ ★★★
      if (sel < LINES.length - 1) {
        selectSingle(sel + 1);
        toast(`第 ${completedIdx + 1} 句已設為 ${fmt(l.time)}，已自動切換至第 ${sel + 1} 句 👉`);
      } else {
        toast(`第 ${completedIdx + 1} 句已設為 ${fmt(l.time)}`);
      }

      save();
      renderAll();
    });
  }

  if (btnClearTime) {
    btnClearTime.addEventListener("click", () => {
      if (!selectedIndices.size) return;
      pushHistory();
      let cnt = 0;
      selectedIndices.forEach(k => {
        if (LINES[k] && LINES[k].time != null) {
          LINES[k].time = null;
          cnt++;
        }
      });
      save();
      renderAll();
      toast(`已清除選取的 ${cnt} 句時間打點`);
    });
  }

  if (manualTimeInput) {
    manualTimeInput.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        manualTimeInput.blur();
      }
    });

    manualTimeInput.addEventListener("change", () => {
      if (selectedIndices.size > 1) {
        batchShiftFromInput();
        return;
      }
      const l = LINES[sel];
      if (!l) return;
      const parsed = parseTime(manualTimeInput.value);
      if (parsed != null) {
        pushHistory();
        const completedIdx = sel;
        l.time = round(parsed);

        // ★★★ 自動切換到下一個歌詞！ ★★★
        if (sel < LINES.length - 1) {
          setSel(sel + 1);
          toast(`第 ${completedIdx + 1} 句時間已更新，已自動切換至第 ${sel + 1} 句 👉`);
        }

        save();
        renderAll();
      } else {
        manualTimeInput.value = l.time != null ? l.time : "";
      }
    });

    // 多選時：輸入 +1.5 / -0.8 / 1.5 → 選取句全部一起平移
    function batchShiftFromInput() {
      const raw = manualTimeInput.value.trim().replace(/\s+/g, "").replace(/^＋/, "+").replace(/^[－−]/, "-");
      manualTimeInput.value = "";
      if (!/^[+-]?\d+(\.\d+)?$/.test(raw)) {
        if (raw) toast("批次平移請輸入秒數，例如 +1.5 或 -0.8");
        return;
      }
      const delta = round(+raw);
      if (!delta) return;
      stepSelectedTime(delta, true);
    }
  }

  // 應援動作工具列事件
  if (inspectorActsRow) {
    inspectorActsRow.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-act]");
      if (!btn) return;
      toggleActOnSelected(btn.dataset.act);
    });
  }

  if (btnClearActs) {
    btnClearActs.addEventListener("click", () => {
      clearActsOnSelected();
    });
  }

  if (inputActSing) {
    inputActSing.addEventListener("change", () => {
      const l = LINES[sel];
      if (!l) return;
      pushHistory();
      const val = inputActSing.value.trim();
      if (val) {
        l.sing = val.split(/[,，、]+/).map(s => s.trim()).filter(Boolean);
      } else {
        delete l.sing;
      }
      save();
      renderAll();
    });
  }

  if (btnFillSingAll) {
    btnFillSingAll.addEventListener("click", () => {
      const l = LINES[sel];
      if (!l || !l.jp) return;
      pushHistory();
      l.sing = [l.jp.trim()];
      if (inputActSing) inputActSing.value = l.jp.trim();
      save();
      renderAll();
      toast("已將整句日文設為大合唱詞");
    });
  }

  if (inputActCall) {
    inputActCall.addEventListener("change", () => {
      const l = LINES[sel];
      if (!l) return;
      pushHistory();
      const val = inputActCall.value.trim();
      if (val) l.call = val; else delete l.call;
      save();
      renderAll();
    });
  }

  if (inputActHow) {
    inputActHow.addEventListener("change", () => {
      const l = LINES[sel];
      if (!l) return;
      pushHistory();
      const val = inputActHow.value.trim();
      if (val) l.how = val; else delete l.how;
      save();
      renderAll();
    });
  }

  // 編輯歌詞與應援標籤
  let modalEditSelectedActs = new Set();
  function renderModalEditActsUI() {
    if (!modalEditActButtons) return;
    modalEditActButtons.querySelectorAll("[data-act]").forEach(b => {
      const act = b.dataset.act;
      const on = modalEditSelectedActs.has(act);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });
    if (modalEditSingGroup) modalEditSingGroup.style.display = modalEditSelectedActs.has("sing") ? "flex" : "none";
    if (modalEditCallGroup) modalEditCallGroup.style.display = modalEditSelectedActs.has("call") ? "flex" : "none";
  }

  if (modalEditActButtons) {
    modalEditActButtons.addEventListener("click", ev => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (modalEditSelectedActs.has(act)) modalEditSelectedActs.delete(act);
      else modalEditSelectedActs.add(act);
      renderModalEditActsUI();
    });
  }

  if (btnEditLine && modalEditLine) {
    btnEditLine.addEventListener("click", () => {
      const l = LINES[sel];
      if (!l) return;
      editingLineIndex = sel;
      if (editLineModalTitle) editLineModalTitle.textContent = `編輯第 ${sel + 1} 句歌詞與應援標籤`;
      if (editJpInput) editJpInput.value = l.jp || "";
      if (editTrInput) editTrInput.value = l.tr || "";
      modalEditSelectedActs = new Set(Array.isArray(l.acts) ? l.acts : []);
      renderModalEditActsUI();
      if (editSingInput) editSingInput.value = Array.isArray(l.sing) ? l.sing.join(", ") : "";
      if (editCallInput) editCallInput.value = l.call || "";
      if (editHowInput) editHowInput.value = l.how || "";
      modalEditLine.classList.add("active");
      editJpInput?.focus();
    });
  }

  if (btnSaveEdit && modalEditLine) {
    btnSaveEdit.addEventListener("click", () => {
      if (editingLineIndex < 0 || !LINES[editingLineIndex]) return;
      pushHistory();
      const line = LINES[editingLineIndex];
      if (editJpInput) line.jp = editJpInput.value.trim();
      if (editTrInput) line.tr = editTrInput.value.trim();

      if (modalEditSelectedActs.size > 0) {
        line.acts = Array.from(modalEditSelectedActs);
      } else {
        delete line.acts;
      }

      if (modalEditSelectedActs.has("sing")) {
        const singVal = editSingInput ? editSingInput.value.trim() : "";
        if (singVal) line.sing = singVal.split(/[,，、]+/).map(s => s.trim()).filter(Boolean);
        else delete line.sing;
      } else {
        delete line.sing;
      }

      if (modalEditSelectedActs.has("call")) {
        const callVal = editCallInput ? editCallInput.value.trim() : "";
        if (callVal) line.call = callVal;
        else delete line.call;
      } else {
        delete line.call;
      }

      const howVal = editHowInput ? editHowInput.value.trim() : "";
      if (howVal) line.how = howVal;
      else delete line.how;

      modalEditLine.classList.remove("active");
      save();
      renderAll();
      toast("已儲存歌詞與應援修改");
    });
  }

  if (btnCancelEdit && modalEditLine) btnCancelEdit.addEventListener("click", () => modalEditLine.classList.remove("active"));
  if (btnCloseEditModal && modalEditLine) btnCloseEditModal.addEventListener("click", () => modalEditLine.classList.remove("active"));

  // 新增句子
  if (btnAddLine && modalAddLine) {
    btnAddLine.addEventListener("click", () => {
      if (addJpInput) addJpInput.value = "";
      if (addTrInput) addTrInput.value = "";
      if (addTimeInput) addTimeInput.value = fmt(getCurrentTime(), true);
      modalAddLine.classList.add("active");
      addJpInput?.focus();
    });
  }

  if (btnSaveAdd && modalAddLine) {
    btnSaveAdd.addEventListener("click", () => {
      const jp = addJpInput?.value.trim();
      const tr = addTrInput?.value.trim() || "";
      if (!jp) return toast("請輸入日文歌詞或舞台台詞");

      pushHistory();
      const t = parseTime(addTimeInput?.value);
      const newLine = { time: t, jp, tr };

      // 插入在當前 sel 之後
      const insertAt = LINES.length ? sel + 1 : 0;
      LINES.splice(insertAt, 0, newLine);
      setSel(insertAt);
      save();
      renderAll();
      modalAddLine.classList.remove("active");
      toast(`已插入新句子！`);
    });
  }

  if (btnCancelAdd && modalAddLine) btnCancelAdd.addEventListener("click", () => modalAddLine.classList.remove("active"));
  if (btnCloseAddModal && modalAddLine) btnCloseAddModal.addEventListener("click", () => modalAddLine.classList.remove("active"));

  // 刪除選取句（支援多選）
  function deleteSelectedLines() {
    const targets = [...selectedIndices].filter(i => LINES[i]).sort((a, b) => a - b);
    if (!targets.length) return;
    const msg = targets.length === 1
      ? `確定要刪除第 ${targets[0] + 1} 句【${LINES[targets[0]].jp || ""}】？`
      : `確定要刪除選取的 ${targets.length} 句（#${targets[0] + 1} ~ #${targets[targets.length - 1] + 1}）？`;
    if (!confirm(`${msg}\n（可用 Ctrl+Z 復原）`)) return;
    pushHistory();
    for (let k = targets.length - 1; k >= 0; k--) LINES.splice(targets[k], 1);
    setSel(targets[0]);
    save();
    renderAll();
    toast(`已刪除 ${targets.length} 句（Ctrl+Z 可復原）`);
  }
  btnDeleteLine?.addEventListener("click", deleteSelectedLines);

  // ── 切半分段邏輯 (Split Clip) ──
  const modalSplitLine = $("modalSplitLine");
  const splitModalTitle = $("splitModalTitle");
  const splitOrigJp = $("splitOrigJp");
  const splitOrigTr = $("splitOrigTr");
  const splitPart1Jp = $("splitPart1Jp");
  const splitPart1Tr = $("splitPart1Tr");
  const splitPart1TimeLabel = $("splitPart1TimeLabel");
  const splitPart2Jp = $("splitPart2Jp");
  const splitPart2Tr = $("splitPart2Tr");
  const splitPart2Time = $("splitPart2Time");
  const btnQuickSplitSpace = $("btnQuickSplitSpace");
  const btnQuickSplitMid = $("btnQuickSplitMid");
  const btnQuickSplitPlayhead = $("btnQuickSplitPlayhead");
  const btnCancelSplit = $("btnCancelSplit");
  const btnCloseSplitModal = $("btnCloseSplitModal");
  const btnConfirmSplit = $("btnConfirmSplit");
  const btnSplitLine = $("btnSplitLine");

  let splittingIndex = -1;

  function openSplitModal(targetIndex) {
    const idx = targetIndex != null ? targetIndex : sel;
    if (idx < 0 || !LINES[idx]) {
      toast("請先選取要切分段的歌詞");
      return;
    }
    splittingIndex = idx;
    const l = LINES[idx];

    if (splitModalTitle) splitModalTitle.textContent = `✂️ 將第 ${idx + 1} 句歌詞切半分段`;
    if (splitOrigJp) splitOrigJp.textContent = l.jp || "";
    if (splitOrigTr) splitOrigTr.textContent = l.tr || "（無翻譯）";
    if (splitPart1TimeLabel) splitPart1TimeLabel.textContent = fmt(l.time);

    // 智慧文字拆分：優先找空格 (全形或半形)
    doSplitByWhitespace(l);

    // 智慧時間推算：若指針落在這句範圍內，使用指針時間；否則使用中點時間
    const curT = getCurrentTime();
    const curDur = l.duration || 3.5;
    if (l.time != null && curT > l.time + 0.3 && curT < l.time + curDur - 0.2) {
      if (splitPart2Time) splitPart2Time.value = round(curT);
    } else if (l.time != null) {
      if (splitPart2Time) splitPart2Time.value = round(l.time + curDur / 2);
    } else {
      if (splitPart2Time) splitPart2Time.value = "";
    }

    modalSplitLine?.classList.add("active");
    splitPart1Jp?.focus();
  }

  function doSplitByWhitespace(l) {
    const jp = l.jp || "";
    const tr = l.tr || "";

    const jpMatch = jp.match(/^(.+?)[\s　]+(.*)$/);
    if (jpMatch) {
      if (splitPart1Jp) splitPart1Jp.value = jpMatch[1].trim();
      if (splitPart2Jp) splitPart2Jp.value = jpMatch[2].trim();
    } else {
      const mid = Math.ceil(jp.length / 2);
      if (splitPart1Jp) splitPart1Jp.value = jp.slice(0, mid).trim();
      if (splitPart2Jp) splitPart2Jp.value = jp.slice(mid).trim();
    }

    const trMatch = tr.match(/^(.+?)[\s　]+(.*)$/);
    if (trMatch) {
      if (splitPart1Tr) splitPart1Tr.value = trMatch[1].trim();
      if (splitPart2Tr) splitPart2Tr.value = trMatch[2].trim();
    } else if (tr) {
      const midTr = Math.ceil(tr.length / 2);
      if (splitPart1Tr) splitPart1Tr.value = tr.slice(0, midTr).trim();
      if (splitPart2Tr) splitPart2Tr.value = tr.slice(midTr).trim();
    } else {
      if (splitPart1Tr) splitPart1Tr.value = "";
      if (splitPart2Tr) splitPart2Tr.value = "";
    }
  }

  function doSplitByMid(l) {
    const jp = l.jp || "";
    const tr = l.tr || "";
    const midJp = Math.ceil(jp.length / 2);
    if (splitPart1Jp) splitPart1Jp.value = jp.slice(0, midJp).trim();
    if (splitPart2Jp) splitPart2Jp.value = jp.slice(midJp).trim();

    if (tr) {
      const midTr = Math.ceil(tr.length / 2);
      if (splitPart1Tr) splitPart1Tr.value = tr.slice(0, midTr).trim();
      if (splitPart2Tr) splitPart2Tr.value = tr.slice(midTr).trim();
    }
  }

  btnQuickSplitSpace?.addEventListener("click", () => {
    if (splittingIndex >= 0 && LINES[splittingIndex]) {
      doSplitByWhitespace(LINES[splittingIndex]);
    }
  });

  btnQuickSplitMid?.addEventListener("click", () => {
    if (splittingIndex >= 0 && LINES[splittingIndex]) {
      doSplitByMid(LINES[splittingIndex]);
    }
  });

  btnQuickSplitPlayhead?.addEventListener("click", () => {
    const t = getCurrentTime();
    if (splitPart2Time) splitPart2Time.value = round(t);
  });

  btnSplitLine?.addEventListener("click", () => openSplitModal(sel));
  btnCancelSplit?.addEventListener("click", () => modalSplitLine?.classList.remove("active"));
  btnCloseSplitModal?.addEventListener("click", () => modalSplitLine?.classList.remove("active"));

  btnConfirmSplit?.addEventListener("click", () => {
    if (splittingIndex < 0 || !LINES[splittingIndex]) return;

    const p1Jp = splitPart1Jp?.value.trim();
    const p1Tr = splitPart1Tr?.value.trim() || "";
    const p2Jp = splitPart2Jp?.value.trim();
    const p2Tr = splitPart2Tr?.value.trim() || "";
    const p2TimeParsed = parseTime(splitPart2Time?.value);

    if (!p1Jp || !p2Jp) {
      toast("前半段與後半段的日文歌詞皆不能為空");
      return;
    }

    pushHistory();

    const orig = LINES[splittingIndex];
    const origTime = orig.time;
    const origDuration = orig.duration;

    // 更新前半段 (原地覆蓋)
    LINES[splittingIndex].jp = p1Jp;
    LINES[splittingIndex].tr = p1Tr;
    if (orig.sing && Array.isArray(orig.sing)) {
      const p1Sing = orig.sing.filter(w => p1Jp.includes(w));
      if (p1Sing.length) LINES[splittingIndex].sing = p1Sing;
      else delete LINES[splittingIndex].sing;
    }

    let part1Duration = undefined;
    let part2Duration = undefined;

    if (origTime != null && p2TimeParsed != null && p2TimeParsed > origTime) {
      part1Duration = round(p2TimeParsed - origTime);
      LINES[splittingIndex].duration = part1Duration;
      if (origDuration != null && origDuration > part1Duration) {
        part2Duration = round(origDuration - part1Duration);
      }
    }

    const p2Sing = (orig.sing && Array.isArray(orig.sing)) ? orig.sing.filter(w => p2Jp.includes(w)) : undefined;

    // 插入後半段新句
    const part2Line = {
      time: p2TimeParsed,
      jp: p2Jp,
      tr: p2Tr,
      duration: part2Duration,
      acts: orig.acts ? [...orig.acts] : undefined,
      sing: (p2Sing && p2Sing.length) ? p2Sing : undefined,
      call: orig.call
    };

    // 移除 undefined 欄位，避免輸出 JSON 時夾帶空鍵
    Object.keys(part2Line).forEach(k => part2Line[k] === undefined && delete part2Line[k]);

    LINES.splice(splittingIndex + 1, 0, part2Line);
    setSel(splittingIndex + 1); // 自動聚焦到切出來的新句

    modalSplitLine?.classList.remove("active");
    save();
    renderAll();
    toast(`已成功將第 ${splittingIndex + 1} 句切分成 2 句！`);
  });

  // ── 貼上歌詞彈窗 ──
  if (btnPasteModal && modalPaste) {
    btnPasteModal.addEventListener("click", () => {
      if (pasteInputText) {
        pasteInputText.value = LINES.map(l => l.jp + (l.tr ? `\t${l.tr}` : "")).join("\n");
      }
      modalPaste.classList.add("active");
      pasteInputText?.focus();
    });
  }
  if (btnClosePasteModal && modalPaste) btnClosePasteModal.addEventListener("click", () => modalPaste.classList.remove("active"));
  if (btnCancelPaste && modalPaste) btnCancelPaste.addEventListener("click", () => modalPaste.classList.remove("active"));

  // 解析貼上內容：JSON（本工具輸出 / lyrics 陣列）→ LRC → Tab 分隔純文字
  function parsePastedLyrics(text) {
    const trimmed = text.trim();
    if (/^[\[{]/.test(trimmed) && !/^\[\d{1,2}:\d{2}/.test(trimmed)) {
      try {
        const data = JSON.parse(trimmed);
        const arr = Array.isArray(data) ? data : (Array.isArray(data.lyrics) ? data.lyrics : null);
        if (arr) {
          const lines = arr.filter(l => l && typeof l.jp === "string").map(l => {
            const line = { ...l, time: (typeof l.time === "number" && l.time >= 0) ? round(l.time) : null };
            if (line.tr == null) line.tr = "";
            return line;
          });
          return { kind: "JSON", lines, timed: true, id: Array.isArray(data) ? null : data.id };
        }
      } catch (e) {
        return { kind: "error", error: `JSON 格式有誤：${e.message}` };
      }
    }

    const rows = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const lrcRe = /^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]\s*(.*)$/;
    const lrcRows = rows.filter(r => lrcRe.test(r));
    if (lrcRows.length && lrcRows.length >= rows.filter(r => !/^\[[a-z]+:/i.test(r)).length * 0.6) {
      const lines = lrcRows.map(r => {
        const [, m, s, rest] = r.match(lrcRe);
        const [jp, tr = ""] = rest.split("\t");
        return { time: round(+m * 60 + +s.replace(":", ".")), jp: jp.trim(), tr: tr.trim() };
      }).filter(l => l.jp);
      return { kind: "LRC", lines, timed: true };
    }

    const lines = rows.map(s => {
      const [jp, tr = ""] = s.split("\t");
      return { time: null, jp: jp.trim(), tr: tr.trim() };
    });
    return { kind: "文字", lines, timed: false };
  }

  function confirmPaste() {
    if (!pasteInputText) return;
    const result = parsePastedLyrics(pasteInputText.value);
    if (result.kind === "error") return toast(result.error);
    let parsed = result.lines;
    if (!parsed.length) return toast("沒有貼上任何歌詞內容");
    if (result.id && S && result.id !== S.id && result.id !== `${S.id}-live` &&
        !confirm(`這份 JSON 是「${result.id}」的資料，但目前選的是「${S.id}」。仍要匯入到目前歌曲嗎？`)) return;

    const keep = !result.timed && $("pasteKeepTimes")?.checked && LINES.length > 0;
    if (keep) {
      // 依行序沿用既有時間、時長與應援標籤，只換文字
      parsed = parsed.map((p, i) => {
        const old = LINES[i];
        if (!old) return p;
        const merged = { ...old, jp: p.jp, tr: p.tr };
        if (Array.isArray(merged.sing)) {
          merged.sing = merged.sing.filter(w => p.jp.includes(w));
          if (!merged.sing.length) delete merged.sing;
        }
        return merged;
      });
    }

    pushHistory();
    LINES = parsed;
    setSel(Math.max(0, LINES.findIndex(l => l.time == null)));
    save();
    renderAll();
    modalPaste.classList.remove("active");
    const timedCnt = LINES.filter(l => l.time != null).length;
    toast(`已匯入 ${LINES.length} 句（${result.kind}${keep ? "，保留原時間" : ""}，${timedCnt} 句有時間）・Ctrl+Z 可復原`);
  }

  btnConfirmPaste?.addEventListener("click", confirmPaste);

  const pasteFileInput = $("pasteFileInput");
  $("btnPasteLoadFile")?.addEventListener("click", () => pasteFileInput?.click());
  pasteFileInput?.addEventListener("change", async () => {
    const f = pasteFileInput.files && pasteFileInput.files[0];
    if (!f) return;
    try {
      pasteInputText.value = await f.text();
      toast(`已讀入 ${f.name}，確認內容後按「開始對時」`);
    } catch (e) {
      toast("讀取檔案失敗");
    }
    pasteFileInput.value = "";
  });

  // ── 快捷鍵說明彈窗 ──
  if (btnHotkeys && modalHotkeys) btnHotkeys.addEventListener("click", () => modalHotkeys.classList.add("active"));
  if (btnCloseHotkeysModal && modalHotkeys) btnCloseHotkeysModal.addEventListener("click", () => modalHotkeys.classList.remove("active"));
  if (btnCloseHotkeys && modalHotkeys) btnCloseHotkeys.addEventListener("click", () => modalHotkeys.classList.remove("active"));

  // ── 上一步 / 下一步 / 複製句按鈕 ──
  $("btnUndo")?.addEventListener("click", undo);
  $("btnRedo")?.addEventListener("click", redo);

  const btnDuplicateLine = $("btnDuplicateLine");
  function duplicateSelectedLine() {
    if (!LINES[sel]) return;
    pushHistory();
    const orig = LINES[sel];
    const dup = {
      ...orig,
      time: orig.time != null ? round(orig.time + (orig.duration || 3)) : null
    };
    LINES.splice(sel + 1, 0, dup);
    setSel(sel + 1);
    save();
    renderAll();
    toast(`已複製第 ${sel} 句為新句 👉`);
  }
  btnDuplicateLine?.addEventListener("click", duplicateSelectedLine);

  let isMuted = false;
  function toggleMute() {
    if (ytPlayer && playerReady) {
      try {
        if (typeof ytPlayer.isMuted === "function") {
          isMuted = ytPlayer.isMuted();
        }
        if (isMuted) {
          ytPlayer.unMute();
          isMuted = false;
          toast("🔊 已取消靜音");
        } else {
          ytPlayer.mute();
          isMuted = true;
          toast("🔇 已靜音");
        }
      } catch (e) {}
    } else {
      isMuted = !isMuted;
      toast(isMuted ? "🔇 已靜音" : "🔊 已取消靜音");
    }
  }

  // ── 效率功能：下一句未打點 / 選到結尾 / 指針微步進 / 速度 / 循環試聽 ──
  function jumpToUntimed(dir = 1) {
    if (!LINES.length) return;
    const n = LINES.length;
    for (let k = 1; k <= n; k++) {
      const i = (sel + dir * k + n) % n;
      if (LINES[i].time == null) {
        setSel(i);
        // 影片帶到前一句已打點時間附近，方便直接接著打點
        let prevT = null;
        for (let j = i - 1; j >= 0; j--) if (LINES[j].time != null) { prevT = LINES[j].time; break; }
        if (prevT != null) seekTo(Math.max(0, prevT - 0.5));
        renderAll();
        toast(`跳到第 ${i + 1} 句（尚未打點）${prevT != null ? `，影片已帶到 ${fmt(Math.max(0, prevT - 0.5))}` : ""}`);
        return;
      }
    }
    toast("🎉 全部句子都已經打點了");
  }

  function selectToEnd() {
    if (!LINES.length) return;
    const from = Math.min(...selectedIndices);
    selectedIndices = new Set();
    for (let i = from; i < LINES.length; i++) selectedIndices.add(i);
    sel = from;
    renderAll();
    toast(`已選取 #${from + 1} ~ #${LINES.length}（${selectedIndices.size} 句），可用 [ ] 或輸入 +秒數 整段平移`);
  }

  function nudgePlayhead(delta) {
    if (getPlayerState() === 1) pause();
    seekTo(round(getCurrentTime() + delta));
  }

  function changeRate(dir) {
    if (!rateSelect) return;
    const opts = [...rateSelect.options];
    const idx = Math.max(0, Math.min(opts.length - 1, rateSelect.selectedIndex + dir));
    if (idx === rateSelect.selectedIndex) return toast(`播放速度已是 ${opts[idx].text}`);
    rateSelect.selectedIndex = idx;
    rateSelect.dispatchEvent(new Event("change"));
    toast(`播放速度 ${opts[idx].text}`);
  }

  // 循環區間：選取句起點前 0.5 秒 → 下一句起點（或自身時長）
  let loopOn = false;
  const btnLoopLine = $("btnLoopLine");
  const timelineLoopRegion = $("timelineLoopRegion");

  function getLoopRange() {
    const l = LINES[sel];
    if (!l || l.time == null) return null;
    const end = clipEnd(sel);
    return { start: Math.max(0, l.time - 0.5), end: Math.min(songDuration, end + 0.15) };
  }

  function renderLoopRegion() {
    if (!timelineLoopRegion) return;
    const r = loopOn ? getLoopRange() : null;
    if (!r) { timelineLoopRegion.style.display = "none"; return; }
    timelineLoopRegion.style.display = "block";
    timelineLoopRegion.style.left = `${TIMELINE_PAD + r.start * zoom}px`;
    timelineLoopRegion.style.width = `${(r.end - r.start) * zoom}px`;
  }

  function toggleLoop(force) {
    const next = force != null ? force : !loopOn;
    if (next && !getLoopRange()) {
      toast("這句還沒有打點時間，無法循環");
      return;
    }
    loopOn = next;
    btnLoopLine?.classList.toggle("loop-on", loopOn);
    renderLoopRegion();
    if (loopOn) {
      seekTo(getLoopRange().start);
      play();
      toast("🔁 循環試聽選取句（再按 R 關閉）・用 [ ] 微調、↑↓ 換句");
    } else {
      toast("已關閉循環試聽");
    }
  }

  btnLoopLine?.addEventListener("click", () => toggleLoop());
  $("btnNextUntimed")?.addEventListener("click", () => jumpToUntimed(1));
  $("btnSelectToEnd")?.addEventListener("click", selectToEnd);

  (function loopTick() {
    if (loopOn && !isScrubbing && !isDraggingClip && getPlayerState() === 1) {
      const r = getLoopRange();
      if (!r) toggleLoop(false);
      else {
        const t = getCurrentTime();
        if (t >= r.end || t < r.start - 1) seekTo(r.start);
      }
    }
    requestAnimationFrame(loopTick);
  })();

  // 點完按鈕／下拉選單後把焦點還給頁面，避免空白鍵同時觸發按鈕＋打點、或快捷鍵被選單吃掉
  document.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b && !b.closest(".modal-overlay")) b.blur();
  });
  document.querySelectorAll(".top-bar select").forEach(s => s.addEventListener("change", () => s.blur()));

  function openEditModal() { btnEditLine?.click(); }
  function openAddModal() { btnAddLine?.click(); }

  // ── 鍵盤快捷鍵監聽 ──
  window.addEventListener("keydown", e => {
    const tgtEl = e.target instanceof Element ? e.target : document.body;
    // 彈窗優先：Esc 一律關閉；Enter 送出（貼上歌詞用 Ctrl+Enter）；其他快捷鍵停用
    if (isModalOpen()) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAllModals();
        return;
      }
      if (e.key === "Enter" && !e.isComposing) {
        const modal = document.querySelector(".modal-overlay.active");
        const inTextarea = tgtEl.tagName === "TEXTAREA";
        if (modal && (!inTextarea || e.ctrlKey || e.metaKey) && !tgtEl.closest("button")) {
          const primary = modal.querySelector(".modal-footer .btn.primary");
          if (primary) {
            e.preventDefault();
            primary.click();
          }
        }
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      if (canSaveToFile && btnSaveFile) saveToLyricsFile(e.shiftKey);
      else btnDownload?.click();
      return;
    }

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    // Ctrl+Z: 復原 / 上一步
    if (isCtrlOrMeta && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
      if (!tgtEl.closest("input, textarea")) {
        e.preventDefault();
        undo();
        return;
      }
    }

    // Ctrl+Y 或 Ctrl+Shift+Z: 重做 / 下一步
    if ((isCtrlOrMeta && (e.key === "y" || e.key === "Y")) ||
        (isCtrlOrMeta && e.shiftKey && (e.key === "z" || e.key === "Z"))) {
      if (!tgtEl.closest("input, textarea")) {
        e.preventDefault();
        redo();
        return;
      }
    }

    // Ctrl+D: 複製選取句
    if (isCtrlOrMeta && (e.key === "d" || e.key === "D")) {
      if (!tgtEl.closest("input, textarea")) {
        e.preventDefault();
        duplicateSelectedLine();
        return;
      }
    }

    // Ctrl+A: 全選所有歌詞
    if (isCtrlOrMeta && (e.key === "a" || e.key === "A")) {
      if (!tgtEl.closest("input, textarea")) {
        e.preventDefault();
        selectAll();
        return;
      }
    }

    const isAltArrow = e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown");
    if (tgtEl.closest("input, textarea, select") || e.metaKey || e.ctrlKey || (e.altKey && !isAltArrow)) {
      return;
    }

    if (e.key === "Delete" && e.shiftKey) {
      e.preventDefault();
      deleteSelectedLines();
      return;
    }
    if (e.key === "End" && e.shiftKey) {
      e.preventDefault();
      selectToEnd();
      return;
    }
    if (e.key === "g" || e.key === "G") {
      e.preventDefault();
      jumpToUntimed(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      toggleLoop();
      return;
    }
    if (e.key === "i" || e.key === "I") {
      e.preventDefault();
      setInPoint();
      return;
    }
    if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      setOutPoint();
      return;
    }
    if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      toggleSnap();
      return;
    }
    if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      openEditModal();
      return;
    }
    if (e.key === "n" || e.key === "N" || e.key === "Insert") {
      e.preventDefault();
      openAddModal();
      return;
    }
    if (e.key === "<" || e.key === ">") {
      e.preventDefault();
      changeRate(e.key === ">" ? 1 : -1);
      return;
    }
    if (e.key === "," || e.key === ".") {
      e.preventDefault();
      nudgePlayhead(e.key === "." ? 0.1 : -0.1);
      return;
    }

    if (e.key === "Escape") {
      modalPaste?.classList.remove("active");
      modalEditLine?.classList.remove("active");
      modalAddLine?.classList.remove("active");
      modalSplitLine?.classList.remove("active");
      modalHotkeys?.classList.remove("active");
      return;
    }

    // 應援動作快捷鍵 1~7 與 0 清除
    if (e.key >= "1" && e.key <= "7") {
      const actIdx = parseInt(e.key, 10) - 1;
      const act = ACT_KEYS[actIdx];
      if (act) {
        e.preventDefault();
        toggleActOnSelected(act);
        return;
      }
    }

    if (e.key === "0") {
      e.preventDefault();
      clearActsOnSelected();
      return;
    }

    if (e.key === "?" || (e.shiftKey && e.key === "/")) {
      e.preventDefault();
      modalHotkeys?.classList.toggle("active");
      return;
    }

    if (e.key === "c" || e.key === "C") {
      e.preventDefault();
      openSplitModal(sel);
      return;
    }

    if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleMute();
      return;
    }

    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomBy(1.4);
      return;
    }

    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      zoomBy(1 / 1.4);
      return;
    }

    const l = LINES[sel];
    const step = e.shiftKey ? 0.2 : 0.05;

    if (e.key === " " && e.shiftKey) {
      e.preventDefault();
      getPlayerState() === 1 ? pause() : play();
      return;
    }

    if (e.key === " ") {
      e.preventDefault();
      doPunch();
    } else if (e.key === "Backspace") {
      e.preventDefault();
      selectSingle(Math.max(0, sel - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (e.altKey) {
        moveLine(sel, sel - 1);
      } else {
        selectSingle(Math.max(0, sel - 1));
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (e.altKey) {
        moveLine(sel, sel + 1);
      } else {
        selectSingle(Math.min(LINES.length - 1, sel + 1));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (l && l.time != null) {
        seekTo(Math.max(0, l.time - 2));
        play();
      } else {
        toast("這句還沒有打點時間");
      }
    } else if (e.key === "[" || e.key === "{") {
      e.preventDefault();
      stepSelectedTime(-step);
    } else if (e.key === "]" || e.key === "}") {
      e.preventDefault();
      stepSelectedTime(step);
    } else if (e.key === "Delete") {
      e.preventDefault();
      if (selectedIndices.size) {
        pushHistory();
        let cnt = 0;
        selectedIndices.forEach(k => {
          if (LINES[k] && LINES[k].time != null) {
            LINES[k].time = null;
            cnt++;
          }
        });
        save();
        renderAll();
        toast(`已清除選取的 ${cnt} 句時間打點`);
      }
    } else if (e.key === "k" || e.key === "K") {
      e.preventDefault();
      getPlayerState() === 1 ? pause() : play();
    } else if (e.key === "ArrowLeft" || e.key === "j" || e.key === "J") {
      e.preventDefault();
      seekTo(getCurrentTime() - (e.shiftKey ? 5 : 2));
    } else if (e.key === "ArrowRight" || e.key === "l" || e.key === "L") {
      e.preventDefault();
      seekTo(getCurrentTime() + (e.shiftKey ? 5 : 2));
    } else if (e.key === "Home") {
      e.preventDefault();
      seekTo(0);
    }
  });

  // ── 輸出與備份 ──
  function entry() {
    const lines = LINES.filter(l => l.time != null).sort((a, b) => a.time - b.time).map(l => {
      const clean = { ...l };
      if (!clean.acts || !clean.acts.length) delete clean.acts;
      if (!clean.sing || !clean.sing.length) delete clean.sing;
      if (!clean.call) delete clean.call;
      if (!clean.how) delete clean.how;
      return clean;
    });

    if (currentVersionMode === "live" && currentLiveItem) {
      return {
        id: `${S.id}-live`,
        baseId: S.id,
        type: "live",
        title: `${S.ja} (${currentLiveItem.concert})`,
        concert: currentLiveItem.concert,
        youtubeId: activeYtId(),
        duration: Math.round(songDuration),
        lyrics: lines
      };
    }

    const built = LYRICS.find(x => x.id === S.id);
    return {
      ...(built || { id: S.id, title: S.ja, youtubeId: S.yt, duration: songDuration }),
      lyrics: lines
    };
  }

  function checkBeforeExport() {
    const miss = LINES.filter(l => l.time == null).length;
    if (miss && !confirm(`還有 ${miss} 句沒有時間，輸出時會略過這些句子。要繼續嗎？`)) {
      return false;
    }
    const bad = lyricsCueList ? lyricsCueList.querySelectorAll(".bad").length : 0;
    if (bad && !confirm(`有 ${bad} 句比上一句早（紅色時間），輸出時會照時間重新排序，句子順序會變。要繼續嗎？`)) {
      return false;
    }

    // 檢查 sing 是否包含在 jp 內
    const invalidSing = [];
    LINES.forEach((l, i) => {
      if (l.sing && Array.isArray(l.sing)) {
        const jp = l.jp || "";
        for (const w of l.sing) {
          if (!jp.includes(w)) {
            invalidSing.push(`第 ${i + 1} 句合唱詞「${w}」未出現在日文歌詞「${jp}」`);
          }
        }
      }
    });
    if (invalidSing.length) {
      if (!confirm(`發現 ${invalidSing.length} 處合唱詞與日文不符：\n${invalidSing.slice(0, 3).join("\n")}\n${invalidSing.length > 3 ? "...等\n" : "\n"}這可能會導致 check-data 檢查報錯。要繼續輸出嗎？`)) {
        return false;
      }
    }
    return true;
  }

  if (btnCopy) {
    btnCopy.addEventListener("click", async () => {
      if (!checkBeforeExport()) return;
      const jsonStr = JSON.stringify(entry(), null, 2);
      try {
        await navigator.clipboard.writeText(jsonStr);
        toast(`已複製 ${currentVersionMode === "live" ? "現場版" : "MV版"} JSON 到剪貼簿！`);
      } catch (e) {
        prompt("請手動複製這段 JSON：", jsonStr);
      }
    });
  }

  if (btnDownload) {
    btnDownload.addEventListener("click", () => {
      if (!checkBeforeExport()) return;
      const data = JSON.stringify(entry(), null, 2) + "\n";
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = currentVersionMode === "live" ? `${S.id}-live.json` : `${S.id}.json`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast(`已下載 ${filename}！`);
    });
  }

  // ── 直接存回歌詞檔：用瀏覽器的資料夾存取權（Chrome / Edge）寫進專案的 song-lyrics.js / song-lyrics-live.js ──
  // 第一次存檔選一次 Ado-guide 資料夾，之後記在 IndexedDB；寫入和檢查的規則跟 apply.mjs 共用 lyrics-store.js
  // 用工作站（node tools/studio/server.mjs）開的時候，下面的 studio 會換成本機伺服器，任何瀏覽器都能存
  let canSaveToFile = typeof window.showDirectoryPicker === "function" && !!window.LyricsStore;
  let studio = null;
  const btnSaveFile = $("btnSaveFile");
  let repoDir = null;

  function idbKv(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open("timing-studio", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("kv");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("kv", mode), req = fn(tx.objectStore("kv"));
        tx.oncomplete = () => { open.result.close(); resolve(req.result); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  async function isRepoDir(dir) {
    try { await dir.getFileHandle("song-lyrics.js"); await dir.getFileHandle("songs.js"); return true; } catch (e) { return false; }
  }

  async function getRepoDir(forcePick) {
    if (studio) return (repoDir = studio.dir);
    let dir = forcePick ? null : repoDir || await idbKv("readonly", s => s.get("repo")).catch(() => null);
    if (dir && dir.queryPermission) {
      let perm = await dir.queryPermission({ mode: "readwrite" });
      if (perm !== "granted") perm = await dir.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") dir = null;
    }
    if (!dir) {
      toast("請選 Ado-guide 專案資料夾（有 song-lyrics.js 的那一層）");
      dir = await window.showDirectoryPicker({ id: "ado-guide", mode: "readwrite" });
    }
    if (!await isRepoDir(dir)) throw new Error(`「${dir.name}」裡沒有 song-lyrics.js 和 songs.js，請選 Ado-guide 專案最上層的資料夾。`);
    repoDir = dir;
    idbKv("readwrite", s => s.put(dir, "repo")).catch(() => {});
    return dir;
  }

  async function saveToLyricsFile(forcePick = false) {
    if (!canSaveToFile) {
      alert("這個瀏覽器不能直接寫檔（要用 Chrome 或 Edge，或用「工作站」打開這個頁面）。\n請改按「下載 JSON」，再跑 node tools/timing/apply.mjs <檔案>。");
      return;
    }
    if (!checkBeforeExport()) return;
    const data = entry();
    const { errors, warnings } = LyricsStore.validate(data, S);
    if (errors.length) {
      alert(`還不能存，有 ${errors.length} 個問題要先修正：\n\n• ${errors.slice(0, 10).join("\n• ")}${errors.length > 10 ? "\n…" : ""}`);
      return;
    }

    let dir;
    try {
      dir = await getRepoDir(forcePick);
    } catch (e) {
      if (e.name !== "AbortError") alert(e.message);
      return;
    }

    const file = LyricsStore.TARGETS[LyricsStore.kindOf(data)].file;
    try {
      const fh = await dir.getFileHandle(file);
      const r = LyricsStore.merge(await (await fh.getFile()).text(), data);
      if (r.unchanged) { toast(`${file} 裡的 ${data.id} 已經是這個版本，不用再存`); return; }
      const label = currentVersionMode === "live" ? `現場版（${currentLiveItem?.concert || ""}）` : "MV 版";
      const msg = `${r.replaced ? "更新" : "新增"}〈${S.ja}〉${label}\n→ ${dir.name}/${file}\n${r.replaced ? `${r.oldCount} 句 → ` : ""}${data.lyrics.length} 句` +
        (warnings.length ? `\n\n提醒：\n• ${warnings.join("\n• ")}` : "") + "\n\n確定寫入嗎？";
      if (!confirm(msg)) return;
      const w = await fh.createWritable();
      await w.write(r.text);
      await w.close();

      // 記憶體裡的已發布資料也換成剛存的版本，之後按「還原」會回到這裡
      const list = r.kind === "live" ? LIVE_LYRICS : LYRICS;
      const i = list.findIndex(x => x.id === data.id);
      if (i >= 0) list[i] = data; else list.push(data);
      ORIG = data.lyrics.map(l => ({ ...l }));
      toast(`已寫入 ${file}（${data.lyrics.length} 句），記得 commit`);
    } catch (e) {
      alert(`存檔失敗：${e.message}`);
    }
  }

  if (btnSaveFile) {
    if (!canSaveToFile) btnSaveFile.title = "這個瀏覽器不能直接寫檔，請用 Chrome 或 Edge，或改按「下載 JSON」";
    btnSaveFile.addEventListener("click", e => saveToLyricsFile(e.shiftKey));
  }

  // ── 工作站模式：本機伺服器假裝成「選好的資料夾」，存檔流程（確認、寫入）跟原本一樣 ──
  // 讀檔時記下內容的雜湊，寫入時伺服器會比對：讀了之後檔案被改過（別的分頁、git pull）就擋下來，不會蓋掉
  async function studioApi(url, body) {
    const opts = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const r = await fetch(url, { cache: "no-store", ...opts });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `工作站回應 ${r.status}`);
    return r;
  }

  function studioDir() {
    const hashes = {};
    const fileUrl = name => `/api/file?name=${encodeURIComponent(name)}`;
    return {
      name: "Ado-guide（工作站）",
      async getFileHandle(name) {
        return {
          async getFile() {
            const r = await studioApi(fileUrl(name));
            hashes[name] = r.headers.get("X-Hash");
            const text = await r.text();
            return { text: async () => text };
          },
          async createWritable() {
            let buf = "";
            return {
              write: async s => { buf += s; },
              close: async () => {
                const r = await fetch(fileUrl(name), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: buf, base: hashes[name] }) });
                const j = await r.json().catch(() => ({}));
                if (!r.ok) throw new Error(j.error || `工作站回應 ${r.status}`);
                hashes[name] = j.hash;
              }
            };
          }
        };
      }
    };
  }

  const stepLog = log => (log || []).map(s => `${s.ok ? "✓" : "✗"} ${s.name}${s.ok ? "" : `\n${(s.out || "").split("\n").slice(-12).join("\n")}`}`).join("\n");

  async function studioPublish() {
    const btn = $("btnPublish");
    try {
      const st = await (await studioApi("/api/status")).json();
      if (st.branch !== st.publishBranch) { alert(`目前在「${st.branch}」分支，工作站只從 ${st.publishBranch} 發布。`); return; }
      if (!st.changed.length && !st.ahead) { toast("歌曲資料沒有變更，不用發布"); return; }
      let msg = "";
      if (st.changed.length) {
        const list = st.changed.map(c => `  ${c.status.padEnd(2)} ${c.file}`).join("\n");
        msg = prompt(`要把這些變更推上 ${st.publishBranch}（約 2 分鐘後網站更新）：\n\n${list}${st.ahead ? `\n\n（另外還有 ${st.ahead} 個上次沒推上去的 commit）` : ""}\n\ncommit 訊息：`, `fix(songs): 更新〈${S.ja}〉`);
        if (!msg || !msg.trim()) return;
      } else if (!confirm(`有 ${st.ahead} 個上次沒推上去的 commit，要再推一次嗎？`)) return;
      btn.disabled = true;
      toast("檢查、發布中…");
      const r = await (await studioApi("/api/publish", { message: msg.trim() || "-" })).json();
      if (r.ok) toast(`已發布：${r.head}，約 2 分鐘後網站更新`);
      else alert(`${r.error}\n\n${stepLog(r.log)}`);
    } catch (e) {
      alert(`發布失敗：${e.message}`);
    } finally {
      btn.disabled = false;
    }
  }

  async function studioSync() {
    if (!confirm("從 GitHub 拉最新的資料（例如 Claude 推上來的情報包）？\n同步完會重新整理頁面，打點進度存在這台電腦，不會不見。")) return;
    try {
      const r = await (await studioApi("/api/sync", {})).json();
      if (r.ok) { toast("已同步，重新整理中…"); setTimeout(() => location.reload(), 600); }
      else alert(`${r.error}${r.out ? `\n\n${r.out}` : ""}`);
    } catch (e) {
      alert(`同步失敗：${e.message}`);
    }
  }

  // 匯入新歌：貼網址 → 工作站讀影片資訊和官方字幕，新增一首「整理中」的歌，完成後打開它
  async function studioImport() {
    const url = prompt("貼上 YouTube 網址（Ado 官方 MV）：");
    if (!url || !url.trim()) return;
    const id = prompt("這首歌網址用的英文 id（小寫英文和數字，例如 shinka）。\n歌名是英文的話可以留空，會自動產生：", "");
    if (id === null) return;
    const btn = $("btnImport");
    btn.disabled = true;
    toast("匯入中：讀影片資訊、下載字幕和音訊…（大約半分鐘）");
    try {
      const r = await (await studioApi("/api/fetch", { url: url.trim(), id: id.trim() })).json();
      if (!r.ok) { alert(`匯入失敗：\n${r.error}`); return; }
      alert(`已新增〈${r.ja}〉（${r.id}）\n\n• ${r.changes.join("\n• ")}${r.warnings.length ? `\n\n提醒：\n• ${r.warnings.join("\n• ")}` : ""}\n\n按確定打開這首歌。`);
      location.href = `?song=${encodeURIComponent(r.id)}`;
    } catch (e) {
      alert(`匯入失敗：${e.message}`);
    } finally {
      btn.disabled = false;
    }
  }

  fetch("/api/health", { cache: "no-store" })
    .then(r => (r.ok ? r.json() : null))
    .then(info => {
      if (!info || info.app !== "ado-studio" || !window.LyricsStore) return;
      studio = { info, dir: studioDir() };
      repoDir = studio.dir;
      canSaveToFile = true;
      if (btnSaveFile) btnSaveFile.title = "檢查後直接寫進專案的 song-lyrics.js / song-lyrics-live.js（Ctrl+S，經由工作站）";
      document.body.classList.add("studio-on");
      [["btnImport", studioImport], ["btnSync", studioSync], ["btnPublish", studioPublish]].forEach(([id, fn]) => {
        const b = $(id);
        if (!b) return;
        b.style.display = "";
        b.addEventListener("click", fn);
      });
    })
    .catch(() => {});

  // ── 歌曲資料：網站上顯示、原本由 AI 補的部分（狀態、手燈色、應援動作、應援重點與翻譯、副歌高潮、LIVE 映像） ──
  // 讀寫規則在 song-meta-store.js；存檔一樣寫進選好的 Ado-guide 資料夾
  const modalSongMeta = $("modalSongMeta");
  const PEN_INFO = { 青: ["藍", "#5d9dfe"], 水: ["水藍", "#5fd4ff"], 白: ["白", "#f2efe8"], 赤: ["紅", "#ff4a5a"], 桃: ["粉紅", "#ff7ab8"], 紫: ["紫", "#a374ff"], 橙: ["橘", "#ff9a3c"], 黄: ["黃", "#ffd84a"], 緑: ["綠", "#4ee08a"], 彩: ["彩色", ""] };
  let metaDraft = null;

  const ytIdOf = v => {
    v = (v || "").trim();
    const m = v.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/);
    return m ? m[1] : v;
  };

  function setMetaMsg(text, kind = "") {
    const el = $("metaMsg");
    if (!el) return;
    el.textContent = text;
    el.className = `meta-msg ${kind}`;
  }

  // 面板裡的輸入 → metaDraft
  function readMetaForm() {
    const climax = $("metaClimax").value.trim();
    const yt = ytIdOf($("metaLiveYt").value), concert = $("metaLiveConcert").value.trim();
    metaDraft.climax = climax === "" ? null : Math.round(parseFloat(climax) * 100) / 100;
    metaDraft.liveVideo = yt || concert ? { yt, concert } : null;
    metaDraft.penGuess = $("metaPenGuess").checked;
    metaDraft.tips = [...$("metaTips").querySelectorAll(".meta-tip")].map(row => ({
      zh: row.querySelector(".zh").value.trim(),
      en: row.querySelector(".en").value.trim(),
      ja: row.querySelector(".ja").value.trim()
    }));
    return metaDraft;
  }

  function renderMetaForm() {
    const d = metaDraft;
    $("songMetaTitle").textContent = `🎨 歌曲資料｜${S.ja}（${S.id}）`;
    $("metaStatus").querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.status === d.status));
    $("metaPens").innerHTML = SongMetaStore.PEN_KEYS.map(k => {
      const [name, col] = PEN_INFO[k], at = d.pen.indexOf(k);
      return `<button type="button" data-pen="${k}" style="--c:${col || "#e2e8f0"}" class="${at >= 0 ? "active" : ""}"><i class="${k === "彩" ? "rb" : ""}"></i>${name}${at >= 0 ? `<b>${at + 1}</b>` : ""}</button>`;
    }).join("");
    $("metaPenPreview").textContent = d.pen ? `網站顯示：${[...d.pen].map(k => PEN_INFO[k][0]).join("、")}` : "網站顯示：藍（沒指定）";
    $("metaPenGuess").checked = d.penGuess;
    $("metaActs").querySelectorAll("[data-act]").forEach(b => b.classList.toggle("active", d.acts.includes(b.dataset.act)));
    $("metaTips").innerHTML = d.tips.map(t => `<div class="meta-tip">
        <input class="zh" type="text" placeholder="中文應援重點，例如：副歌一起喊「Hey」" value="${esc(t.zh)}">
        <div class="tr"><input class="en" type="text" placeholder="English（選填）" value="${esc(t.en)}"><input class="ja" type="text" placeholder="日本語（選填）" value="${esc(t.ja)}"></div>
        <div class="ops"><button type="button" data-op="up" title="上移">↑</button><button type="button" data-op="down" title="下移">↓</button><button type="button" data-op="del" title="刪除">✕</button></div>
      </div>`).join("");
    $("metaClimax").value = d.climax == null ? "" : d.climax;
    $("metaLiveYt").value = d.liveVideo ? d.liveVideo.yt : "";
    $("metaLiveConcert").value = d.liveVideo ? d.liveVideo.concert : "";
    $("btnMetaClimaxNow").disabled = currentVersionMode !== "mv";
  }

  async function openSongMeta() {
    if (!window.SongMetaStore || !modalSongMeta) return;
    try {
      // 每次打開都讀最新的檔案（剛存過、或在別處改過都會反映）
      const get = f => fetch(`../../${f}?t=${Date.now()}`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error(`${f} 讀取失敗（${r.status}）`); return r.text(); });
      const [songsSrc, i18nSrc] = await Promise.all([get("songs.js"), get("i18n.js")]);
      metaDraft = SongMetaStore.readMeta(songsSrc, i18nSrc, S.id);
    } catch (e) {
      alert(`讀不到歌曲資料：${e.message}`);
      return;
    }
    if (!metaDraft.tips.length) metaDraft.tips.push({ zh: "", en: "", ja: "" });
    renderMetaForm();
    setMetaMsg("");
    modalSongMeta.classList.add("active");
  }

  async function saveSongMeta(forcePick = false) {
    const d = { ...readMetaForm(), tips: metaDraft.tips.filter(t => t.zh) };
    const { errors, warnings } = SongMetaStore.validate(d);
    if (errors.length) { setMetaMsg(`還不能存：\n• ${errors.join("\n• ")}`, "err"); return; }
    if (!canSaveToFile) { setMetaMsg("這個瀏覽器不能直接寫檔，請用 Chrome 或 Edge。", "err"); return; }

    let dir;
    try { dir = await getRepoDir(forcePick); } catch (e) { if (e.name !== "AbortError") setMetaMsg(e.message, "err"); return; }
    try {
      const songsFh = await dir.getFileHandle("songs.js"), i18nFh = await dir.getFileHandle("i18n.js");
      const r = SongMetaStore.applyMeta(await (await songsFh.getFile()).text(), await (await i18nFh.getFile()).text(), d);
      if (!r.changes.length) { setMetaMsg("跟檔案裡的一樣，沒有要存的變更。"); return; }
      const msg = `〈${S.ja}〉要寫入 ${dir.name}/${r.songsChanged ? "songs.js" : ""}${r.songsChanged && r.i18nChanged ? "、" : ""}${r.i18nChanged ? "i18n.js" : ""}：\n• ${r.changes.join("\n• ")}` +
        (warnings.length ? `\n\n提醒：\n• ${warnings.join("\n• ")}` : "") + "\n\n確定寫入嗎？";
      if (!confirm(msg)) return;
      const write = async (fh, text) => { const w = await fh.createWritable(); await w.write(text); await w.close(); };
      if (r.songsChanged) await write(songsFh, r.songs);
      if (r.i18nChanged) await write(i18nFh, r.i18n);

      // 同步工作台記憶體裡的這首歌；LIVE 映像有變就重新整理現場版選單
      const liveChanged = JSON.stringify(S.liveVideo ? { yt: S.liveVideo.yt, concert: S.liveVideo.concert } : null) !== JSON.stringify(d.liveVideo);
      ["sug", "free", "hold"].forEach(k => delete S[k]);
      if (d.status) S[d.status] = true;
      S.acts = d.acts.slice();
      S.tips = d.tips.map(t => t.zh);
      S.liveVideo = d.liveVideo ? { ...(S.liveVideo || {}), ...d.liveVideo } : null;
      modalSongMeta.classList.remove("active");
      if (liveChanged) pickSong(S.id, currentVersionMode, currentLiveItem?.yt);
      toast(`已寫入歌曲資料（${r.changes.length} 項），記得 commit`);
    } catch (e) {
      setMetaMsg(`存檔失敗：${e.message}`, "err");
    }
  }

  if (modalSongMeta && window.SongMetaStore) {
    $("btnSongMeta")?.addEventListener("click", openSongMeta);
    $("btnCloseSongMeta")?.addEventListener("click", () => modalSongMeta.classList.remove("active"));
    $("btnCancelSongMeta")?.addEventListener("click", () => modalSongMeta.classList.remove("active"));
    $("btnSaveSongMeta")?.addEventListener("click", e => saveSongMeta(e.shiftKey));
    $("metaStatus").addEventListener("click", e => {
      const b = e.target.closest("[data-status]");
      if (!b) return;
      readMetaForm();
      metaDraft.status = b.dataset.status;
      renderMetaForm();
    });
    $("metaPens").addEventListener("click", e => {
      const b = e.target.closest("[data-pen]");
      if (!b) return;
      readMetaForm();
      const k = b.dataset.pen;
      metaDraft.pen = metaDraft.pen.includes(k) ? metaDraft.pen.replace(k, "") : metaDraft.pen + k;
      renderMetaForm();
    });
    $("metaActs").addEventListener("click", e => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      readMetaForm();
      const a = b.dataset.act;
      metaDraft.acts = metaDraft.acts.includes(a) ? metaDraft.acts.filter(x => x !== a) : ACT_KEYS.filter(x => x === a || metaDraft.acts.includes(x));
      renderMetaForm();
    });
    $("btnMetaActsFromLines").addEventListener("click", () => {
      readMetaForm();
      const used = new Set(LINES.flatMap(l => l.acts || []));
      if (!used.size) { setMetaMsg("目前的逐行歌詞還沒有標應援動作。", "warn"); return; }
      metaDraft.acts = ACT_KEYS.filter(a => used.has(a));
      renderMetaForm();
      setMetaMsg(`已依${currentVersionMode === "live" ? "現場版" : "MV 版"}逐行歌詞帶入：${metaDraft.acts.join(", ")}`);
    });
    $("btnMetaAddTip").addEventListener("click", () => {
      readMetaForm();
      metaDraft.tips.push({ zh: "", en: "", ja: "" });
      renderMetaForm();
      const rows = $("metaTips").querySelectorAll(".meta-tip .zh");
      rows[rows.length - 1]?.focus();
    });
    $("metaTips").addEventListener("click", e => {
      const b = e.target.closest("[data-op]");
      if (!b) return;
      readMetaForm();
      const i = [...$("metaTips").children].indexOf(b.closest(".meta-tip")), t = metaDraft.tips;
      if (b.dataset.op === "del") t.splice(i, 1);
      else {
        const j = b.dataset.op === "up" ? i - 1 : i + 1;
        if (j < 0 || j >= t.length) return;
        [t[i], t[j]] = [t[j], t[i]];
      }
      if (!t.length) t.push({ zh: "", en: "", ja: "" });
      renderMetaForm();
    });
    $("btnMetaClimaxNow").addEventListener("click", () => {
      $("metaClimax").value = (Math.round(getCurrentTime() * 100) / 100).toFixed(2);
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", () => {
      const modeLabel = currentVersionMode === "live" ? `現場版 (${currentLiveItem?.concert})` : "MV 原版";
      if (!confirm(`確定丟掉此歌曲【${modeLabel}】在本機暫存的進度？`)) return;
      store.set(lsKey(), null);
      pickSong(S.id, currentVersionMode);
      toast(`已還原${modeLabel}資料`);
    });
  }

  // ── 頂部參數變更 ──
  if (songSelect) songSelect.addEventListener("change", () => pickSong(songSelect.value));
  if (rateSelect) {
    rateSelect.addEventListener("change", () => {
      if (ytPlayer && playerReady && typeof ytPlayer.setPlaybackRate === "function") {
        ytPlayer.setPlaybackRate(+rateSelect.value);
      }
    });
  }

  if (lagInput) {
    lagInput.value = store.get("timing-lag") || lagInput.value;
    lagInput.addEventListener("change", () => store.set("timing-lag", lagInput.value));
  }

  window.addEventListener("resize", () => {
    renderTimeline();
    updatePlayheadUI(getCurrentTime());
  });

  // 重新載入按鈕
  $("btnRetryLoad")?.addEventListener("click", () => location.reload());

  // 暴露公開 API 供調試與自動化測試使用
  window.TimingStudio = {
    pickSong,
    seekTo,
    play,
    pause,
    doPunch,
    undo,
    redo,
    selectAll,
    selectRange,
    autoSortByTime,
    moveLine,
    duplicateSelectedLine,
    cloneLyricsFromMv,
    openSplitModal,
    jumpToUntimed,
    selectToEnd,
    toggleLoop,
    toggleSnap,
    setInPoint,
    setOutPoint,
    setZoom,
    getZoom: () => zoom,
    deleteSelectedLines,
    parsePastedLyrics,
    getCurrentTime,
    getLines: () => LINES,
    getSel: () => sel,
    getSelectedIndices: () => Array.from(selectedIndices),
    getSongs: () => songs,
    getMode: () => currentVersionMode,
    getDuration: () => songDuration,
    isDurationFromVideo: () => durationFromVideo,
    getLiveItem: () => currentLiveItem,
    saveToLyricsFile,
    openSongMeta,
    saveSongMeta,
    studioPublish,
    studioSync,
    isStudio: () => !!studio,
    _setRepoDir: dir => { repoDir = dir; }
  };

  // 啟動加載
  if (songs.length > 0) {
    const urlParams = new URLSearchParams(location.search);
    const initSongId = urlParams.get("song") || store.get("timing-last") || songs[0].id;
    const initMode = urlParams.get("mode") || "mv";
    pickSong(initSongId, initMode);
  }
})();
