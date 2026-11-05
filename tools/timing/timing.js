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
  let LINES = [];
  let ORIG = [];
  let sel = 0;
  let selectedIndices = new Set([0]); // 多重選取的句子集合
  let playingIdx = -1;
  let zoom = 45; // 像素/秒 (px/s)
  let followPlayhead = true;
  let isScrubbing = false;
  let isDraggingClip = false;
  let editingLineIndex = -1;

  function selectSingle(idx) {
    if (!LINES.length) return;
    sel = Math.max(0, Math.min(LINES.length - 1, idx));
    selectedIndices = new Set([sel]);
    renderAll();
  }

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

  function seekTo(sec) {
    sec = Math.max(0, Math.min(songDuration, sec));
    lastSeekTime = sec;
    simTime = sec;
    simLastTime = performance.now();
    if (ytPlayer && playerReady && !playerError && typeof ytPlayer.seekTo === "function") {
      try { ytPlayer.seekTo(sec, true); } catch (e) {}
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

    sel = 0;
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

      // 如果還沒有現場版對時資料，檢查是否有以 -live 結尾的資料
      const liveBuilt = LYRICS.find(x => x.id === `${S.id}-live`);
      ORIG = liveBuilt && liveBuilt.lyrics ? liveBuilt.lyrics.map(l => ({ ...l })) : [];

      LINES = (Array.isArray(saved) && saved.length > 0) ? saved : ORIG.map(l => ({ ...l }));

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
        ? l.acts.map(a => `<span class="act-tag ${a}">${a.toUpperCase()}</span>`).join("")
        : "";

      return `
        <li class="cue-item ${isSel ? "selected" : ""} ${isPlay ? "playing" : ""} ${bad ? "bad" : ""} ${changed ? "changed" : ""}" data-i="${i}" draggable="true">
          <span class="cue-drag-grip" title="按住上下拖曳調整歌詞順序">⋮⋮</span>
          <span class="cue-idx">${i + 1}</span>
          <span class="cue-time ${l.time == null ? "none" : ""}">${fmt(l.time)}</span>
          <div class="cue-texts">
            <span class="cue-jp" lang="ja">${esc(l.jp || "")}${actsHtml}</span>
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
    const badCount = lyricsCueList.querySelectorAll(".bad").length;
    const changedCount = lyricsCueList.querySelectorAll(".changed").length;

    if (statsSummary) {
      statsSummary.innerHTML = `<b>${timedCount} / ${totalCount}</b> 句已對時 ${currentVersionMode === "live" ? `<span style="color: #f43f5e; font-size: 11px;">[LIVE 現場版]</span>` : ""}`;
    }
    let detailText = [];
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
      return;
    }
    manualTimeInput.placeholder = "秒數 / mm:ss";
    const l = LINES[sel];
    if (!l) {
      inspectorTitle.innerHTML = "無選取句";
      inspectorTimeLabel.textContent = "—";
      manualTimeInput.value = "";
      return;
    }
    inspectorTitle.innerHTML = `選取：<b>#${sel + 1}</b> <span style="font-weight: 400; color: #cbd5e1;">${esc(l.jp || "")}</span>`;
    inspectorTimeLabel.textContent = fmt(l.time);
    manualTimeInput.value = l.time != null ? l.time : "";
  }

  // 3. 導讀提示更新
  function updatePrompter() {
    if (!prompterTargetText || !prompterNextText) return;
    const cur = LINES[sel];
    const nxt = LINES[sel + 1];

    if (cur) {
      prompterTargetText.innerHTML = `<b>#${sel + 1}</b> ${esc(cur.jp || "")} ${cur.tr ? `<span style="color: #93c5fd; font-weight: normal;">(${esc(cur.tr)})</span>` : ""}`;
    } else {
      prompterTargetText.textContent = "— (已至最後)";
    }

    if (nxt) {
      prompterNextText.innerHTML = `<b>#${sel + 2}</b> ${esc(nxt.jp || "")} ${nxt.tr ? `<span style="color: #93c5fd; font-weight: normal;">(${esc(nxt.tr)})</span>` : ""}`;
    } else {
      prompterNextText.textContent = "— (結尾)";
    }
  }

  // 4. 時間軸渲染 (Ruler, Clips, Waveform)
  function renderTimeline() {
    if (!timelineViewport || !timelineContentLayer) return;
    const totalWidth = Math.max(timelineViewport.clientWidth, songDuration * zoom + TIMELINE_PAD + 120);
    timelineContentLayer.style.width = `${totalWidth}px`;

    renderRuler(totalWidth);
    renderWaveform(totalWidth);
    renderSubtitleClips();
  }

  // 4.1 時間刻度尺
  function renderRuler(totalWidth) {
    if (!rulerCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const height = 28;
    rulerCanvas.width = totalWidth * dpr;
    rulerCanvas.height = height * dpr;
    rulerCanvas.style.width = `${totalWidth}px`;
    rulerCanvas.style.height = `${height}px`;

    const ctx = rulerCanvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, height);

    let majorStep = 10;
    let minorStep = 2;
    if (zoom >= 100) {
      majorStep = 2;
      minorStep = 0.5;
    } else if (zoom >= 50) {
      majorStep = 5;
      minorStep = 1;
    } else if (zoom >= 25) {
      majorStep = 10;
      minorStep = 2;
    } else if (zoom >= 12) {
      majorStep = 30;
      minorStep = 5;
    } else {
      majorStep = 60;
      minorStep = 15;
    }

    ctx.font = '10px ui-monospace, "Cascadia Code", Consolas, monospace';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    for (let t = 0; t <= songDuration; t += minorStep) {
      const x = TIMELINE_PAD + t * zoom;
      const isMajor = Math.abs(t % majorStep) < 0.001;

      if (isMajor) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - 12);
        ctx.stroke();

        ctx.fillStyle = "#94a3b8";
        ctx.fillText(fmt(t, false), x + 4, 10);
      } else {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - 6);
        ctx.stroke();
      }
    }
  }

  // 4.2 參考波形與打點標記軌
  function renderWaveform(totalWidth) {
    if (!waveCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const height = 54;
    waveCanvas.width = totalWidth * dpr;
    waveCanvas.height = height * dpr;
    waveCanvas.style.width = `${totalWidth}px`;
    waveCanvas.style.height = `${height}px`;

    const ctx = waveCanvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, height);

    const centerY = height / 2;
    ctx.fillStyle = currentVersionMode === "live" ? "rgba(244, 63, 94, 0.2)" : "rgba(14, 165, 233, 0.22)";

    const barWidth = 3;
    const gap = 1.5;
    const totalBars = Math.floor((totalWidth - TIMELINE_PAD) / (barWidth + gap));

    for (let i = 0; i < totalBars; i++) {
      const x = TIMELINE_PAD + i * (barWidth + gap);
      const t = (x - TIMELINE_PAD) / zoom;
      const seed = Math.sin(t * 1.8) * Math.cos(t * 0.45) * Math.sin(t * 5.2);
      const amp = Math.min(1, Math.max(0.12, Math.abs(seed) * 0.8 + 0.15));
      const h = amp * (height - 12);
      ctx.fillRect(x, centerY - h / 2, barWidth, h);
    }

    LINES.forEach((l, idx) => {
      if (l.time == null) return;
      const x = TIMELINE_PAD + l.time * zoom;
      ctx.save();
      ctx.translate(x, 7);

      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(5, 0);
      ctx.lineTo(0, 5);
      ctx.lineTo(-5, 0);
      ctx.closePath();

      if (idx === sel) {
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
  function renderSubtitleClips() {
    if (!trackSubtitles) return;
    trackSubtitles.innerHTML = "";
    let count = 0;

    LINES.forEach((l, i) => {
      if (l.time == null) return;
      count++;

      let nextTime = null;
      for (let j = i + 1; j < LINES.length; j++) {
        if (LINES[j].time != null && LINES[j].time > l.time) {
          nextTime = LINES[j].time;
          break;
        }
      }

      let duration = 3.5;
      if (l.duration != null && l.duration > 0) {
        duration = l.duration;
      } else if (nextTime != null) {
        const gap = nextTime - l.time;
        duration = gap <= 8 ? gap : 4.5;
      }
      const width = Math.max(32, duration * zoom);
      const left = TIMELINE_PAD + l.time * zoom;

      const prev = LINES.slice(0, i).reverse().find(x => x.time != null);
      const bad = prev && l.time < prev.time;
      const isSel = selectedIndices.has(i);
      const isPlay = i === playingIdx;

      const clip = document.createElement("div");
      clip.className = `timeline-clip ${isSel ? "selected" : ""} ${isPlay ? "playing" : ""} ${bad ? "bad" : ""}`;
      clip.style.left = `${left}px`;
      clip.style.width = `${width}px`;
      clip.dataset.i = i;

      clip.innerHTML = `
        <div class="clip-handle-left" data-handle="left" data-i="${i}" title="拖曳微調起點時間"></div>
        <div class="clip-header-bar" style="${currentVersionMode === "live" ? "background: #be123c;" : ""}">
          <span class="clip-id-tag">#${i + 1}${(l.acts && l.acts.length) ? ` <span style="font-size:8.5px; opacity:0.85; font-weight:800; color:#38bdf8;">[${l.acts.join(",")}]</span>` : ""}</span>
          <span class="clip-time-tag">${fmt(l.time)}</span>
          <button class="clip-split-btn" data-action="split" data-i="${i}" title="將此句切半分段 (快捷鍵 C)">✂️</button>
        </div>
        <div class="clip-body">
          <span class="clip-text-jp" lang="ja">${esc(l.jp || "")}</span>
          ${l.tr ? `<span class="clip-text-tr">${esc(l.tr)}</span>` : ""}
        </div>
        <div class="clip-handle-right" data-handle="right" data-i="${i}" title="拉動延長/縮短此句顯示時間"></div>
      `;

      trackSubtitles.appendChild(clip);
    });

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
            liveSubBadge.textContent = cur.acts.join(" • ").toUpperCase();
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
    if (followPlayhead && getPlayerState() === 1 && !isScrubbing && !isDraggingClip && timelineViewport) {
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

  function stepSelectedTime(delta) {
    if (!selectedIndices.size) return;
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
    if (selectedIndices.size > 1) {
      toast(`已將選取的 ${count} 句歌詞整體微調 ${delta > 0 ? "+" : ""}${delta} 秒`);
    }
  }

  // ── 時間軸互動事件 ──
  function handleTimelineScrub(e) {
    if (!timelineContentLayer) return;
    const rect = timelineContentLayer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const t = Math.max(0, Math.min(songDuration, (clickX - TIMELINE_PAD) / zoom));

    const displayX = TIMELINE_PAD + t * zoom;
    if (timelineDragTooltip) {
      timelineDragTooltip.style.display = "block";
      timelineDragTooltip.style.left = `${displayX + 10}px`;
      timelineDragTooltip.textContent = fmt(t);
    }

    seekTo(t);
  }

  if (timelineRulerTrack) {
    timelineRulerTrack.addEventListener("mousedown", e => {
      isScrubbing = true;
      handleTimelineScrub(e);

      const onMove = ev => {
        if (!isScrubbing) return;
        handleTimelineScrub(ev);
      };

      const onUp = () => {
        isScrubbing = false;
        if (timelineDragTooltip) timelineDragTooltip.style.display = "none";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  if (playheadHead) {
    playheadHead.addEventListener("mousedown", e => {
      e.stopPropagation();
      isScrubbing = true;

      const onMove = ev => {
        if (!isScrubbing) return;
        handleTimelineScrub(ev);
      };

      const onUp = () => {
        isScrubbing = false;
        if (timelineDragTooltip) timelineDragTooltip.style.display = "none";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  if (trackSubtitles) {
    trackSubtitles.addEventListener("mousedown", e => {
      const clip = e.target.closest(".timeline-clip");

      // ── A. 點擊在字幕軌空白處：啟動框選矩形多選 (Marquee Box Selection) ──
      if (!clip) {
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          if (selectedIndices.size > 1) {
            selectSingle(sel);
          }
        }

        const marqueeBox = $("timelineMarqueeBox");
        if (!marqueeBox || !timelineContentLayer) return;

        const rect = timelineContentLayer.getBoundingClientRect();
        const startX = e.clientX - rect.left;
        const startY = e.clientY - rect.top;

        let marqueeActive = true;
        marqueeBox.style.display = "block";
        marqueeBox.style.left = `${startX}px`;
        marqueeBox.style.top = `${startY}px`;
        marqueeBox.style.width = "0px";
        marqueeBox.style.height = "0px";

        const baseSelection = (e.shiftKey || e.ctrlKey || e.metaKey) ? new Set(selectedIndices) : new Set();

        const onMarqueeMove = ev => {
          if (!marqueeActive) return;
          const curX = ev.clientX - rect.left;
          const curY = ev.clientY - rect.top;

          const boxLeft = Math.min(startX, curX);
          const boxTop = Math.min(startY, curY);
          const boxWidth = Math.abs(curX - startX);
          const boxHeight = Math.abs(curY - startY);

          marqueeBox.style.left = `${boxLeft}px`;
          marqueeBox.style.top = `${boxTop}px`;
          marqueeBox.style.width = `${boxWidth}px`;
          marqueeBox.style.height = `${boxHeight}px`;

          const boxRight = boxLeft + boxWidth;
          const boxBottom = boxTop + boxHeight;

          // 檢測與所有字幕塊的幾何碰撞
          const newSet = new Set(baseSelection);
          const allClips = trackSubtitles.querySelectorAll(".timeline-clip");

          allClips.forEach(el => {
            const elIdx = +el.dataset.i;
            const cLeft = el.offsetLeft;
            const cTop = el.offsetTop;
            const cRight = cLeft + el.offsetWidth;
            const cBottom = cTop + el.offsetHeight;

            // AABB 碰撞檢測
            const intersects = !(boxRight < cLeft || boxLeft > cRight || boxBottom < cTop || boxTop > cBottom);
            if (intersects) {
              newSet.add(elIdx);
            }
          });

          if (newSet.size > 0) {
            selectedIndices = newSet;
            sel = [...newSet][0];
            allClips.forEach(el => {
              const elIdx = +el.dataset.i;
              el.classList.toggle("selected", selectedIndices.has(elIdx));
            });
            renderInspector();
          }
        };

        const onMarqueeUp = () => {
          marqueeActive = false;
          marqueeBox.style.display = "none";
          window.removeEventListener("mousemove", onMarqueeMove);
          window.removeEventListener("mouseup", onMarqueeUp);
          renderAll();
        };

        window.addEventListener("mousemove", onMarqueeMove);
        window.addEventListener("mouseup", onMarqueeUp);
        return;
      }

      // ── B. 點擊在字幕塊上 ──
      const idx = +clip.dataset.i;

      // 1. 剪刀分割按鈕點擊
      const splitBtn = e.target.closest(".clip-split-btn");
      if (splitBtn || e.target.dataset.action === "split") {
        e.stopPropagation();
        openSplitModal(idx);
        return;
      }

      // 處理多選按鍵點擊
      if (e.shiftKey) {
        e.stopPropagation();
        selectRange(sel, idx);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.stopPropagation();
        toggleSelect(idx);
        return;
      }

      // 如果點選的字幕塊不是在已有多選群組中，設為單選
      if (!selectedIndices.has(idx) || selectedIndices.size <= 1) {
        sel = idx;
        selectedIndices = new Set([idx]);
      } else {
        sel = idx;
      }

      // 記錄拖曳前的歷史快照，若放開時發生變動則可 Ctrl+Z 復原
      const dragSnapshot = recordSnapshot();

      // 2. 右側手柄拖曳：拉動延長或縮短框框時長 (Duration)
      const handleRight = e.target.closest('[data-handle="right"]');
      if (handleRight) {
        e.stopPropagation();

        const clipLeft = TIMELINE_PAD + LINES[idx].time * zoom;
        const currentW = clip.offsetWidth;
        const origDuration = LINES[idx].duration || round(currentW / zoom);

        // 指針保持在原本的定點，作為最關鍵的對齊標竿！
        const fixedPlayheadTime = getCurrentTime();

        // 尋找磁吸對齊參考點
        const snapTargets = [];
        if (fixedPlayheadTime > LINES[idx].time) {
          snapTargets.push({ time: round(fixedPlayheadTime), label: "指針定點" });
        }
        for (let j = idx + 1; j < LINES.length; j++) {
          if (LINES[j].time != null && LINES[j].time > LINES[idx].time) {
            snapTargets.push({ time: LINES[j].time, label: `下一句 #${j + 1}` });
            break;
          }
        }

        isDraggingClip = true;
        clip.classList.add("resizing-active");

        const snapLine = $("timelineSnapLine");
        let lastTargetDuration = origDuration;
        let lastTargetEndTime = round(LINES[idx].time + origDuration);

        const onMove = ev => {
          if (!isDraggingClip) return;
          const rect = timelineContentLayer.getBoundingClientRect();
          const mouseX = ev.clientX - rect.left;

          // 計算目標寬度（框框直接隨滑鼠實時拉長/縮短）
          let targetWidth = mouseX - clipLeft;
          let targetDuration = Math.max(0.3, targetWidth / zoom);
          let targetEndTime = LINES[idx].time + targetDuration;

          // 磁吸檢測 (接近指針或下一句起點時自動吸附)
          let snapped = false;
          let snapLabel = "";
          const snapThresholdSec = 10 / zoom; // 10px 磁吸距離

          for (const target of snapTargets) {
            if (Math.abs(targetEndTime - target.time) <= snapThresholdSec) {
              targetEndTime = target.time;
              targetDuration = Math.max(0.3, targetEndTime - LINES[idx].time);
              targetWidth = targetDuration * zoom;
              snapped = true;
              snapLabel = `🧲 對齊${target.label}`;
              break;
            }
          }

          targetDuration = round(targetDuration);
          targetEndTime = round(targetEndTime);
          lastTargetDuration = targetDuration;
          lastTargetEndTime = targetEndTime;
          LINES[idx].duration = targetDuration;

          // ★★★ 字幕框本身即時被拉長，指針留在原本定點不動！ ★★★
          clip.style.width = `${Math.max(28, targetDuration * zoom)}px`;

          // 更新字幕塊頭部時間提示
          const timeTag = clip.querySelector(".clip-time-tag");
          if (timeTag) timeTag.textContent = `${fmt(LINES[idx].time)} ➔ ${fmt(targetEndTime)}`;

          // 顯示磁吸對齊線
          if (snapLine) {
            if (snapped) {
              snapLine.style.display = "block";
              snapLine.style.transform = `translateX(${TIMELINE_PAD + targetEndTime * zoom}px)`;
            } else {
              snapLine.style.display = "none";
            }
          }

          // 浮動 Tooltip 提示
          if (timelineContentLayer && timelineDragTooltip) {
            timelineDragTooltip.style.display = "block";
            timelineDragTooltip.style.left = `${clipLeft + targetDuration * zoom + 12}px`;
            if (snapped) {
              timelineDragTooltip.innerHTML = `<span style="color: #facc15; font-weight:800;">${snapLabel} (${fmt(targetEndTime)})</span><span style="opacity:0.85; margin-left:8px;">[時長 ${targetDuration.toFixed(2)}s]</span>`;
            } else {
              timelineDragTooltip.innerHTML = `<span>#${idx + 1} 拉長至: <b>${fmt(targetEndTime)}</b></span><span style="opacity:0.85; margin-left:8px;">(時長 ${targetDuration.toFixed(2)}s)</span>`;
            }
          }
        };

        const onUp = () => {
          isDraggingClip = false;
          clip.classList.remove("resizing-active");
          if (timelineDragTooltip) timelineDragTooltip.style.display = "none";
          if (snapLine) snapLine.style.display = "none";
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);

          if (lastTargetDuration !== origDuration) {
            undoStack.push(dragSnapshot);
            if (undoStack.length > MAX_HISTORY) undoStack.shift();
            redoStack = [];
            updateUndoRedoUI();
          }

          LINES[idx].duration = lastTargetDuration;

          // ★★★ 拉動延長時間後，自動切換到下一個歌詞！ ★★★
          const nextIdx = Math.min(LINES.length - 1, idx + 1);
          selectSingle(nextIdx);

          save();
          renderAll();
          toast(`第 ${idx + 1} 句框框已延長至 ${fmt(lastTargetEndTime)}（時長 ${lastTargetDuration.toFixed(2)}s），已自動切換至下一句 👉`);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return;
      }

      // 3. 拖曳字幕塊移動時間 (支援單塊移動 或 多塊批次平移！)
      renderAll();
      isDraggingClip = true;
      const isHandleLeft = e.target.dataset.handle === "left";

      // 標記所有正在被拖曳的 clip
      const activeClips = [];
      const initialTimes = new Map();

      if (selectedIndices.size > 1 && !isHandleLeft) {
        // 多選批次平移！
        selectedIndices.forEach(k => {
          if (LINES[k] && LINES[k].time != null) {
            initialTimes.set(k, LINES[k].time);
            const cEl = trackSubtitles.querySelector(`.timeline-clip[data-i="${k}"]`);
            if (cEl) {
              cEl.classList.add("dragging", "moving");
              activeClips.push({ idx: k, el: cEl, origTime: LINES[k].time });
            }
          }
        });
      } else {
        clip.classList.add("dragging", isHandleLeft ? "resizing-left" : "moving");
        initialTimes.set(idx, LINES[idx].time);
        activeClips.push({ idx, el: clip, origTime: LINES[idx].time });
      }

      const startX = e.clientX;
      let totalDeltaSec = 0;

      const onMove = ev => {
        if (!isDraggingClip) return;
        const deltaSec = (ev.clientX - startX) / zoom;
        totalDeltaSec = deltaSec;

        // 計算邊界，防止移出 < 0
        let minAllowedDelta = -Infinity;
        for (const [k, t] of initialTimes) {
          if (-t > minAllowedDelta) minAllowedDelta = -t;
        }
        const effectiveDelta = Math.max(minAllowedDelta, deltaSec);

        // 批次位移所有選中的字幕塊
        activeClips.forEach(item => {
          const newT = round(Math.max(0, item.origTime + effectiveDelta));
          LINES[item.idx].time = newT;
          item.el.style.left = `${TIMELINE_PAD + newT * zoom}px`;
          const timeTag = item.el.querySelector(".clip-time-tag");
          if (timeTag) timeTag.textContent = fmt(newT);
        });

        // 浮動 Tooltip 提示
        if (timelineContentLayer && timelineDragTooltip) {
          const rect = timelineContentLayer.getBoundingClientRect();
          const curX = ev.clientX - rect.left;
          timelineDragTooltip.style.display = "block";
          timelineDragTooltip.style.left = `${curX + 14}px`;
          if (activeClips.length > 1) {
            timelineDragTooltip.innerHTML = `<span>🚚 批次平移 <b>${activeClips.length}</b> 句</span><span style="opacity:0.85; margin-left:6px;">(${effectiveDelta >= 0 ? "+" : ""}${effectiveDelta.toFixed(2)}s)</span>`;
          } else {
            timelineDragTooltip.innerHTML = `<span>#${idx + 1} 起始位置: <b>${fmt(LINES[idx].time)}</b></span>`;
          }
        }

        if (inspectorTimeLabel) inspectorTimeLabel.textContent = fmt(LINES[sel]?.time);
        if (manualTimeInput) manualTimeInput.value = LINES[sel]?.time || "";
      };

      const onUp = () => {
        isDraggingClip = false;
        activeClips.forEach(item => item.el.classList.remove("dragging", "resizing-left", "moving"));
        if (timelineDragTooltip) timelineDragTooltip.style.display = "none";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);

        // 檢查是否真的有位移
        let moved = false;
        for (const [k, t] of initialTimes) {
          if (LINES[k].time !== t) { moved = true; break; }
        }

        if (moved) {
          undoStack.push(dragSnapshot);
          if (undoStack.length > MAX_HISTORY) undoStack.shift();
          redoStack = [];
          updateUndoRedoUI();
          save();
          renderAll();
          if (activeClips.length > 1) {
            toast(`已將選取的 ${activeClips.length} 句歌詞整體平移 ${totalDeltaSec >= 0 ? "+" : ""}${totalDeltaSec.toFixed(2)} 秒！`);
          }
        } else {
          renderAll();
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    trackSubtitles.addEventListener("dblclick", e => {
      const clip = e.target.closest(".timeline-clip");
      if (!clip) return;
      const idx = +clip.dataset.i;
      sel = idx;
      const l = LINES[idx];
      if (l && l.time != null) {
        seekTo(l.time);
        play();
      }
      renderAll();
    });
  }

  function setZoom(newZoom) {
    zoom = Math.max(10, Math.min(180, newZoom));
    if (zoomSlider) zoomSlider.value = zoom;
    renderTimeline();
    updatePlayheadUI(getCurrentTime());
  }

  if (timelineViewport) {
    timelineViewport.addEventListener("wheel", e => {
      if (e.ctrlKey || e.altKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 5 : -5;
        setZoom(zoom + delta);
      }
    }, { passive: false });
  }

  if (zoomSlider) zoomSlider.addEventListener("input", () => setZoom(+zoomSlider.value));
  if (btnZoomIn) btnZoomIn.addEventListener("click", () => setZoom(zoom + 10));
  if (btnZoomOut) btnZoomOut.addEventListener("click", () => setZoom(zoom - 10));

  if (btnZoomFit) {
    btnZoomFit.addEventListener("click", () => {
      if (!timelineViewport) return;
      const viewWidth = timelineViewport.clientWidth - 40;
      const fitZoom = Math.max(10, Math.min(180, viewWidth / songDuration));
      setZoom(fitZoom);
      timelineViewport.scrollLeft = 0;
    });
  }

  if (btnZoomFocus) {
    btnZoomFocus.addEventListener("click", () => {
      const l = LINES[sel];
      if (!l || l.time == null || !timelineViewport) return;
      setZoom(60);
      const targetX = TIMELINE_PAD + l.time * zoom;
      timelineViewport.scrollLeft = Math.max(0, targetX - timelineViewport.clientWidth / 2);
    });
  }

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
      const l = LINES[sel];
      if (!l) return;
      const parsed = parseTime(manualTimeInput.value);
      if (parsed != null) {
        pushHistory();
        const completedIdx = sel;
        l.time = round(parsed);

        // ★★★ 自動切換到下一個歌詞！ ★★★
        if (sel < LINES.length - 1) {
          sel = sel + 1;
          toast(`第 ${completedIdx + 1} 句時間已更新，已自動切換至第 ${sel + 1} 句 👉`);
        }

        save();
        renderAll();
      } else {
        manualTimeInput.value = l.time != null ? l.time : "";
      }
    });
  }

  // 編輯歌詞文字
  if (btnEditLine && modalEditLine) {
    btnEditLine.addEventListener("click", () => {
      const l = LINES[sel];
      if (!l) return;
      editingLineIndex = sel;
      if (editLineModalTitle) editLineModalTitle.textContent = `編輯第 ${sel + 1} 句歌詞`;
      if (editJpInput) editJpInput.value = l.jp || "";
      if (editTrInput) editTrInput.value = l.tr || "";
      modalEditLine.classList.add("active");
      editJpInput?.focus();
    });
  }

  if (btnSaveEdit && modalEditLine) {
    btnSaveEdit.addEventListener("click", () => {
      if (editingLineIndex < 0 || !LINES[editingLineIndex]) return;
      pushHistory();
      if (editJpInput) LINES[editingLineIndex].jp = editJpInput.value.trim();
      if (editTrInput) LINES[editingLineIndex].tr = editTrInput.value.trim();
      modalEditLine.classList.remove("active");
      save();
      renderAll();
      toast("已儲存歌詞修改");
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
      sel = insertAt;
      save();
      renderAll();
      modalAddLine.classList.remove("active");
      toast(`已插入新句子！`);
    });
  }

  if (btnCancelAdd && modalAddLine) btnCancelAdd.addEventListener("click", () => modalAddLine.classList.remove("active"));
  if (btnCloseAddModal && modalAddLine) btnCloseAddModal.addEventListener("click", () => modalAddLine.classList.remove("active"));

  // 刪除目前句子
  if (btnDeleteLine) {
    btnDeleteLine.addEventListener("click", () => {
      if (!LINES[sel]) return;
      const targetText = LINES[sel].jp || `#${sel + 1}`;
      if (!confirm(`確定要刪除第 ${sel + 1} 句【${targetText}】？`)) return;
      pushHistory();
      LINES.splice(sel, 1);
      sel = Math.max(0, Math.min(sel, LINES.length - 1));
      save();
      renderAll();
      toast("已刪除該句");
    });
  }

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

    LINES.splice(splittingIndex + 1, 0, part2Line);
    sel = splittingIndex + 1; // 自動聚焦到切出來的新句

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

  if (btnConfirmPaste && modalPaste) {
    btnConfirmPaste.addEventListener("click", () => {
      if (!pasteInputText) return;
      const text = pasteInputText.value;
      const parsed = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => {
        const [jp, tr = ""] = s.split("\t");
        return { time: null, jp: jp.trim(), tr: tr.trim() };
      });
      if (!parsed.length) return toast("沒有貼上任何歌詞內容");

      LINES = parsed;
      sel = 0;
      save();
      renderAll();
      modalPaste.classList.remove("active");
      toast(`已匯入 ${LINES.length} 句新歌詞！`);
    });
  }

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
    sel = sel + 1;
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

  // ── 鍵盤快捷鍵監聽 ──
  window.addEventListener("keydown", e => {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    // Ctrl+Z: 復原 / 上一步
    if (isCtrlOrMeta && (e.key === "z" || e.key === "Z") && !e.shiftKey) {
      if (!e.target.closest("input, textarea")) {
        e.preventDefault();
        undo();
        return;
      }
    }

    // Ctrl+Y 或 Ctrl+Shift+Z: 重做 / 下一步
    if ((isCtrlOrMeta && (e.key === "y" || e.key === "Y")) ||
        (isCtrlOrMeta && e.shiftKey && (e.key === "z" || e.key === "Z"))) {
      if (!e.target.closest("input, textarea")) {
        e.preventDefault();
        redo();
        return;
      }
    }

    // Ctrl+D: 複製選取句
    if (isCtrlOrMeta && (e.key === "d" || e.key === "D")) {
      if (!e.target.closest("input, textarea")) {
        e.preventDefault();
        duplicateSelectedLine();
        return;
      }
    }

    // Ctrl+A: 全選所有歌詞
    if (isCtrlOrMeta && (e.key === "a" || e.key === "A")) {
      if (!e.target.closest("input, textarea")) {
        e.preventDefault();
        selectAll();
        return;
      }
    }

    if (e.target.closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) {
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
      setZoom(zoom + 10);
      return;
    }

    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setZoom(zoom - 10);
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
    const lines = LINES.filter(l => l.time != null).sort((a, b) => a.time - b.time);

    if (currentVersionMode === "live" && currentLiveItem) {
      return {
        id: `${S.id}-live`,
        baseId: S.id,
        type: "live",
        title: `${S.ja} (${currentLiveItem.concert})`,
        concert: currentLiveItem.concert,
        youtubeId: activeYtId(),
        duration: songDuration,
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
    getCurrentTime,
    getLines: () => LINES,
    getSel: () => sel,
    getSelectedIndices: () => Array.from(selectedIndices),
    getSongs: () => songs,
    getMode: () => currentVersionMode,
    getLiveItem: () => currentLiveItem
  };

  // 啟動加載
  if (songs.length > 0) {
    const urlParams = new URLSearchParams(location.search);
    const initSongId = urlParams.get("song") || store.get("timing-last") || songs[0].id;
    const initMode = urlParams.get("mode") || "mv";
    pickSong(initSongId, initMode);
  }
})();
