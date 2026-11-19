(() => {
  "use strict";
  const SHARED = window.ADO_SHARED || {};
  const SETLIST = window.ADO_SETLIST || {};
  const PENLIGHT = window.ADO_PENLIGHT || {};
  const QUIZ = window.ADO_QUIZ || {};

  // ── 語言：<html data-lang> 由建置寫入（zh／en／ja）；文字以中文原文當 key 查 i18n.js 的字典，查不到就顯示中文
  // ROOT：英文、日文版在 /en/、/jp/ 底下，歌詞檔、更新日誌這些共用檔案要往上一層找
  const LANG = document.documentElement.dataset.lang || "zh";
  const ROOT = document.documentElement.dataset.root || "";
  const DICT = (window.ADO_I18N || {})[LANG] || {};
  const T = (src, ...args) => (DICT[src] ?? src).replace(/\{(\d+)\}/g, (_, i) => args[i]);
  // 英文版歌詞下面那行放羅馬拼音，日文版不放，中文版放中譯
  const subLine = item => (LANG === "en" ? item.ro || "" : LANG === "ja" ? "" : item.tr || "");
  // 反拍：喊聲標籤裡有「反拍」（或翻譯後的同一個詞）就用反拍的提示樣式
  const isOffbeat = txt => (SHARED.isOffbeat ? SHARED.isOffbeat(txt, T) : (!!txt && (txt.includes("反拍") || txt.includes(T("反拍")))));
  const isNote = SHARED.isNote || (txt => /^（[^）]+）$/.test(String(txt || "").trim()));

  // ── 動作 ──
  const ACT_MAP = SHARED.ACT_MAP || {
    sing:    { name: "大合唱",   icon: "i-sing",    how: "跟著一起唱" },
    clap:    { name: "拍手",     icon: "i-clap",    how: "跟著節拍拍手" },
    wave:    { name: "舉手揮動", icon: "i-wave",    how: "舉手左右揮" },
    jump:    { name: "跳躍",     icon: "i-jump",    how: "跟著節奏跳" },
    call:    { name: "喊聲",     icon: "i-call",    how: "跟著喊短句" },
    gesture: { name: "手勢",     icon: "i-gesture", how: "跟 Ado 做同樣的動作" },
    listen:  { name: "安靜聽",   icon: "i-listen",  how: "留給 Ado 唱" }
  };
  const ACT = Object.fromEntries(Object.entries(ACT_MAP).map(([k, v]) => [k, { name: T(v.name), icon: v.icon, how: T(v.how) }]));

  const { SONGS, UT, PEN, BEAT, CLIMAX, SERIES = [], PRACTICE = {} } = window.ADO_SONGS;
  // hold：應援和螢光棒顏色還沒有可靠來源（例如剛出的新歌），資料先留著、畫面不顯示，確認後拿掉 hold；sug 的建議也一樣先不顯示；沒有 tips 又不是 free 的歌也先視為 hold
  SONGS.forEach(s => { if (s.sug || (!s.free && (!s.tips || !s.tips.length))) s.hold = true; if (s.hold) { s.acts = []; s.tips = []; } });
  SONGS.forEach(s => { s.ut = UT[s.id] ? `https://www.uta-net.com/song/${UT[s.id]}/` : `https://www.uta-net.com/artist/29298/`; s.acts = s.acts || []; s.tips = (s.tips || []).map(t => T(t)); s.dur = s.len ? s.len.split(":").reduce((a, b) => a * 60 + +b, 0) : 0; });
  // 推出順序：MV 在 YouTube 公開的日期（日本時間）；編號照這個順序
  SONGS.sort((a, b) => a.date.localeCompare(b.date)).forEach((s, i) => s.no = i + 1);
  const VALID_SONG_IDS = new Set(SONGS.map(s => s.id));
  // 歌詞：正式網站由 scripts/build.mjs 拆成每首一個檔（lyrics/<id>.json），<html data-lyrics> 是版本；
  // 先讀小小的 lyrics/index.json（每首的應援數量）與 hashes.json（每首內容雜湊），打開哪首才載那首。直接開原始檔時沒有拆，改讀整份 song-lyrics.js
  // 應援數量：歌詞裡有動作的行數（「安靜聽」不算）；index.json 裡沒有的歌就是沒有逐行歌詞
  const LYV = document.documentElement.dataset.lyrics, LY = {}, lyWait = {}, LY_LIVE = {}, lyLiveWait = {}, lyLiveLoaded = new Set();
  let lyReady = false, hashesFound = false;
  let lyHashes = { mv: {}, live: {}, karaoke: {} };
  const loadScript = src => new Promise(res => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = el.onerror = res;
    document.head.appendChild(el);
  });
  const getJSON = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const hashesLoaded = LYV
    ? getJSON(`${ROOT}lyrics/hashes.json?v=${LYV}`).then(h => {
        if (h && typeof h === "object" && !Array.isArray(h)) {
          hashesFound = true;
          lyHashes = {
            mv: (h.mv && typeof h.mv === "object") ? h.mv : {},
            live: (h.live && typeof h.live === "object") ? h.live : {},
            karaoke: (h.karaoke && typeof h.karaoke === "object") ? h.karaoke : {}
          };
        }
        return lyHashes;
      })
    : Promise.resolve(lyHashes);
  const lyLoaded = (LYV
    ? Promise.all([getJSON(`${ROOT}lyrics/index.json?v=${LYV}`), hashesLoaded]).then(([idx]) => idx)
    : Promise.all([
        loadScript(ROOT + "song-lyrics.js"),
        loadScript(ROOT + "song-lyrics-live.js")
      ]).then(() => {
        const idx = {};
        (window.SONG_LYRICS || []).forEach(b => { LY[b.id] = b; if (b.lyrics && b.lyrics.length) idx[b.id] = b.lyrics.filter(l => (l.acts || []).some(a => a !== "listen")).length; });
        (window.SONG_LYRICS_LIVE || []).forEach(b => {
          const baseId = b.baseId || b.id.replace(/-live$/, "");
          LY_LIVE[baseId] = b;
          lyLiveLoaded.add(baseId);
        });
        return idx;
      })
  ).then(idx => {
    lyReady = true;
    SONGS.forEach(s => { s.lines = !!idx && s.id in idx; s.cheer = s.lines && !s.hold ? idx[s.id] : 0; });
  });
  // 這首的歌詞載好了沒（拆檔時打開才載）；網址一開始就指向的歌，和 index.json 一起先載
  const lyHave = (s, source = (typeof currentVideoSource === "function" ? currentVideoSource(s) : "mv")) => {
    if (!lyReady) return false;
    if (!LYV) return true;
    if (!s.lines) return true;
    if (source === "live" && s.liveVideo) return lyLiveLoaded.has(s.id);
    return !!LY[s.id];
  };
  const fetchLy = id => {
    if (LY[id]) return Promise.resolve(true);
    if (!lyWait[id]) {
      lyWait[id] = hashesLoaded.then(() => {
        const v = (lyHashes.mv && lyHashes.mv[id]) || LYV;
        return getJSON(`${ROOT}lyrics/${id}.json?v=${v}`);
      }).then(b => {
        if (b) { LY[id] = b; return true; }
        delete lyWait[id];
        return false;
      }, () => {
        delete lyWait[id];
        return false;
      });
    }
    return lyWait[id];
  };
  const fetchLyLive = id => {
    if (lyLiveLoaded.has(id)) return Promise.resolve(true);
    if (!lyLiveWait[id]) {
      lyLiveWait[id] = hashesLoaded.then(() => {
        const v = (lyHashes.live && lyHashes.live[id]) || LYV;
        return fetch(`${ROOT}lyrics-live/${id}.json?v=${v}`);
      }).then(async r => {
        if (r.ok) {
          const b = await r.json();
          if (b) LY_LIVE[id] = b;
          lyLiveLoaded.add(id);
          return true;
        }
        if (r.status === 404) {
          lyLiveLoaded.add(id);
          return true;
        }
        delete lyLiveWait[id];
        return false;
      }).catch(() => {
        delete lyLiveWait[id];
        return false;
      });
    }
    return lyLiveWait[id];
  };
  function loadLyrics(s, source = (typeof currentVideoSource === "function" ? currentVideoSource(s) : "mv")) {
    if (!LYV || lyHave(s, source)) return Promise.resolve(true);
    if (source === "live" && s.liveVideo) {
      return fetchLyLive(s.id).then(ok => (ok && !LY_LIVE[s.id] && !LY[s.id] ? fetchLy(s.id) : ok));
    }
    return fetchLy(s.id);
  }
  const firstSong = (location.hash.slice(1) || document.documentElement.dataset.song || "").split(/[?@]/)[0];
  const firstSongObj = SONGS.find(s => s.id === firstSong);
  if (LYV && firstSongObj) {
    fetchLy(firstSong);
    if (firstSongObj.liveVideo) fetchLyLive(firstSong);
  }
  const BY = Object.fromEntries(SONGS.map(s => [s.id, s]));
  const PENC_RAW = SHARED.PENC || { 青: ["藍", "#5d9dfe"], 水: ["水藍", "#5fd4ff"], 白: ["白", "#f2efe8"], 赤: ["紅", "#ff4a5a"], 桃: ["粉紅", "#ff7ab8"], 紫: ["紫", "#a374ff"], 橙: ["橘", "#ff9a3c"], 黄: ["黃", "#ffd84a"], 緑: ["綠", "#4ee08a"] };
  const PENC = Object.fromEntries(Object.entries(PENC_RAW).map(([k, [n, col]]) => [k, [T(n), col]]));
  const RAINBOW = SHARED.RAINBOW || [..."赤橙黄緑水青紫"];
  const PEN_ORDER = SHARED.PEN_ORDER || ["青", "水", "白", "赤", "桃", "紫", "橙", "黄", "緑", "彩"];
  const penName = k => (SHARED.penName ? SHARED.penName(k, T) : (k === "彩" ? T("彩色") : PENC[k][0]));
  function penOf(s) {
    if (SHARED.penOf) return SHARED.penOf(s, PEN, T);
    const pen = !s.hold && PEN[s.id] && PEN[s.id][0] !== "?" && PEN[s.id], keys = [...(pen || "青")];
    return { keys, none: !pen, cols: keys.flatMap(k => (k === "彩" ? RAINBOW : [k]).map(c => PENC[c][1])) };
  }

  const fmt = SHARED.fmt || (s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
  const esc = SHARED.esc || (s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const icon = a => `<svg class="a-${a}" role="img" aria-label="${esc(ACT[a].name)}"><use href="#${ACT[a].icon}"/></svg>`;
  // 一行的主色：第一個不是「安靜聽」的動作
  const mainAct = SHARED.mainAct || (acts => acts.find(a => a !== "listen") || (acts.length ? "listen" : ""));
  // 歌詞行的底色：有要唱的字時整行不染色，只染那幾個字；其他行用第一個不是「唱」的動作
  const lineAct = SHARED.lineAct || (l => l.sing.length ? "sing" : mainAct(l.acts.filter(a => a !== "sing")) || mainAct(l.acts));
  // 提醒文字：有標籤用標籤，有要唱的字就寫出來
  const cueLabel = l => l.call || (l.sing.length ? T("唱「{0}」", l.sing.join(T("」「"))) : l.acts.map(a => ACT[a].name).join(T("、")));
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 重播一次 CSS 進場動畫：拿掉 class、強迫重排、再加回去；播完就收掉，下次重畫不會又播
  const replay = (el, cls, ms = 500) => { if (!el || reduce) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el._replay); el._replay = setTimeout(() => el.classList.remove(cls), ms); };
  // 換頁、換主題時新舊畫面交叉淡化；不支援或減少動態就直接換
  const transition = (fn, cls) => {
    if (reduce || !document.startViewTransition) return fn();
    if (cls) document.documentElement.classList.add(cls);
    const vt = document.startViewTransition(fn);
    vt.finished.catch(() => {}).finally(() => cls && document.documentElement.classList.remove(cls));
  };
  const toast = (() => { const el = document.getElementById("toast"); let t = 0; return msg => { el.textContent = msg; /* 「加到主畫面」提示也在畫面上時，疊在它上面 */ const pwa = document.getElementById("pwaToast"); el.style.bottom = pwa && !pwa.hidden && pwa.classList.contains("show") ? `${Math.round(innerHeight - pwa.getBoundingClientRect().top + 10)}px` : ""; el.classList.add("show"); clearTimeout(t); t = setTimeout(() => el.classList.remove("show"), Math.min(7000, 2600 + String(msg).length * (LANG === "zh" || LANG === "ja" ? 80 : 30))); }; })();

  // ── 首頁 ──
  const homeEl = document.getElementById("home");
  const homeV = homeEl, songV = document.getElementById("song");
  const list = document.getElementById("songList"), q = document.getElementById("q"), barQ = document.getElementById("barQ"), countEl = document.getElementById("songCount");
  const moreBtn = document.getElementById("moreBtn"), emptyEl = document.getElementById("songEmpty"), listMore = document.getElementById("listMore");
  const sortBtn = document.getElementById("sortBtn"), sortLabel = document.getElementById("sortLabel");
  const listProgress = document.getElementById("listProgress");
  // 清單先只露 12 首，看到底按「再看 12 首」才接著列下一批；76 首的連結都在 HTML 裡，搜尋引擎照樣看得到
  const LIMIT = 12, STEP = 12;
  // 列到第幾首記在這個分頁裡：重新整理、或從別頁按上一頁回來，清單長度不變，瀏覽器才捲得回原位
  const shownKey = "list-shown", session = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };
  let filter = "all", sort = store.get("list-sort") === "cheer" ? "cheer" : "date", shown = Math.max(LIMIT, +session.get(shownKey) || 0);
  // 目前排序下的歌曲順序；切換上一首、下一首也照這個
  const ordered = () => sort === "cheer" ? [...SONGS].sort((a, b) => b.cheer - a.cheer || a.no - b.no) : SONGS;
  const thumb = (s, w, h, lazy) => s.yt
    ? `<img class="thumb" src="https://i.ytimg.com/vi/${s.yt}/mqdefault.jpg" alt="" width="${w}" height="${h}" decoding="async"${lazy ? ' loading="lazy"' : ""}>`
    : `<span class="thumb thumb-ph" aria-hidden="true"><span>${esc(s.upcoming ? T("預留曲目") : T("尚無 MV"))}</span></span>`;
  // 歌名下面那行：中文名（和日文一樣時用英文名）、是不是翻唱
  // 歌名下面那行：中文版放官方中文名，英文版放英文名，日文版不放；翻唱曲加註
  const otherName = s => (LANG === "ja" ? "" : LANG === "en" ? (s.en && s.en !== s.ja ? s.en : "") : (s.zh !== s.ja ? s.zh : (s.en && s.en !== s.ja ? s.en : "")));
  const subOf = s => [otherName(s), s.cover ? T("翻唱") : "", s.upcoming ? T("即將發行") : ""].filter(Boolean).join("・");
  const actIcons = s => s.acts.filter(a => a !== "listen").map(icon).join("");

  const hasLiveVideo = s => Boolean(s.liveVideo || (s.live && s.yt));
  const hasLiveAudio = s => Boolean((s.lives && s.lives.length > 0) && !s.liveVideo && !s.live);
  const hasLive = s => Boolean((s.lives && s.lives.length > 0) || s.liveVideo || s.live);

  const FREQ_TIERS = [1, 2, 3];
  const FREQ_BY_TIER = Object.fromEntries(FREQ_TIERS.map(t => [t, (PRACTICE[t] || []).filter(id => BY[id])]));
  const FREQ_ALL = FREQ_TIERS.flatMap(t => FREQ_BY_TIER[t]);
  const FREQ_ORDER = new Map(FREQ_ALL.map((id, i) => [id, i]));
  const FREQ_TIER = new Map(FREQ_TIERS.flatMap(t => FREQ_BY_TIER[t].map(id => [id, t])));
  const TIER_LABEL = SHARED.TIER_LABEL || { 1: "必練", 2: "跟唱・聆聽", 3: "看巡演" };

  // ── 待練清單 & 熟練度（js/setlist.js） ──
  const parseListHash = (h, valid = VALID_SONG_IDS) => {
    if (SETLIST.parseListHash) return SETLIST.parseListHash(h, valid);
    const m = String(h || "").match(/^#?list=([^@?#]+)/);
    if (!m) return null;
    const out = [], seen = new Set();
    m[1].split(",").forEach(raw => {
      const id = raw.trim();
      if (!id || seen.has(id) || (valid && !valid.has(id))) return;
      seen.add(id); out.push(id);
    });
    return out;
  };
  const formatListHash = ids => (SETLIST.formatListHash ? SETLIST.formatListHash(ids) : "#list=" + ids.join(","));
  const loadSetlist = (st = store, valid = VALID_SONG_IDS) => {
    if (SETLIST.loadSetlist) return SETLIST.loadSetlist(st, valid);
    try {
      const arr = JSON.parse(st.get("practice-setlist") || "[]");
      if (!Array.isArray(arr)) return [];
      const out = [], seen = new Set();
      arr.forEach(id => { if (typeof id === "string" && !seen.has(id) && (!valid || valid.has(id))) { seen.add(id); out.push(id); } });
      return out;
    } catch (e) { return []; }
  };
  const saveSetlist = (st, ids) => {
    if (SETLIST.saveSetlist) return SETLIST.saveSetlist(st, ids);
    st.set("practice-setlist", JSON.stringify(ids));
  };
  const toggleSetlistId = (ids, id) => {
    if (SETLIST.toggleSetlistId) return SETLIST.toggleSetlistId(ids, id);
    const has = ids.includes(id);
    return { ids: has ? ids.filter(x => x !== id) : [...ids, id], added: !has };
  };
  const gradeOf = score => (SETLIST.gradeOf ? SETLIST.gradeOf(score) : (score >= 95 ? "S" : score >= 85 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D"));
  const loadQuizBest = (st = store) => {
    if (SETLIST.loadQuizBest) return SETLIST.loadQuizBest(st);
    try {
      const parsed = JSON.parse(st.get("quiz-best") || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const out = {};
      Object.entries(parsed).forEach(([id, v]) => {
        if (v && typeof v === "object" && !Array.isArray(v) && typeof v.score === "number" && Number.isFinite(v.score)) out[id] = v;
      });
      return out;
    } catch (e) { return {}; }
  };
  const computeMastery = (best, freqIds) => {
    if (SETLIST.computeMastery) return SETLIST.computeMastery(best, freqIds);
    let completed = 0, mastered = 0;
    freqIds.forEach(id => {
      const entry = best && best[id];
      if (entry && typeof entry.score === "number" && Number.isFinite(entry.score)) {
        completed++;
        if (entry.score >= 85) mastered++;
      }
    });
    return { completed, mastered, total: freqIds.length };
  };

  let S = null;
  let mySetlist = loadSetlist(store, VALID_SONG_IDS);
  let sharedList = null;
  let activePlayList = null;
  const cntSetlistEl = document.getElementById("cntSetlist");
  const masteryBarEl = document.getElementById("masteryBar");
  const masteryLabelEl = document.getElementById("masteryLabel");
  const masteryFillEl = document.getElementById("masteryFill");
  const setlistBarEl = document.getElementById("setlistBar");
  const setlistInfoEl = document.getElementById("setlistInfo");
  const setlistPlayBtn = document.getElementById("setlistPlayBtn");
  const setlistShareBtn = document.getElementById("setlistShareBtn");
  const setlistClearBtn = document.getElementById("setlistClearBtn");
  const setlistSaveBtn = document.getElementById("setlistSaveBtn");
  const setlistExitBtn = document.getElementById("setlistExitBtn");
  const toolSetlistBtn = document.getElementById("toolSetlistBtn");

  const activeSetlistIds = () => (sharedList || mySetlist).filter(id => BY[id]);

  function updateMasteryBar() {
    if (!masteryBarEl) return;
    const best = loadQuizBest(store);
    const { completed, mastered, total } = computeMastery(best, FREQ_ALL);
    masteryBarEl.hidden = completed === 0;
    if (masteryLabelEl) masteryLabelEl.textContent = T("常唱曲熟練度 {0}／{1} 首", mastered, total);
    if (masteryFillEl) masteryFillEl.style.width = `${total > 0 ? Math.round((mastered / total) * 100) : 0}%`;
  }

  function syncToolSetlistBtn() {
    if (!toolSetlistBtn) return;
    const inList = !!(S && mySetlist.includes(S.id));
    toolSetlistBtn.setAttribute("aria-pressed", String(inList));
    const label = T(inList ? "移出待練清單" : "加入待練清單");
    const span = toolSetlistBtn.querySelector("span");
    if (span) span.textContent = label;
  }

  function syncSetlistUi() {
    if (cntSetlistEl) cntSetlistEl.textContent = String(mySetlist.length);
    syncToolSetlistBtn();
    if (!setlistBarEl) return;
    const showBar = filter === "setlist" || !!sharedList;
    setlistBarEl.hidden = !showBar;
    const ids = activeSetlistIds();
    if (setlistInfoEl) {
      if (sharedList) {
        setlistInfoEl.hidden = false;
        setlistInfoEl.textContent = T("分享的待練清單（共 {0} 首）", sharedList.length);
      } else {
        setlistInfoEl.hidden = true;
        setlistInfoEl.textContent = "";
      }
    }
    if (setlistPlayBtn) setlistPlayBtn.disabled = ids.length === 0;
    if (setlistShareBtn) setlistShareBtn.disabled = ids.length === 0;
    if (setlistClearBtn) setlistClearBtn.disabled = mySetlist.length === 0;
    if (setlistSaveBtn) setlistSaveBtn.hidden = !sharedList;
    if (setlistExitBtn) setlistExitBtn.hidden = !sharedList;
  }

  function syncFilterChips() {
    document.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.f === filter)));
  }

  function toggleSetlistSong(id) {
    if (!BY[id]) return;
    const res = toggleSetlistId(mySetlist, id);
    mySetlist = res.ids;
    saveSetlist(store, mySetlist);
    syncSetlistUi();
    const label = T(res.added ? "移出待練清單" : "加入待練清單");
    list.querySelectorAll(`.setlist-btn[data-setlist-id="${id}"]`).forEach(btn => {
      btn.setAttribute("aria-pressed", String(res.added));
      btn.setAttribute("aria-label", label);
      btn.title = label;
    });
    if (filter === "setlist" && !sharedList) renderList();
    toast(T(res.added ? "已加入待練清單" : "已移出待練清單"));
  }

  // 螢光棒顏色的小圓點
  const penDots = s => (SHARED.penDots ? SHARED.penDots(s, PEN, T) : (() => {
    const p = penOf(s);
    const short = p.shortText || p.keys.map(penName).join(T("、"));
    return `<span class="dots" aria-label="${esc(T("螢光棒：") + short)}">${p.keys.map(k => k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`).join("")}</span>`;
  })());

  const tierTagOf = s => {
    if (filter !== "frequent" || freqSub !== "all") return "";
    const t = FREQ_TIER.get(s.id);
    return t ? `<span class="tier-tag is-t${t}">${T(TIER_LABEL[t])}</span>` : "";
  };

  const liveTagOf = s => {
    if (filter === "live") {
      if (hasLiveVideo(s)) return `<span class="live-tag is-video">${T("Live 影片")}</span>`;
      if (hasLiveAudio(s)) return `<span class="live-tag is-audio">${T("Live 音源")}</span>`;
    } else if (hasLiveVideo(s)) {
      return `<span class="live-tag is-video">${T("Live 影片")}</span>`;
    }
    return "";
  };

  const rowHtml = (s, quizBest = loadQuizBest(store), mySet = new Set(mySetlist)) => {
    const bestEntry = quizBest && quizBest[s.id];
    const grade = bestEntry && typeof bestEntry.score === "number" ? gradeOf(bestEntry.score) : "";
    const gradeTitle = grade ? T("測驗最高分：{0} 分（{1}）", bestEntry.score, grade) : "";
    const gradeBadge = grade ? `<span class="quiz-grade grade-${grade.toLowerCase()}" title="${esc(gradeTitle)}" aria-label="${esc(gradeTitle)}">${grade}</span>` : "";
    const inList = mySet.has(s.id);
    const setlistLbl = T(inList ? "移出待練清單" : "加入待練清單");
    const setlistBtn = `<button type="button" class="setlist-btn" data-setlist-id="${s.id}" aria-pressed="${inList}" aria-label="${esc(setlistLbl)}" title="${esc(setlistLbl)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17l-6-4-6 4V4z"/></svg></button>`;
    return `<li><a class="song" href="song/${s.id}/" data-id="${s.id}">${thumb(s, 80, 45, true)}<span class="song-main"><span class="name"><span class="ja" lang="ja">${esc(s.ja)}</span><span class="sub"><span class="zh">${esc(subOf(s))}</span>${tierTagOf(s)}${liveTagOf(s)}${penDots(s)}</span></span><span class="acts">${actIcons(s)}${s.free ? `<span class="free">${T("自由搖")}</span>` : ""}${sort === "cheer" && s.cheer ? `<span class="cnt">${T("{0} 句", s.cheer)}</span>` : ""}${gradeBadge}</span></span></a>${setlistBtn}</li>`;
  };
  let searchTimer = 0;
  function syncListPaging() {
    const items = list.children, total = items.length;
    for (let i = 0; i < total; i++) items[i].hidden = i >= shown;
    const plain = !q.value.trim() && filter === "all";
    const shownCount = Math.min(shown, total);
    const rest = Math.max(0, total - shownCount);
    if (plain) session.set(shownKey, shown);
    listMore.hidden = total <= LIMIT;
    listProgress.textContent = rest ? T("已列出 {0}／{1} 首", shownCount, total) : T("{0} 首都列出來了", total);
    // 列完了換成「收合」，帶回清單開頭
    moreBtn.textContent = rest ? T("再看 {0} 首", Math.min(STEP, rest)) : T("收合清單");
  }
  // free：粉絲說沒有固定應援；hold（含 sug）：還查不到可靠的應援資料
  function renderList() {
    clearTimeout(searchTimer);
    searchTimer = 0;
    const term = q.value.trim().toLowerCase();
    const cleanTerm = term.replace(/[\s\-_'’"!?！？()（）/]/g, "");
    const matchesTerm = s => {
      if (!term) return true;
      const pool = [s.ja, s.zh, s.en || "", s.ro || "", s.id, ...(s.alias || [])];
      const matchPlain = pool.some(x => x.toLowerCase().includes(term));
      const matchClean = cleanTerm ? pool.some(x => x.toLowerCase().replace(/[\s\-_'’"!?！？()（）/]/g, "").includes(cleanTerm)) : false;
      return matchPlain || matchClean;
    };
    let rows;
    if (filter === "setlist") {
      const sourceIds = sharedList || mySetlist;
      rows = sourceIds.map(id => BY[id]).filter(Boolean).filter(matchesTerm);
      if (sort === "cheer") rows.sort((a, b) => b.cheer - a.cheer || a.no - b.no);
    } else {
      rows = ordered().filter(s => {
        if (!matchesTerm(s)) return false;
        if (filter === "frequent") {
          const tier = FREQ_TIER.get(s.id);
          return !!tier && (freqSub === "all" || String(tier) === freqSub);
        }
        if (filter === "cheer") return s.tips.length > 0 && !s.free && !s.hold;
        if (filter === "live") {
          if (liveSub === "video") return hasLiveVideo(s);
          if (liveSub === "audio") return hasLiveAudio(s);
          return hasLive(s);
        }
        if (filter === "cover") return !!s.cover;
        return true;
      });
      if (filter === "frequent" && sort !== "cheer") rows.sort((a, b) => FREQ_ORDER.get(a.id) - FREQ_ORDER.get(b.id));
    }
    const quizBest = loadQuizBest(store), mySet = new Set(mySetlist);
    list.innerHTML = rows.map(s => rowHtml(s, quizBest, mySet)).join("");
    const plain = !term && filter === "all", total = rows.length;
    list.classList.remove("collapsed");
    syncListPaging();
    countEl.textContent = plain ? T("{0} 首", SONGS.length) : T("{0} 首符合", total);
    emptyEl.hidden = total > 0;
    if (!total) {
      emptyEl.textContent = term
        ? T("找不到「{0}」，試試日文、中文或英文歌名。", q.value.trim())
        : filter === "setlist"
          ? T("待練清單是空的，點歌曲右側的書籤圖示即可加入。")
          : T("這個分類目前沒有歌。");
    }
  }
  // 首頁上所有歌曲連結（清單、書架、主視覺）：普通左鍵點擊用 SPA 即時切換；帶修飾鍵就讓瀏覽器開新分頁
  homeEl.addEventListener("click", ev => {
    const sb = ev.target.closest(".setlist-btn");
    if (sb) {
      ev.preventDefault();
      ev.stopPropagation();
      const id = sb.dataset.setlistId;
      if (id && BY[id]) toggleSetlistSong(id);
      return;
    }
    const a = ev.target.closest("a[data-id]");
    if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    if (BY[a.dataset.id]) {
      ev.preventDefault();
      location.hash = a.dataset.id;
    }
  });
  if (toolSetlistBtn) {
    toolSetlistBtn.addEventListener("click", () => {
      if (S) toggleSetlistSong(S.id);
    });
  }
  if (setlistPlayBtn) {
    setlistPlayBtn.addEventListener("click", () => {
      const ids = activeSetlistIds();
      if (!ids.length) return;
      activePlayList = [...ids];
      if (BY[ids[0]]) tapPlay(BY[ids[0]]);
      if (PAGE_SONG) goSong(ids[0]);
      else location.hash = ids[0];
    });
  }
  if (setlistShareBtn) {
    setlistShareBtn.addEventListener("click", async () => {
      const ids = activeSetlistIds();
      if (!ids.length) return;
      const base = LYV ? new URL("./", document.baseURI).href : `${location.origin}${location.pathname}`;
      const url = base + formatListHash(ids);
      try { await navigator.clipboard.writeText(url); toast(T("已複製待練清單分享連結")); }
      catch (e) { prompt(T("複製這個連結："), url); }
    });
  }
  if (setlistClearBtn) {
    setlistClearBtn.addEventListener("click", () => {
      mySetlist = [];
      saveSetlist(store, mySetlist);
      syncSetlistUi();
      renderList();
      toast(T("已清空待練清單"));
    });
  }
  if (setlistSaveBtn) {
    setlistSaveBtn.addEventListener("click", () => {
      if (!sharedList) return;
      const merged = [...mySetlist];
      sharedList.forEach(id => { if (BY[id] && !merged.includes(id)) merged.push(id); });
      mySetlist = merged;
      saveSetlist(store, mySetlist);
      sharedList = null;
      filter = "setlist";
      if (parseListHash(location.hash, VALID_SONG_IDS) !== null) history.replaceState(null, "", "#songs");
      syncFilterChips();
      syncSetlistUi();
      renderList();
      toast(T("已儲存為我的待練清單"));
    });
  }
  if (setlistExitBtn) {
    setlistExitBtn.addEventListener("click", () => {
      sharedList = null;
      if (!mySetlist.length) filter = "all";
      if (parseListHash(location.hash, VALID_SONG_IDS) !== null) history.replaceState(null, "", "#songs");
      syncFilterChips();
      syncSubFilters();
      syncSetlistUi();
      renderList();
    });
  }
  // 兩個搜尋框（主視覺、頂欄）內容同步；在頂欄打字時，清單不在眼前就捲過去
  const songsSec = document.getElementById("songs");
  function onSearch(src, ev) {
    const other = src === q ? barQ : q;
    if (other.value !== src.value) other.value = src.value;
    shown = LIMIT;
    clearTimeout(searchTimer);
    if (!navigator.webdriver && ev && ev.isTrusted && ev.inputType === "insertText" && (!ev.data || ev.data.length === 1) && src.value) {
      searchTimer = setTimeout(() => { searchTimer = 0; renderList(); }, 80);
    } else {
      renderList();
    }
  }
  q.addEventListener("input", ev => onSearch(q, ev));
  barQ.addEventListener("input", ev => {
    onSearch(barQ, ev);
    const r = songsSec.getBoundingClientRect();
    if (r.top > innerHeight * .6 || r.bottom < 120) songsSec.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  });
  let liveSub = "all"; // "all" | "video" | "audio"
  let freqSub = "all"; // "all" | "1" | "2" | "3"
  const SUB_FILTERS = [
    {
      key: "frequent",
      el: document.getElementById("freqSubFilter"),
      attr: "freqSub",
      sel: "[data-freq-sub]",
      get: () => freqSub,
      set: v => { freqSub = v; },
      counts: {
        cntFreqAll: () => FREQ_ALL.length,
        cntFreq1: () => FREQ_BY_TIER[1].length,
        cntFreq2: () => FREQ_BY_TIER[2].length,
        cntFreq3: () => FREQ_BY_TIER[3].length
      }
    },
    {
      key: "live",
      el: document.getElementById("liveSubFilter"),
      attr: "sub",
      sel: "[data-sub]",
      get: () => liveSub,
      set: v => { liveSub = v; },
      counts: {
        cntLiveAll: () => SONGS.filter(hasLive).length,
        cntLiveVideo: () => SONGS.filter(hasLiveVideo).length,
        cntLiveAudio: () => SONGS.filter(hasLiveAudio).length
      }
    }
  ];
  function syncSubFilters() {
    SUB_FILTERS.forEach(sf => {
      if (!sf.el) return;
      sf.el.hidden = filter !== sf.key;
      Object.entries(sf.counts).forEach(([id, fn]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = fn();
      });
      const cur = sf.get();
      sf.el.querySelectorAll(sf.sel).forEach(b => {
        const active = b.dataset[sf.attr] === cur;
        b.classList.toggle("active", active);
        b.setAttribute("aria-pressed", String(active));
      });
    });
  }
  syncSubFilters();
  syncSetlistUi();

  document.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => {
    filter = b.dataset.f; shown = LIMIT;
    if (filter === "live") liveSub = "all";
    if (filter === "frequent") freqSub = "all";
    syncSubFilters();
    syncFilterChips();
    syncSetlistUi();
    renderList(); replay(list, "swap");
  }));

  SUB_FILTERS.forEach(sf => {
    if (!sf.el) return;
    sf.el.addEventListener("click", ev => {
      const btn = ev.target.closest(sf.sel);
      if (!btn) return;
      sf.set(btn.dataset[sf.attr]);
      syncSubFilters();
      shown = LIMIT;
      renderList(); replay(list, "swap");
    });
  });
  const SORT_NAME = { date: T("推出順序"), cheer: T("動作多的在前") };
  function syncSort() {
    sortLabel.textContent = SORT_NAME[sort];
    sortBtn.setAttribute("aria-label", T("排序：{0}（點一下切換）", SORT_NAME[sort]));
  }
  sortBtn.addEventListener("click", () => {
    sort = sort === "cheer" ? "date" : "cheer"; store.set("list-sort", sort === "cheer" ? "cheer" : null);
    syncSort(); renderList(); replay(list, "swap");
  });
  moreBtn.addEventListener("click", e => {
    const before = shown, total = list.children.length;
    if (before >= total) {
      shown = LIMIT; syncListPaging();
      // 收合時清單變短，把畫面帶回清單開頭，不然會停在頁尾
      if (songsSec.getBoundingClientRect().top < 0) songsSec.scrollIntoView({ block: "start" });
      return;
    }
    shown = Math.min(total, before + STEP);
    syncListPaging();
    // 新露出的這一批依序進場；用鍵盤按的，焦點移到這批第一首
    const fresh = [...list.children].slice(before, shown);
    if (!reduce) fresh.forEach((li, i) => { li.style.setProperty("--k", i); li.classList.add("fresh"); });
    if (e.detail === 0 && fresh[0]) fresh[0].querySelector("a").focus();
  });
  let homeReady = false, resumeReel = () => {}, measureHomeReel = () => {};
  function ensureHomeReady() {
    if (homeReady) return;
    homeReady = true;
    syncSort();
    syncFilterChips();
    syncSubFilters();
    updateMasteryBar();
    syncSetlistUi();
    renderList();
    setupShelf(STARTERS, "shelf");
    setupShelf(LATEST, "latestShelf");
    const idxNav = document.getElementById("songIndex");
    const reelNowEl = document.getElementById("reelNow");
    const years = SONGS.map(s => Number((s.date || "").slice(0, 4))).filter(y => y >= 2000 && y <= 2100);
    const minYear = years.length ? Math.min(...years) : 2020;
    const maxYear = years.length ? Math.max(...years) : 2026;
    const defaultReelNow = T("{0} – {1} · 全 {2} 首", minYear, maxYear, SONGS.length);
    if (reelNowEl && !reelNowEl.textContent) reelNowEl.textContent = defaultReelNow;
    if (idxNav) {
      if (!idxNav.children.length) {
        const sortedForReel = [...SONGS].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.no - a.no);
        const reelRows = [0, 1, 2].map(i => {
          const start = Math.round((i * sortedForReel.length) / 3);
          const end = Math.round(((i + 1) * sortedForReel.length) / 3);
          return sortedForReel.slice(start, end);
        });
        const reelCardHtml = s => {
          const sub = subOf(s);
          const year = (s.date || "").slice(0, 4);
          return `<a class="reel-card" href="song/${s.id}/" data-id="${s.id}" draggable="false">${thumb(s, 116, 65, true)}<span class="reel-info"><span class="reel-ja" lang="ja">${esc(s.ja)}</span><span class="reel-meta">${penDots(s)}<span class="reel-year">${esc(year)}</span>${sub ? `<span class="reel-sub">${esc(sub)}</span>` : ""}</span></span></a>`;
        };
        idxNav.innerHTML = reelRows.map((row, idx) =>
          `<div class="reel-row" data-dir="${idx % 2 === 1 ? "1" : "-1"}"><div class="reel-track">${row.map(reelCardHtml).join("")}</div></div>`
        ).join("");
      }
      idxNav.classList.add("js-reel");
      idxNav.addEventListener("dragstart", e => e.preventDefault());
      let reelVis = false, rafId = 0, lastT = 0;
      const wrapAndApply = st => {
        if (!st.half) st.half = st.track.scrollWidth / 2;
        if (!st.half) return;
        while (st.x <= -st.half) st.x += st.half;
        while (st.x > 0) st.x -= st.half;
        st.track.style.transform = `translate3d(${st.x.toFixed(2)}px,0,0)`;
      };
      const states = [...idxNav.querySelectorAll(".reel-row")].map((row, i) => {
        const track = row.querySelector(".reel-track");
        const orig = [...track.children];
        orig.forEach(node => {
          node.setAttribute("draggable", "false");
          const clone = node.cloneNode(true);
          clone.setAttribute("aria-hidden", "true");
          clone.setAttribute("draggable", "false");
          clone.tabIndex = -1;
          clone.removeAttribute("id");
          track.appendChild(clone);
        });
        const dir = Number(row.dataset.dir) || (i % 2 === 1 ? 1 : -1);
        const baseSpeed = (i === 0 ? 28 : i === 1 ? 24 : 32) * dir;
        const st = { row, track, dir, baseSpeed, curSpeed: reduce ? 0 : baseSpeed, vel: 0, x: dir > 0 ? -600 : 0, half: 0, hover: false, drag: false, startX: 0, lastMoveT: 0, moved: 0 };
        row.addEventListener("pointerenter", () => { st.hover = true; });
        row.addEventListener("pointerleave", () => { st.hover = false; });
        row.addEventListener("focusin", () => { st.hover = true; });
        row.addEventListener("focusout", () => { st.hover = false; });
        row.addEventListener("pointerdown", e => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          st.drag = true;
          st.startX = e.clientX;
          st.lastMoveT = performance.now();
          st.vel = 0;
          st.moved = 0;
          row.classList.add("is-dragging");
        });
        window.addEventListener("pointermove", e => {
          if (!st.drag) return;
          const now = performance.now();
          const dtMove = Math.max(0.008, (now - st.lastMoveT) / 1000);
          const dx = e.clientX - st.startX;
          st.startX = e.clientX;
          st.lastMoveT = now;
          st.moved += Math.abs(dx);
          st.vel = Math.max(-1400, Math.min(1400, dx / dtMove));
          st.x += dx;
          wrapAndApply(st);
        }, { passive: true });
        const endDrag = () => {
          if (!st.drag) return;
          st.drag = false;
          st.curSpeed = st.vel;
          row.classList.remove("is-dragging");
          if (!rafId && reelVis && !homeV.hidden) { lastT = 0; rafId = requestAnimationFrame(stepReel); }
        };
        window.addEventListener("pointerup", endDrag, { passive: true });
        window.addEventListener("pointercancel", endDrag, { passive: true });
        row.addEventListener("wheel", e => {
          if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
          e.preventDefault();
          st.x -= e.deltaX;
          wrapAndApply(st);
        }, { passive: false });
        row.addEventListener("click", e => {
          if (st.moved > 5) {
            e.preventDefault();
            e.stopPropagation();
            st.moved = 0;
          }
        }, true);
        return st;
      });
      const showCardMeta = card => {
        if (!card || !reelNowEl) return;
        const s = BY[card.dataset.id];
        if (!s) return;
        const year = (s.date || "").slice(0, 4);
        const penTxt = penOf(s).keys.map(penName).join(T("、"));
        reelNowEl.textContent = `${year} · 〈${s.ja}〉 · ${T("螢光棒：")}${penTxt}`;
      };
      idxNav.addEventListener("pointerover", e => {
        const card = e.target.closest(".reel-card");
        if (card) showCardMeta(card);
      });
      idxNav.addEventListener("focusin", e => {
        const card = e.target.closest(".reel-card");
        if (card) showCardMeta(card);
      });
      idxNav.addEventListener("focusout", e => {
        if (reelNowEl && (!e.relatedTarget || !idxNav.contains(e.relatedTarget))) {
          reelNowEl.textContent = defaultReelNow;
        }
      });
      idxNav.addEventListener("pointerleave", () => {
        if (reelNowEl) reelNowEl.textContent = defaultReelNow;
      });
      const measureReel = () => {
        if (homeV.hidden || !idxNav.offsetParent) return;
        states.forEach(st => { st.half = st.track.scrollWidth / 2; wrapAndApply(st); });
      };
      measureHomeReel = measureReel;
      measureReel();
      window.addEventListener("resize", measureReel, { passive: true });
      function stepReel(now) {
        if (!reelVis || homeV.hidden || (reduce && states.every(st => !st.drag && Math.abs(st.curSpeed) < 0.5))) {
          rafId = 0;
          return;
        }
        const dt = lastT ? Math.min(0.06, (now - lastT) / 1000) : 0.016;
        lastT = now;
        states.forEach(st => {
          if (st.drag) return;
          const target = (!reelVis || reduce || st.hover) ? 0 : st.baseSpeed;
          st.curSpeed += (target - st.curSpeed) * Math.min(1, dt * 6);
          st.x += st.curSpeed * dt;
          wrapAndApply(st);
        });
        rafId = requestAnimationFrame(stepReel);
      }
      const startReel = () => {
        if (reelVis && !homeV.hidden && !rafId && (!reduce || states.some(st => st.drag || Math.abs(st.curSpeed) >= 0.5))) {
          lastT = 0;
          measureReel();
          rafId = requestAnimationFrame(stepReel);
        }
      };
      resumeReel = startReel;
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(entries => {
          reelVis = entries.some(en => en.isIntersecting);
          startReel();
        }, { rootMargin: "160px" });
        io.observe(idxNav);
      } else {
        reelVis = true;
        startReel();
      }
    }
  }

  // 「隨機練一首」：按下去那一刻才抽（首頁的點擊處理接著用 data-id 換頁）；只抽有應援資料的歌，不抽剛剛練過的那首
  const randomLink = document.getElementById("randomLink");
  const pickRandom = () => {
    const last = recentIds()[0], pool = SONGS.filter(s => !s.hold && s.tips.length && s.id !== last), s = pool[Math.floor(Math.random() * pool.length)];
    if (!s) return;
    randomLink.dataset.id = s.id;
    randomLink.href = `song/${s.id}/`;
  };
  let randomPickedByKey = false;
  randomLink.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      randomPickedByKey = true;
      pickRandom();
    }
  });
  randomLink.addEventListener("click", () => {
    if (randomPickedByKey) { randomPickedByKey = false; return; }
    pickRandom();
  });

  // 書架：推薦先練的 9 首＋最近發佈的 6 首；下方進度條跟著捲動走，箭頭到底就停用
  const STARTERS = FREQ_BY_TIER[1].map(id => BY[id]).filter(Boolean);
  const LATEST = SONGS.filter(s => !s.upcoming).sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.no - b.no).slice(0, 6);
  function setupShelf(songs, prefix) {
    const shelf = document.getElementById(prefix);
    const shelfNav = document.getElementById(`${prefix}Nav`);
    const shelfThumb = document.getElementById(`${prefix}Thumb`);
    const shelfPrev = document.getElementById(`${prefix}Prev`);
    const shelfNext = document.getElementById(`${prefix}Next`);
    if (!shelf) return;
    shelf.innerHTML = songs.map(s => `<li><a class="card" href="song/${s.id}/" data-id="${s.id}">${thumb(s, 320, 180, false)}<span class="card-text"><span class="card-ja" lang="ja">${esc(s.ja)}</span><span class="card-sub"><span>${esc(subOf(s))}</span><span class="acts">${actIcons(s)}</span></span></span></a></li>`).join("");
    let shelfTick = 0;
    function measureShelf() {
      shelfTick = 0;
      // 在歌曲頁時首頁是隱藏的，量到的寬度是 0：別把切換鈕藏起來，不然回首頁那一格清單會往下掉、捲動位置對不上
      if (!shelf.clientWidth) return;
      const max = shelf.scrollWidth - shelf.clientWidth;
      const frac = shelf.scrollWidth ? Math.min(1, shelf.clientWidth / shelf.scrollWidth) : 1;
      const pos = max > 0 ? shelf.scrollLeft / max : 0;
      shelfNav.hidden = max <= 1;
      shelfThumb.style.width = `${frac * 100}%`;
      shelfThumb.style.left = `${pos * (1 - frac) * 100}%`;
      // 按到底那顆會停用；鍵盤焦點如果在它上面，移到另一顆，不要掉到頁面最上面
      const had = document.activeElement;
      shelfPrev.disabled = pos <= .01;
      shelfNext.disabled = pos >= .99;
      if (had === shelfPrev && shelfPrev.disabled) shelfNext.focus();
      else if (had === shelfNext && shelfNext.disabled) shelfPrev.focus();
    }
    shelf.addEventListener("scroll", () => { if (!shelfTick) shelfTick = requestAnimationFrame(measureShelf); }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(() => measureShelf()).observe(shelf);
    [[shelfPrev, -1], [shelfNext, 1]].forEach(([b, dir]) => b.addEventListener("click", () => shelf.scrollBy({ left: dir * shelf.clientWidth * .8, behavior: reduce ? "auto" : "smooth" })));
    measureShelf();
  }
  if (!document.documentElement.dataset.song) ensureHomeReady();
  lyLoaded.then(() => { if (homeReady) renderList(); });

  // 最近看過：記最多 3 首在這台裝置；主視覺顯示「繼續練〈最近那首〉」
  const resumeLink = document.getElementById("resumeLink"), resumeName = document.getElementById("resumeName");
  const recentIds = () => { try { return JSON.parse(store.get("recent") || "[]").filter(id => BY[id]); } catch (e) { return []; } };
  function renderRecent() {
    const id = recentIds()[0];
    resumeLink.hidden = !id;
    if (!id) return;
    resumeLink.href = `song/${id}/`;
    resumeLink.dataset.id = id;
    resumeName.textContent = BY[id].ja;
  }
  const remember = id => store.set("recent", JSON.stringify([id, ...recentIds().filter(x => x !== id)].slice(0, 3)));
  // 圖示說明：只列清單裡用得到的動作；主視覺說明裡的歌曲數也照實際資料
  const usedActs = new Set(SONGS.flatMap(s => s.acts.filter(a => a !== "listen")));
  document.getElementById("homeLegend").innerHTML = Object.keys(ACT).filter(a => usedActs.has(a))
    .map(a => `<span class="a-${a}">${icon(a)}${ACT[a].name}</span>`).join("");
  document.getElementById("factSongs").textContent = SONGS.length;

  // ── 頂欄：一往下捲就變半透明；首頁大搜尋框捲到頂欄後面，小搜尋框才出現 ──
  const bar = document.getElementById("bar"), heroSearch = document.getElementById("heroSearch");
  let barTick = 0;
  function syncBar() {
    barTick = 0;
    bar.classList.toggle("is-stuck", scrollY > 4);
    bar.classList.toggle("has-search", !homeEl.hidden && heroSearch.getBoundingClientRect().bottom < bar.offsetHeight);
  }
  addEventListener("scroll", () => { if (!barTick) barTick = requestAnimationFrame(syncBar); }, { passive: true });
  syncBar();

  // ── 頂欄選單（手燈 App、外觀）：點外面、按 Esc 或打開另一個就關；方向鍵在項目間移動 ──
  const barMenus = [["lampBtn", "lampPop"], ["langBtn", "langPop"], ["themeBtn", "themePop"]].map(([b, p]) => ({ btn: document.getElementById(b), pop: document.getElementById(p) }));
  const menuItems = m => [...m.pop.querySelectorAll('[role^="menuitem"]')];
  function closeMenus(except) {
    barMenus.forEach(m => {
      if (m === except || m.pop.hidden) return;
      m.pop.hidden = true;
      m.btn.setAttribute("aria-expanded", "false");
    });
  }
  barMenus.forEach(m => {
    m.btn.addEventListener("click", ev => {
      const open = m.pop.hidden;
      closeMenus(m);
      m.pop.hidden = !open;
      m.btn.setAttribute("aria-expanded", String(open));
      // 用鍵盤打開（click 的 detail 是 0）時，焦點直接移到目前選中的項目，沒有就第一個
      if (open && ev.detail === 0) (m.pop.querySelector('[aria-checked="true"]') || menuItems(m)[0]).focus();
    });
    m.pop.addEventListener("keydown", ev => {
      const items = menuItems(m), i = items.indexOf(document.activeElement);
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        items[(i + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
      } else if (ev.key === "Home" || ev.key === "End") {
        ev.preventDefault();
        items[ev.key === "Home" ? 0 : items.length - 1].focus();
      } else if (ev.key === "Tab") closeMenus();
    });
    m.pop.addEventListener("click", ev => {
      if (!ev.target.closest('[role^="menuitem"]')) return;
      closeMenus();
      if (ev.detail === 0) m.btn.focus();
    });
  });
  document.addEventListener("click", ev => { if (!ev.target.closest(".menu")) closeMenus(); });
  document.addEventListener("keydown", ev => {
    const m = ev.key === "Escape" && barMenus.find(x => !x.pop.hidden);
    if (!m) return;
    ev.stopPropagation();
    closeMenus();
    m.btn.focus();
  });

  // ── 外觀：淺色／深色／跟隨系統，記在這台裝置（head 裡的小段程式已經先套過一次） ──
  const themeBtn = document.getElementById("themeBtn"), themeIco = document.getElementById("themeIco");
  const THEME_ICON = {
    light: "M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
    dark: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
    system: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 3v18"
  };
  const THEME_NAME = { light: T("淺色"), dark: T("深色"), system: T("跟隨系統") };
  const sysLight = matchMedia("(prefers-color-scheme: light)");
  const themePref = () => { const p = store.get("theme"); return p === "light" || p === "dark" ? p : "system"; };
  // 手機瀏覽器頂端的顏色跟著頁面底色；沉浸模式一律深色
  function syncThemeColor() {
    const light = document.documentElement.dataset.theme === "light" && !document.body.classList.contains("immersive-mode");
    document.querySelector('meta[name="theme-color"]').content = light ? "#ffffff" : "#070a12";
  }
  let pipWin = null, pipEls = null, canvasPip = null, isPipActive = false;
  let lastPipLine = -2, lastPipPlayState = null, lastPipSongNo = -1, lastPipLines = null, lastPipPct = -1;
  let venue = null, venueP = null, venueRO = null, venueResizeHandler = null;
  let quizStartSeq = 0;
  function applyTheme() {
    const p = themePref();
    document.documentElement.dataset.theme = p === "light" || (p === "system" && sysLight.matches) ? "light" : "dark";
    themeIco.setAttribute("d", THEME_ICON[p]);
    themeBtn.setAttribute("aria-label", T("外觀：{0}", THEME_NAME[p]));
    document.querySelectorAll("[data-theme-pick]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.themePick === p)));
    syncThemeColor();
    if (typeof syncPipState === "function") syncPipState();
  }
  document.querySelectorAll("[data-theme-pick]").forEach(b => b.addEventListener("click", () => {
    store.set("theme", b.dataset.themePick === "system" ? null : b.dataset.themePick);
    transition(applyTheme, "vt-theme");
  }));
  if (sysLight.addEventListener) sysLight.addEventListener("change", applyTheme);
  applyTheme();

  // ── 手燈 App 下載（PenlightSync）：抓最新版本，把下載連結、版本和檔案大小填進選單 ──
  const lampDlWinLink = document.getElementById("lampDlWinLink"), lampDlMacLink = document.getElementById("lampDlMacLink");
  const lampDlWinDesc = document.getElementById("lampDlWinDesc"), lampDlMacDesc = document.getElementById("lampDlMacDesc");
  [[lampDlWinLink, "Windows"], [lampDlMacLink, "macOS"]].forEach(([a, os]) => a.addEventListener("click", () => toast(T("✨ 已開始下載 PenlightSync {0} 版！", os))));
  const LAMP_RELEASE_KEY = "penlight-sync-release-v1";
  const LAMP_DL_PREFIX = "https://github.com/Gcree/penlight-sync/releases/download/";
  let lampReleaseLoaded = false;
  function applyLampRelease(data) {
    if (!data || !Array.isArray(data.assets)) return;
    const tag = typeof data.tag_name === "string" ? data.tag_name : "";
    const fill = (re, link, desc) => {
      if (!link || !desc) return;
      const asset = data.assets.find(a => a && typeof a.name === "string" && re.test(a.name) && typeof a.browser_download_url === "string" && a.browser_download_url.startsWith(LAMP_DL_PREFIX));
      if (!asset) return;
      link.href = asset.browser_download_url;
      desc.textContent = `${tag ? `${tag}・` : ""}${(asset.size / 1048576).toFixed(1)} MB`;
    };
    fill(/win/i, lampDlWinLink, lampDlWinDesc);
    fill(/mac/i, lampDlMacLink, lampDlMacDesc);
  }
  function loadLampRelease() {
    if (lampReleaseLoaded) return;
    lampReleaseLoaded = true;
    try {
      const cached = JSON.parse(session.get(LAMP_RELEASE_KEY) || "null");
      if (cached && typeof cached === "object" && typeof cached.ts === "number" && Date.now() - cached.ts < 3600000 && cached.data) {
        applyLampRelease(cached.data);
        return;
      }
    } catch (e) {}
    fetch("https://api.github.com/repos/Gcree/penlight-sync/releases/latest")
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !Array.isArray(data.assets)) return;
        applyLampRelease(data);
        session.set(LAMP_RELEASE_KEY, JSON.stringify({
          ts: Date.now(),
          data: {
            tag_name: data.tag_name,
            assets: data.assets.map(a => ({ name: a.name, size: a.size, browser_download_url: a.browser_download_url }))
          }
        }));
      })
      .catch(() => { lampReleaseLoaded = false; });
  }
  const lampBtnEl = document.getElementById("lampBtn");
  if (lampBtnEl) lampBtnEl.addEventListener("click", loadLampRelease);

  // ── 加入主畫面 Toast（PWA Install Toast） ──
  const pwaToast = document.getElementById("pwaToast");
  const pwaToastText = document.getElementById("pwaToastText");
  const pwaActionBtn = document.getElementById("pwaActionBtn");
  const pwaXBtn = document.getElementById("pwaXBtn");
  const pwaInstallBtn = document.getElementById("pwaInstallBtn");
  const toolInstallBtn = document.getElementById("toolInstallBtn");

  let deferredInstallPrompt = null;
  let pwaToastTimer = 0;
  const isPWA = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  window.addEventListener("beforeinstallprompt", ev => {
    ev.preventDefault();
    deferredInstallPrompt = ev;
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hidePwaToast();
    toast(T("✨ 已成功加入主畫面！"));
  });

  function showPwaToast(autoDismiss = 8000) {
    if (!pwaToast || isPWA) return;
    clearTimeout(pwaToastTimer);
    pwaToast.hidden = false;
    pwaToastText.textContent = T("將網站加到主畫面練習？");
    pwaActionBtn.textContent = T("加入主畫面");
    pwaActionBtn.hidden = false;
    pwaXBtn.hidden = false;

    requestAnimationFrame(() => {
      pwaToast.classList.add("show");
    });

    if (autoDismiss > 0) {
      pwaToastTimer = setTimeout(() => hidePwaToast(false), autoDismiss);
    }
  }

  function hidePwaToast(recordDismiss = false) {
    if (!pwaToast) return;
    clearTimeout(pwaToastTimer);
    pwaToast.classList.remove("show");
    setTimeout(() => {
      if (!pwaToast.classList.contains("show")) pwaToast.hidden = true;
    }, 240);
    if (recordDismiss) {
      store.set("install-dismissed", String(Date.now()));
    }
  }

  function handlePwaInstall() {
    clearTimeout(pwaToastTimer);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");

    if (pwaActionBtn.textContent === T("知道了")) {
      hidePwaToast(true);
      return;
    }

    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(choice => {
        if (choice.outcome === "accepted") {
          pwaToastText.textContent = T("✨ 正在加入主畫面…");
          pwaActionBtn.hidden = true;
          pwaXBtn.hidden = true;
          pwaToastTimer = setTimeout(() => hidePwaToast(true), 2000);
        } else {
          hidePwaToast(true);
        }
        deferredInstallPrompt = null;
      });
      return;
    }

    if (isIOS) {
      pwaToastText.innerHTML = T("請點瀏覽器的<b>分享</b>按鈕，再選<b>「加入主畫面」</b>");
      pwaActionBtn.textContent = T("知道了");
      pwaToastTimer = setTimeout(() => hidePwaToast(true), 6000);
      return;
    }

    if (isPWA) {
      pwaToastText.textContent = T("目前已在主畫面 App 模式下開啟囉！");
      pwaActionBtn.hidden = true;
      pwaToastTimer = setTimeout(() => hidePwaToast(false), 2600);
      return;
    }

    // 一般桌面瀏覽器
    pwaToastText.textContent = T("請點網址列右側 ⊕ 或選單選擇加入主畫面");
    pwaActionBtn.hidden = true;
    pwaToastTimer = setTimeout(() => hidePwaToast(true), 3500);
  }

  if (pwaActionBtn) {
    pwaActionBtn.addEventListener("click", handlePwaInstall);
  }
  if (pwaXBtn) {
    pwaXBtn.addEventListener("click", () => hidePwaToast(true));
  }
  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener("click", () => {
      if (isPWA) toast(T("目前已在主畫面 App 模式下開啟囉！"));
      else { showPwaToast(0); handlePwaInstall(); }
    });
  }
  if (toolInstallBtn) {
    toolInstallBtn.addEventListener("click", () => {
      if (isPWA) toast(T("目前已在主畫面 App 模式下開啟囉！"));
      else { showPwaToast(0); handlePwaInstall(); }
    });
  }

  // 第一次造訪或超過 7 天：載入 2.5 秒後主動提示 toast（僅在首頁提示，不遮擋歌詞）
  if (!isPWA) {
    const dismissedTime = parseInt(store.get("install-dismissed") || "0", 10);
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (!dismissedTime || (Date.now() - dismissedTime > oneWeek)) {
      setTimeout(() => {
        if (!document.body.classList.contains("on-song")) {
          showPwaToast(8000);
        }
      }, 2500);
    }
  }

  // ── 歌曲頁 ──
  const box = document.getElementById("lines"), legend = document.getElementById("legend");
  const sTitleEl = document.getElementById("sTitle"), mvEl = document.querySelector("#song .mv");
  const PAGE_SONG = document.documentElement.dataset.song || "", PAGE_TITLE = document.title;
  // 在歌曲獨立頁（song/<id>/）上切歌：網址換成那首的獨立頁，不重新載入整頁；從首頁進來的（#id）照舊用 #
  const pathSong = () => { const m = location.pathname.match(/\/song\/([^/]+)\/?$/); return m && BY[m[1]] ? m[1] : ""; };
  const songHref = id => (PAGE_SONG ? `song/${id}/` : "#" + id);
  let lastPath = location.pathname;
  function goSong(id) {
    if (!PAGE_SONG) { location.hash = id; return; }
    history.pushState(null, "", new URL(`song/${id}/`, document.baseURI));
    lastPath = location.pathname;
    transition(route);
  }
  // 上一頁、下一頁：路徑變了才換歌（只換 # 的交給 hashchange）
  addEventListener("popstate", () => { if (location.pathname === lastPath) return; lastPath = location.pathname; transition(route); });
  ["prevSong", "nextSong"].forEach(k => document.getElementById(k).addEventListener("click", ev => {
    const a = ev.currentTarget;
    if (!PAGE_SONG || !a.getAttribute("href") || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    ev.preventDefault();
    goSong(getSongIdFromEl(a));
  }));
  let LINES = [], TAGGED = false, lineEls = [], curLine = -1, curKey = "", lastCueNextHtml = "", lastTrackPct = -1, maxLitLine = -1;
  let frameId = 0, stageT = 0, lastMs = 0, idleDrawn = false, penSong = null, blasted = false, crowdOn = false, venueOn = false, venueRaise = 0, venueClap = 0, venueJump = 0;
  function ensureFrame() { if (!frameId) frameId = requestAnimationFrame(frame); }

  // 歌詞捲動：自己做 0.26 秒先快後慢的動畫，把目前這行放到框的正中央；新的一行來了就從現在位置接著捲，不會疊在一起
  // 歌詞在唱到的那一刻亮起，不提前（提前會覺得歌詞比音樂快）
  const sc = document.getElementById("lyScroll");
  let glideId = null, holdUntil = 0;
  function glide(to) {
    if (glideId !== null) cancelAnimationFrame(glideId);
    glideId = null;
    if (reduce) { sc.scrollTop = to; return; }
    const from = sc.scrollTop, d = to - from, t0 = performance.now();
    const step = ms => { const k = Math.min(1, (ms - t0) / 260); sc.scrollTop = from + d * (1 - Math.pow(1 - k, 3)); glideId = k < 1 ? requestAnimationFrame(step) : null; };
    glideId = requestAnimationFrame(step);
  }
  function centerLine(el) {
    if (!el || !el.offsetParent || performance.now() < holdUntil) return;
    const r = el.getBoundingClientRect(), b = sc.getBoundingClientRect();
    const to = Math.max(0, Math.min(sc.scrollHeight - sc.clientHeight, sc.scrollTop + r.top - b.top - (sc.clientHeight - r.height) / 2));
    if (Math.abs(to - sc.scrollTop) >= 4) glide(to);
  }
  // 自己滑歌詞時，自動捲動先停 3 秒，不跟手指搶，並暫時解凍景深方便閱讀
  let userScrollTimer = null;
  ["wheel", "touchmove"].forEach(ev => sc.addEventListener(ev, () => {
    holdUntil = performance.now() + 3000;
    sc.classList.add("user-scrolling");
    clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => { sc.classList.remove("user-scrolling"); }, 1500);
    if (glideId !== null) { cancelAnimationFrame(glideId); glideId = null; }
  }, { passive: true }));
  // 底部留半個框的空白，最後幾行也能捲到中間
  // 沉浸模式：上面也留半個框，前幾句也能捲到正中間（字幕永遠在同一個高度）
  // 留白放在歌詞清單（#lines）上，不放在捲動框上：捲動框的內距會撐住它自己的高度，視窗變矮時縮不回來
  const padEnd = () => {
    const half = LINES.length ? Math.round(sc.clientHeight / 2) + "px" : "", imm = document.body.classList.contains("immersive-mode"), list = document.getElementById("lines");
    sc.style.paddingBottom = imm ? "" : half;
    list.style.paddingTop = imm ? half : "";
    list.style.paddingBottom = imm ? half : "";
  };
  addEventListener("resize", padEnd);

  const getBuiltinSong = (id, source = (typeof currentVideoSource === "function" ? currentVideoSource(S) : "mv")) => {
    if (source === "live" && LY_LIVE[id]) return LY_LIVE[id];
    return LY[id] || null;
  };
  // 內建歌詞：動作只看每行的 acts，依 じゅん🌝ぴ 的 note 整理
  function parseBuiltin(builtin) {
    const lines = (builtin.lyrics || []).map(item => ({
      t: +item.time || 0,
      dur: item.duration != null && +item.duration > 0 ? +item.duration : null,
      ja: (j => (j && isNote(j) ? T(j) : j))(String(item.jp || "").trim()) || null,
      zh: String(subLine(item)).trim() || null,
      acts: S.hold ? [] : (item.acts || []).filter(a => ACT[a] && a !== "listen"),
      listen: S.hold ? false : (item.acts || []).includes("listen"),
      sing: S.hold ? [] : item.sing || [],
      call: S.hold ? null : (item.call ? T(item.call) : null)
    }));
    return lines.sort((a, b) => a.t - b.t);
  }
  function loadSongData(source = (typeof currentVideoSource === "function" ? currentVideoSource(S) : "mv")) {
    const builtin = getBuiltinSong(S.id, source);
    LINES = builtin && builtin.lyrics ? parseBuiltin(builtin) : [];
    TAGGED = LINES.some(l => l.acts.length);
  }
  function lineEnd(i, fallback = DUR()) {
    const l = LINES[i];
    if (!l) return fallback;
    const next = LINES[i + 1] ? LINES[i + 1].t : fallback;
    return l.dur != null ? Math.min(next, l.t + l.dur) : next;
  }
  function lastStartedAt(t) {
    let k = -1;
    for (let i = 0; i < LINES.length; i++) { if (t >= LINES[i].t) k = i; else break; }
    return k;
  }
  const nextIdxAt = t => lastStartedAt(t) + 1;
  function lineAt(t) {
    const k = lastStartedAt(t);
    if (k < 0) return -1;
    const l = LINES[k];
    if (l.dur != null && t >= l.t + l.dur) return -1;
    return k;
  }

  // 假名：歌詞裡寫「漢字(かな)」就會標在漢字上方；每個字包成 .k 給卡拉OK與字體飛入動畫用
  // sung 是觀眾要唱的字，取最後一次出現的位置（Ado 先唱、觀眾接時，觀眾在後面）
  function jaHTML(txt, sung = []) {
    if (SHARED.jaHTML) return SHARED.jaHTML(txt, sung);
    const out = [], re = /([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g, hit = new Set();
    sung.forEach(w => { const i = txt.lastIndexOf(w); if (i >= 0) for (let j = i; j < i + w.length; j++) hit.add(j); });
    // 英文、數字連在一起的字包成一組（.kw），一個單字不會被拆到兩行
    let kIndex = 0, word = [];
    const flush = () => { if (word.length) out.push(word.length > 1 ? `<span class="kw">${word.join("")}</span>` : word[0]); word = []; };
    const k = (i, html, latin) => {
      const rot = (((kIndex * 7) % 15) - 7).toFixed(1) + "deg";
      const span = `<span class="k${hit.has(i) ? " sung" : ""}" style="--i:${kIndex++};--rot:${rot}">${html}</span>`;
      if (latin) word.push(span); else { flush(); out.push(span); }
    };
    const chars = (str, at) => { for (const c of str) { k(at, esc(c), /[A-Za-z0-9'’!?,.\-]/.test(c)); at += c.length; } };
    let last = 0, m;
    while ((m = re.exec(txt))) { chars(txt.slice(last, m.index), last); k(m.index, `<ruby>${esc(m[1])}<rt>${esc(m[2])}</rt></ruby>`); last = re.lastIndex; }
    chars(txt.slice(last), last);
    flush();
    return out.join("");
  }
  function renderLines(lyFailed = false) {
    // 歌詞換了（換歌、切 MV／Live）：提示框下半部的時間軸重畫、重新看放不放得下
    clearRippleTimers();
    maxLitLine = -1;
    lastCueNextHtml = "";
    lastTrackPct = -1;
    queueMicrotask(() => { trackSig = null; upHtml = ""; fitCueMore(); });
    box.innerHTML = "";
    if (!lyHave(S) && !lyFailed) { box.innerHTML = `<div class="empty is-loading"><span class="spinner" aria-hidden="true"></span><span>${T("正在載入歌詞…")}</span></div>`; legend.innerHTML = ""; SING = []; singJump.hidden = true; return; }
    if (!LINES.length) {
      box.innerHTML = `<div class="empty"><b>${T("這首還沒有逐行時間軸")}</b>${S.tips.length ? `<ul class="summary">${S.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul><span>${T("先邊看 MV 邊照上面的重點練。")}</span>` : `<span>${T("應援還在整理，先看 MV 熟悉旋律，副歌跟著現場氣氛就好。")}</span>`}<span>${T('歌詞請看<a href="{0}" target="_blank" rel="noopener">歌ネット的正版歌詞頁</a>。', S.ut)}</span></div>`;
      legend.innerHTML = ""; SING = []; singJump.hidden = true; sc.scrollTop = 0; padEnd(); return;
    }
    LINES.forEach((l, i) => {
      const el = document.createElement("div");
      const m = lineAct(l);
      el.className = "ln" + (m ? " a-" + m : "") + (l.acts.includes("sing") ? " sing" : ""); el.tabIndex = 0; el.setAttribute("role", "button");
      const ja = l.ja ? jaHTML(l.ja, l.sing) : `<span class="ph">${T("日文歌詞（{0}）", fmt(l.t))}</span>`;
      const zh = l.zh ? esc(l.zh) : (l.ja || LANG !== "zh" ? "" : `<span class="ph">中譯</span>`);
      // 喊聲標籤只放在同一句喊聲的第一行
      let callHtml = "";
      if (l.call && !(i && LINES[i - 1].call === l.call)) {
        if (isOffbeat(l.call)) {
          callHtml = `<span class="call call-offbeat"><svg class="ico-clap"><use href="#i-clap"/></svg><span class="call-txt">${T("反拍拍手")}</span><span class="call-rhythm"><b>${T("空")}</b><i>${T("拍")}</i><b>${T("空")}</b><i>${T("拍")}</i></span></span>`;
        } else {
          callHtml = `<span class="call">${esc(l.call)}</span>`;
        }
      }
      el.innerHTML = `<div class="ja" lang="ja">${ja}</div>${zh ? `<div class="zh">${zh}</div>` : ""}<div class="acts">${l.acts.map(icon).join("")}</div>${callHtml}`;
      el.addEventListener("click", () => seek(l.t));
      el.addEventListener("keydown", e => { if (e.key === "Enter") seek(l.t); });
      box.appendChild(el);
    });
    lineEls = [...box.querySelectorAll(".ln")];
    lineEls.forEach(el => { el._ks = [...el.querySelectorAll(".k")]; });
    curLine = -1; box.classList.remove("has-now");
    const used = new Set(LINES.flatMap(l => l.acts));
    focusAct = "";
    legend.innerHTML = Object.keys(ACT).filter(a => used.has(a)).map(a => `<button class="a-${a}" data-act="${a}" aria-pressed="false" title="${esc(T("只亮出要{0}的句子", ACT[a].name))}"><i></i>${ACT[a].name}</button>`).join("");
    SING = LINES.filter((l, i) => l.acts.includes("sing") && !(i && LINES[i - 1].acts.includes("sing"))).map(l => l.t);
    singJump.hidden = !SING.length;
    sc.scrollTop = 0; holdUntil = 0; padEnd();
    if (karaokeTiming && S && karaokeTiming.songId === S.id) {
      applyKaraokeTimingToDom(S);
    }
  }

  // ── 卡拉 OK 逐字時間整合 ──
  let karaokeTiming = null;
  let karaokeLoadSeq = 0;
  let karaokeLoadingId = null;
  let lastUpdateT = -1;

  function applyKaraokeTimingToDom(song) {
    if (!song || !lineEls.length || !LINES.length) return;
    const api = window.KARAOKE_SOURCES;
    lineEls.forEach((el, i) => {
      const lineData = LINES[i];
      if (!lineData) return;
      const timedLine = karaokeTiming && karaokeTiming.lines && karaokeTiming.lines[i];
      const ks = el._ks || (el._ks = [...el.querySelectorAll(".k")]);
      if (!ks.length) return;

      if (timedLine && timedLine.granularity === "word" && Array.isArray(timedLine.words) && timedLine.words.length && api && typeof api.mapUnitsToWords === "function") {
        const units = api.extractUnits(lineData.ja || "");
        const nextTime = lineEnd(i, lineData.t + 4);
        const mapped = api.mapUnitsToWords(units, timedLine.words, lineData.t, nextTime);
        const matchRatio = mapped.totalMeaningfulUnits > 0 ? (mapped.matchedUnits / mapped.totalMeaningfulUnits) : 0;
        if (matchRatio >= 0.5) {
          ks.forEach((k, ki) => {
            const timing = mapped.timings[ki];
            if (timing && Number.isFinite(timing.start)) {
              k._kStart = timing.start;
              k._kEnd = timing.end;
              k.dataset.start = String(timing.start);
              k.dataset.end = String(timing.end);
            } else {
              delete k._kStart;
              delete k._kEnd;
              delete k.dataset.start;
              delete k.dataset.end;
            }
          });
          el.dataset.karaokeSource = "word";
          return;
        }
      }

      ks.forEach(k => {
        delete k._kStart;
        delete k._kEnd;
        delete k.dataset.start;
        delete k.dataset.end;
      });
      el.dataset.karaokeSource = (timedLine && timedLine.granularity === "line") ? "line" : "fallback";
    });
  }

  async function loadKaraokeTiming(song) {
    if (!song) return;
    if (karaokeLoadingId === song.id) return;
    const seq = ++karaokeLoadSeq;
    karaokeLoadingId = song.id;
    karaokeTiming = null;

    const api = window.KARAOKE_SOURCES;
    if (!api || typeof api.load !== "function" || typeof api.alignToLocalLyrics !== "function") {
      if (seq === karaokeLoadSeq) karaokeLoadingId = null;
      applyKaraokeTimingToDom(song);
      return;
    }

    if (LYV) await hashesLoaded;
    if (seq !== karaokeLoadSeq || S !== song) return;

    const karaokeHash = lyHashes.karaoke && lyHashes.karaoke[song.id];
    const localUrl = hashesFound
      ? (karaokeHash ? `${ROOT}karaoke/${song.id}.json?v=${karaokeHash}` : null)
      : (LYV ? `${ROOT}karaoke/${song.id}.json?v=${LYV}` : null);

    let timed = null;
    try {
      timed = await api.load(song, {
        duration: DUR(),
        localUrl,
        localLabel: T("（靜態快取）")
      });
    } catch (e) {
      timed = null;
    }

    if (seq !== karaokeLoadSeq || S !== song) return;
    karaokeLoadingId = null;

    if (!timed) {
      applyKaraokeTimingToDom(song);
      return;
    }

    const aligned = api.alignToLocalLyrics(timed, LINES);
    if (!aligned) {
      applyKaraokeTimingToDom(song);
      return;
    }

    aligned.songId = song.id;
    karaokeTiming = aligned;
    applyKaraokeTimingToDom(song);
  }

  // 圖例：再點一次取消
  let focusAct = "";
  legend.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    focusAct = focusAct === b.dataset.act ? "" : b.dataset.act;
    legend.querySelectorAll("[data-act]").forEach(x => x.setAttribute("aria-pressed", x.dataset.act === focusAct));
    lineEls.forEach((el, i) => el.classList.toggle("dim", !!focusAct && !LINES[i].acts.includes(focusAct)));
  });

  // 播放：同 Vaundy 版，YouTube 播放器只建立一次，換歌用 cueVideoById 換影片
  // 直接點開檔案（file://）時瀏覽器不送來源網址，YouTube 會拒絕嵌入，所以改顯示提示
  let player = null, ready = false, vid = "", readyTimer = 0, playerRetries = 0, ytScriptEl = null, START = 0, muteTimer = 0, vloadTimer = 0;
  const vstatus = document.getElementById("vstatus"), vmsg = document.getElementById("vmsg"), vload = document.getElementById("vload");

  // ── 影片版本（MV / Live）控制 ──
  let videoSourceOverride = null; // null | "mv" | "live"
  let routeSource = null;
  let switchSeq = 0;

  function currentVideoSource(s = S) {
    if (!s || !s.liveVideo) return "mv";
    if (s === S && (videoSourceOverride === "mv" || videoSourceOverride === "live")) return videoSourceOverride;
    return TOOL["prefer-live"] ? "live" : "mv";
  }

  function activeVideoId(s = S) {
    if (!s) return "";
    return currentVideoSource(s) === "live" && s.liveVideo ? s.liveVideo.yt : s.yt;
  }

  function updateVideoSourceUi() {
    const pill = document.getElementById("videoSourcePill");
    if (!pill) return;
    const hasLive = Boolean(S && S.liveVideo);
    pill.hidden = !hasLive;
    if (!hasLive) return;

    const isLive = currentVideoSource(S) === "live";
    const mvBtn = pill.querySelector('[data-video-source="mv"]');
    const liveBtn = pill.querySelector('[data-video-source="live"]');

    if (mvBtn) {
      mvBtn.classList.toggle("active", !isLive);
      mvBtn.setAttribute("aria-pressed", String(!isLive));
    }
    if (liveBtn) {
      liveBtn.classList.toggle("active", isLive);
      liveBtn.setAttribute("aria-pressed", String(isLive));
      liveBtn.title = S.liveVideo.concert ? `${S.ja} (${S.liveVideo.concert})` : T("現場版");
    }
  }

  function syncCardYtEl(el, curYt) {
    if (!el) return;
    if (curYt) {
      el.href = `https://www.youtube.com/watch?v=${curYt}`;
      el.target = "_blank";
      el.rel = "noopener";
      el.textContent = T("在 YouTube 開啟 ↗");
    } else {
      el.removeAttribute("href");
      el.removeAttribute("target");
      el.removeAttribute("rel");
      el.textContent = T("尚未公開");
    }
  }

  function updateExternalLinks(s = S) {
    if (!s) return;
    const curYt = activeVideoId(s);
    const ytLink2 = document.getElementById("ytLink2");
    if (ytLink2) {
      if (curYt) {
        ytLink2.href = `https://www.youtube.com/watch?v=${curYt}`;
        ytLink2.hidden = false;
      } else {
        ytLink2.removeAttribute("href");
        ytLink2.hidden = true;
      }
    }
    syncCardYtEl(document.getElementById("cardYt"), curYt);
  }

  const normLyricText = txt => String(txt || "")
    .replace(/([\u4e00-\u9fff々〆ヵヶ]+)[(（][\u3040-\u30ffー]+[)）]/g, "$1")
    .replace(/[\s\u3000、。！？!?.,，．・「」『』（）()\[\]{}【】<>《》:：;；…—–\-‐‑〜~_“”‘’'"']/g, "")
    .toLowerCase();

  function switchVideoSource(source, opts) {
    if (!S || !S.liveVideo) return;
    const targetSource = source === "live" ? "live" : "mv";
    if (currentVideoSource(S) === targetSource) return;

    const song = S;
    const seq = ++switchSeq;
    const curTime = now();
    const curIdx = lineAt(curTime);
    const oldLen = LINES.length;
    const curLineObj = curIdx >= 0 ? LINES[curIdx] : null;
    const curNorm = curLineObj && curLineObj.ja ? normLyricText(curLineObj.ja) : "";
    videoSourceOverride = targetSource;
    updateVideoSourceUi();
    videoMsg("");
    hideAlert();
    quizStop();

    const doSwitch = (ok = true) => {
      if (seq !== switchSeq || S !== song || songV.hidden) return;
      loadSongData(targetSource);
      curKey = null;
      hideAlert();
      blasted = false;
      renderLines(!ok);
      document.getElementById("toolQuiz").disabled = !TAGGED;
      document.querySelectorAll('[data-tool="click"]').forEach(b => b.disabled = !BEAT[song.id] || targetSource === "live");

      const targetVid = activeVideoId(song);
      if (player && ready) {
        let targetStart = 0;
        if (opts && typeof opts.startSeconds === "number") {
          targetStart = opts.startSeconds;
        } else if (curIdx >= 0 && LINES.length) {
          let matchIdx = -1;
          if (curNorm) {
            const est = oldLen ? (curIdx / oldLen) * LINES.length : curIdx;
            let bestDist = Infinity;
            for (let i = 0; i < LINES.length; i++) {
              if (normLyricText(LINES[i].ja) === curNorm) {
                const d = Math.abs(i - est);
                if (d < bestDist) { bestDist = d; matchIdx = i; }
              }
            }
          }
          if (matchIdx < 0) matchIdx = Math.min(curIdx, LINES.length - 1);
          targetStart = LINES[matchIdx].t;
        } else {
          targetStart = Math.max(0, Math.min(DUR(), curTime));
        }
        vid = targetVid;
        videoMsg("");
        setVideoLoading(true);
        try {
          player.unMute();
          autoMuted = false;
          player.loadVideoById({ videoId: targetVid, startSeconds: targetStart });
        } catch (e) {}
        syncSwitchLoading();
        ensurePlaying();
      }
      updateExternalLinks(song);

      if (targetSource === "live") {
        karaokeLoadSeq++;
        karaokeLoadingId = null;
        karaokeTiming = null;
        applyKaraokeTimingToDom(song);
      } else if (OPT.karaoke && LINES.length > 0) {
        loadKaraokeTiming(song);
      }
    };

    if (!lyReady || !lyHave(song, targetSource)) {
      setVideoLoading(true);
      (lyReady ? Promise.resolve() : lyLoaded)
        .then(() => loadLyrics(song, targetSource))
        .then(ok => doSwitch(ok !== false));
    } else {
      doSwitch(true);
    }
  }

  // 長度以 YouTube 回報的為準，還沒載好才用資料裡的長度
  const DUR = () => { try { const d = ready && vid && vid === activeVideoId(S) && player.getDuration(); if (d) return d; } catch (e) {} return S ? S.dur : 1; };
  function videoMsg(text, loading = false) {
    vstatus.hidden = !text;
    vstatus.classList.toggle("is-loading", !!text && loading);
    if (text) vmsg.textContent = text;
  }
  function setVideoLoading(on) {
    if (!vload) return;
    clearTimeout(vloadTimer);
    vload.hidden = !on;
    if (on) {
      // 保底關閉：避免部分瀏覽器未觸發狀態事件而一直蓋住畫面
      vloadTimer = setTimeout(() => { vload.hidden = true; }, 4500);
    }
  }
  const syncSwitchLoading = () => {
    let st = -1;
    try { st = player.getPlayerState(); } catch (e) {}
    setVideoLoading(st === -1 || st === 3);
  };
  const now = () => { try { return (ready && vid && vid === activeVideoId(S) && player.getCurrentTime()) || 0; } catch (e) { return 0; } };
  const isPlaying = () => { try { return ready && !!vid && vid === activeVideoId(S) && [1, 3].includes(player.getPlayerState()); } catch (e) { return false; } };
  function play() { if (ready && player && S && activeVideoId(S) && vid) try { player.playVideo(); } catch (e) {} }
  function pause() { clearTimeout(muteTimer); if (ready && player) try { player.pauseVideo(); } catch (e) {} }
  function seek(t) { if (!ready || !player || !S || !activeVideoId(S) || !vid) return; try { player.seekTo(Math.max(0, Math.min(DUR(), t)), true); player.playVideo(); } catch (e) {} }

  // 播放速度：放慢練應援時間點，記在這台裝置
  // 電腦是工具列上的下拉選單，手機是一顆按鈕輪流切換（1 → 0.75 → 0.5）
  let RATE = [.5, .75].includes(+store.get("mv-rate")) ? +store.get("mv-rate") : 1;
  const RATES = [1, .75, .5], rateCycle = document.getElementById("rateCycle"), rateNow = document.getElementById("rateNow");
  const applyRate = () => { try { player.setPlaybackRate(RATE); } catch (e) {} };
  function paintRate() {
    document.querySelectorAll("[data-rate]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.rate === RATE)));
    rateNow.textContent = document.getElementById("rateBtnVal").textContent = `${RATE}×`;
    rateCycle.setAttribute("aria-label", T("播放速度：{0}（點一下切換）", `${RATE}×`));
  }
  function setRate(r) { RATE = r; store.set("mv-rate", RATE === 1 ? null : String(RATE)); if (ready) applyRate(); paintRate(); }
  document.querySelectorAll("[data-rate]").forEach(b => b.addEventListener("click", () => setRate(+b.dataset.rate)));
  rateCycle.addEventListener("click", () => setRate(RATES[(RATES.indexOf(RATE) + 1) % RATES.length]));
  paintRate();

  // 跳到大合唱：每段連續 sing 行的第一行
  const singJump = document.getElementById("singJump"), singPrev = document.getElementById("singPrev"), singNext = document.getElementById("singNext");
  let SING = [];
  const singAt = (dir, t) => {
    if (dir < 0) {
      for (let i = SING.length - 1; i >= 0; i--) {
        if (SING[i] < t - 1.5) return SING[i];
      }
      return undefined;
    }
    for (let i = 0; i < SING.length; i++) {
      if (SING[i] > t + .5) return SING[i];
    }
    return undefined;
  };
  singPrev.addEventListener("click", () => { const t = singAt(-1, now()); if (t != null) seek(t); });
  singNext.addEventListener("click", () => { const t = singAt(1, now()); if (t != null) seek(t); });

  function resetPlayer() {
    clearTimeout(readyTimer);
    clearTimeout(muteTimer);
    if (player) { try { player.destroy(); } catch (e) {} }
    player = null;
    ready = false;
    const screen = document.getElementById("screen");
    if (screen && !document.getElementById("ytp")) {
      const el = document.createElement("div");
      el.id = "ytp";
      screen.prepend(el);
    }
  }

  function scheduleReadyCheck() {
    clearTimeout(readyTimer);
    if (ready || !S || songV.hidden || !activeVideoId(S) || !navigator.onLine || location.protocol === "file:") return;
    readyTimer = setTimeout(() => {
      if (ready || !S || songV.hidden || !navigator.onLine) return;
      if (playerRetries < 2) {
        playerRetries++;
        resetPlayer();
        if (window.YT && YT.Player) {
          vid = activeVideoId(S);
          createPlayer(vid, true);
        } else {
          if (ytScriptEl) { ytScriptEl.remove(); ytScriptEl = null; }
          if (typeof reloadYT === "function") reloadYT();
          scheduleReadyCheck();
        }
      } else {
        setVideoLoading(false);
        videoMsg(T("影片連線延遲，請到 YouTube 觀看。"));
      }
    }, 4500);
  }

  function createPlayer(videoId, startPlaying = true) {
    if (player || !window.YT || !YT.Player || !videoId) return;
    const origin = location.protocol.startsWith("http") ? location.origin : undefined;
    const startAt = START;
    player = new YT.Player("ytp", {
      videoId: videoId,
      playerVars: {
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
        autoplay: startPlaying ? 1 : 0,
        enablejsapi: 1,
        iv_load_policy: 3,
        start: START,
        ...(origin ? { origin } : {})
      },
      events: {
        onReady: () => {
          ready = true;
          playerRetries = 0;
          clearTimeout(readyTimer);
          videoMsg("");
          setVideoLoading(false);
          applyRate();
          // 等播放器的期間已經回首頁：不要在背景出聲
          if (!S || songV.hidden) { try { player.pauseVideo(); } catch (e) {} START = 0; return; }
          // 等播放器的期間換了歌：交給 loadVideo 換片
          if (vid !== activeVideoId(S)) { loadVideo(); return; }
          if (startPlaying) {
            // 點連結時播放器先建好，之後才知道網址上的 @秒數
            if (START && START !== startAt) seek(START);
            try { player.unMute(); autoMuted = false; player.playVideo(); } catch (e) {}
            ensurePlaying();
          }
          START = 0;
        },
        // 換影片後 YouTube 會把速度重設成 1，播放或載入完成時再套一次
        onStateChange: e => {
          if (e.data === 3) setVideoLoading(true);
          else if (e.data === 0 || e.data === 1 || e.data === 2 || e.data === 5) setVideoLoading(false);
          if (e.data === 1) { videoMsg(""); applyRate(); }
          else if (e.data === 5) applyRate();
          if (e.data === 0) ended();
        },
        onError: () => { clearTimeout(muteTimer); setVideoLoading(false); videoMsg(T("無法播放影片，請到 YouTube 觀看。")); }
      }
    });
    scheduleReadyCheck();
  }

  function loadVideo() {
    if (!S || songV.hidden) return;
    const targetVid = activeVideoId(S);
    if (!targetVid) {
      clearTimeout(readyTimer);
      clearTimeout(muteTimer);
      if (ready && player && typeof player.pauseVideo === "function") {
        try { player.pauseVideo(); } catch (e) {}
      }
      vid = "";
      START = 0;
      setVideoLoading(false);
      videoMsg(S.upcoming
        ? T("這首尚未公開官方 MV，發行後就會補上影片與同步歌詞。")
        : T("這首目前沒有官方 YouTube 影片，可透過下方串流平台收聽。"));
      return;
    }
    if (!window.YT || !YT.Player) {
      if (navigator.onLine && location.protocol !== "file:") {
        if (!ytScriptEl && typeof reloadYT === "function") reloadYT();
        scheduleReadyCheck();
      }
      return;
    }
    const startSec = START || 0;
    if (!player) {
      vid = targetVid;
      createPlayer(vid, true);
      return;
    }
    if (!ready) {
      scheduleReadyCheck();
      return;
    }
    // 打開歌曲或切歌播放
    if (vid !== targetVid) {
      vid = targetVid;
      setVideoLoading(true);
      try {
        player.unMute();
        autoMuted = false;
        player.loadVideoById({ videoId: targetVid, startSeconds: startSec });
      } catch (e) {}
      syncSwitchLoading();
    } else {
      if (START) seek(START);
      try {
        player.unMute();
        autoMuted = false;
        player.playVideo();
      } catch (e) {}
    }
    START = 0;
    ensurePlaying();
  }

  // 取得點擊目標的歌曲 ID
  function getSongIdFromEl(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.id) return el.dataset.id;
    const href = el.getAttribute("href") || "";
    if (href.startsWith("#")) return href.slice(1).split("@")[0].split("?")[0];
    const m = href.match(/(?:^|\/)song\/([^\/?#]+)/);
    return m ? m[1] : null;
  }

  // 使用者手勢直接啟動播放，避免瀏覽器與 YouTube 判定為背景自動播放而插入廣告與強制靜音
  // iPhone／Safari 只讓「點擊當下」叫的播放出聲：換頁有轉場，等 openSong 再播已經不算點擊，所以要在這裡先播
  document.addEventListener("click", e => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;  // 開新分頁：這頁不要出聲
    const a = e.target.closest("a[data-id], a[href^='#'], #prevSong, #nextSong");
    if (!a) return;
    const targetId = getSongIdFromEl(a);
    const targetSong = targetId && BY[targetId];
    if (targetSong) tapPlay(targetSong);
  });
  function tapPlay(targetSong) {
    const src = targetSong === S ? currentVideoSource(targetSong) : (targetSong.liveVideo && TOOL["prefer-live"] ? "live" : "mv");
    const targetVid = src === "live" && targetSong.liveVideo ? targetSong.liveVideo.yt : targetSong.yt;
    if (!targetVid) {
      if (player && ready && typeof player.pauseVideo === "function") {
        try { player.pauseVideo(); } catch (err) {}
      }
      return;
    }
    if (player && ready) {
      try {
        player.unMute();
        autoMuted = false;
        if (vid !== targetVid) {
          vid = targetVid;
          setVideoLoading(true);
          player.loadVideoById({ videoId: targetVid, startSeconds: 0 });
          syncSwitchLoading();
        } else {
          player.playVideo();
        }
      } catch (err) {}
    }
  }

  // 瀏覽器不讓有聲音的影片自己播時（直接打開網址、還沒點過畫面，iPhone 常見），改成靜音播放並提醒
  function ensurePlaying() {
    clearTimeout(muteTimer);
    muteTimer = setTimeout(() => {
      if (!ready || !player || songV.hidden) return;
      try {
        const st = player.getPlayerState();
        if (st === 1 || st === 2 || st === 3) return;  // 在播、使用者自己暫停了、或還在緩衝
        player.mute(); player.playVideo(); autoMuted = true;
        toast(T("瀏覽器不讓影片自動出聲，先靜音播放；點一下畫面就有聲音"));
      } catch (e) {}
    }, 3000);
  }
  // 被迫靜音之後，使用者在頁面上點的第一下（任何地方）就順便開聲音：點擊當下叫 unMute 才算數
  let autoMuted = false;
  const unmuteOnTap = () => {
    if (!autoMuted || !ready) return;
    autoMuted = false;
    try { player.unMute(); } catch (e) {}
  };
  ["click", "keydown"].forEach(t => document.addEventListener(t, unmuteOnTap, true));
  let reloadYT = null;
  if (location.protocol === "file:") {
    videoMsg(T("直接點開檔案時 YouTube 不允許嵌入播放。請改用資料夾裡的「開啟網站.command」，或放上 GitHub Pages 再看。"));
  } else {
    // 離線時（加到主畫面、在場館收不到訊號）影片播不了，先說清楚；連回網路就重新載入播放器
    const OFFLINE = T("離線中：影片要連上網路才能播，歌詞和應援重點照樣可以看。");
    const loadYT = () => {
      if ((window.YT && YT.Player) || ytScriptEl) return;
      const yts = document.createElement("script");
      ytScriptEl = yts;
      yts.src = "https://www.youtube.com/iframe_api";
      yts.onload = () => { if (ytScriptEl === yts) ytScriptEl = null; };
      yts.onerror = () => {
        if (ytScriptEl === yts) ytScriptEl = null;
        yts.remove();
        if (S && !songV.hidden && !activeVideoId(S)) return;
        if (!navigator.onLine) videoMsg(OFFLINE);
        else if (S && !songV.hidden && playerRetries < 2) scheduleReadyCheck();
        else videoMsg(T("無法載入 YouTube 播放器，請到 YouTube 觀看。"));
      };
      document.head.appendChild(yts);
    };
    reloadYT = loadYT;
    window.onYouTubeIframeAPIReady = () => { loadVideo(); };
    if (!navigator.onLine) videoMsg(OFFLINE);
    loadYT();
    addEventListener("online", () => { if (!ready) { playerRetries = 0; if (!(S && !songV.hidden && !activeVideoId(S))) { videoMsg(T("正在載入影片…"), true); scheduleReadyCheck(); } loadYT(); } });
    addEventListener("offline", () => { if (!ready && !(S && !songV.hidden && !activeVideoId(S))) { clearTimeout(readyTimer); videoMsg(OFFLINE); } });
  }
  // 離線用的 Service Worker：只有建置過的網站才有 sw.js；ROOT 讓英文、日文版也註冊到網站根目錄
  if (LYV && "serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register(ROOT + "sw.js").catch(() => {}));

  function openSong(s, t = 0) {
    quizStop(); closeSheets(); playerRetries = 0;
    switchSeq++; quizStartSeq++; karaokeLoadSeq++; karaokeLoadingId = null; karaokeTiming = null;
    clearRippleTimers(); lastCueNextHtml = ""; lastTrackPct = -1; blasted = false;
    S = s; curKey = null; hideAlert(); START = t; remember(s.id);
    if (routeSource) {
      videoSourceOverride = routeSource;
      routeSource = null;
    } else {
      videoSourceOverride = null;
    }
    updateVideoSourceUi();
    const curSrc = currentVideoSource(s);
    loadSongData(curSrc);
    // 上一首播不了留下的錯誤訊息，換歌時先收掉；播放器還沒好時保留載入動畫與提示
    if (ready) videoMsg("");
    else if (navigator.onLine && location.protocol !== "file:") videoMsg(T("正在載入影片…"), true);
    // 在這首自己的頁面（song/<id>/）時保留建置時寫好的完整標題，給搜尋引擎看
    document.title = s.id === PAGE_SONG ? PAGE_TITLE : `${s.ja}｜${T("Ado 應援指南")}`;
    const sub = otherName(s);
    // 歌名前的小唱片：首頁唱片架飛過來的落點，播放時會轉
    sTitleEl.innerHTML = (window.ADO_CD ? `<span class="sdisc" aria-hidden="true">${window.ADO_CD(s)}</span>` : "") + esc(s.ja) + (sub ? `<span lang="${LANG === "zh" && s.zh !== s.ja ? "zh-Hant-TW" : "en"}">${esc(sub)}</span>` : "");
    updateExternalLinks(s);
    // 正版歌詞、現場音源、YouTube 連結都只放在「速覽」
    document.getElementById("cardLyrics").href = s.ut;
    const p = penOf(s);
    document.getElementById("pen").innerHTML = T("螢光棒") + p.keys.map(k => k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`).join("")
      + `<b>${p.keys.map(penName).join(T("、"))}${p.none ? T("（沒指定）") : ""}</b>`;
    // 接關聯曲：換到的是上一首說好的那首，告訴使用者為什麼接這首
    if (TOOL.related && nextUp && nextUp.id === s.id && nextUp.why) toast(T("接著聽關聯曲：{0}", nextUp.why));
    if (!TOOL.shuffle && !TOOL.related && activePlayList && activePlayList.length) {
      const plIdx = activePlayList.indexOf(s.id);
      if (plIdx >= 0) toast(T("清單第 {0}／{1} 首", plIdx + 1, activePlayList.length));
      else activePlayList = null;
    }
    syncToolSetlistBtn();
    shuffleSeen(s);
    paintNav(s);
    fillSong();
    paintRelated(s);
    document.querySelectorAll('[data-tool="click"]').forEach(b => b.disabled = !BEAT[s.id] || curSrc === "live");
    loadVideo();
    updateAmbientColors(s);
    if (!hasDocPip()) prepCanvasPip();
    ensureFrame();
  }
  // 歌詞相關的部分：歌詞檔載好後會再跑一次
  function fillSong() {
    const s = S;
    if (!s) return;
    const curSrc = currentVideoSource(s);
    if (lyReady && !lyHave(s, curSrc)) {
      loadLyrics(s, curSrc).then(ok => {
        if (S === s && !songV.hidden && currentVideoSource(s) === curSrc) {
          if (ok) fillSong();
          else renderLines(true);
        }
      });
    }
    loadSongData(curSrc);
    renderLines();
    if (karaokeTiming && S && karaokeTiming.songId === S.id) {
      applyKaraokeTimingToDom(S);
    } else if (OPT.karaoke && curSrc === "mv" && LINES.length > 0 && (!karaokeTiming || karaokeTiming.songId !== s.id)) {
      loadKaraokeTiming(s);
    }
    // 測驗要有逐行應援才出得了題
    document.getElementById("toolQuiz").disabled = !TAGGED;
    document.getElementById("cueSummary").innerHTML = TAGGED ? s.tips.map(t => `<li>${esc(t)}</li>`).join("") : "";
    document.getElementById("cueIcon").innerHTML = `<use href="#${ACT[s.acts[0] || "listen"].icon}"/>`;
    cueBox.className = "cue";
    document.getElementById("cueName").textContent = T("按播放開始");
    document.getElementById("cueHow").textContent = !lyHave(s, curSrc) ? "" : LINES.length ? T("播放後，這裡會顯示現在要做的動作。") : T("這首還沒有逐行時間軸，不會跳提示，照歌詞欄的重點練。");
    cueNext.innerHTML = "";
    lastCueNextHtml = "";

    // 同步更新歌曲應援速覽卡片（若存在於 DOM 中）
    const cardJa = document.getElementById("cardJa");
    if (cardJa) {
      cardJa.textContent = s.ja + (otherName(s) ? `（${otherName(s)}）` : "");
      const p = penOf(s);
      const penText = p.keys.map(penName).join(T("、")) + (p.none ? T("（未指定，建議用代表色藍色）") : "");
      document.getElementById("cardPen").textContent = penText;
      const aka = LANG === "zh" ? [...new Set([s.zh !== s.ja ? s.zh : "", ...(s.alias || []), s.en && s.en !== s.ja ? s.en : ""].filter(Boolean))].join("・") : LANG === "en" ? [s.ro && s.ro !== s.en ? s.ro : ""].filter(Boolean).join("・") : "";
      [["cardAka", aka], ["cardTie", s.tie ? T(s.tie) : ""], ["cardAlbum", s.album ? T(s.album) : ""], ["cardDate", (s.date || "").replace(/-/g, "/")]].forEach(([k, v]) => {
        const dt = document.getElementById(k + "Dt"), dd = document.getElementById(k + "Dd");
        if (dt && dd) { dd.textContent = v; dt.hidden = dd.hidden = !v; }
      });
      document.getElementById("cardTips").textContent = s.tips && s.tips.length ? s.tips.join(T("；")) : (s.free ? T("沒有固定應援，自由跟著節奏搖手燈。") : T("應援還在整理，先熟悉旋律。"));
      syncCardYtEl(document.getElementById("cardYt"), activeVideoId(s));
      const cardStream = document.getElementById("cardStream");
      if (cardStream) cardStream.innerHTML = (s.stream || []).map(x => `<a href="${esc(x.url)}" class="live-chip" target="_blank" rel="noopener">${esc(x.name)} ↗</a>`).join(" ");
      const cardLiveDt = document.getElementById("cardLiveDt");
      const cardLiveDd = document.getElementById("cardLiveDd");
      if (cardLiveDt && cardLiveDd) {
        const lives = s.lives;
        if (lives.length > 0) {
          cardLiveDt.hidden = false;
          cardLiveDd.hidden = false;
          cardLiveDd.innerHTML = lives.map(l => `<a href="https://www.youtube.com/watch?v=${esc(l.yt)}" class="live-chip" target="_blank" rel="noopener">${esc(l.concert)} ↗</a>`).join(" ");
        } else {
          cardLiveDt.hidden = true;
          cardLiveDd.hidden = true;
          cardLiveDd.innerHTML = "";
        }
      }
    }
  }
  lyLoaded.then(() => { if (S && !songV.hidden) fillSong(); });

  // 現在動作：以目前這一行為準。沒有動作的行不提示（聽 Ado 唱）
  // 整首沒有逐行標記的歌（自由搖、應援還在整理），整首用同一個提示，不跳字卡
  function songCue() {
    if (S.free) return { acts: [], name: T("自由跟著節奏"), how: T("沒有固定應援，跟著現場氣氛就好。") };
    if (S.hold) return { acts: [], name: T("應援還在整理"), how: T("先熟悉旋律，跟著現場氣氛就好。") };
    return null;
  }
  function cueAt(t) {
    const li = lineAt(t), l = LINES[li];
    if (!l) return null;
    if (!TAGGED) { const c = songCue(); if (c) return { key: "song", ...c, whole: true, beat: c.acts.length > 0 }; }
    if (!l.acts.length) return { key: li, acts: [], name: "", how: "", listen: true };
    return { key: li, acts: l.acts, name: cueLabel(l), how: l.acts.map(a => ACT[a].how).join("，"), claps: currentVideoSource(S) === "live" ? null : S.claps, beat: true, listenLine: l.listen };
  }
  // 接下來的 n 個動作（同一個動作連續好幾句只算一次，安靜聽的句子跳過）
  function nextChanges(t, n) {
    const out = [], sig = l => l.acts.join(",") + cueLabel(l);
    let prev = LINES[lineAt(t)];
    for (let i = nextIdxAt(t); i < LINES.length && out.length < n; i++) {
      const l = LINES[i];
      if (prev && sig(l) === sig(prev)) continue;
      prev = l;
      if (l.acts.length) out.push({ t: l.t, acts: l.acts, name: cueLabel(l) });
    }
    return out;
  }
  function nextChange(t) {
    const li = lineAt(t), cur = LINES[li], sig = l => l.acts.join(",") + cueLabel(l);
    for (let i = nextIdxAt(t); i < LINES.length; i++) {
      if (!cur || sig(LINES[i]) !== sig(cur)) { const l = LINES[i]; if (!l.acts.length) continue; return { t: l.t, acts: l.acts, name: cueLabel(l) }; }
    }
    return null;
  }

  // 拍點：x 是第幾拍（含小數）、f 是這拍過了多少、bar 是小節裡的第幾拍、down 是小節第一拍；這首沒有拍點資料回 null
  function beatAt(t) {
    if (!S || currentVideoSource(S) === "live") return null;
    const bt = BEAT[S.id]; if (!bt) return null;
    const P = 60 / bt[0], x = (t - bt[1]) / P, k = Math.floor(x), bar = ((k % 4) + 4) % 4;
    return { P, x, k, f: x - k, bar, known: !!bt[2], down: !!bt[2] && bar === 0 };
  }
  // 拍子剛到時是 1，很快退到 0
  const beatPulse = b => Math.exp(-b.f * b.P / Math.min(.16, b.P * .35));

  // 大字提醒：字卡＋四周邊框光，不蓋住 MV 和歌詞
  // 動作前一小節邊框先微亮預告（不倒數），動作開始那拍整個亮；字卡內容跟著拍子動
  const al = document.getElementById("alert"), alIcon = document.getElementById("alIcon"), alName = document.getElementById("alName"),
        alBody = document.getElementById("alBody"), alHow = document.getElementById("alHow"), cueFrame = document.getElementById("cueFrame");
  const screenEl = document.getElementById("screen");
  let alertOn = store.get("alert-off") !== "1", alKey = "", alKind = "", alDots = [], alWords = [], alSing = [], alSteps = [];
  // 大字提醒開關：在練習工具列上
  const alertBtns = [document.getElementById("alertTool")];
  const paintAlert = () => alertBtns.forEach(b => b.setAttribute("aria-pressed", alertOn));
  paintAlert();
  alertBtns.forEach(b => b.addEventListener("click", () => { alertOn = !alertOn; paintAlert(); store.set("alert-off", alertOn ? "0" : "1"); }));
  const dotsHTML = (n, first) => `<div class="dots">${Array.from({ length: n }, (_, i) => `<i${first && !i ? ' class="first"' : ""}></i>`).join("")}</div>`;
  // 字卡內容：大合唱寫出要唱的字，喊聲寫出要喊的話，拍手是每拍亮的圓點，揮手是擺動的螢光棒，跳躍是彈起的圖示；反拍拍手特製 4 拍視覺儀
  function cardFor(cue, l) {
    const offbeat = isOffbeat(l.call) || isOffbeat(cue.name);
    if (offbeat) {
      return {
        act: "clap",
        name: T("反拍拍手（第 2、4 拍）"),
        kind: "offbeat",
        body: `<div class="offbeat-meter"><div class="beat-step step-1"><span class="step-num">1</span><span class="step-txt">${T("空")}</span><span class="step-sub">—</span></div><div class="beat-step target-clap step-2"><span class="step-num">2</span><span class="step-txt">${T("拍！")}</span><svg class="step-ico" viewBox="0 0 24 24"><use href="#i-clap"/></svg></div><div class="beat-step step-3"><span class="step-num">3</span><span class="step-txt">${T("空")}</span><span class="step-sub">—</span></div><div class="beat-step target-clap step-4"><span class="step-num">4</span><span class="step-txt">${T("拍！")}</span><svg class="step-ico" viewBox="0 0 24 24"><use href="#i-clap"/></svg></div></div>`,
        how: T("口訣：一 [拍] 三 [拍]（空・拍・空・拍）")
      };
    }
    const act = l.sing.length ? "sing" : l.call ? (l.acts.includes("call") ? "call" : mainAct(l.acts)) : mainAct(l.acts);
    const extra = l.acts.filter(a => a !== act).map(a => ACT[a].name);
    const head = { act, name: ACT[act].name + (extra.length ? `<em>＋${extra.join(T("、"))}</em>` : "") };
    // 整句都要唱（沒標要唱哪幾個字）時，整句放大
    const words = l.sing.length ? l.sing : act === "sing" && l.ja && !l.call ? [l.ja] : null;
    if (words) return { ...head, kind: "sing", words, body: `<div class="words">${words.map(w => jaHTML(w)).join("　")}</div>`, how: "" };
    if (l.call) return { ...head, kind: "big", body: `<div class="big">${esc(l.call)}</div>`, how: "" };
    if (act === "clap") return { ...head, kind: "dots", body: dotsHTML(4, true), how: ACT.clap.how };
    if (act === "wave") return { ...head, kind: "swing", body: '<svg class="swing" viewBox="0 0 132 72"><path class="arc" d="M14 54a54 54 0 0 1 104 0"/><g class="stick"><line x1="66" y1="70" x2="66" y2="16"/></g></svg>', how: ACT.wave.how };
    if (act === "jump") return { ...head, kind: "hop", body: `<svg class="hop"><use href="#i-jump"/></svg>`, how: ACT.jump.how };
    return { ...head, kind: "big", body: `<div class="big">${esc(ACT[act].how)}</div>`, how: "" };
  }
  function showCard(key, c) {
    if (key === alKey) return;
    alKey = key; alKind = c.kind; alSing = c.words || [];
    al.className = `alert show a-${c.act}`;
    alIcon.innerHTML = `<use href="#${ACT[c.act].icon}"/>`;
    alName.innerHTML = c.name; alBody.innerHTML = c.body; alHow.textContent = c.how;
    alDots = [...alBody.querySelectorAll(".dots i")];
    alWords = [...alBody.querySelectorAll(".k")];
    alSteps = [...alBody.querySelectorAll(".beat-step")];
    placeCard();
  }
  function placeCard() {
    const r = (mvEl || screenEl).getBoundingClientRect(), c = cueBox.getBoundingClientRect();
    al.style.setProperty("--al-left", Math.round(r.left + r.width / 2) + "px");
    al.style.setProperty("--al-max", Math.round(r.width - 16) + "px");
    const top = c.height > 0 ? (c.top + 40) : (r.bottom + 12);
    al.style.setProperty("--al-top", Math.round(Math.max(8, Math.min(top, innerHeight - al.offsetHeight - 12))) + "px");
  }
  addEventListener("resize", () => { if (alKey) placeCard(); });
  function hideAlert() { if (alKey) { al.className = "alert"; alKey = ""; } cueFrame.style.opacity = 0; }
  function alerts(t, playing, cue) {
    // 測驗中不提示：字卡和邊框光都會洩題
    if (!alertOn || !playing || !cue || QZ) return hideAlert();
    const b = beatAt(t), pulse = b && !reduce ? beatPulse(b) * (b.known && !b.down ? .6 : 1) : 0;
    al.style.setProperty("--pulse", pulse.toFixed(3));
    // 「唱」最後的 Clap Clap Clap：三下圓點
    if (cue.claps && currentVideoSource(S) !== "live" && t >= cue.claps && t < cue.claps + 2.2) {
      if (alKey !== "claps3") showCard("claps3", { act: "clap", name: T("拍三下"), kind: "claps3", body: dotsHTML(3), how: T("啪、啪、啪") });
      const d = t - cue.claps; alDots.forEach((x, j) => x.classList.toggle("on", d > j * .55 && d < j * .55 + .3));
      cueFrame.style.opacity = .8;
      return;
    }
    const l = LINES[cue.key];
    if (cue.listen || cue.whole || !l) {
      if (alKey) { al.className = "alert"; alKey = ""; }
      // 預告：下一個動作前一小節（沒有拍點資料時 2 秒），邊框慢慢亮起
      const nx = nextChange(t), lead = b ? b.P * 4 : 2, left = nx ? nx.t - t : Infinity;
      cueFrame.style.opacity = left > 0 && left < lead ? (.15 + .35 * (1 - left / lead)).toFixed(2) : 0;
      return;
    }
    const nextKey = "l" + cue.key;
    if (nextKey !== alKey) showCard(nextKey, cardFor(cue, l));
    cueFrame.style.opacity = (.6 + .4 * pulse).toFixed(2);
    if (alKind === "sing") {
      // 唱到的字亮起：要唱的字在這行的位置，照這行的進度換算
      const end = lineEnd(cue.key), frac = Math.max(0, Math.min(1, (t - l.t) / Math.max(.5, (end - l.t) * .9)));
      const ja = l.ja || "";
      const at = Math.min(...alSing.map(w => ja.lastIndexOf(w)).filter(i => i >= 0), ja.length), len = Math.max(1, ja.length - at);
      const lit = Math.round(Math.max(0, Math.min(1, (frac * ja.length - at) / len)) * alWords.length);
      alWords.forEach((k, i) => k.classList.toggle("lit", i < lit));
    } else if (alKind === "dots") {
      const on = b ? (b.known ? b.bar : ((b.k % 4) + 4) % 4) : Math.floor((t - l.t) * 2) % 4;
      alDots.forEach((x, j) => x.classList.toggle("on", j === on && (!b || b.f < .5)));
    } else if (alKind === "offbeat") {
      const bar = b ? (b.known ? b.bar : ((b.k % 4) + 4) % 4) : Math.floor((t - l.t) * 2) % 4;
      const hit = (!b || b.f < .45);
      alSteps.forEach((x, j) => {
        const isCurrent = j === bar;
        x.classList.toggle("current", isCurrent);
        x.classList.toggle("hit", isCurrent && (j === 1 || j === 3) && hit);
      });
    } else if (alKind === "swing" && !reduce) {
      al.style.setProperty("--ang", (Math.cos(Math.PI * (b ? b.x : (t - l.t) * 2)) * 28).toFixed(1) + "deg");
    }
  }

  // ── Folia 風格：字型輪廓音波衝擊 (Glyph Shockwave) ──
  const rippleTimers = new Set();
  function clearRippleTimers() {
    rippleTimers.forEach(id => clearTimeout(id));
    rippleTimers.clear();
  }
  function addRippleTimer(fn, ms) {
    const id = setTimeout(() => {
      rippleTimers.delete(id);
      fn();
    }, ms);
    rippleTimers.add(id);
    return id;
  }
  function spawnGlyphWave(targetEl) {
    if (!targetEl || OPT.light === false || reduce || QZ) return;
    const old = targetEl.querySelectorAll(".chorus-glyph-wave");
    old.forEach(w => w.remove());

    const wave = document.createElement("span");
    wave.className = "chorus-glyph-wave";
    wave.setAttribute("aria-hidden", "true");
    wave.innerHTML = targetEl.innerHTML;
    targetEl.appendChild(wave);
    const fbId = addRippleTimer(() => wave.remove(), 950);
    wave.addEventListener("animationend", () => {
      clearTimeout(fbId);
      rippleTimers.delete(fbId);
      wave.remove();
    }, { once: true });
  }

  function triggerChorusRipples(lineEl, lineData, isClimax) {
    if (!lineEl || OPT.light === false || reduce || QZ) return;
    const sungEls = lineEl.querySelectorAll(".sung");
    if (sungEls.length) {
      sungEls.forEach((el, idx) => {
        addRippleTimer(() => { spawnGlyphWave(el); }, idx * 90);
      });
    } else if (lineData && (lineData.acts.includes("sing") || isClimax)) {
      const jaEl = lineEl.querySelector(".ja");
      if (jaEl) spawnGlyphWave(jaEl);
    }
  }

  // 畫面更新
  const cueBox = document.querySelector(".cue"), cueIcon = document.getElementById("cueIcon"), cueName = document.getElementById("cueName"), cueHow = document.getElementById("cueHow"), cueNext = document.getElementById("cueNext");
  // ── 電腦版提示框下半部：「接下來」清單＋整首應援時間軸。框夠高才顯示，框矮時只留大字提醒 ──
  const cueMore = document.getElementById("cueMore"), cueUpWrap = document.getElementById("cueUpWrap"), cueUp = document.getElementById("cueUp"), cueTrack = document.getElementById("cueTrack");
  let trackSig = "", trackDur = 0, upHtml = "";
  // 時間軸：每段動作依歌詞時間畫成色塊（同一個動作連續的句子併成一段）
  function buildTrack() {
    const d = DUR();
    const sig = S && LINES.length && TAGGED && d > 0 ? `${S.id}|${Math.round(d)}|${LINES.length}|${LINES[0].t}|${LINES[LINES.length - 1].t}` : "";
    if (sig === trackSig) return;
    trackSig = sig; trackDur = d;
    if (!sig) { cueTrack.innerHTML = ""; return; }
    const segs = [];
    LINES.forEach((l, i) => {
      const a = mainAct(l.acts);
      if (!a || a === "listen") return;
      const end = Math.min(d, lineEnd(i, l.t + 4)), last = segs[segs.length - 1];
      if (last && last.a === a && Math.abs(last.e - l.t) < .05) last.e = end; else segs.push({ a, s: l.t, e: end });
    });
    cueTrack.innerHTML = `<div class="segs">${segs.map(g => `<i class="a-${g.a}" style="left:${(g.s / d * 100).toFixed(2)}%;width:${Math.max(.5, (g.e - g.s) / d * 100).toFixed(2)}%"></i>`).join("")}</div><b class="head"></b>`;
  }
  // 依提示框剩下的高度決定顯示幾樣：上面留給標題和現在的動作（或大字提醒字卡）
  function fitCueMore() {
    const ok = !!(S && LINES.length && TAGGED) && cueBox.offsetParent !== null;
    const room = ok ? cueBox.clientHeight - 190 : 0;
    cueMore.hidden = room < 30;
    cueUpWrap.hidden = room < 170;
    cueBox.dataset.more = cueUpWrap.hidden ? (cueMore.hidden ? "" : "track") : "up";
  }
  if (window.ResizeObserver) new ResizeObserver(() => fitCueMore()).observe(cueBox);
  function paintCueMore(t) {
    if (cueMore.hidden) return;
    buildTrack();
    if (trackDur) {
      const p = Math.min(1, Math.max(0, t / trackDur));
      cueTrack.style.setProperty("--p", p.toFixed(4));
      const pct = Math.round(p * 100);
      if (pct !== lastTrackPct) {
        lastTrackPct = pct;
        cueTrack.setAttribute("aria-valuenow", String(pct));
      }
    }
    if (cueUpWrap.hidden) return;
    const html = nextChanges(t, 3).map(x => {
      const left = x.t - t;
      return `<li><button type="button" data-t="${x.t}" title="${esc(T("跳到 {0}", fmt(x.t)))}"><span class="when">${left <= 60 ? T("{0} 秒後", Math.max(1, Math.ceil(left))) : fmt(x.t)}</span><b class="a-${mainAct(x.acts)}">${esc(x.name)}</b></button></li>`;
    }).join("") || `<li class="end">${T("這首的應援到這裡結束")}</li>`;
    if (html !== upHtml) { cueUp.innerHTML = html; upHtml = html; }
  }
  // 點「接下來」的項目或時間軸：跳到那裡（動作前 2 秒，來得及準備）
  cueUp.addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (b) seek(Math.max(0, +b.dataset.t - 2)); });
  cueTrack.addEventListener("click", e => {
    if (!trackDur) return;
    const r = cueTrack.getBoundingClientRect();
    seek(Math.max(0, (e.clientX - r.left) / r.width * trackDur - 1));
  });
  cueTrack.addEventListener("keydown", e => {
    if (!trackDur || !ready) return;
    const step = e.shiftKey ? 15 : 5;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      seek(Math.max(0, now() - step));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      seek(Math.min(DUR(), now() + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      seek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      seek(DUR());
    }
  });

  function update() {
    if (!S || songV.hidden) return null;
    const t = now(), playing = isPlaying();
    paintCueMore(t);
    sTitleEl.classList.toggle("spinning", playing);
    if (SING.length) { singPrev.disabled = singAt(-1, t) == null; singNext.disabled = singAt(1, t) == null; }
    const started = playing || t > 0, cue = cueAt(t);
    cueBox.classList.toggle("playing", playing); cueBox.classList.toggle("alerting", playing && alertOn);
    if (started && cue) {
      const key = cue.name + cue.acts.join();
      if (key !== curKey) {
        const offbeat = isOffbeat(cue.name);
        cueIcon.innerHTML = offbeat ? `<use href="#i-clap"/>` : (cue.acts.length ? `<use href="#${ACT[cue.acts[0]].icon}"/>` : "");
        cueBox.className = "cue" + (cue.listen ? " idle" : offbeat ? " a-clap" : (cue.acts.length ? " a-" + mainAct(cue.acts) : "")) + (playing ? " playing" : "") + (playing && alertOn ? " alerting" : "");
        if (offbeat) {
          cueName.innerHTML = `<span class="cue-offbeat-title">${T("反拍拍手")}</span><span class="cue-offbeat-pattern"><b>1${T("空")}</b><b class="clap">2${T("拍")}</b><b>3${T("空")}</b><b class="clap">4${T("拍")}</b></span>`;
          cueHow.textContent = T("第 2、4 拍拍手（口訣：空・拍・空・拍）");
        } else {
          cueName.textContent = cue.name;
          cueHow.textContent = cue.how;
        }
        if (curKey) replay(cueName.parentElement, "swap", 400);
        curKey = key;
      }
      const nx = nextChange(t);
      const nextHtml = nx ? (nx.t - t <= 5 ? T("{0} 秒後", Math.ceil(nx.t - t)) : T("下一個 {0}", fmt(nx.t))) + `<b class="a-${mainAct(nx.acts)}">${esc(nx.name)}</b>` : "";
      if (nextHtml !== lastCueNextHtml) { cueNext.innerHTML = nextHtml; lastCueNextHtml = nextHtml; }
    } else if (started) {
      // 第一句之前的前奏：先空著，顯示下一個動作；整首沒有時間軸的新歌：不要一直停在「按播放開始」
      const key = LINES.length ? "intro" : "free";
      if (key !== curKey) {
        cueIcon.innerHTML = "";
        cueBox.className = "cue idle" + (playing ? " playing" : "") + (playing && alertOn ? " alerting" : "");
        cueName.textContent = LINES.length ? "" : T("自由跟著節奏"); cueHow.textContent = LINES.length ? "" : T("應援還在整理，跟著現場氣氛就好"); curKey = key;
      }
      const nx = LINES.length && nextChange(t);
      const nextHtml = nx ? (nx.t - t <= 5 ? T("{0} 秒後", Math.ceil(nx.t - t)) : T("下一個 {0}", fmt(nx.t))) + `<b class="a-${mainAct(nx.acts)}">${esc(nx.name)}</b>` : "";
      if (nextHtml !== lastCueNextHtml) { cueNext.innerHTML = nextHtml; lastCueNextHtml = nextHtml; }
    }
    const li = lineAt(t);
    if (started && li !== curLine && lineEls.length) {
      const cx = S && currentVideoSource(S) !== "live" ? CLIMAX[S.id] : null;
      const isClimax = cx != null && (t >= cx - 2.5 && t <= cx + 28);
      const pastUntil = li >= 0 ? li : nextIdxAt(t);
      lineEls.forEach((e, i) => {
        const isNow = i === li;
        e.classList.toggle("now", isNow);
        if (isNow) e.setAttribute("aria-current", "true");
        else e.removeAttribute("aria-current");
        e.classList.toggle("past", i < pastUntil);
        e.classList.toggle("climax-surge", isNow && isClimax);
      });
      box.classList.toggle("has-now", li >= 0);
      if (OPT.karaoke && maxLitLine >= 0 && (li < curLine || (li >= 0 && maxLitLine > li) || (li < 0 && pastUntil <= maxLitLine))) {
        const clearFrom = li >= 0 ? li + 1 : Math.max(0, pastUntil);
        for (let i = clearFrom; i <= maxLitLine; i++) {
          (lineEls[i] && lineEls[i]._ks || []).forEach(k => k.classList.remove("lit"));
        }
        maxLitLine = li >= 0 ? li : Math.max(-1, pastUntil - 1);
      }
      if (li >= 0 && OPT.scroll) centerLine(lineEls[li]);
      if (li >= 0 && lineEls[li] && !reduce) {
        triggerChorusRipples(lineEls[li], LINES[li], isClimax);
      }
      curLine = li;
    } else if (!started && maxLitLine >= 0) {
      for (let i = 0; i <= maxLitLine; i++) {
        (lineEls[i] && lineEls[i]._ks || []).forEach(k => k.classList.remove("lit"));
      }
      maxLitLine = -1;
    }
    if (OPT.karaoke && li >= 0 && lineEls[li]) {
      const ks = lineEls[li]._ks || [];
      if (ks.length) {
        if (li > maxLitLine) maxLitLine = li;
        const isWordTimed = lineEls[li].dataset.karaokeSource === "word";
        if (isWordTimed) {
          ks.forEach((k) => {
            const start = k._kStart != null ? k._kStart : (k.dataset.start ? Number(k.dataset.start) : null);
            const wasLit = k.classList.contains("lit");
            const nowLit = start != null && Number.isFinite(start) && t >= start;
            k.classList.toggle("lit", nowLit);
            if (!wasLit && nowLit && k.classList.contains("sung") && !reduce && playing && Math.abs(t - lastUpdateT) < 0.35) {
              spawnGlyphWave(k);
            }
          });
        } else {
          const end = lineEnd(li), frac = Math.max(0, Math.min(1, (t - LINES[li].t) / Math.max(.5, (end - LINES[li].t) * .9)));
          const lit = Math.round(frac * ks.length);
          ks.forEach((k, i) => {
            const wasLit = k.classList.contains("lit");
            const nowLit = i < lit;
            k.classList.toggle("lit", nowLit);
            if (!wasLit && nowLit && k.classList.contains("sung") && !reduce && playing && Math.abs(t - lastUpdateT) < 0.35) {
              spawnGlyphWave(k);
            }
          });
        }
      }
    }
    lastUpdateT = t;
    alerts(t, playing, cue);
    return cue;
  }

  // 語言切換
  // 歌詞顯示選項：預設值 → 記在這台裝置
  const OPT = { ja: true, kana: true, zh: true, karaoke: false, sing: false, scroll: true, size: "m", blur: true, fly: true, light: true };
  try {
    const savedOpt = JSON.parse(store.get("view-opts") || "null");
    if (savedOpt && typeof savedOpt === "object" && !Array.isArray(savedOpt)) {
      ["ja", "kana", "zh", "karaoke", "sing", "scroll", "blur", "fly", "light"].forEach(k => {
        if (typeof savedOpt[k] === "boolean") OPT[k] = savedOpt[k];
      });
      if (savedOpt.size === "s" || savedOpt.size === "m" || savedOpt.size === "l") OPT.size = savedOpt.size;
    }
  } catch (e) {}
  function applyOpts() {
    box.classList.toggle("hide-ja", !OPT.ja); box.classList.toggle("hide-kana", !OPT.kana); box.classList.toggle("hide-zh", !OPT.zh);
    box.classList.toggle("karaoke", OPT.karaoke); box.classList.toggle("only-sing", OPT.sing);
    box.classList.toggle("size-s", OPT.size === "s"); box.classList.toggle("size-l", OPT.size === "l");
    box.classList.toggle("depth-focus", OPT.blur !== false);
    box.classList.toggle("fly-in", OPT.fly !== false);
    document.body.classList.toggle("no-lights", OPT.light === false);
    if (!OPT.karaoke) {
      box.querySelectorAll(".k.lit").forEach(k => k.classList.remove("lit"));
      maxLitLine = -1;
    }
    document.querySelectorAll("[data-opt]").forEach(b => b.setAttribute("aria-pressed", !!OPT[b.dataset.opt]));
    document.querySelectorAll("[data-size]").forEach(b => b.setAttribute("aria-pressed", b.dataset.size === OPT.size));
    singOnly.setAttribute("aria-pressed", OPT.sing);
    if (typeof syncPipState === "function") syncPipState();
  }
  const singOnly = document.getElementById("singOnly");
  const setOpt = (k, v) => {
    OPT[k] = v;
    store.set("view-opts", JSON.stringify(OPT));
    applyOpts();
    holdUntil = 0;
    if (k === "light") {
      idleDrawn = false;
      ensureFrame();
    }
    if (k === "karaoke" && v && S && !songV.hidden && currentVideoSource(S) === "mv" && LINES.length > 0 && (!karaokeTiming || karaokeTiming.songId !== S.id)) {
      loadKaraokeTiming(S);
    }
    if (OPT.scroll && lineEls[curLine]) centerLine(lineEls[curLine]);
  };
  singOnly.addEventListener("click", () => setOpt("sing", !OPT.sing));
  document.querySelectorAll("[data-size]").forEach(b => b.addEventListener("click", () => setOpt("size", b.dataset.size)));
  document.querySelectorAll("[data-opt]").forEach(b => b.addEventListener("click", () => setOpt(b.dataset.opt, !OPT[b.dataset.opt])));
  applyOpts();
  // 歌詞下面那一行：中文版是中譯、英文版是羅馬拼音、日文版沒有，開關的名稱跟著換
  const optSub = document.getElementById("optSub");
  if (LANG === "en") optSub.firstElementChild.textContent = T("羅馬拼音");
  if (LANG === "ja") optSub.hidden = true;
  // ── 「速覽」「顯示」「更多」「速度」選單 ──
  // 電腦：貼著按鈕浮出（非強制回應的 dialog，點外面或 Esc 關掉）；手機、平板直放、手機橫拿：從畫面底部拉出的抽屜（強制回應，點暗處、往下滑或 Esc 關掉）
  const SHEET_MQ = matchMedia("(max-width: 900px), (orientation: landscape) and (max-height: 500px)");
  const SHEETS = [
    { dlg: document.getElementById("guideDlg"), btns: ["guideBtn"] },
    { dlg: document.getElementById("dispDlg"), btns: ["dispBtn", "dockDisp"] },
    { dlg: document.getElementById("moreDlg"), btns: ["dockMore"] },
    { dlg: document.getElementById("rateDlg"), btns: ["rateBtn"] }
  ].map(x => ({ ...x, btns: x.btns.map(id => document.getElementById(id)) }));
  let sheetFrom = null, sheetOpenY = 0, sheetOpenAt = 0;
  function placeSheet(sh, btn) {
    const panel = sh.dlg.firstElementChild, r = btn.getBoundingClientRect(), w = panel.offsetWidth, h = panel.offsetHeight;
    // 對齊按鈕中間（靠近畫面邊緣時往內收）；下面放得下往下開，不然往上開（工具列在畫面下方，所以通常往上）
    // 兩邊都放不下就開在空間大的那邊，選單裡面自己捲
    panel.style.maxHeight = "";
    const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2)), below = innerHeight - r.bottom - 18, above = r.top - 18;
    const down = h <= below || (h > above && below >= above);
    if (h > (down ? below : above)) panel.style.maxHeight = (down ? below : above) + "px";
    const top = down ? r.bottom + 6 : r.top - 6 - Math.min(h, above);
    Object.assign(sh.dlg.style, { left: left + "px", top: top + "px" });
  }
  function closeSheets() { SHEETS.forEach(sh => { if (sh.dlg.open) sh.dlg.close(); }); }
  function openSheet(sh, btn) {
    const was = sh.dlg.open;
    closeSheets();
    if (was) return;
    sheetFrom = btn;
    sheetOpenY = scrollY;
    sheetOpenAt = performance.now();
    const asSheet = SHEET_MQ.matches;
    sh.dlg.classList.toggle("as-sheet", asSheet);
    sh.dlg.style.left = sh.dlg.style.top = "";
    if (asSheet) sh.dlg.showModal(); else { sh.dlg.show(); placeSheet(sh, btn); }
    sh.btns.forEach(b => b.setAttribute("aria-expanded", "true"));
    // 用鍵盤打開時焦點移到第一個可見項目
    if (!asSheet) {
      const focusable = [...sh.dlg.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled)")].find(el => el.getClientRects().length > 0);
      (focusable || sh.dlg).focus({ preventScroll: true });
    }
  }
  SHEETS.forEach(sh => {
    sh.btns.forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); openSheet(sh, b); }));
    sh.dlg.querySelectorAll(".sheet-close").forEach(btn => btn.addEventListener("click", () => sh.dlg.close()));
    sh.dlg.addEventListener("close", () => {
      sh.btns.forEach(b => b.setAttribute("aria-expanded", "false"));
      sh.dlg.classList.remove("dragging"); sh.dlg.firstElementChild.style.transform = "";
      if (sheetFrom && document.activeElement && (sh.dlg.contains(document.activeElement) || document.activeElement === document.body)) sheetFrom.focus({ preventScroll: true });
    });
    // 抽屜：點到暗處（dialog 本身，不是裡面的面板）就關
    sh.dlg.addEventListener("click", e => { if (e.target === sh.dlg) sh.dlg.close(); });
    // 抽屜：抓著上面的把手或標題往下拉，拉超過 80px 就關
    const panel = sh.dlg.firstElementChild;
    let drag = null;
    panel.addEventListener("pointerdown", e => {
      if (!sh.dlg.classList.contains("as-sheet") || !e.target.closest(".sheet-grip, .sheet-title, .card-title")) return;
      drag = { y: e.clientY, id: e.pointerId };
      try { panel.setPointerCapture(e.pointerId); } catch (err) {}
      sh.dlg.classList.add("dragging");
    });
    panel.addEventListener("pointermove", e => { if (drag && e.pointerId === drag.id) panel.style.transform = `translateY(${Math.max(0, e.clientY - drag.y)}px)`; });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y; drag = null; sh.dlg.classList.remove("dragging");
      if (dy > 80) sh.dlg.close(); else panel.style.transform = "";
    };
    panel.addEventListener("pointerup", end);
    panel.addEventListener("pointercancel", end);
  });
  // 浮出的選單：點外面、按 Esc、Tab 離開、捲動或改變視窗大小就關
  document.addEventListener("click", e => SHEETS.forEach(sh => { if (sh.dlg.open && !sh.dlg.classList.contains("as-sheet") && !sh.dlg.contains(e.target)) sh.dlg.close(); }));
  document.addEventListener("focusin", e => SHEETS.forEach(sh => {
    if (sh.dlg.open && !sh.dlg.classList.contains("as-sheet") && !sh.dlg.contains(e.target) && !sh.btns.includes(e.target)) sh.dlg.close();
  }));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      const sh = SHEETS.find(x => x.dlg.open && !x.dlg.classList.contains("as-sheet"));
      if (!sh) return;
      e.stopImmediatePropagation(); sh.dlg.close();
    } else if (e.key === "Tab") {
      const sh = SHEETS.find(x => x.dlg.open && !x.dlg.classList.contains("as-sheet"));
      if (!sh) return;
      const focusables = [...sh.dlg.querySelectorAll("button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])")].filter(el => el.getClientRects().length > 0);
      if (!focusables.length) { sh.dlg.close(); return; }
      const first = focusables[0], last = focusables[focusables.length - 1];
      if ((e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
        sh.dlg.close();
      }
    }
  }, true);
  addEventListener("scroll", () => {
    if (performance.now() - sheetOpenAt <= 150 || Math.abs(scrollY - sheetOpenY) <= 8) return;
    SHEETS.forEach(sh => { if (sh.dlg.open && !sh.dlg.classList.contains("as-sheet")) sh.dlg.close(); });
  }, { passive: true });
  addEventListener("resize", () => SHEETS.forEach(sh => { if (sh.dlg.open && sh.dlg.classList.contains("as-sheet") !== SHEET_MQ.matches) sh.dlg.close(); }));
  // 選單裡的動作（分享、回報、沉浸模式這些）做完就收起來；開關類的（日文、卡拉OK…）留著，可以連續切
  document.querySelectorAll("#moreDlg button:not([aria-pressed]), #moreDlg a, #toolImmersiveMenuBtn, #toolPipMenuBtn, #rateDlg [data-rate]").forEach(el => el.addEventListener("click", () => setTimeout(closeSheets, 0)));

  // ── 練習工具 ──
  // 優先級判斷：現場影片 (Live Video) > MV > 演唱會音源 (Live Audio)；有現場影片時預設 Live 優先
  const preferLiveStored = store.get("tool-prefer-live");
  const preferLiveDefault = preferLiveStored === null ? true : preferLiveStored === "1";
  const TOOL = { click: store.get("tool-click") === "1", autonext: store.get("tool-autonext") === "1", shuffle: store.get("tool-shuffle") === "1", related: store.get("tool-related") === "1" && store.get("tool-shuffle") !== "1", lamp: store.get("tool-lamp") === "1", "prefer-live": preferLiveDefault };

  // ── 隨機播放：下一首（按鈕、播完自動下一首、歌詞小窗的下一首）照洗過的順序走，全部輪過一次才會重複；上一首回到剛剛聽的那首 ──
  // 洗好的順序和聽過的紀錄只記在這個分頁（sessionStorage），關掉分頁就重來
  const shufList = k => { try { return JSON.parse(session.get(k) || "[]").filter(id => BY[id]); } catch (e) { return []; } };
  function shuffleNext(s) {
    let q = shufList("shuffle-queue").filter(id => id !== s.id);
    if (!q.length) {
      q = SONGS.map(x => x.id).filter(id => id !== s.id);
      for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    }
    session.set("shuffle-queue", JSON.stringify(q));
    return BY[q[0]];
  }
  // 聽過的順序：往回走（按上一首）時退一格，不然接在後面
  function shuffleSeen(s) {
    if (!TOOL.shuffle && !TOOL.related) return;
    const h = shufList("shuffle-hist");
    if (h[h.length - 2] === s.id) h.pop(); else if (h[h.length - 1] !== s.id) h.push(s.id);
    session.set("shuffle-hist", JSON.stringify(h.slice(-80)));
    session.set("shuffle-queue", JSON.stringify(shufList("shuffle-queue").filter(id => id !== s.id)));
  }
  function navTargets(s) {
    if (!TOOL.shuffle && !TOOL.related && activePlayList && activePlayList.length) {
      const idx = activePlayList.indexOf(s.id);
      if (idx >= 0) {
        return [BY[activePlayList[idx - 1]] || null, BY[activePlayList[idx + 1]] || null];
      }
    }
    const seq = ordered(), at = seq.indexOf(s);
    if (!TOOL.shuffle && !TOOL.related) return [seq[at - 1], seq[at + 1]];
    const h = shufList("shuffle-hist"), prev = h[h.length - 1] === s.id ? BY[h[h.length - 2]] : null;
    if (TOOL.shuffle) return [prev, shuffleNext(s)];
    // 接關聯曲：這個分頁還沒聽過的關聯曲先接；都聽過了就照首頁順序往下
    const r = relNext(s);
    return [prev, r ? r.s : seq[at + 1] || seq[0], r ? r.why : ""];
  }
  // 下一首按鈕指向哪首、為什麼（接關聯曲時換到那首會跳提示）
  let nextUp = null;
  function paintNav(s) {
    const [prev, next, why] = navTargets(s);
    nextUp = next ? { id: next.id, why } : null;
    const nextWord = TOOL.shuffle ? T("下一首（隨機）") : TOOL.related ? T("下一首（關聯曲）") : T("下一首");
    [["prevSong", prev, T("上一首")], ["nextSong", next, nextWord]].forEach(([id, x, word]) => {
      const a = document.getElementById(id);
      if (x) {
        a.setAttribute("href", songHref(x.id));
        a.setAttribute("aria-label", `${word}：${x.ja}`);
        a.removeAttribute("aria-disabled");
        a.title = `${word}：${x.ja}${id === "nextSong" && why ? `（${why}）` : ""}`;
      } else {
        a.removeAttribute("href");
        a.removeAttribute("title");
        a.setAttribute("aria-label", word);
        a.setAttribute("aria-disabled", "true");
      }
    });
    const nb = document.getElementById("nextSong");
    nb.classList.toggle("is-shuffle", TOOL.shuffle);
    nb.classList.toggle("is-related", TOOL.related);
  }

  // ── 關聯曲：同一位作詞／作曲／編曲者、同一部作品（songs.js 的 CREDIT、SERIES） ──
  // 名字後面括號裡的團名只顯示，比對時拿掉
  const credKey = SHARED.credKey || (n => n.replace(/\s*\(.*\)\s*$/, "").trim());
  const credHas = SHARED.credHas || ((s, part, key) => !!(s.credit && (s.credit[part] || []).some(n => credKey(n) === key)));
  function credRole(s, key) {
    if (SHARED.credRole) return SHARED.credRole(s, key, T);
    const w = credHas(s, "w", key), c = credHas(s, "c", key);
    return w && c ? T("詞曲") : w ? T("作詞") : c ? T("作曲") : credHas(s, "a", key) ? T("編曲") : "";
  }
  const relCache = {};
  function relatedOf(s) {
    if (relCache[s.id]) return relCache[s.id];
    if (SHARED.relatedOf) return (relCache[s.id] = SHARED.relatedOf(s, SONGS, SERIES, T));
    const groups = [], c = s.credit;
    if (c) {
      const names = [...c.w || [], ...c.c || [], ...c.a || []], keys = [...new Set(names.map(credKey))];
      keys.forEach(key => {
        const songs = SONGS.filter(x => x !== s && ["w", "c", "a"].some(p => credHas(x, p, key)));
        if (songs.length) groups.push({ kind: "who", name: names.find(n => credKey(n) === key), role: credRole(s, key), songs: songs.map(x => ({ s: x, role: credRole(x, key) })) });
      });
    }
    SERIES.forEach(g => {
      if (!g.ids.includes(s.id)) return;
      const songs = g.ids.filter(id => id !== s.id && BY[id]).map(id => ({ s: BY[id], role: "" }));
      if (songs.length) groups.push({ kind: "work", name: T(g.name), songs });
    });
    return relCache[s.id] = groups;
  }
  // 理由寫成一句：「同為 てにをは 的作品」「同一部作品：《…》」
  const relWhy = g => g.kind === "who" ? T("同為 {0} 的作品", credKey(g.name)) : T("同一部作品：{0}", g.name);
  function relNext(s) {
    const heard = new Set(shufList("shuffle-hist"));
    for (const g of relatedOf(s)) for (const r of g.songs) if (!heard.has(r.s.id)) return { s: r.s, why: relWhy(g) };
    return null;
  }
  function relHtml(s) {
    return relatedOf(s).map(g => `<div class="rel-g"><p class="rel-h"><b${g.kind === "who" ? ' lang="ja"' : ""}>${esc(g.name)}</b><small>${g.kind === "who" ? T("這首的{0}", esc(g.role)) : T("同一部作品")}</small></p><ul class="rel-list">${g.songs.map(({ s: x, role }) =>
      `<li><a class="rel-link" href="${songHref(x.id)}" data-id="${x.id}">${thumb(x, 64, 36, true)}<span class="rel-t"><b lang="ja">${esc(x.ja)}</b>${role || x.cover ? `<small>${[role, x.cover ? T("翻唱") : ""].filter(Boolean).join("・")}</small>` : ""}</span></a></li>`).join("")}</ul></div>`).join("");
  }
  const extIco = `<svg class="ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  function paintRelated(s) {
    const groups = relatedOf(s), n = new Set(groups.flatMap(g => g.songs.map(r => r.s.id))).size;
    // 速覽卡：詞曲、關聯曲、本站沒收的同作者作品（建置出來的歌曲頁沒有這塊，第一次用到時補上）
    const card = document.getElementById("songGuideCard");
    if (!card) return;
    let more = document.getElementById("cardMore");
    if (!more) { more = document.createElement("div"); more.id = "cardMore"; card.appendChild(more); }
    const c = s.credit, who = list => list.map(n => `<span lang="ja">${esc(n)}</span>`).join("、");
    const rows = !c ? [] : [[T("作詞"), c.w], [T("作曲"), c.c], [T("編曲"), c.a]].filter(([, v]) => v && v.length).map(([k, v]) => `<dt>${k}</dt><dd>${who(v)}</dd>`);
    if (c && c.x && c.x.length) rows.push(`<dt>${T("延伸聽")}</dt><dd><span class="card-note">${T("本站還沒收、Ado 也唱過的同作者作品")}</span>${c.x.map(t => `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent("Ado " + t)}" target="_blank" rel="noopener" class="live-chip" lang="ja">${esc(t)} ${extIco}</a>`).join(" ")}</dd>`);
    const relHtmlStr = (rows.length ? `<dl class="card-dl card-credit">${rows.join("")}</dl>` : "")
      + (n ? `<section class="rel-block" aria-label="${esc(T("關聯曲"))}"><h4 class="rel-title">${T("關聯曲")}<small>${T("同一位創作者、同一部作品，點了直接換歌")}</small></h4>${relHtml(s)}</section>` : "");
    more.innerHTML = relHtmlStr;
    const inlineEl = document.getElementById("songGuideInline");
    if (inlineEl && inlineEl.dataset.song !== s.id) {
      inlineEl.dataset.song = s.id;
      const dn = otherName(s), p = penOf(s), tipText = s.tips && s.tips.length ? s.tips.join(T("；")) : (s.free ? T("沒有固定應援，自由跟著節奏搖手燈。") : T("應援還在整理，先熟悉旋律。"));
      const cloned = card.cloneNode(true);
      cloned.removeAttribute("id");
      cloned.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
      const h3 = cloned.querySelector(".card-title"); if (h3) h3.remove();
      const dateStr = LANG === "en" ? (s.date || "") : (s.date || "").replace(/-/g, "/");
      const metaParts = s.upcoming
        ? [LANG === "en" ? `Scheduled ${dateStr}` : LANG === "ja" ? `${dateStr} リリース予定` : `預計 ${dateStr} 發行`, s.len].filter(Boolean)
        : [dateStr, s.len].filter(Boolean);
      const lead = LANG === "en"
        ? `Ado's "${dn || s.ja}"${dn ? ` (${s.ja})` : ""}${metaParts.length ? ` (${metaParts.join(", ")})` : ""}. ${p.none ? "No fixed penlight color; use Ado's blue." : `Recommended penlight: ${p.keys.map(penName).join(", ")}.`} ${tipText}`
        : LANG === "ja"
        ? `「${s.ja}」${metaParts.length ? `（${metaParts.join("・")}）` : ""}。${p.none ? "ペンライト色指定なし（青）。" : `おすすめペンライト：${p.keys.map(penName).join("・")}。`}${tipText}`
        : `〈${s.ja}〉${dn ? `（${dn}）` : ""}${metaParts.length ? `（${metaParts.join("・")}）` : ""}。${p.none ? "手燈未指定固定顏色，建議切換為 Ado 代表色藍色。" : `推薦手燈：${p.keys.map(penName).join("、")}。`}${tipText}`;
      inlineEl.innerHTML = `<h2 class="guide-inline-h">${T("〈{0}〉應援速覽", `${esc(s.ja)}${dn ? `（${esc(dn)}）` : ""}`)}</h2><p class="guide-inline-lead">${esc(lead)}</p>`;
      inlineEl.appendChild(cloned);
    }
  }
  // 點關聯曲：跟上一首、下一首一樣，在歌曲獨立頁不重新載入整頁
  document.addEventListener("click", ev => {
    const a = ev.target.closest("a.rel-link");
    if (!a) return;
    const d = a.closest("details"); if (d) d.open = false;
    if (a.closest("#guideDlg")) closeSheets();
    if (!PAGE_SONG || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    ev.preventDefault();
    goSong(a.dataset.id);
  });
  const paintTools = () => document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", TOOL[b.dataset.tool]));

  // ── 沉浸模式 (Folia Immersive Stage) ──
  const ambientMesh = document.getElementById("ambientMesh");
  const toolImmersive = document.getElementById("tool-immersive");
  const toolImmersiveMenuBtn = document.getElementById("toolImmersiveMenuBtn");
  const songbar = document.querySelector(".songbar"), dockEl = document.getElementById("dock");
  let isImmersive = false;
  let songbarHideTimer = null;

  function updateAmbientColors(s) {
    if (!s) return;
    const p = penOf(s);
    const cols = p && p.cols && p.cols.length ? p.cols : ["#5d9dfe", "#ff4a5a"];
    if (cueFrame) {
      cueFrame.style.setProperty("--c1", cols[0]);
      cueFrame.style.setProperty("--c2", cols[1 % cols.length]);
    }
    if (!ambientMesh) return;
    // 設在 body：場館光暈、舞台螢幕的光、字幕發光都用這首的手燈色
    document.body.style.setProperty("--mesh-c1", cols[0]);
    document.body.style.setProperty("--mesh-c2", cols[1] || cols[0]);
    if (venue) venue.setPen(cols);
  }

  function resetSongbarAutohide() {
    if (!isImmersive || !songbar) return;
    [songbar, dockEl].forEach(el => el.classList.remove("autohide"));
    clearTimeout(songbarHideTimer);
    songbarHideTimer = setTimeout(() => {
      if (isImmersive && !SHEETS.some(sh => sh.dlg.open)) [songbar, dockEl].forEach(el => el.classList.add("autohide"));
    }, 3500);
  }

  // 開關沉浸模式：先熄燈（黑幕淡入），換版面，再亮出舞台螢幕；離開時像場燈亮起。instant：回首頁時直接關
  let immBusy = false;
  let immVeil = null, immVeilAnim = null, immIntroAnims = [], immIntroTimer = null, immCenterTimer = null;
  function cancelImmersiveAnims() {
    clearTimeout(immIntroTimer); immIntroTimer = null;
    clearTimeout(immCenterTimer); immCenterTimer = null;
    if (immIntroAnims.length) {
      immIntroAnims.forEach(a => { try { if (a) a.cancel(); } catch (e) {} });
      immIntroAnims = [];
    }
    if (immVeilAnim) { try { immVeilAnim.cancel(); } catch (e) {} immVeilAnim = null; }
    if (immVeil) { immVeil.remove(); immVeil = null; }
  }
  const veilFade = (el, from, to, ms) => {
    immVeilAnim = el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: to ? "cubic-bezier(.4, 0, 1, 1)" : "cubic-bezier(0, 0, .2, 1)", fill: "forwards" });
    return immVeilAnim.finished.catch(() => {});
  };
  async function setImmersive(on, instant) {
    if (instant) {
      cancelImmersiveAnims();
      immBusy = false;
    }
    if (isImmersive === on || (immBusy && !instant)) return;
    isImmersive = on;
    [toolImmersive, toolImmersiveMenuBtn].forEach(b => b && b.setAttribute("aria-pressed", isImmersive));
    const veil = !reduce && !instant ? document.body.appendChild(Object.assign(document.createElement("div"), { className: "imm-veil" })) : null;
    if (veil) { immVeil = veil; immBusy = true; await veilFade(veil, 0, 1, on ? 260 : 180); }
    if (isImmersive !== on) { if (veil) { veil.remove(); if (immVeil === veil) immVeil = null; } immBusy = false; return; }
    document.body.classList.toggle("immersive-mode", isImmersive);
    syncThemeColor();
    padEnd();
    if (isImmersive) {
      updateAmbientColors(S);
      ensureFrame();
      ensureVenue().then(() => requestAnimationFrame(venueLayout));
      toast(T("✨ 已開啟沉浸播放模式（按 Esc 或 F 退出）"));
      resetSongbarAutohide();
      // 舞台螢幕開機：從全黑淡入，提示和字幕隨後浮上來
      // 影片框不用 filter：iPhone 上 YouTube 影片的父層套 filter 可能整個畫不出來。
      // iPhone Safari 的 delay + fill: backwards 動畫偶爾停在透明的第一格，時間到了一律取消，保證看得到
      if (!reduce) {
        const ease = "cubic-bezier(.2, .7, .2, 1)";
        const intro = [mvEl?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, delay: 200, easing: ease, fill: "backwards" })];
        [cueBox, document.querySelector("#song .lyrics")].forEach((el, i) => el && intro.push(el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 800, delay: 650 + i * 70, easing: ease, fill: "backwards" })));
        immIntroAnims = intro;
        immIntroTimer = setTimeout(() => { intro.forEach(a => a && a.cancel()); immIntroAnims = []; }, 1800);
      }
    } else {
      cancelImmersiveAnims();
      [songbar, dockEl].forEach(el => el && el.classList.remove("autohide"));
      clearTimeout(songbarHideTimer);
      document.body.classList.remove("imm-crowd", "has-venue");
      if (ambientMesh) ambientMesh.style.setProperty("--beat-hit", "0");
      if (mvEl) mvEl.style.setProperty("--beat-hit", "0");
      disposeVenue();
    }
    if (curLine >= 0 && lineEls[curLine]) immCenterTimer = setTimeout(() => centerLine(lineEls[curLine]), 80);
    if (veil) { await veilFade(veil, 1, 0, on ? 700 : 380); veil.remove(); if (immVeil === veil) immVeil = null; immBusy = false; }
  }

  // ── 3D 場館（assets/stage3d.js，原始碼在 tools/stage3d）：第一次開沉浸模式才載入 ──
  // 減少動態、沒有 WebGL、載入失敗：照舊用 2D 的燈光畫布
  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", e => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  function venueLayout() {
    if (!venue || !isImmersive) return;
    const cv = document.getElementById("venue"), scr = document.getElementById("screen");
    if (!cv || !scr) return;
    venue.layout(scr.getBoundingClientRect(), cv.clientWidth, cv.clientHeight);
  }
  function disposeVenue() {
    if (venueRO) { try { venueRO.disconnect(); } catch (e) {} venueRO = null; }
    if (venueResizeHandler) { removeEventListener("resize", venueResizeHandler); venueResizeHandler = null; }
    const cv = document.getElementById("venue");
    if (venue && typeof venue.dispose === "function") { try { venue.dispose(); } catch (e) {} }
    if (cv) {
      try {
        const gl = cv.getContext("webgl2") || cv.getContext("webgl");
        const ext = gl && gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      } catch (e) {}
      cv.remove();
    }
    venue = null;
    venueP = null;
    document.body.classList.remove("has-venue");
  }
  function ensureVenue() {
    if (reduce) return Promise.resolve(null);
    if (!venueP) {
      const app = document.querySelector('script[src*="app.js"]');
      const stage3dV = document.documentElement.dataset.stage3d;
      const query = stage3dV ? `?v=${encodeURIComponent(stage3dV)}` : (app ? new URL(app.src).search : "");
      const url = new URL("assets/stage3d.js" + query, app ? app.src : location.href).href;
      venueP = import(url).then(m => {
        if (!isImmersive || songV.hidden) { venueP = null; return null; }
        let cv = document.getElementById("venue");
        if (!cv) {
          cv = document.createElement("canvas");
          cv.id = "venue"; cv.setAttribute("aria-hidden", "true");
          document.body.insertBefore(cv, document.getElementById("fx"));
        }
        venue = m.createVenue(cv, { mobile: matchMedia("(max-width: 900px), (pointer: coarse)").matches });
        if (S) venue.setPen(penOf(S).cols);
        if (/[?&]debug3d(&|$)/.test(location.search)) window.__venue = venue;
        cv.addEventListener("webglcontextlost", e => { e.preventDefault(); disposeVenue(); });
        venueResizeHandler = () => requestAnimationFrame(venueLayout);
        addEventListener("resize", venueResizeHandler);
        venueRO = new ResizeObserver(() => venueLayout());
        const scr = document.getElementById("screen");
        if (scr) venueRO.observe(scr);
        return venue;
      }).catch(err => {
        console.warn("3D venue unavailable", err);
        venueP = null;
        return null;
      });
    }
    return venueP;
  }

  function toggleImmersive() {
    if (!S || songV.hidden) return;
    setImmersive(!isImmersive);
  }

  if (toolImmersive) toolImmersive.addEventListener("click", toggleImmersive);
  if (toolImmersiveMenuBtn) {
    toolImmersiveMenuBtn.addEventListener("click", toggleImmersive);
  }

  // ── 歌詞子母畫面小窗 (Lyrics Document Picture-in-Picture & Fallback) ──
  const stripFurigana = s => (s || "").replace(/([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g, "$1");
  const toolPipBtn = document.getElementById("toolPipBtn");
  const toolPipMenuBtn = document.getElementById("toolPipMenuBtn");

  const PIP_STYLES = `
    html, body {
      width: 100%; height: 100%; margin: 0; overflow: hidden;
      background: var(--ground, #04060c); color: var(--text, #f8fafc);
      font-family: var(--font, system-ui, -apple-system, sans-serif);
      user-select: none;
    }
    [hidden] { display: none !important; }
    .document-pip {
      box-sizing: border-box; position: relative;
      display: flex !important; flex-direction: column; gap: 0;
      width: 100%; height: 100%; min-height: 100%; padding: 0;
      overflow: hidden; background: var(--ground, #04060c);
      color: var(--text, #f8fafc);
    }
    .document-pip .pip-progress {
      position: absolute; inset: 0 0 auto; z-index: 2; height: 3px;
      overflow: hidden; background: var(--surface, #121829);
      pointer-events: none;
    }
    .document-pip .pip-progress-fill {
      position: absolute; inset: 0 auto 0 0; width: 100%;
      background: var(--accent, #02b4f5);
      transform: scaleX(0); transform-origin: left center;
      transition: transform .1s linear;
      box-shadow: 0 0 8px var(--accent, #02b4f5);
    }
    .document-pip .pip-controls {
      flex: none; display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px;
      align-items: center; gap: 8px; min-width: 0; min-height: 64px;
      padding: 12px 18px 4px; box-sizing: border-box;
    }
    .document-pip .pip-track-controls {
      display: flex; align-items: center; min-width: 0; height: 44px;
      overflow: hidden; border-radius: 999px;
      background: var(--surface, #121829);
      border: 1px solid var(--line, rgba(255, 255, 255, 0.1));
    }
    .document-pip .pip-song-label {
      flex: 1 1 auto; min-width: 0; height: 44px; display: flex;
      align-items: center; justify-content: center; gap: 8px; padding: 0 6px;
    }
    .document-pip .pip-song-number {
      flex: none; color: var(--accent, #02b4f5); font-size: 13px;
      font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap;
    }
    .document-pip .pip-title {
      min-width: 0; overflow: hidden; color: var(--text, #f8fafc);
      font-size: 14.5px; font-weight: 600; line-height: 1.35;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .document-pip .pip-action {
      width: 44px; min-width: 44px; height: 44px; min-height: 44px;
      display: inline-flex; align-items: center; justify-content: center;
      padding: 0; border: 0; border-radius: 50%;
      background: var(--surface, #121829);
      border: 1px solid var(--line, rgba(255, 255, 255, 0.1));
      color: var(--text, #f8fafc); font: inherit; cursor: pointer;
      transition: background .15s, border-color .15s, color .15s;
    }
    .document-pip .pip-controls > .pip-action { flex: none; }
    .document-pip .pip-track-controls .pip-action {
      width: 36px; min-width: 36px; height: 36px; min-height: 36px;
      margin: 4px; background: transparent; border: 0;
      color: var(--muted, #94a3b8);
    }
    .document-pip .pip-action:hover {
      background: var(--raised, #1a2238); color: var(--accent, #02b4f5);
      border-color: var(--accent, #02b4f5);
    }
    .document-pip .pip-action svg {
      flex: none; width: 18px; height: 18px; fill: none;
      stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }
    .document-pip .pip-lyrics {
      flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center;
      min-height: 0; overflow: hidden; padding: 0 18px 8px;
    }
    .document-pip .pip-line-group { min-width: 0; }
    .document-pip .pip-current-line, .document-pip .pip-next-line { min-width: 0; }
    .document-pip .pip-empty {
      margin: 0; padding: 12px 9px; border-radius: 8px;
      color: var(--muted, #94a3b8); font-size: 13.5px; line-height: 1.45; text-align: center;
    }
    .document-pip .ln {
      width: 100%; box-sizing: border-box; display: flex; flex-direction: column;
      align-items: flex-start; gap: 3px; margin: 0; padding: 6px 12px;
      border-radius: 10px; background: transparent; color: var(--text, #f8fafc);
      cursor: default; pointer-events: none; text-align: left;
      border-left: 3px solid transparent;
    }
    .document-pip .pip-current-line .ln {
      min-height: 52px; border-left: 3px solid var(--accent, #02b4f5);
      background: color-mix(in srgb, var(--text, #fff) 6%, transparent);
    }
    .document-pip .pip-current-line .ja {
      font-size: clamp(15px, 3.8vw, 19px); font-weight: 700; line-height: 1.35; color: var(--text, #f8fafc);
    }
    .document-pip .pip-current-line .ja ruby { ruby-position: over; }
    .document-pip .pip-current-line .ja rt { font-size: 10px; color: var(--faint, #64748b); font-weight: normal; }
    .document-pip .pip-current-line .zh {
      font-size: clamp(12px, 2.8vw, 14px); color: var(--muted, #94a3b8); line-height: 1.3;
    }
    .document-pip .pip-next-line { margin-top: 4px; opacity: .52; }
    .document-pip .pip-next-line .ln { padding: 4px 12px; }
    .document-pip .pip-next-line .ja {
      font-size: clamp(11.5px, 2.7vw, 13.5px); line-height: 1.3; color: var(--muted, #94a3b8);
    }
    .document-pip .pip-next-line .zh {
      font-size: clamp(10.5px, 2.4vw, 12px); color: var(--faint, #64748b); line-height: 1.3;
    }
    .document-pip .acts { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
    .document-pip .acts svg { width: 14px; height: 14px; }
    .document-pip .call { font-size: 11px; padding: 1px 6px; border-radius: 999px; margin-left: 6px; }
  `;

  function copyStylesToPip(targetDoc) {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
      const s = targetDoc.createElement("link");
      s.rel = "stylesheet";
      s.href = l.href;
      targetDoc.head.appendChild(s);
    });
    document.querySelectorAll("style").forEach(st => {
      targetDoc.head.appendChild(st.cloneNode(true));
    });
    const extra = targetDoc.createElement("style");
    extra.textContent = PIP_STYLES;
    targetDoc.head.appendChild(extra);
  }

  function copySvgIconsToPip(targetDoc) {
    const sprite = document.querySelector("body > svg");
    if (sprite) {
      targetDoc.body.appendChild(sprite.cloneNode(true));
    }
  }

  function updatePipButtonStates(active) {
    isPipActive = active;
    [toolPipBtn, toolPipMenuBtn].forEach(b => {
      if (b) b.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncPipState() {
    if (!pipWin || pipWin.closed) return;
    const doc = pipWin.document;
    doc.documentElement.lang = document.documentElement.lang || "zh-Hant-TW";
    if (document.documentElement.dataset.theme) {
      doc.documentElement.dataset.theme = document.documentElement.dataset.theme;
    } else {
      delete doc.documentElement.dataset.theme;
    }
    const mainEl = pipEls ? pipEls.main : doc.querySelector("main.document-pip");
    if (mainEl) {
      mainEl.classList.toggle("hide-ja", !OPT.ja);
      mainEl.classList.toggle("hide-kana", !OPT.kana);
      mainEl.classList.toggle("hide-zh", !OPT.zh);
      mainEl.classList.toggle("karaoke", !!OPT.karaoke);
      if (!OPT.karaoke && pipEls && pipEls.curKs) {
        pipEls.curKs.forEach(k => k.classList.remove("lit"));
      }
    }
  }

  async function openDocPip() {
    if (pipWin && !pipWin.closed) {
      pipWin.close();
      pipWin = null;
      pipEls = null;
      updatePipButtonStates(false);
      return;
    }

    try {
      pipWin = await window.documentPictureInPicture.requestWindow({
        width: 450,
        height: 225
      });
    } catch (err) {
      pipWin = null;
      pipEls = null;
      // requestWindow 失敗通常已用掉這次點擊的授權，授權還在才試備援，不然備援一定被擋
      if (navigator.userActivation && navigator.userActivation.isActive) {
        console.warn("documentPictureInPicture failed, falling back to Canvas PiP:", err);
        return openCanvasPip();
      }
      // 這台瀏覽器的新式小窗不能用：之後改走畫布備援，先把影片準備好讓下一次點擊直接成功
      console.warn("documentPictureInPicture failed:", err);
      docPipFailed = true;
      prepCanvasPip();
      toast(document.pictureInPictureEnabled ? T("無法開啟歌詞小窗，請再按一次") : T("您的瀏覽器不支援子母畫面 (Picture-in-Picture) 功能"));
      return;
    }

    updatePipButtonStates(true);
    lastPipLine = -2;
    lastPipPlayState = null;
    lastPipSongNo = -1;
    lastPipPct = -1;

    pipWin.addEventListener("pagehide", () => {
      pipWin = null;
      pipEls = null;
      updatePipButtonStates(false);
    });

    const doc = pipWin.document;
    doc.documentElement.lang = document.documentElement.lang || "zh-Hant-TW";
    doc.title = `${T("歌詞小窗")}｜${S ? S.ja : T("Ado 應援指南")}`;

    copyStylesToPip(doc);
    copySvgIconsToPip(doc);

    const mainEl = doc.createElement("main");
    mainEl.className = "document-pip song-page";
    mainEl.innerHTML = `
      <div class="pip-progress" role="progressbar" aria-label="${esc(T("播放進度"))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span class="pip-progress-fill"></span>
      </div>
      <header class="pip-controls" aria-label="${esc(T("字幕窗控制"))}">
        <button type="button" class="pip-action pip-return" title="${esc(T("返回主頁"))}" aria-label="${esc(T("返回主頁"))}">
          <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        <div class="pip-track-controls" role="group" aria-label="${esc(T("切換歌曲"))}">
          <button type="button" class="pip-action pip-prev" title="${esc(T("上一首"))}" aria-label="${esc(T("上一首"))}">
            <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6"/></svg>
          </button>
          <div class="pip-song-label" aria-live="polite">
            <span class="pip-song-number"></span>
            <span class="pip-title"></span>
          </div>
          <button type="button" class="pip-action pip-next" title="${esc(T("下一首"))}" aria-label="${esc(T("下一首"))}">
            <svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6"/></svg>
          </button>
        </div>
        <button type="button" class="pip-action pip-play" title="${esc(T("播放"))}" aria-label="${esc(T("播放主頁影片"))}">
          <svg class="icon-play" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg class="icon-pause" viewBox="0 0 24 24" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
      </header>
      <section class="pip-lyrics" aria-label="${esc(T("同步歌詞"))}">
        <div class="pip-line-group pip-current-group">
          <div class="pip-current-line"></div>
        </div>
        <div class="pip-line-group pip-next-group">
          <div class="pip-next-line"></div>
        </div>
      </section>
    `;
    doc.body.appendChild(mainEl);

    const playBtn = mainEl.querySelector(".pip-play");
    pipEls = {
      main: mainEl,
      progressBar: mainEl.querySelector(".pip-progress"),
      fill: mainEl.querySelector(".pip-progress-fill"),
      noEl: mainEl.querySelector(".pip-song-number"),
      titleEl: mainEl.querySelector(".pip-title"),
      playBtn,
      playSvg: playBtn.querySelector(".icon-play"),
      pauseSvg: playBtn.querySelector(".icon-pause"),
      curContainer: mainEl.querySelector(".pip-current-line"),
      nextContainer: mainEl.querySelector(".pip-next-line"),
      nextGroup: mainEl.querySelector(".pip-next-group"),
      curKs: []
    };
    syncPipState();

    mainEl.querySelector(".pip-return").addEventListener("click", () => {
      try { window.focus(); } catch (e) {}
    });
    mainEl.querySelector(".pip-prev").addEventListener("click", () => {
      const prev = document.getElementById("prevSong");
      if (prev && prev.getAttribute("href")) prev.click();
    });
    mainEl.querySelector(".pip-next").addEventListener("click", () => {
      const next = document.getElementById("nextSong");
      if (next && next.getAttribute("href")) next.click();
    });
    playBtn.addEventListener("click", () => {
      if (isPlaying()) pause(); else play();
    });

    updatePip();
  }

  function stopCanvasPip() {
    if (!canvasPip) return;
    try { canvasPip.video.pause(); } catch (e) {}
    try {
      const stream = canvasPip.video.srcObject;
      if (stream && typeof stream.getTracks === "function") {
        stream.getTracks().forEach(tr => tr.stop());
      }
      canvasPip.video.srcObject = null;
      canvasPip.video.remove();
    } catch (e) {}
    canvasPip = null;
  }

  async function openCanvasPip() {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {});
      updatePipButtonStates(false);
      stopCanvasPip();
      return;
    }

    if (!document.pictureInPictureEnabled) {
      toast(T("您的瀏覽器不支援子母畫面 (Picture-in-Picture) 功能"));
      return;
    }

    prepCanvasPip();
    if (!canvasPip) {
      toast(T("您的瀏覽器不支援子母畫面 (Picture-in-Picture) 功能"));
      return;
    }
    lastPipLine = -2;
    const nextIdx = curLine >= 0 ? curLine + 1 : nextIdxAt(now());
    renderCanvasPip(isPlaying(), curLine >= 0 ? LINES[curLine] : null, nextIdx < LINES.length ? LINES[nextIdx] : null);

    // 先送出 PiP 請求再做其他 await，不然點擊的授權會在等待中失效
    try {
      const req = canvasPip.video.requestPictureInPicture();
      canvasPip.video.play().catch(() => {});
      await req;
      updatePipButtonStates(true);
    } catch (err) {
      console.warn("Canvas PiP request failed:", err);
      toast(T("無法開啟歌詞小窗，請再按一次"));
    }
  }

  // 沒有 Document PiP 的瀏覽器改用畫布影片：開歌曲時先把影片準備好，按下按鈕才能立刻進子母畫面
  function prepCanvasPip() {
    if (canvasPip || !document.pictureInPictureEnabled) return;
    const canvas = document.createElement("canvas");
    if (typeof canvas.captureStream !== "function") return;
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    video.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none";
    const stream = canvas.captureStream(25);
    video.srcObject = stream;
    document.body.appendChild(video);
    canvasPip = { canvas, ctx, video, stream };
    video.addEventListener("leavepictureinpicture", () => {
      updatePipButtonStates(false);
      stopCanvasPip();
    });
    renderCanvasPip(false, null, null);
    video.play().catch(() => {});
  }
  let docPipFailed = false;
  const hasDocPip = () => !docPipFailed && !!(window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === "function");

  function togglePip() {
    if (!S || songV.hidden) return;
    if (hasDocPip()) {
      openDocPip();
    } else {
      openCanvasPip();
    }
  }

  function renderCanvasPip(playing, l, nextL) {
    if (!canvasPip) return;
    const { canvas, ctx } = canvasPip;
    const w = canvas.width, h = canvas.height;

    const grad = ctx.createRadialGradient(w / 2, 0, 10, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "#101d36");
    grad.addColorStop(1, "#070b14");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#02b4f5";
    ctx.font = 'bold 20px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(S ? `Ado〈${S.ja}〉` : T("Ado 應援指南"), 24, 38);

    ctx.fillStyle = "#64748b";
    ctx.font = '15px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(playing ? T("正在播放 ⏸") : T("已暫停 ▶"), w - 24, 38);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 52);
    ctx.lineTo(w - 24, 52);
    ctx.stroke();

    let curY = 96;
    if (l && l.acts && l.acts.length) {
      const act = mainAct(l.acts);
      const badgeText = l.call ? `【${l.call}】` : `【${ACT[act]?.name || act}】`;
      ctx.fillStyle = act === "wave" ? "#ffd84a" : (act === "call" ? "#ff7ab8" : "#2dc7ff");
      ctx.font = 'bold 16px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(badgeText, 24, curY);
      curY += 34;
    } else {
      curY += 10;
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 26px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = "left";
    // LINES 的每行是 parseBuiltin 整理過的：日文在 ja、下面那行（中譯或羅馬拼音）在 zh
    const curJp = l ? stripFurigana(l.ja || l.zh || "") : (S ? `〈${S.ja}〉` : T("等待播放…"));
    ctx.fillText(curJp, 24, curY, w - 48);

    if (l && l.ja && l.zh) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = '17px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(l.zh, 24, curY + 34, w - 48);
    }

    if (nextL && (nextL.ja || nextL.zh)) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.beginPath();
      ctx.moveTo(24, h - 54);
      ctx.lineTo(w - 24, h - 54);
      ctx.stroke();

      ctx.fillStyle = "#475569";
      ctx.font = 'bold 13px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(T("下一句"), 24, h - 24);

      ctx.fillStyle = "#64748b";
      ctx.font = '14px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(stripFurigana(nextL.ja || nextL.zh), 74, h - 24, w - 100);
    }
  }

  function updatePip() {
    if (!isPipActive) return;
    // 換歌或歌詞檔晚到時，就算行號一樣也要重畫，不然會留著上一首的文字
    if (lastPipLines !== LINES || (S && lastPipSongNo !== S.no)) { lastPipLines = LINES; lastPipLine = -2; }
    const playing = isPlaying();
    const t = now();
    const dur = DUR();
    const progress = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 0;
    const l = curLine >= 0 ? LINES[curLine] : null;
    const nextIdx = curLine >= 0 ? curLine + 1 : nextIdxAt(t);
    const nextL = nextIdx < LINES.length ? LINES[nextIdx] : null;

    if (pipWin && !pipWin.closed && pipEls) {
      const doc = pipWin.document;

      // Progress bar
      if (pipEls.fill) pipEls.fill.style.transform = `scaleX(${progress})`;
      const pct = Math.round(progress * 100);
      if (pipEls.progressBar && pct !== lastPipPct) {
        lastPipPct = pct;
        pipEls.progressBar.setAttribute("aria-valuenow", String(pct));
      }

      // Song header & title
      if (S && lastPipSongNo !== S.no) {
        lastPipSongNo = S.no;
        if (pipEls.noEl) pipEls.noEl.textContent = String(S.no).padStart(2, "0");
        if (pipEls.titleEl) pipEls.titleEl.textContent = S.ja;
        doc.title = `${T("歌詞小窗")}｜${S.ja}`;
      }

      // Play/Pause button
      if (lastPipPlayState !== playing) {
        lastPipPlayState = playing;
        if (pipEls.playBtn) {
          if (pipEls.playSvg) pipEls.playSvg.style.display = playing ? "none" : "";
          if (pipEls.pauseSvg) pipEls.pauseSvg.style.display = playing ? "" : "none";
          pipEls.playBtn.setAttribute("title", playing ? T("暫停") : T("播放"));
          pipEls.playBtn.setAttribute("aria-label", playing ? T("暫停主頁影片") : T("播放主頁影片"));
        }
      }

      // Current Line & Next Line
      if (lastPipLine !== curLine) {
        lastPipLine = curLine;
        const { curContainer, nextContainer, nextGroup } = pipEls;

        if (curContainer) {
          if (curLine >= 0 && lineEls[curLine]) {
            const cloned = lineEls[curLine].cloneNode(true);
            cloned.querySelectorAll(".chorus-glyph-wave").forEach(el => el.remove());
            curContainer.replaceChildren(cloned);
            pipEls.curKs = [...cloned.querySelectorAll(".k")];
          } else {
            curContainer.innerHTML = `<p class="pip-empty">${S ? T("〈{0}〉等待播放…", esc(S.ja)) : T("等待同步…")}</p>`;
            pipEls.curKs = [];
          }
        }

        if (nextContainer && nextGroup) {
          if (curLine >= 0 && curLine + 1 < lineEls.length && lineEls[curLine + 1]) {
            const nextClone = lineEls[curLine + 1].cloneNode(true);
            nextClone.querySelectorAll(".chorus-glyph-wave").forEach(el => el.remove());
            nextContainer.replaceChildren(nextClone);
            nextGroup.hidden = false;
          } else {
            nextContainer.textContent = "";
            nextGroup.hidden = true;
          }
        }
      }

      // 卡拉OK逐字點亮即時同步至子母小窗
      if (OPT.karaoke && curLine >= 0 && lineEls[curLine]) {
        const curKs = pipEls.curKs;
        const origKs = lineEls[curLine]._ks || lineEls[curLine].querySelectorAll(".k");
        if (curKs && curKs.length && origKs && curKs.length === origKs.length) {
          for (let idx = 0; idx < curKs.length; idx++) {
            curKs[idx].classList.toggle("lit", origKs[idx].classList.contains("lit"));
          }
        }
      }
    }

    if (canvasPip && document.pictureInPictureElement === canvasPip.video) {
      if (lastPipLine !== curLine || lastPipPlayState !== playing || (S && lastPipSongNo !== S.no)) {
        lastPipLine = curLine;
        lastPipPlayState = playing;
        if (S) lastPipSongNo = S.no;
        renderCanvasPip(playing, l, nextL);
      }
    }
  }

  if (toolPipBtn) toolPipBtn.addEventListener("click", togglePip);
  if (toolPipMenuBtn) {
    toolPipMenuBtn.addEventListener("click", togglePip);
  }

  ["mousemove", "touchstart"].forEach(ev => {
    document.addEventListener(ev, () => {
      if (isImmersive) resetSongbarAutohide();
    }, { passive: true });
  });
  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.tool;
    if (k === "lamp" && TOOL.lamp && lampStatusText === T("找不到 PenlightSync")) {
      toast(T("請先在電腦開啟 PenlightSync App，並在色彩頁將「取色來源」選為網站"));
      lampConnect();
      return;
    }
    TOOL[k] = !TOOL[k]; store.set("tool-" + k, TOOL[k] ? "1" : null); paintTools();
    if (k === "click" && TOOL.click && !songV.hidden) clickCtx();
    // 隨機播放、接關聯曲只能開一個
    if ((k === "shuffle" || k === "related") && TOOL[k]) { const o = k === "shuffle" ? "related" : "shuffle"; TOOL[o] = false; store.set("tool-" + o, null); paintTools(); }
    if ((k === "shuffle" || k === "related") && S) {
      if (TOOL[k]) { session.set("shuffle-hist", "[]"); session.set("shuffle-queue", "[]"); shuffleSeen(S); }
      paintNav(S);
      if (k === "shuffle") toast(TOOL.shuffle ? T("隨機播放：下一首會隨機挑，{0} 首輪完才重複", SONGS.length) : T("已關閉隨機播放"));
      else toast(TOOL.related ? T("接關聯曲：下一首先接同一位創作者或同一部作品的歌") : T("已關閉接關聯曲"));
    }
    if (k === "lamp") {
      if (TOOL.lamp) { lampConnect(); }
      else { lampDisconnect(true); }
    }
    if (k === "prefer-live") {
      toast(TOOL["prefer-live"] ? T("已開啟：有官方現場畫面的歌曲優先播放 Live 版") : T("已關閉優先播放 Live 版"));
      if (S && S.liveVideo) {
        switchVideoSource(TOOL["prefer-live"] ? "live" : "mv");
      }
    }
  }));
  paintTools();

  const videoSourcePill = document.getElementById("videoSourcePill");
  if (videoSourcePill) {
    videoSourcePill.addEventListener("click", e => {
      const btn = e.target.closest("[data-video-source]");
      if (!btn || btn.disabled) return;
      switchVideoSource(btn.dataset.videoSource);
    });
  }
  // 上次就開著拍點聲：瀏覽器要等使用者點一下或按鍵才肯出聲，第一次互動時把聲音準備好
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => { if (TOOL.click && !songV.hidden) clickCtx(); }, true));

  // 播完自動下一首：跟下一首按鈕同一首（照首頁目前的排序，開了隨機播放就照洗過的順序）
  function ended() {
    // 測驗中播完：結算，不跳下一首
    if (QZ) return quizFinish();
    if (!TOOL.autonext || !S) return;
    const nx = navTargets(S)[1];
    if (nx) goSong(nx.id);
  }

  // 拍點聲：在拍子上響一聲「喀」，小節第一拍高一點；聲音提前排好，不會跟著畫面掉格
  let actx = null, lastClick = null;
  function clickCtx() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) { actx = null; }
    return actx;
  }
  function tick(at, strong) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = strong ? 1760 : 1320;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(strong ? .32 : .2, at + .002); g.gain.exponentialRampToValueAtTime(.0001, at + .05);
    o.connect(g).connect(actx.destination); o.start(at); o.stop(at + .06);
  }
  function clicks(t, playing) {
    if (!TOOL.click || !playing || !actx || actx.state !== "running") { lastClick = null; return; }
    const b = beatAt(t); if (!b) return;
    // 下一拍在 0.12 秒內就先排進去（影片時間換成真實時間要除以速度）
    const wait = (1 - b.f) * b.P / RATE;
    if (wait < .12 && lastClick !== b.k + 1) {
      lastClick = b.k + 1;
      const bar = (((b.k + 1) % 4) + 4) % 4;
      tick(actx.currentTime + wait, b.known && bar === 0);
    }
  }

  // ── 手燈連動（PenlightSync，js/penlight.js） ──
  let lampHasConnected = false;
  let lampLastSent = null, lampLastSentWallTime = 0, lampSeq = 0, lampStatusText = "";
  const lampStatusEl = document.getElementById("tool-lamp-status");
  const toolLampEl = document.getElementById("tool-lamp");
  const lampLiveBadgeEl = document.getElementById("lampLiveBadge");

  function setLampStatus(text, isLinked = false) {
    lampStatusText = text;
    if (lampStatusEl) lampStatusEl.textContent = text ? " " + text : "";
    if (toolLampEl) {
      if (isLinked) toolLampEl.classList.add("lamp-linked");
      else toolLampEl.classList.remove("lamp-linked");
    }
    if (lampLiveBadgeEl) {
      lampLiveBadgeEl.hidden = !isLinked;
    }
  }

  function handleLampState(nextState, detail = {}) {
    if (detail.msg && detail.msg.type === "hello") {
      if (detail.lamp === "linked") {
        const wasLinked = lampStatusText === T("已連動");
        setLampStatus(T("已連動"), true);
        if (!wasLinked) toast(T("✨ 已與 PenlightSync 手燈連動！"));
      } else if (detail.lamp === "connecting") {
        setLampStatus(T("手燈連線中…"), false);
      } else {
        setLampStatus(T("App 已開，手燈未連"), false);
      }
      return;
    }
    if (nextState === "connecting" || nextState === "reconnecting") {
      if (TOOL.lamp) setLampStatus(T("連線中…"), false);
    } else if (nextState === "connected") {
      if (!lampHasConnected) {
        lampHasConnected = true;
        toast(T("已連上 PenlightSync"));
      }
      lampLastSent = null;
    } else if (nextState === "unavailable") {
      setLampStatus(T("找不到 PenlightSync"), false);
    } else if (nextState === "error") {
      if (detail.reason === "SecurityError" || (detail.error && detail.error.name === "SecurityError")) {
        setLampStatus(T("找不到 PenlightSync"), false);
      }
    } else if (nextState === "disconnected") {
      lampLastSent = null;
      if (!TOOL.lamp || detail.enabled === false) setLampStatus("", false);
    }
  }

  function createFallbackLampClient(onState) {
    let ws = null, timer = null, retries = 0, enabled = false, state = "disconnected";
    const setState = (s, d = {}) => { state = s; onState(s, { state: s, enabled, retryCount: retries, ...d }); };
    const connect = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!enabled || typeof WebSocket !== "function") { if (typeof WebSocket !== "function") setState("unavailable"); return; }
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;
      setState("connecting");
      try {
        const cur = new WebSocket("ws://127.0.0.1:51730/ado");
        ws = cur;
        cur.onopen = () => { if (cur !== ws) return; retries = 0; setState("connected"); };
        cur.onmessage = ev => {
          if (cur !== ws) return;
          try {
            const msg = JSON.parse(ev.data);
            if (msg && msg.type === "hello") setState("connected", { lamp: msg.lamp ?? null, msg });
          } catch (e) {}
        };
        cur.onerror = () => {};
        cur.onclose = () => {
          if (cur !== ws) return;
          ws = null;
          if (!enabled) { setState("disconnected"); return; }
          if (retries < 12) { retries++; setState("reconnecting"); timer = setTimeout(connect, 5000); }
          else setState("unavailable");
        };
      } catch (e) {
        if (!enabled) return;
        if (e && e.name === "SecurityError") { setState("unavailable", { reason: "SecurityError", error: e }); return; }
        if (retries < 12) { retries++; setState("reconnecting"); timer = setTimeout(connect, 5000); }
        else setState("unavailable");
      }
    };
    const sendImmediate = p => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      try { ws.send(typeof p === "string" ? p : JSON.stringify(p)); return true; } catch (e) { return false; }
    };
    const disconnect = stop => {
      if (timer) { clearTimeout(timer); timer = null; }
      retries = 0;
      if (ws) {
        if (stop) sendImmediate(stop);
        try { ws.close(); } catch (e) {}
        ws = null;
      }
      setState("disconnected");
    };
    return {
      connect,
      disconnect,
      send: sendImmediate,
      sendImmediate,
      isConnected: () => !!(ws && ws.readyState === WebSocket.OPEN),
      isEnabled: () => enabled,
      setEnabled: v => { enabled = !!v; if (!enabled && timer) { clearTimeout(timer); timer = null; } },
      get state() { return state; }
    };
  }

  const lampClient = PENLIGHT.createPenlightClient
    ? PENLIGHT.createPenlightClient({ url: "ws://127.0.0.1:51730/ado", throttleMs: 200, onState: handleLampState })
    : createFallbackLampClient(handleLampState);

  function lampDisconnect(sendStop) {
    lampClient.setEnabled(false);
    lampClient.disconnect(sendStop ? { v: 1, type: "stop" } : undefined);
    setLampStatus("", false);
    lampLastSent = null;
  }

  function lampStop() {
    if (lampClient.isConnected()) {
      lampClient.sendImmediate({ v: 1, type: "stop" });
    }
    lampLastSent = null;
  }

  function lampConnect() {
    if (!TOOL.lamp || matchMedia("(pointer: coarse)").matches) return;
    lampClient.setEnabled(true);
    lampClient.connect();
  }

  function currentCue(t) {
    if (!TAGGED) return "free";
    const li = lineAt(t);
    if (li < 0) return "";
    const l = LINES[li];
    if (l && l.listen) return "listen";
    const c = cueAt(t);
    if (!c) return "";
    // 只有在整首歌為抒情歌（如夜明けと蛍、ドライフラワー），或該句明確標記為 listen 時，才送 listen
    const isBallad = S && S.acts && S.acts.length === 1 && S.acts[0] === "listen";
    if (c.acts && c.acts.length) {
      if (c.acts.includes("listen")) return "listen";
      return mainAct(c.acts) || "";
    }
    if (isBallad) return "listen";
    return "";
  }

  // 跟 PenlightSync「網站」取色模式（SiteLightEvaluator，自動節奏）同一套規則：沉浸模式的 3D 觀眾手燈用，現場看起來跟實體手燈一致
  // 一般段落每 2 拍換色；拍手、喊聲、跳躍、135 BPM 以上每拍換；副歌高潮（8 拍）連續鼓聲每半拍換；沒有拍點資料每 4 秒換；安靜聽亮度減半
  function lampLook(t) {
    const isLive = S && currentVideoSource(S) === "live";
    const n = penOf(S).cols.length || 1, bd = isLive ? null : BEAT[S.id], cueName = currentCue(t), cx = isLive ? null : CLIMAX[S.id];
    const bpm = bd && bd[0] > 0 ? bd[0] : 0;
    const climax = cx != null && t >= cx && t < cx + (bpm ? 8 * 60 / bpm : 4);
    const listen = cueName === "listen", hype = cueName === "jump" || cueName === "call" || cueName === "clap" || climax;
    const mod = k => ((k % n) + n) % n;
    let idx = 0;
    if (n > 1 && bpm) {
      const x = (t - bd[1]) / (60 / bpm), k = Math.floor(x), bar = mod4(k);
      const roll = climax || (hype && bpm >= 125) || (bar === 3 && x - k >= .5 && bpm >= 115);
      idx = mod(roll ? Math.floor(x * 2) : (hype || bpm >= 135) ? k : Math.floor(k / 2));
    } else if (n > 1) idx = mod(Math.floor(t / 4));
    return { idx, bright: climax ? 1 : listen ? .5 : 1, cue: cueName };
  }
  const mod4 = k => ((k % 4) + 4) % 4;

  function lampFrame(t, playing) {
    if (!TOOL.lamp || !lampClient.isConnected()) return;
    if (!S || songV.hidden) return;

    const nowWall = performance.now();
    // 一秒最多 5 則（發送間隔至少 200ms）
    if (nowWall - lampLastSentWallTime < 200) return;

    const cue = currentCue(t);
    let shouldSend = false;

    if (!lampLastSent) {
      shouldSend = true;
    } else if (lampLastSent.song !== S.id) {
      shouldSend = true;
    } else if (lampLastSent.playing !== playing) {
      shouldSend = true;
    } else if (lampLastSent.rate !== RATE) {
      shouldSend = true;
    } else if (lampLastSent.cue !== cue) {
      shouldSend = true;
    } else {
      // 預估影片秒數（真實經過秒數乘以播放速度）
      const elapsedSec = (nowWall - lampLastSentWallTime) / 1000;
      const predictedT = lampLastSent.playing ? (lampLastSent.t + elapsedSec * lampLastSent.rate) : lampLastSent.t;
      if (Math.abs(t - predictedT) > 0.3) {
        shouldSend = true; // 偵測到跳轉超過 0.3 秒
      } else if (playing && nowWall - lampLastSentWallTime >= 1000) {
        shouldSend = true; // 播放中每 1 秒心跳校時
      }
    }

    if (shouldSend) {
      const pen = penOf(S);
      const isLive = currentVideoSource(S) === "live";
      const bData = isLive ? null : BEAT[S.id];
      const beat = bData ? { bpm: bData[0], offset: bData[1], barKnown: Boolean(bData[2]) } : null;
      const climax = !isLive && CLIMAX[S.id] != null ? CLIMAX[S.id] : null;
      const roundedT = Math.round(t * 100) / 100;

      lampSeq++;
      const payload = {
        v: 1,
        type: "state",
        seq: lampSeq,
        song: S.id,
        title: S.zh || S.ja || S.id,
        playing: Boolean(playing),
        t: roundedT,
        rate: RATE,
        colors: pen.cols,
        colorsSet: !pen.none,
        beat,
        climax,
        cue
      };

      try {
        const ok = lampClient.send(payload);
        if (ok !== false) {
          lampLastSent = { song: S.id, playing: Boolean(playing), rate: RATE, cue, t: roundedT };
          lampLastSentWallTime = nowWall;
        }
      } catch (e) {}
    }
  }

  if (TOOL.lamp && !matchMedia("(pointer: coarse)").matches) {
    lampConnect();
  }
  addEventListener("pagehide", lampStop);

  // ── 測驗模式（js/quiz-engine.js）：應援提示藏起來，該應援的地方自己按空白鍵或點「按這裡」，依時間準不準給分 ──
  // 題目：連續同一個動作（含標籤）的行合成一段；有拍點資料的拍手段每拍一題（反拍只算第 2、4 拍），其他動作只在段落開頭一題
  // 判定窗以真實秒數計（影片秒數 ÷ 速度），放慢練也一樣公平；段落開頭比較難抓，判定窗放寬
  const QZ_WIN = QUIZ.QZ_WIN || { beat: [.08, .16], onset: [.15, .35] };
  const QZ_POINT = QUIZ.QZ_POINT || { perfect: 1, good: .6, miss: 0 };
  const quizBtn = document.getElementById("toolQuiz"), quizHud = document.getElementById("quizHud"), quizPad = document.getElementById("quizPad"), quizDlg = document.getElementById("quizDlg");
  const qzScore = document.getElementById("qzScore"), qzJudge = document.getElementById("qzJudge"), qzCombo = document.getElementById("qzCombo"), qzProg = document.getElementById("qzProg");
  let QZ = null;
  // 這行要做的主要動作：跟大字提醒的字卡同一套判斷
  const quizAct = QUIZ.quizAct || (l => isOffbeat(l.call) ? "clap" : l.sing.length ? "sing" : l.call && l.acts.includes("call") ? "call" : mainAct(l.acts));
  function quizTargets() {
    if (QUIZ.buildTargets) {
      return QUIZ.buildTargets({
        lines: LINES,
        beat: BEAT[S.id] || null,
        dur: DUR(),
        isOffbeat,
        lineEnd,
        actMap: ACT_MAP
      });
    }
    const out = [], bt = BEAT[S.id], sig = l => l.acts.join(",") + cueLabel(l);
    for (let i = 0; i < LINES.length; i++) {
      const l = LINES[i];
      if (!l.acts.length) continue;
      let j = i;
      while (LINES[j + 1] && LINES[j + 1].acts.length && sig(LINES[j + 1]) === sig(l) && Math.abs(lineEnd(j) - LINES[j + 1].t) < 0.05) j++;
      const end = lineEnd(j), act = quizAct(l), off = isOffbeat(l.call);
      let n = 0;
      if (bt && act === "clap") {
        const P = 60 / bt[0];
        for (let k = Math.ceil((l.t - .1 - bt[1]) / P); bt[1] + k * P < end - .05; k++) {
          const bar = ((k % 4) + 4) % 4;
          if (off && bar !== 1 && bar !== 3) continue;
          out.push({ t: bt[1] + k * P, act, kind: "beat", res: null, result: null, done: false }); n++;
        }
      }
      if (!n) out.push({ t: l.t, act, kind: "onset", res: null, result: null, done: false });
      i = j;
    }
    return out;
  }
  const quizWin = tg => ((tg && tg.win) || QZ_WIN[tg.kind]).map(w => w * RATE);
  function quizStats() {
    if (QUIZ.summarizeQuiz) {
      const sum = QUIZ.summarizeQuiz({ targets: QZ.targets, extra: QZ.stray });
      const c = { perfect: sum.perfect || 0, good: sum.good || 0, miss: sum.miss || 0, skip: sum.skipped || 0 };
      const per = sum.per || {};
      return { c, per, judged: sum.judged, total: sum.total, score: sum.score, grade: sum.grade || gradeOf(sum.score) };
    }
    const c = { perfect: 0, good: 0, miss: 0, skip: 0 }, per = {};
    QZ.targets.forEach(tg => {
      if (tg.res) c[tg.res]++;
      if (!tg.res || tg.res === "skip") return;
      const p = per[tg.act] = per[tg.act] || { hit: 0, total: 0 };
      p.total++; if (tg.res !== "miss") p.hit++;
    });
    const judged = c.perfect + c.good + c.miss;
    const score = judged ? Math.round((c.perfect + c.good * QZ_POINT.good) / judged * 100) : 0;
    return { c, per, judged, total: QZ.targets.length - c.skip, score, grade: gradeOf(score) };
  }
  function quizPaint() {
    const st = quizStats();
    qzScore.textContent = st.score;
    qzCombo.textContent = QZ.combo > 1 ? T("{0} 連擊", QZ.combo) : "";
    qzProg.textContent = T("{0}／{1} 題", st.judged, st.total);
  }
  function quizJudge(kind, act, d) {
    const NAME = { perfect: "Perfect", good: "Good", miss: "Miss", stray: T("多按了") };
    const hint = act ? ACT[act].name + (d != null && kind !== "miss" && Math.abs(d) >= .03 ? "・" + T(d < 0 ? "早 {0} 秒" : "晚 {0} 秒", Math.abs(d / RATE).toFixed(2)) : "") : "";
    qzJudge.innerHTML = `<b class="j-${kind}">${NAME[kind]}</b>${hint ? `<span>${esc(hint)}</span>` : ""}`;
    replay(qzJudge, "pop", 300);
  }
  function setVideoSourcePillDisabled(disabled) {
    if (!videoSourcePill) return;
    videoSourcePill.querySelectorAll("[data-video-source]").forEach(btn => {
      btn.disabled = !!disabled;
    });
  }
  async function quizStart() {
    if (!S || !ready || !activeVideoId(S)) return;
    const song = S;
    const seq = ++quizStartSeq;
    if (song.liveVideo && currentVideoSource(song) === "live") {
      if (!lyReady) await lyLoaded;
      if (!lyHave(song, "mv")) await loadLyrics(song, "mv");
      if (seq !== quizStartSeq || S !== song || songV.hidden || !ready) return;
      switchVideoSource("mv", { startSeconds: 0 });
    }
    const targets = quizTargets();
    if (!targets.length) { toast(T("這首沒有逐行應援，不能測驗")); return; }
    // lastT 先記現在的位置，seek(0) 若是非同步延遲，armed 先保持 false 等真正回到開頭才開始判定
    const startT = now();
    QZ = { targets, stray: 0, combo: 0, maxCombo: 0, lastT: startT, armed: startT < 1.0, done: false, rate: RATE };
    clearRippleTimers();
    setVideoSourcePillDisabled(true);
    document.body.classList.add("quiz-on");
    cueBox.querySelector("h2").textContent = T("測驗模式");
    quizBtn.setAttribute("aria-pressed", "true");
    quizHud.hidden = false; qzJudge.innerHTML = "";
    hideAlert(); quizPaint();
    seek(0);
    const afterT = now();
    if (afterT < 1.0) {
      QZ.armed = true;
      QZ.lastT = afterT;
    }
    toast(T("測驗開始：該應援的地方按空白鍵或點「按這裡」"));
  }
  function quizStop() {
    quizStartSeq++;
    setVideoSourcePillDisabled(false);
    if (!QZ) return;
    QZ = null;
    document.body.classList.remove("quiz-on");
    cueBox.querySelector("h2").textContent = T("現在要做的事");
    quizBtn.setAttribute("aria-pressed", "false");
    quizHud.hidden = true;
    if (quizDlg.open) quizDlg.close();
  }
  function quizTap() {
    if (!QZ || QZ.done) return;
    replay(quizPad, "hit", 120);
    const t = now();
    let hit = null, kind = "stray", delta = null;
    if (QUIZ.judgeTap) {
      ({ hit, kind, delta } = QUIZ.judgeTap({ targets: QZ.targets, t, rate: RATE }));
    } else {
      let bd = Infinity;
      QZ.targets.forEach(tg => { const d = Math.abs(t - tg.t); if (!tg.res && !tg.done && d <= quizWin(tg)[1] && d < bd) { bd = d; hit = tg; } });
      if (hit) {
        kind = bd <= quizWin(hit)[0] ? "perfect" : "good";
        delta = t - hit.t;
      }
    }
    if (!hit) { QZ.stray++; quizJudge("stray"); return; }
    hit.res = kind;
    hit.result = kind;
    hit.done = true;
    QZ.combo++; QZ.maxCombo = Math.max(QZ.maxCombo, QZ.combo);
    quizJudge(kind, hit.act, delta);
    quizPaint();
  }
  function quizFrame(t) {
    if (!QZ || QZ.done) return;
    if (!QZ.armed) {
      if (!(t < 1.0 || t < QZ.lastT - 0.5)) return;
      QZ.armed = true;
      QZ.lastT = t;
    }
    let changed = false;
    if (t < QZ.lastT - .5) {
      // 往回跳：跳回點之後的題目重新作答，可以只重練一段
      QZ.targets.forEach(tg => { if (tg.t >= t - .2 && (tg.res || tg.done)) { tg.res = null; tg.result = null; tg.done = false; changed = true; } });
      QZ.combo = 0;
    } else if (t - QZ.lastT > 1.2) {
      // 往前跳（點歌詞、按 →、切到別的分頁回來）：中間沒機會按的題目不算分
      QZ.targets.forEach(tg => { if (!tg.res && !tg.done && tg.t >= QZ.lastT && tg.t < t - quizWin(tg)[1]) { tg.res = "skip"; tg.result = "skip"; tg.done = true; changed = true; } });
    }
    QZ.targets.forEach(tg => {
      if (tg.res || tg.done || t <= tg.t + quizWin(tg)[1]) return;
      tg.res = "miss"; tg.result = "miss"; tg.done = true; QZ.combo = 0; changed = true;
      quizJudge("miss", tg.act);
    });
    QZ.lastT = t;
    if (changed) quizPaint();
    const last = QZ.targets[QZ.targets.length - 1];
    if (t > last.t + 2 && QZ.targets.every(tg => tg.res || tg.done)) quizFinish();
  }
  function quizFinish() {
    if (!QZ || QZ.done) return;
    QZ.targets.forEach(tg => { if (!tg.res && !tg.done) { tg.res = "miss"; tg.result = "miss"; tg.done = true; } });
    QZ.done = true;
    pause();
    const st = quizStats(), rank = st.grade || gradeOf(st.score);
    // 最佳成績：整首都有作答（沒有略過）才記
    const best = loadQuizBest(store);
    const prev = best[S.id] || null;
    const full = !st.c.skip, isNew = full && (!prev || st.score > prev.score);
    if (isNew) {
      best[S.id] = { score: st.score, rate: QZ.rate };
      store.set(SETLIST.QUIZ_BEST_KEY || "quiz-best", JSON.stringify(best));
      updateMasteryBar();
      if (homeReady) renderList();
    }
    QZ.result = { score: st.score, rank, c: st.c };
    document.getElementById("qrRank").textContent = rank;
    document.getElementById("qrScore").textContent = T("{0} 分", st.score);
    document.getElementById("qrMeta").textContent = `〈${S.ja}〉${QZ.rate !== 1 ? `・${QZ.rate}×` : ""}${QZ.maxCombo > 1 ? "・" + T("最多 {0} 連擊", QZ.maxCombo) : ""}`;
    ["perfect", "good", "miss"].forEach(k => document.getElementById("qr" + k[0].toUpperCase() + k.slice(1)).textContent = st.c[k]);
    document.getElementById("qrStray").textContent = QZ.stray;
    document.getElementById("qrActs").innerHTML = Object.keys(ACT).filter(a => st.per[a]).map(a => {
      const p = st.per[a], hitCnt = typeof p.hit === "number" ? p.hit : ((p.perfect || 0) + (p.good || 0));
      const pct = p.total ? Math.round(hitCnt / p.total * 100) : 0;
      return `<li class="a-${a}"><span>${ACT[a].name}</span><i><span style="width:${pct}%"></span></i><b>${hitCnt}／${p.total}</b></li>`;
    }).join("");
    document.getElementById("qrBest").textContent = !full ? T("中間有跳過的段落，這次不記最佳成績。") : isNew ? (prev ? T("刷新最佳成績！（之前 {0} 分）", prev.score) : T("第一次挑戰這首，已記下成績。")) : T("最佳成績 {0} 分", prev.score);
    quizDlg.showModal();
  }
  quizDlg.addEventListener("close", async () => {
    const v = quizDlg.returnValue;
    quizDlg.returnValue = "";
    if (!QZ) return;
    if (v === "retry") { quizStop(); quizStart(); }
    else if (v === "copy" && QZ.result) {
      const r = QZ.result, text = T("〈{0}〉應援測驗 {1}（{2} 分，Perfect {3}・Good {4}・Miss {5}）", S.ja, r.rank, r.score, r.c.perfect, r.c.good, r.c.miss) + `｜${T("Ado 應援指南")} ${LYV ? new URL(`song/${S.id}/`, document.baseURI).href : location.href.split("#")[0] + "#" + S.id}`;
      try { await navigator.clipboard.writeText(text); toast(T("已複製成績")); } catch (e) { prompt(T("複製這段內容："), text); }
      if (QZ && !songV.hidden && !quizDlg.open) quizDlg.showModal();
    } else {
      quizStop();
    }
  });
  quizBtn.addEventListener("click", () => {
    closeSheets();
    QZ ? quizStop() : quizStart();
  });
  // 按下去那一刻就判定（不等放開）；不搶焦點，空白鍵才不會按到別的按鈕
  quizPad.addEventListener("pointerdown", e => { e.preventDefault(); quizTap(); });
  quizPad.addEventListener("click", e => { if (e.detail === 0) quizTap(); });

  // 分享目前時間：網址後面加 @秒數，打開就從那裡開始
  document.getElementById("shareBtn").addEventListener("click", async () => {
    if (!S) return;
    // 正式網站（有每首歌的獨立頁）分享那首的頁面，連結預覽才會是那首歌；本機預覽沒有獨立頁，用 # 網址
    const t = Math.floor(now()), at = t ? `#${S.id}@${t}` : "";
    // 建置過的網頁才有 data-lyrics；baseURI 是這個語言的根目錄（歌曲頁有 <base href="../../">）
    const url = LYV ? new URL(`song/${S.id}/`, document.baseURI).href + at : `${location.origin}${location.pathname}${at || "#" + S.id}`;
    closeSheets();
    const text = `${S.ja}${t ? " " + fmt(t) : ""}｜${T("Ado 應援指南")}`;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title: text, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast(t ? T("已複製連結（從 {0} 開始）", fmt(t)) : T("已複製連結")); }
    catch (e) { prompt(T("複製這個連結："), url); }
  });

  // 回報錯誤／意見回饋：開啟預先填好的 Google 表單（表單「Ado 應援指南｜回報與意見回饋」，帳號 kuti36.work）
  // entry 是各題的編號；form 留空時改成複製文字
  const REPORT = { form: "https://docs.google.com/forms/d/e/1FAIpQLSd7f7-x0jHfDrObA4cD7D6HiAyZ2CN2BOiP1gTIffZYKW3XPg/viewform", entry: { song: "1258710218", time: "504224952", line: "1328755778", kind: "792721747", note: "1740176641" } };
  const dlg = document.getElementById("reportDlg"), rpKind = document.getElementById("rpKind"), rpNote = document.getElementById("rpNote");
  let rpData = null;
  // 歌曲頁的「回報錯誤」帶入歌曲、時間和這一句；頁尾的「意見回饋」不指定歌曲
  function openReport(onSong) {
    closeSheets();
    document.getElementById("reportH").textContent = onSong ? T("回報錯誤") : T("意見回饋");
    document.getElementById("rpWhere").hidden = !onSong;
    if (onSong) {
      pause();
      const t = now(), l = LINES[lineAt(t)];
      rpData = { song: `${S.ja}（${S.id}）`, time: fmt(t) + `（${t.toFixed(1)} 秒）`, line: l ? (l.ja || l.zh || "") : T("（還沒開始）") };
      rpKind.selectedIndex = 0;
    } else {
      rpData = { song: "", time: "", line: "" };
      rpKind.value = "功能建議";
    }
    document.getElementById("rpSong").textContent = rpData.song;
    document.getElementById("rpTime").textContent = rpData.time;
    document.getElementById("rpLine").textContent = rpData.line;
    rpNote.value = "";
    document.getElementById("rpHint").textContent = REPORT.form ? T("按送出會開啟 Google 表單，上面的內容已經幫你填好。") : T("回報表單還沒開放，按送出會把內容複製起來。");
    document.getElementById("rpSend").textContent = REPORT.form ? T("開啟表單") : T("複製內容");
    dlg.showModal();
  }
  document.getElementById("reportBtn").addEventListener("click", () => { if (S) openReport(true); });
  document.getElementById("feedbackBtn").addEventListener("click", () => openReport(false));
  dlg.addEventListener("close", async () => {
    if (dlg.returnValue !== "send" || !rpData) return;
    const d = { ...rpData, kind: rpKind.value, note: rpNote.value.trim() };
    if (REPORT.form) {
      const q = Object.entries(REPORT.entry).filter(([k, e]) => e && d[k]).map(([k, e]) => `entry.${e}=${encodeURIComponent(d[k])}`).join("&");
      const win = open(`${REPORT.form}?usp=pp_url&${q}`, "_blank", "noopener");
      if (win) return;
    }
    const text = `【Ado 應援指南 回報】${d.song ? `\n歌曲：${d.song}\n時間：${d.time}\n這一句：${d.line}` : ""}\n問題：${d.kind}${d.note ? "\n說明：" + d.note : ""}`;
    try { await navigator.clipboard.writeText(text); toast(T("已複製回報內容")); } catch (e) { prompt(T("複製這段內容："), text); }
  });

  // 更新日誌：第一次打開時讀 CHANGELOG.md（## 版本、- 項目、`程式碼`、[文字](網址)）
  const logDlg = document.getElementById("logDlg"), logBody = document.getElementById("logBody");
  const LOG_URL = "https://github.com/Gcree/ado-guide/blob/main/CHANGELOG.md";
  let logLoaded = false;
  const inline = t => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  function renderLog(md) {
    let html = "", open = false;
    for (const raw of md.split("\n")) {
      const ln = raw.trim(), h = ln.match(/^##\s+(\S+)(?:\s+[—-]\s+(.+))?$/);
      if (h || !ln.startsWith("- ")) { if (open) { html += "</ul>"; open = false; } }
      if (h) html += `<h3>${inline(h[1])}${h[2] ? `<small>${inline(h[2])}</small>` : ""}</h3>`;
      else if (ln.startsWith("- ")) { if (!open) { html += "<ul>"; open = true; } html += `<li>${inline(ln.slice(2))}</li>`; }
    }
    return html + (open ? "</ul>" : "");
  }
  document.getElementById("logBtn").addEventListener("click", async () => {
    logDlg.showModal();
    if (logLoaded) return;
    try {
      const r = await fetch(ROOT + "CHANGELOG.md", { cache: "no-cache" });
      if (!r.ok) throw 0;
      logBody.innerHTML = renderLog(await r.text()); logLoaded = true;
    } catch (e) { logBody.innerHTML = `<p>${T('讀不到更新日誌，可以到 <a href="{0}" target="_blank" rel="noopener">GitHub</a> 看。', LOG_URL)}</p>`; }
  });

  // 鍵盤：空白鍵播放／暫停，← → 上一句、下一句（在輸入框裡不搶按鍵）
  addEventListener("keydown", e => {
    if (!S || songV.hidden || e.metaKey || e.ctrlKey || e.altKey || dlg.open || logDlg.open || quizDlg.open || SHEETS.some(sh => sh.dlg.open) || barMenus.some(m => !m.pop.hidden)) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "Escape" && isImmersive) {
      e.preventDefault();
      setImmersive(false);
      return;
    }
    if (e.key === "Escape" && QZ) {
      e.preventDefault();
      quizStop();
      return;
    }
    if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleImmersive();
      return;
    }
    if (!ready) return;
    // 測驗中空白鍵拿來作答（播放／暫停改用 K）；按住不放不算連按
    if (QZ && e.key === " ") {
      e.preventDefault();
      if (!e.repeat) quizTap();
    } else if (e.key === "q" || e.key === "Q") {
      e.preventDefault();
      if (!quizBtn.disabled) QZ ? quizStop() : quizStart();
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      togglePip();
    } else if (e.key === " " || e.key === "k" || e.key === "K") {
      if (e.target.closest("button, summary, a") && e.key === " ") return;
      e.preventDefault(); isPlaying() ? pause() : play();
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && LINES.length && e.target !== cueTrack) {
      e.preventDefault();
      const t = now(), li = lineAt(t), cur = lastStartedAt(t);
      // 往前：這句剛開始 1.5 秒內就回上一句，不然回這句開頭（空白間奏中則回到上一句）
      const to = e.key === "ArrowRight" ? LINES[cur + 1] : (li >= 0 ? (t - LINES[li].t > 1.5 ? LINES[li] : LINES[li - 1]) : LINES[cur]);
      if (to) { holdUntil = 0; seek(to.t); }
    }
  });

  // ── 路由：#歌曲 id 開歌曲頁，其他回首頁 ──
  // 回清單時捲回離開前的位置
  let listY = 0, lastView = null, hasRouted = false;
  // GA 換頁：只在真的換到另一首歌或回首頁時記一次（跳秒數 @t、首頁錨點 #faq 不算），第一次進站由 gtag config 自己記
  function trackView(s) {
    const view = s ? s.id : "";
    if (view === lastView) return;
    const first = lastView === null;
    lastView = view;
    if (first || typeof gtag !== "function") return;
    gtag("event", "page_view", {
      page_title: document.title,
      page_location: location.href.split("@")[0],
      ...(s ? { song_id: s.id, song_name: s.ja } : {})
    });
  }
  // 語言切換的連結跟著目前這首歌走：中文在根目錄、英文在 en/、日文在 jp/
  const LANG_DIR = { zh: "", en: "en/", ja: "jp/" };
  function syncLangLinks(s) {
    const rest = s ? `song/${s.id}/` : "";
    document.querySelectorAll("[data-lang-link]").forEach(a => {
      const code = a.dataset.langLink, here = code === LANG;
      a.href = (here ? "" : ROOT + LANG_DIR[code]) + rest || "./";
      if (a.hasAttribute("aria-checked")) a.setAttribute("aria-checked", String(here));
      else if (here) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  function route() {
    // 每首歌的獨立頁（song/<id>/）沒有 # 時直接開那首
    const rawH = location.hash.slice(1) || pathSong();
    let h = rawH;
    routeSource = null;
    let routeFilter = null;
    const qIdx = h.indexOf("?");
    if (qIdx >= 0) {
      const q = new URLSearchParams(h.slice(qIdx + 1));
      const sVal = (q.get("src") || "").toLowerCase();
      if (sVal === "live" || sVal === "mv") routeSource = sVal;
      const fVal = (q.get("f") || "").toLowerCase();
      if (fVal) routeFilter = fVal;
      h = h.slice(0, qIdx);
    }
    const parsedList = parseListHash(h, VALID_SONG_IDS);
    let [id, at] = h.split("@"), s = BY[id];
    if (!s && parsedList === null && h === "random") {
      const pool = SONGS.filter(x => !x.hold && !x.sug && Boolean(x.yt) && (x.free || (x.tips && x.tips.length > 0)));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) {
        s = pick;
        id = pick.id;
        if (!PAGE_SONG) history.replaceState(null, "", `#${pick.id}`);
        else if (pick.id !== PAGE_SONG) history.replaceState(null, "", new URL(`song/${pick.id}/`, document.baseURI));
      }
    }
    syncLangLinks(s);
    if (s) {
      if (!homeV.hidden) listY = scrollY;
      document.documentElement.classList.add("seen");
      document.body.classList.add("on-song"); document.documentElement.classList.add("on-song"); syncThemeColor();
      hidePwaToast(false);
      homeV.hidden = true; songV.hidden = false;
      ensureFrame();
      openSong(s, Math.max(0, Math.floor(+at || 0))); scrollTo(0, 0);
      if (hasRouted && sTitleEl && (!document.activeElement || document.activeElement === document.body || !songV.contains(document.activeElement) || (document.activeElement.tagName === "A" && !document.activeElement.hasAttribute("href")))) {
        sTitleEl.tabIndex = -1;
        sTitleEl.focus({ preventScroll: true });
      }
      trackView(s);
    } else {
      const wasSong = !songV.hidden;
      activePlayList = null;
      if (parsedList !== null) {
        sharedList = parsedList;
        filter = "setlist";
        shown = LIMIT;
      } else if (routeFilter && ["all", "frequent", "cheer", "live", "cover", "setlist"].includes(routeFilter)) {
        sharedList = null;
        filter = routeFilter;
        shown = LIMIT;
        if (filter === "live") liveSub = "all";
        if (filter === "frequent") freqSub = "all";
      } else if (wasSong && sharedList && !h) {
        sharedList = null;
        if (filter === "setlist" && !mySetlist.length) filter = "all";
      }
      ensureHomeReady();
      closeSheets();
      setImmersive(false, true); quizStop();
      clearTimeout(readyTimer); clearTimeout(muteTimer); clearRippleTimers();
      switchSeq++; quizStartSeq++; karaokeLoadSeq++; karaokeLoadingId = null; karaokeTiming = null;
      if (pipWin && !pipWin.closed) { try { pipWin.close(); } catch (e) {} pipWin = null; pipEls = null; }
      if (document.pictureInPictureElement) { document.exitPictureInPicture().catch(() => {}); }
      stopCanvasPip();
      updatePipButtonStates(false);
      disposeVenue();
      lampStop(); pause(); hideAlert(); setVideoLoading(false); S = null;
      document.body.classList.remove("on-song"); document.documentElement.classList.remove("on-song"); syncThemeColor();
      songV.hidden = true; homeV.hidden = false;
      syncBar();
      idleDrawn = false; ensureFrame();
      document.title = PAGE_SONG ? T("Ado 應援指南") : PAGE_TITLE;
      updateMasteryBar();
      syncFilterChips();
      syncSubFilters();
      syncSetlistUi();
      renderList();
      renderRecent(); crateShow(); resumeReel(); measureHomeReel();
      const targetId = parsedList !== null ? "songs" : h;
      const target = targetId && document.getElementById(targetId);
      if (target) target.scrollIntoView({ block: "start" }); else scrollTo(0, listY);
      if (hasRouted && wasSong && (!document.activeElement || document.activeElement === document.body || songV.contains(document.activeElement))) {
        const focusEl = target || document.getElementById("heroH");
        if (focusEl) { focusEl.tabIndex = -1; focusEl.focus({ preventScroll: true }); }
      }
      trackView(null);
    }
    hasRouted = true;
  }
  // 唱片架點下去時自己做轉場（CD 和封面飛過去），這次換頁不用交叉淡化
  let quietNav = false, crateShow = () => {};
  addEventListener("hashchange", () => { if (quietNav) { quietNav = false; route(); } else transition(route); });

  // ── 首頁主視覺的唱片架：每次隨機抽 3～5 首 MV，插圖做成 CD 封套；滑過 CD 浮出，點了 CD 和封面飛去那首的頁面 ──
  {
    // 縮圖是 16:9，封套是正方形：數字是裁切的水平位置（0 最左、100 最右），逐首看過縮圖決定。
    // 踊、ロックスター、エルフ 的縮圖以大字為主或角色太小，裁成正方形不好看，先不放；還沒確認螢光棒色（hold）的也不放
    const FX = { show: 55, usseewa: 45, readymade: 40, gyakkou: 50, shinjidai: 55, giragira: 35, kurakura: 58, saikyo: 55, aiaia: 50, totmusica: 50, kira: 40, ibara: 45, rebellion: 50, chocolat: 62, ashura: 45, kokoro: 50, himawari: 50, dignity: 55, hibana: 50, magic: 50, kanjaa: 65 };
    const POOL = Object.keys(FX).map(id => BY[id]).filter(s => s && !s.hold && Boolean(s.yt));
    const hero = document.querySelector(".hero"), stage = document.getElementById("crateStage"), crate = document.getElementById("crate");
    const crateNow = document.getElementById("crateNow"), shuffleBtn = document.getElementById("shuffle");
    // 觸控與否要即時判斷：平板接上滑鼠、或視窗縮放時會變
    const touchMQ = matchMedia("(hover: none)");
    const rnd = (a, b) => a + Math.random() * (b - a);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const idle = () => T("從 {0} 首 MV 抽出 {1} 張", POOL.length, crate.children.length);
    // CD 和側帶用的兩個顏色：螢光棒的前兩色；彩色的用粉紅＋水藍
    const inks = s => {
      const { keys } = penOf(s), cs = keys.filter(k => k !== "彩").map(k => PENC[k][1]), rb = keys.includes("彩");
      return [cs[0] || (rb ? "#ff7ab8" : "#5fd4ff"), cs[1] || (rb ? "#5fd4ff" : "#c9d3e3")];
    };
    const obiDots = s => penOf(s).keys.map(k => `<span style="background:${k === "彩" ? "conic-gradient(#ff4a5a, #ffd84a, #4ee08a, #5fd4ff, #a374ff, #ff4a5a)" : PENC[k][1]}"></span>`).join("");
    const art = s => {
      const i = new Image();
      i.alt = ""; i.decoding = "async";
      if (!s || !s.yt) return i;
      let fellBack = false;
      const fallback = () => {
        if (fellBack) return;
        fellBack = true;
        i.src = `https://i.ytimg.com/vi/${s.yt}/mqdefault.jpg`;
      };
      // 沒有高解析縮圖時 YouTube 回 120×90 的灰圖，改用中尺寸
      i.onload = () => { if (!fellBack && i.naturalWidth < 200) fallback(); };
      i.onerror = fallback;
      i.src = `https://i.ytimg.com/vi/${s.yt}/maxresdefault.jpg`;
      return i;
    };
    let moldN = 0;
    // CD 本體；歌曲頁標題旁的小唱片也用這個
    window.ADO_CD = s => {
      const [p1, p2] = inks(s), id = `cd-mold-${++moldN}`;
      return `<span class="cd" style="--p1:${p1};--p2:${p2}"><span class="cd-face"></span><span class="cd-rain"></span><span class="cd-spin"><svg class="cd-mold" viewBox="0 0 100 100" aria-hidden="true">`
        + `<path id="${id}" d="M50 50m-10.6 0a10.6 10.6 0 1 1 21.2 0a10.6 10.6 0 1 1 -21.2 0" fill="none"/><text><textPath href="#${id}">ADO · ${esc(s.ja)} · 応援 ·</textPath></text></svg></span></span>`;
    };

    // 由前左下往後右上排，越後面越深；隨機只在小範圍抖動，構圖不會散
    function layout(n) {
      const probe = document.createElement("li");
      probe.className = "rec"; probe.style.visibility = "hidden"; crate.append(probe);
      const unit = probe.offsetWidth; probe.remove();
      // 每張往右的距離不超過舞台剩下的寬度，手機上整疊也不會超出螢幕；桌機可以往右溢出一點，但不超出視窗（平板橫放時兩側留白很少）
      const room = innerWidth > 900 ? Math.min(stage.clientWidth * 1.3, innerWidth - stage.getBoundingClientRect().left - 24) : stage.clientWidth;
      const step = Math.min((n > 4 ? .36 : .46) * unit, (room - unit * 1.1) / (n - 1));
      return Array.from({ length: n }, (_, i) => ({ x: i * step + rnd(-6, 6), y: -i * (n > 4 ? .07 : .1) * unit + rnd(-8, 8), z: -i * .62 * unit, r: rnd(-3.5, 3.5) }));
    }
    function deal() {
      const n = 3 + Math.floor(Math.random() * 3), picks = [...POOL].sort(() => Math.random() - .5).slice(0, n), pos = layout(n);
      crate.innerHTML = "";
      // 最前面那張先放進 DOM，Tab 順序從前面開始；後面的用 z-index 壓在下面
      picks.forEach((s, i) => {
        const li = document.createElement("li"), p = pos[i], [p1, p2] = inks(s);
        li.className = "rec is-out"; li.style.zIndex = String(10 - i);
        Object.entries({ "--x": p.x + "px", "--y": p.y + "px", "--z": p.z + "px", "--r": p.r + "deg", "--i": i, "--fx": FX[s.id] + "%", "--p1": p1, "--p2": p2 }).forEach(([k, v]) => li.style.setProperty(k, v));
        li.innerHTML = `<a href="song/${s.id}/" data-crate="${s.id}" aria-label="${T("{0}，打開應援頁", esc(s.ja))}"><span class="floor"></span><span class="float"><span class="jacket">${window.ADO_CD(s)}`
          + `<span class="tray"></span><span class="sleeve"><span class="obi" aria-hidden="true"><i>Ado</i><u></u><b lang="ja">${esc(s.ja)}</b><s>${obiDots(s)}</s></span></span>`
          + `<span class="spine"></span><span class="lip"></span></span></span></a>`;
        const img = art(s);
        // 右側斷面用同一張插圖的右緣，載入後才知道最後用的是哪個尺寸
        img.addEventListener("load", () => li.style.setProperty("--art", `url("${img.currentSrc}")`));
        li.querySelector(".sleeve").prepend(img);
        li._song = s;
        crate.append(li);
        setTimeout(() => li.classList.remove("is-out"), reduce ? 0 : 80 + (n - i) * 90);
      });
      crateNow.textContent = idle();
      startCycle();
    }

    // 選中一張：前面的往前倒（像翻唱片箱），選中的抽高；背後的光和下面那行字換成這首的螢光棒色
    // hint：手機上下面那行要不要多一句操作提示（"tap" 選到了、再點打開；"swipe" 自動輪播中、可以滑）
    function setOn(li, hint) {
      const recs = [...crate.children], k = recs.indexOf(li);
      recs.forEach((x, i) => { x.classList.toggle("is-on", x === li); x.classList.toggle("is-deep", x === li && k > 0); x.classList.toggle("is-lean", k > 0 && i < k); });
      crate.classList.toggle("has-on", !!li);
      if (!li) { hero.style.removeProperty("--glow"); crateNow.textContent = idle(); return; }
      const s = li._song;
      hero.style.setProperty("--glow", inks(s)[0]);
      crateNow.innerHTML = `${penDots(s)}${hint ? "" : T("螢光棒 · ")}<b lang="ja">${esc(s.ja)}</b>${hint === "tap" ? `<span class="crate-hint">${T("再點一下打開")}</span>` : hint === "swipe" ? `<span class="crate-hint">${T("左右滑動翻唱片")}</span>` : ""}`;
    }

    // 手機沒有滑過：唱片架在畫面裡時每隔幾秒輪流讓一張的 CD 浮出；手指一碰就停，放開 6 秒沒動才接著輪
    let cycle = 0, resumeT = 0, inView = true, busy = false;
    function startCycle() {
      clearInterval(cycle); clearTimeout(resumeT);
      if (!touchMQ.matches || reduce || busy) return setOn(null);
      const recs = [...crate.children], cur = crate.querySelector(".rec.is-on");
      let k = Math.max(0, recs.indexOf(cur));
      setOn(recs[k], "swipe");
      if (inView) cycle = setInterval(() => !homeV.hidden && setOn(recs[++k % recs.length], "swipe"), 3200);
    }
    const holdCycle = () => { clearInterval(cycle); clearTimeout(resumeT); resumeT = setTimeout(() => !busy && inView && startCycle(), 6000); };
    touchMQ.addEventListener("change", startCycle);
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (touchMQ.matches) inView ? startCycle() : (clearInterval(cycle), clearTimeout(resumeT)); }).observe(stage);

    // 手機的「翻唱片」：手指在唱片架上左右滑，滑到哪張就抽起哪張，整個架子和反光跟著手指轉；
    // 上下滑照常捲動頁面（touch-action: pan-y）。點一下先選起來，再點一下才打開
    let drag = null, lastPointer = "mouse", wasOn = false, swallowClick = false;
    const recUnder = x => {
      // 用每張封套的水平中心找最近的一張；前面的往左、後面的往右，跟手指方向一致
      let best = null, d = Infinity;
      for (const li of crate.children) {
        const r = li.querySelector(".sleeve").getBoundingClientRect(), c = Math.abs(r.left + r.width / 2 - x);
        if (c < d) { d = c; best = li; }
      }
      return best;
    };
    stage.addEventListener("pointerdown", e => {
      lastPointer = e.pointerType;
      if (e.pointerType !== "touch" || busy) return;
      const li = e.target.closest(".rec");
      wasOn = !!li && li.classList.contains("is-on");
      drag = { x: e.clientX, y: e.clientY, on: false };
      holdCycle();
    });
    stage.addEventListener("pointermove", e => {
      if (!drag || e.pointerType !== "touch") return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
        drag.on = true;
      }
      const r = stage.getBoundingClientRect();
      if (!reduce) crate.style.setProperty("--px", Math.max(-.5, Math.min(.5, (e.clientX - r.left) / r.width - .5)).toFixed(3));
      const li = recUnder(e.clientX);
      if (li && !li.classList.contains("is-on")) {
        setOn(li, "tap");
        // 換到下一張時輕輕震一下（只有支援的 Android 瀏覽器會震）
        if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate(6);
      }
    });
    const endDrag = () => {
      if (!drag) return;
      if (drag.on) { swallowClick = true; setTimeout(() => swallowClick = false, 350); crate.style.setProperty("--px", 0); }
      drag = null;
      holdCycle();
    };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", () => { if (drag) { drag.on = false; endDrag(); } });

    // 滑過：整個唱片架只聽一組事件。離開後稍等一下才收回，滑到隔壁那張時不會先閃回原狀
    let leaveT = 0;
    crate.addEventListener("pointerover", e => {
      const li = e.target.closest(".rec");
      if (!li || busy || e.pointerType === "touch") return;
      clearTimeout(leaveT);
      if (!li.classList.contains("is-on")) setOn(li);
    });
    crate.addEventListener("pointerleave", e => { if (e.pointerType === "touch") return; clearTimeout(leaveT); leaveT = setTimeout(() => !busy && setOn(null), 140); });
    crate.addEventListener("focusin", e => { const li = e.target.closest(".rec"); if (li && !busy && lastPointer !== "touch") setOn(li); });
    crate.addEventListener("focusout", e => { if (!crate.contains(e.relatedTarget) && !busy && !touchMQ.matches) setOn(null); });
    // 指標視差：整個架子微微轉向游標，封套和 CD 的反光也跟著走
    if (!reduce) {
      stage.addEventListener("pointermove", e => {
        if (e.pointerType === "touch") return;
        const r = stage.getBoundingClientRect();
        crate.style.setProperty("--px", ((e.clientX - r.left) / r.width - .5).toFixed(3));
        crate.style.setProperty("--py", ((e.clientY - r.top) / r.height - .5).toFixed(3));
      });
      stage.addEventListener("pointerleave", () => { crate.style.setProperty("--px", 0); crate.style.setProperty("--py", 0); });
    }

    shuffleBtn.addEventListener("click", () => {
      if (busy) return;
      busy = true;
      shuffleBtn.classList.add("turning"); setTimeout(() => shuffleBtn.classList.remove("turning"), 600);
      clearInterval(cycle); setOn(null);
      [...crate.children].forEach((li, i) => setTimeout(() => li.classList.add("is-out"), reduce ? 0 : i * 60));
      setTimeout(() => {
        busy = false;
        if (homeV.hidden) { dealt = false; return; }
        deal();
      }, reduce ? 0 : 520);
    });

    // 點擊：那張轉正抽出 → 首頁淡掉 → 換到歌曲頁 → CD 弧線飛到歌名旁變成小唱片，封面展開成 16:9 的 MV 畫面
    crate.addEventListener("click", e => {
      const a = e.target.closest("a[data-crate]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (swallowClick) return;
      // 手指點：還沒選起來的那張先抽起來，再點一下才打開（滑鼠滑過時已經選好了，點了直接打開）
      if (lastPointer === "touch" && e.detail !== 0 && !wasOn) { setOn(a.parentElement, "tap"); holdCycle(); return; }
      // 飛行動畫後才換頁，那時已經不算點擊：影片在點下去這一刻先開始播
      if (!busy && a.parentElement._song) tapPlay(a.parentElement._song);
      // detail 是 0：用鍵盤按 Enter，落地後把焦點交給歌曲頁的返回鍵
      fly(a.parentElement, e.detail === 0);
    });
    // 飛行替身放在一層 .crate 裡，封套、側帶、反光、CD 直接套唱片架原本的樣式，交接那一格看起來完全一樣。
    // 只動 transform／opacity／clip-path，交給合成器跑：歌曲頁在背後建播放器、排歌詞時也不會掉格
    const box = (el, r) => (Object.assign(el.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }), el);
    const div = (cls, html = "") => Object.assign(document.createElement("div"), { className: cls, innerHTML: html });
    const move = (from, to) => `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`;
    // 節奏（毫秒）：抽出 260 → 首頁淡出 200 後換頁 → 第一段共 340 → 第二段 600 → 落地 160，約 1.2 秒到定位。
    // 第一段結尾保留速度、第二段帶速度起步，中間不會停住；CD 水平慢、垂直快，走成一道弧線
    const DUR = { pull: 260, fade: 200, up: 340, fly: 600, land: 160 };
    const EASE = { up: "cubic-bezier(.35, 0, .65, .85)", fly: "cubic-bezier(.25, .35, .2, 1)", flyX: "cubic-bezier(.4, .2, .2, 1)", flyY: "cubic-bezier(.15, .5, .2, 1)" };
    function reset() {
      crate.classList.remove("pulling");
      [...crate.children].forEach(x => { x.classList.remove("is-pull"); x.style.visibility = ""; });
      busy = false;
      startCycle();
    }
    async function fly(li, kb) {
      if (busy) return;
      const s = li._song;
      if (reduce) { location.hash = s.id; return; }
      busy = true; clearInterval(cycle); clearTimeout(leaveT);
      let layer = null, screen = null, mini = null, fades = [];
      try {
        setOn(li);
        crate.classList.add("pulling"); li.classList.add("is-pull");
        // 抽出的轉場快結束就起飛，不停在原地等
        await wait(DUR.pull);
        const cd = li.querySelector(".cd"), sleeve = li.querySelector(".sleeve"), fx = FX[s.id];
        const dr = cd.getBoundingClientRect(), sr = sleeve.getBoundingClientRect();
        layer = div("crate crate-fly");
        ["--p1", "--p2", "--fx"].forEach(k => layer.style.setProperty(k, li.style.getPropertyValue(k)));
        layer.style.setProperty("--px", crate.style.getPropertyValue("--px") || 0);
        document.body.append(layer);

        // 第一段（還在首頁）：CD 往上抽出、封面微微浮起，首頁和頂欄淡掉。這段不需要知道終點，先交給合成器跑
        const gSq = box(div("fly-g"), sr);
        gSq.style.setProperty("--s", sr.width + "px");
        gSq.append(sleeve.cloneNode(true));
        // CD 分兩層：外層只管水平、內層管垂直和縮放，兩個方向用不同的曲線就是弧線。
        // CD 一路都在封面後面，跟它在封套裡的位置一致；飛到歌名旁時已經在影片框上方，不會被蓋住
        const gCd = box(div("fly-g", `<div class="fly-y">${cd.outerHTML}</div>`), dr), gCdY = gCd.firstElementChild;
        layer.append(gCd, gSq);
        li.style.visibility = "hidden";
        const lift = { left: dr.left + dr.width * .1, top: dr.top - dr.height * .5, width: dr.width * .8 };
        const up = { left: sr.left - sr.width * .02, top: sr.top - sr.height * .04, width: sr.width * 1.04 };
        const legUp = { duration: DUR.up, easing: EASE.up, fill: "forwards" };
        const t0 = performance.now();
        gCdY.animate([{ transform: "none" }, { transform: `translateY(${lift.top - dr.top}px) scale(.8)` }], legUp);
        gCd.animate([{ transform: "none" }, { transform: `translateX(${lift.left - dr.left}px)` }], legUp);
        gSq.animate([{ transform: "none" }, { transform: move(sr, up) }], legUp);
        const bar = document.getElementById("bar");
        fades = [homeV, bar].map(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fade, easing: "cubic-bezier(.3, 0, 1, 1)", fill: "forwards" }));
        // 等首頁淡完才換頁；換頁那一下主執行緒很忙，第一段還在合成器上跑，畫面不會停
        await Promise.all(fades.map(f => f.finished.catch(() => {})));
        if (location.hash.slice(1) === s.id) {
          route();
        } else {
          const routed = new Promise(r => addEventListener("hashchange", r, { once: true }));
          quietNav = true;
          location.hash = s.id;
          await routed;
        }
        fades.forEach(f => { try { f.cancel(); } catch (e) {} });
        fades = [];
        const left = Math.max(0, DUR.up - (performance.now() - t0));
        // 歌曲頁（連同背景的舞台燈）先藏著，第二段開始才淡入
        [songV, document.getElementById("fx")].forEach(el => el && el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: left + 60, easing: "cubic-bezier(.05, .7, .1, 1)", fill: "backwards" }));
        screen = document.getElementById("screen");
        mini = document.querySelector("#sTitle .sdisc");
        const fr = screen.getBoundingClientRect(), mr = mini ? mini.getBoundingClientRect() : { left: fr.left + fr.width / 2, top: fr.top, width: 1, height: 1 };
        [screen, mini].forEach(x => x && (x.style.visibility = "hidden"));
        await wait(left);

        // 第二段：封面換成終點大小的 16:9 畫面，先裁成剛才那塊正方形（上面疊著同一張封套，側帶和反光都在），
        // 一邊展開一邊讓封套淡掉；CD 弧線飛到歌名旁縮成小唱片
        const k = up.width / fr.height, ox = (fr.width - fr.height) * fx / 100, radius = parseFloat(getComputedStyle(screen).borderTopLeftRadius) || 0;
        const gArt = box(div("fly-g fly-art"), fr);
        const artImg = document.createElement("img");
        const srcImg = sleeve.querySelector("img");
        artImg.src = (srcImg && (srcImg.currentSrc || srcImg.src)) || "";
        artImg.alt = "";
        gArt.append(artImg);
        const cover = div("fly-cover");
        Object.assign(cover.style, { left: ox + "px", width: fr.height + "px" });
        cover.style.setProperty("--s", fr.height + "px");
        cover.append(sleeve.cloneNode(true));
        gArt.append(cover);
        gSq.replaceWith(gArt);
        const legFly = { duration: DUR.fly, fill: "forwards" };
        gArt.animate([
          { transform: move(fr, { left: up.left - k * ox, top: up.top, width: fr.width * k }), clipPath: `inset(0 ${fr.width - ox - fr.height}px 0 ${ox}px round ${3 / k}px)` },
          { transform: "none", clipPath: `inset(0 0 0 0 round ${radius}px)` }
        ], { ...legFly, easing: EASE.fly });
        cover.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fly * .4, easing: "ease-out", fill: "forwards" });
        gCd.animate([{ transform: `translateX(${lift.left - dr.left}px)` }, { transform: `translateX(${mr.left - dr.left}px)` }], { ...legFly, easing: EASE.flyX });
        gCdY.animate([{ transform: `translateY(${lift.top - dr.top}px) scale(.8)` }, { transform: `translateY(${mr.top - dr.top}px) scale(${mr.width / dr.width})` }], { ...legFly, easing: EASE.flyY });
        await wait(DUR.fly);
        // 落地：底下的播放器和小唱片露出來，替身淡掉，不會硬切
        [screen, mini].forEach(x => x && (x.style.visibility = ""));
        const closingLayer = layer;
        layer = null;
        closingLayer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.land, easing: "ease-out", fill: "forwards" }).finished.catch(() => {}).then(() => closingLayer.remove());
        if (kb) document.querySelector(".songbar a.ib")?.focus({ preventScroll: true });
      } finally {
        fades.forEach(f => { try { f.cancel(); } catch (e) {} });
        [screen, mini].forEach(x => x && (x.style.visibility = ""));
        if (layer) layer.remove();
        reset();
      }
    }

    // 直接打開歌曲頁時首頁是隱藏的，量不到唱片大小：等回到首頁再發牌
    let dealt = false;
    crateShow = () => { if (!dealt) { dealt = true; deal(); } };
    // 換了視窗大小，重新排（間距跟著唱片大小算）
    let rw = innerWidth;
    addEventListener("resize", () => { if (Math.abs(innerWidth - rw) < 40 || busy) return; rw = innerWidth; if (homeV.hidden) dealt = false; else deal(); });
  }
  route();

  // 返回按鈕與 Logo 導航優化：在 SPA 模式下點擊清除 hash 平滑回首頁
  const backBtn = document.querySelector(".songbar a.ib");
  if (backBtn) {
    backBtn.addEventListener("click", ev => {
      if (!PAGE_SONG && location.hash) {
        ev.preventDefault();
        location.hash = "";
      }
    });
  }
  const markBtn = document.querySelector("header.bar a.mark");
  if (markBtn) {
    markBtn.addEventListener("click", ev => {
      if (!PAGE_SONG && location.hash) {
        ev.preventDefault();
        location.hash = "";
      }
    });
  }

  // ── 舞台燈光 ──
  const rgbCache = {};
  const rgbOf = h => rgbCache[h] || (rgbCache[h] = (() => { const n = parseInt(h.slice(1), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; })());
  const rgba = (rgb, a) => `rgba(${rgb},${Math.max(0, Math.min(1, a))})`;
  const BLUE = "#02b4f5", DEEP = "#075073", IVORY = "#f8fafc";
  const BLUE_RGB = rgbOf(BLUE), DEEP_RGB = rgbOf(DEEP), IVORY_RGB = rgbOf(IVORY);
  function stage(cv, o) {
    const ctx = cv.getContext("2d"); let W = 0, H = 0;
    const size = () => { const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    addEventListener("resize", size); size();
    const sticks = Array.from({ length: o.sticks }, () => ({ x: Math.random(), y: Math.random(), ph: Math.random() * 6.28, c: BLUE_RGB }));
    const petals = Array.from({ length: o.petals }, () => ({ x: Math.random(), y: Math.random(), r: 3 + Math.random() * 4, s: .2 + Math.random() * .4, a: Math.random() * 6.28 }));
    // pal：這首的螢光棒顏色；null 是首頁的藍白
    let pal = null, palRgb = [BLUE_RGB], beams = [];
    const pen = cols => {
      pal = cols && cols.length ? cols : null;
      palRgb = pal ? pal.map(rgbOf) : [BLUE_RGB];
      beams = pal ? [0, 1, 2, 3].map(i => palRgb[i % palRgb.length]) : [DEEP_RGB, BLUE_RGB, IVORY_RGB, DEEP_RGB];
      sticks.forEach((s, i) => s.c = pal ? palRgb[i % palRgb.length] : Math.random() < .75 ? BLUE_RGB : IVORY_RGB);
    };
    pen(null);
    // hit：重拍的亮度（1 → 0），beat：第幾拍，用來輪流換閃光的顏色
    const draw = (tt, energy, hit, listen, playing, beat, dt = 0.016) => {
      if (!cv.width) size();
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      [.12, .34, .58, .86].forEach((bx, i) => {
        const col = beams[i], sway = reduce ? 0 : Math.sin(tt * .45 + i * 1.7) * .16;
        const ox = W * (bx + (i % 2 ? .08 : -.08)), oy = H * 1.05, tx = W * (bx + sway), w = W * (.06 + .03 * hit);
        const g = ctx.createLinearGradient(ox, oy, tx, 0), a = (.05 + .12 * energy + .3 * hit) * o.k;
        g.addColorStop(0, rgba(col, 0)); g.addColorStop(.4, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox - 4, oy); ctx.lineTo(tx - w, -20); ctx.lineTo(tx + w, -20); ctx.lineTo(ox + 4, oy); ctx.fill();
      });
      // 重拍：從台下往上整片亮一下
      if (hit > .01) {
        const col = palRgb[beat % palRgb.length], g = ctx.createRadialGradient(W / 2, H * 1.1, 0, W / 2, H * 1.1, Math.max(W, H) * .95);
        g.addColorStop(0, rgba(col, .2 * hit * o.k)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      petals.forEach((p, i) => {
        if (!reduce && playing) { p.y += p.s * .09 * (1 + energy) * dt; p.a += .48 * dt; if (p.y > 1.05) { p.y = -.05; p.x = Math.random(); } }
        ctx.save(); ctx.translate(p.x * W + Math.sin(p.a) * 12, p.y * H); ctx.rotate(p.a);
        ctx.fillStyle = rgba(pal ? palRgb[i % palRgb.length] : BLUE_RGB, .28 * o.k); ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, 6.28); ctx.fill(); ctx.restore();
      });
      // raise：0 一般、沉浸模式約 .35、大合唱時 1；手燈海變高、往上舉、更亮
      const rz = draw.raise * (Math.min(W, H) < 600 ? .45 : 1), baseY = H - 4, band = Math.min(70, H * .14) * (1 + rz * .8);
      sticks.forEach(s => {
        const swing = reduce ? 0 : Math.sin(tt * (playing ? 4.2 : 1.3) + s.ph) * (playing ? .5 : .2) * (listen ? .3 : 1);
        ctx.save(); ctx.translate(s.x * W, baseY - s.y * band - 6 * hit - rz * 8); ctx.rotate(swing);
        ctx.strokeStyle = rgba(s.c, (.16 + .3 * energy + .45 * hit) * (.45 + s.y * .55) * o.k * (1 + rz * .5));
        ctx.lineWidth = 3 + rz; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -(12 + s.y * 8 + rz * 6)); ctx.stroke(); ctx.restore();
      });
      ctx.globalCompositeOperation = "source-over";
    };
    draw.pen = pen;
    draw.raise = 0;
    return draw;
  }
  const bg = stage(document.getElementById("fx"), { sticks: 110, petals: 22, k: 1.25 });

  // 彩帶砲：左右下角各噴一發，紙片會翻面飄落，長彩帶邊飛邊扭；只在有東西在飛的時候畫
  function cannon(cv) {
    const ctx = cv.getContext("2d"); let W = 0, H = 0, bits = [], run = false, last = 0;
    const size = () => { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    addEventListener("resize", size); size();
    const rnd = (a, b) => a + Math.random() * (b - a);
    const tick = ms => {
      const dt = Math.min(.05, last ? (ms - last) / 1000 : .016); last = ms;
      ctx.clearRect(0, 0, W, H);
      bits = bits.filter(p => p.age < p.life && p.y < H + 80);
      for (const p of bits) {
        p.age += dt; if (p.age < 0) continue;
        // 空氣阻力讓它很快慢下來，之後靠重力慢慢飄落
        const k = Math.exp(-p.drag * dt);
        p.vx *= k; p.vy = p.vy * k + 520 * dt;
        p.x += (p.vx + Math.sin(p.age * p.fq + p.ph) * p.sway) * dt; p.y += p.vy * dt; p.spin += p.vs * dt;
        const a = Math.min(1, (p.life - p.age) / 1.2);
        if (p.trail) {
          // 每移動一小段記一個點，飄得慢時彩帶也保持一樣長
          const h = p.trail[0];
          if (!h || Math.hypot(p.x - h[0], p.y - h[1]) > 7) { p.trail.unshift([p.x, p.y]); if (p.trail.length > 16) p.trail.pop(); }
          ctx.fillStyle = rgba(rgbOf(p.c), a);
          for (let i = 1; i < p.trail.length; i++) {
            const [x0, y0] = p.trail[i - 1], [x1, y1] = p.trail[i], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
            const w = 3.5 * Math.abs(Math.cos(p.spin + i * .55)) + .6, nx = -dy / l * w, ny = dx / l * w;
            ctx.beginPath(); ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x1 + nx, y1 + ny); ctx.lineTo(x1 - nx, y1 - ny); ctx.lineTo(x0 - nx, y0 - ny); ctx.fill();
          }
        } else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin * .6); ctx.scale(1, Math.cos(p.spin));
          ctx.fillStyle = rgba(rgbOf(p.c), a); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
        }
      }
      run = bits.length > 0;
      if (run) requestAnimationFrame(tick); else { ctx.clearRect(0, 0, W, H); last = 0; }
    };
    return cols => {
      if (reduce) return;
      const pal = [...(cols && cols.length ? cols : [BLUE, IVORY]), "#ffd76a", "#eef2f8"], n = W < 600 ? 55 : 95;
      [-1, 1].forEach(side => {
        const ox = side < 0 ? -10 : W + 10, oy = H + 10;
        for (let i = 0; i < n + 10; i++) {
          // 往畫面中間偏上噴：角度離垂直 15–40 度，速度決定能衝多高
          const ribbon = i >= n, ang = rnd(15, 40) * Math.PI / 180, v = H * rnd(1.5, 2.5) * (ribbon ? 1.1 : 1);
          bits.push({ x: ox, y: oy, vx: -side * Math.sin(ang) * v, vy: -Math.cos(ang) * v, age: -rnd(0, .18), life: rnd(4.5, 6.5),
            drag: ribbon ? rnd(1.6, 2.1) : rnd(2.2, 3), sway: rnd(20, 60), fq: rnd(2, 5), ph: rnd(0, 6.28), spin: rnd(0, 6.28), vs: rnd(4, 11) * (Math.random() < .5 ? -1 : 1),
            w: rnd(6, 10), h: rnd(10, 16), c: pal[Math.floor(Math.random() * pal.length)], trail: ribbon ? [] : null });
        }
      });
      if (!run) { run = true; requestAnimationFrame(tick); }
    };
  }
  const blast = cannon(document.getElementById("confetti"));

  // 背景燈光只在播放時動；沒播放時畫一次就停，不在閱讀時晃
  addEventListener("resize", () => { idleDrawn = false; ensureFrame(); });
  function frame(ms) {
    frameId = 0;
    let keepRunning = true;
    try {
      const cue = update(), playing = S && !songV.hidden && isPlaying(), t = now();
      clicks(t, playing);
      lampFrame(t, playing);
      quizFrame(t);
      // 歌曲頁燈光換成這首的螢光棒顏色，回首頁換回藍白
      const want = S && !songV.hidden ? S : null;
      if (want !== penSong) { penSong = want; bg.pen(want && penOf(want).cols); idleDrawn = false; blasted = false; }
      // 播到副歌高潮噴一次彩帶；倒回高潮前再播到會再噴（Live 版時間軸不同，不套用 MV 的 CLIMAX）
      const cx = want && currentVideoSource(want) !== "live" ? CLIMAX[want.id] : null;
      if (cx != null) {
        if (t < cx - .3) blasted = false;
        else if (playing && !blasted && t >= cx - .05 && t < cx + .8 && OPT.light !== false) { blasted = true; blast(penOf(want).cols); if (venueOn && venue && venue.fire) venue.fire(); }
      }
      // 「交給觀眾」：沉浸模式播到大合唱的句子，舞台螢幕退暗、字幕和手燈海亮起來
      const cl = isImmersive && playing && LINES.length ? lineAt(t) : -1;
      const crowd = cl >= 0 && LINES[cl].acts.includes("sing");
      if (crowd !== crowdOn) { crowdOn = crowd; document.body.classList.toggle("imm-crowd", crowd); }
      const prevMs = lastMs || ms;
      const dt = Math.min(.1, Math.max(.001, (ms - prevMs) / 1000));
      if (OPT.light !== false) {
        if (playing) stageT += dt;
        lastMs = ms;
        // 每拍亮一下再退，小節第一拍最亮；這首沒有拍點資料時，改在每句歌詞開頭亮
        const li = lineAt(t), l = LINES[li], b = beatAt(t);
        let hit = 0, beat = Math.max(0, li);
        if (playing && !reduce && b) { hit = beatPulse(b) * (b.down ? 1 : .5); beat = Math.max(0, Math.floor(b.k / 4)); }
        else if (playing && !reduce && l) hit = Math.exp(-(t - l.t) / .4) * (l.acts.length ? 1 : .65);
        const energy = playing && cue ? (cue.listen ? .2 : cue.beat ? 1 : .45) : .4;
        if (isImmersive) {
          const bh = (playing && !reduce) ? hit.toFixed(3) : "0";
          if (ambientMesh) ambientMesh.style.setProperty("--beat-hit", bh);
          if (mvEl) mvEl.style.setProperty("--beat-hit", bh);
        }
        // 沉浸模式的手燈海比較高；大合唱時整片舉起來
        const raiseTo = isImmersive ? (crowd ? 1 : .35) : 0;
        if (Math.abs(bg.raise - raiseTo) > .005) { bg.raise += (raiseTo - bg.raise) * Math.min(1, dt * 2.4); idleDrawn = false; }
        // 3D 場館載好了就由它畫，2D 畫布休息
        const useVenue = isImmersive && !!venue;
        if (useVenue !== venueOn) { venueOn = useVenue; document.body.classList.toggle("has-venue", useVenue); idleDrawn = false; if (useVenue) venueLayout(); }
        if (useVenue) {
          const ease = Math.min(1, dt * 2.2), look = lampLook(t);
          // 拍手：手燈放到胸前不擺，跟著拍子一開一合（反拍拍手只在第 2、4 拍合）；跳躍：全場跟著拍子彈
          const offb = !!(cue && isOffbeat(cue.name)), clapOn = playing && (look.cue === "clap" || offb), jumpOn = playing && look.cue === "jump";
          venueRaise += ((crowd ? 1 : 0) - venueRaise) * ease;
          venueClap += ((clapOn ? 1 : 0) - venueClap) * Math.min(1, ease * 1.5);
          venueJump += ((jumpOn ? .16 : 0) - venueJump) * ease;
          // 兩手合起來的程度：拍點上是 1、兩拍中間張最開，用 cos 讓開合是平順的來回，不是一下彈回去
          // 反拍拍手只拍第 2、4 拍，所以開合週期拉長成兩拍
          const clapPulse = clapOn ? (b ? .5 + .5 * Math.cos(2 * Math.PI * (offb ? (b.x - 1) / 2 : b.x)) : hit) : 0;
          venue.render({ t: ms / 1000, swing: b ? b.x : ms / 1000 * (playing ? 1.6 : .35), amp: playing ? (look.cue === "listen" && !crowd ? .14 : .42) : .08,
            hit: playing && !reduce ? hit : 0, raise: venueRaise, px: pointer.x, py: pointer.y, still: reduce,
            colIdx: look.idx, bright: look.bright, clap: venueClap, clapPulse, jump: venueJump });
        } else if (playing || !idleDrawn) { bg(stageT, playing ? Math.max(energy, crowd ? .9 : 0) : energy, hit, cue && cue.listen && !crowd, playing, beat, dt); idleDrawn = !playing && Math.abs(bg.raise - raiseTo) <= .005; }
      } else {
        lastMs = ms;
        if (venueOn) { venueOn = false; document.body.classList.remove("has-venue"); }
        if (!idleDrawn) {
          const cv = document.getElementById("fx");
          if (cv) {
            const ctx = cv.getContext("2d");
            if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
          }
          if (ambientMesh) ambientMesh.style.setProperty("--beat-hit", "0");
          if (mvEl) mvEl.style.setProperty("--beat-hit", "0");
          idleDrawn = true;
        }
      }
      updatePip();
      keepRunning = !songV.hidden || !idleDrawn;
    } catch (err) {
      console.error(err);
      keepRunning = !songV.hidden;
    } finally {
      if (keepRunning && !frameId) {
        frameId = requestAnimationFrame(frame);
      }
    }
  }
  ensureFrame();
})();
