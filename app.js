(() => {
  // ── 語言：<html data-lang> 由建置寫入（zh／en／ja）；文字以中文原文當 key 查 i18n.js 的字典，查不到就顯示中文
  // ROOT：英文、日文版在 /en/、/jp/ 底下，歌詞檔、更新日誌這些共用檔案要往上一層找
  const LANG = document.documentElement.dataset.lang || "zh";
  const ROOT = document.documentElement.dataset.root || "";
  const DICT = (window.ADO_I18N || {})[LANG] || {};
  const T = (src, ...args) => (DICT[src] ?? src).replace(/\{(\d+)\}/g, (_, i) => args[i]);
  // 英文版歌詞下面那行放羅馬拼音，日文版不放，中文版放中譯
  const subLine = item => (LANG === "en" ? item.ro || "" : LANG === "ja" ? "" : item.tr || "");
  // 反拍：喊聲標籤裡有「反拍」（或翻譯後的同一個詞）就用反拍的提示樣式
  const isOffbeat = txt => !!txt && (txt.includes("反拍") || txt.includes(T("反拍")));

  // ── 動作 ──
  const ACT = {
    sing:    { name: T("大合唱"),   icon: "i-sing",    how: T("跟著一起唱") },
    clap:    { name: T("拍手"),     icon: "i-clap",    how: T("跟著節拍拍手") },
    wave:    { name: T("舉手揮動"), icon: "i-wave",    how: T("舉手左右揮") },
    jump:    { name: T("跳躍"),     icon: "i-jump",    how: T("跟著節奏跳") },
    call:    { name: T("喊聲"),     icon: "i-call",    how: T("跟著喊短句") },
    gesture: { name: T("手勢"),     icon: "i-gesture", how: T("跟 Ado 做同樣的動作") },
    listen:  { name: T("安靜聽"),   icon: "i-listen",  how: T("留給 Ado 唱") }
  };

  const { SONGS, UT, PEN, BEAT, CLIMAX, SERIES = [] } = window.ADO_SONGS;
  // hold：應援和螢光棒顏色還沒有可靠來源（例如剛出的新歌），資料先留著、畫面不顯示，確認後拿掉 hold；sug 的建議也一樣先不顯示；沒有 tips 又不是 free 的歌也先視為 hold
  SONGS.forEach(s => { if (s.sug || (!s.free && (!s.tips || !s.tips.length))) s.hold = true; if (s.hold) { s.acts = []; s.tips = []; } });
  SONGS.forEach(s => { s.ut = UT[s.id] ? `https://www.uta-net.com/song/${UT[s.id]}/` : `https://www.uta-net.com/artist/29298/`; s.acts = s.acts || []; s.tips = (s.tips || []).map(t => T(t)); s.dur = s.len.split(":").reduce((a, b) => a * 60 + +b, 0); });
  // 推出順序：MV 在 YouTube 公開的日期（日本時間）；編號照這個順序
  SONGS.sort((a, b) => a.date.localeCompare(b.date)).forEach((s, i) => s.no = i + 1);
  // 歌詞：正式網站由 scripts/build.mjs 拆成每首一個檔（lyrics/<id>.json），<html data-lyrics> 是版本；
  // 先讀小小的 lyrics/index.json（每首的應援數量），打開哪首才載那首。直接開原始檔時沒有拆，改讀整份 song-lyrics.js
  // 應援數量：歌詞裡有動作的行數（「安靜聽」不算）；index.json 裡沒有的歌就是沒有逐行歌詞
  const LYV = document.documentElement.dataset.lyrics, LY = {}, lyWait = {}, LY_LIVE = {}, lyLiveWait = {};
  let lyReady = false;
  const loadScript = src => new Promise(res => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = el.onerror = res;
    document.head.appendChild(el);
  });
  const getJSON = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const lyLoaded = (LYV
    ? getJSON(`${ROOT}lyrics/index.json?v=${LYV}`)
    : Promise.all([
        loadScript(ROOT + "song-lyrics.js"),
        loadScript(ROOT + "song-lyrics-live.js")
      ]).then(() => {
        const idx = {};
        (window.SONG_LYRICS || []).forEach(b => { LY[b.id] = b; if (b.lyrics && b.lyrics.length) idx[b.id] = b.lyrics.filter(l => (l.acts || []).some(a => a !== "listen")).length; });
        (window.SONG_LYRICS_LIVE || []).forEach(b => {
          const baseId = b.baseId || b.id.replace('-live', '');
          LY_LIVE[baseId] = b;
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
    if (!s.lines) return true;
    if (source === "live" && s.liveVideo) return !!LY_LIVE[s.id] || !!LY[s.id];
    return !!LY[s.id];
  };
  const fetchLy = id => lyWait[id] = lyWait[id] || getJSON(`${ROOT}lyrics/${id}.json?v=${LYV}`).then(b => { if (b) LY[id] = b; });
  const fetchLyLive = id => lyLiveWait[id] = lyLiveWait[id] || getJSON(`${ROOT}lyrics-live/${id}.json?v=${LYV}`).then(b => { if (b) LY_LIVE[id] = b; });
  function loadLyrics(s) {
    if (!LYV || lyHave(s)) return Promise.resolve();
    const tasks = [fetchLy(s.id)];
    if (s.liveVideo) tasks.push(fetchLyLive(s.id));
    return Promise.all(tasks).then(() => { if (!LY[s.id] && !LY_LIVE[s.id]) s.lines = false; });
  }
  const firstSong = (location.hash.slice(1) || document.documentElement.dataset.song || "").split("@")[0];
  if (LYV && SONGS.some(s => s.id === firstSong)) {
    fetchLy(firstSong);
    fetchLyLive(firstSong);
  }
  const BY = Object.fromEntries(SONGS.map(s => [s.id, s]));
  const PENC = { 青: [T("藍"), "#5d9dfe"], 水: [T("水藍"), "#5fd4ff"], 白: [T("白"), "#f2efe8"], 赤: [T("紅"), "#ff4a5a"], 桃: [T("粉紅"), "#ff7ab8"], 紫: [T("紫"), "#a374ff"], 橙: [T("橘"), "#ff9a3c"], 黄: [T("黃"), "#ffd84a"], 緑: [T("綠"), "#4ee08a"] };
  const penName = k => (k === "彩" ? T("彩色") : PENC[k][0]);
  const RAINBOW = [..."赤橙黄緑水青紫"];
  function penOf(s) {
    const pen = !s.hold && PEN[s.id] && PEN[s.id][0] !== "?" && PEN[s.id], keys = [...(pen || "青")];
    return { keys, none: !pen, cols: keys.flatMap(k => (k === "彩" ? RAINBOW : [k]).map(c => PENC[c][1])) };
  }

  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const icon = a => `<svg class="a-${a}" role="img" aria-label="${ACT[a].name}"><use href="#${ACT[a].icon}"/></svg>`;
  // 一行的主色：第一個不是「安靜聽」的動作
  const mainAct = acts => acts.find(a => a !== "listen") || (acts.length ? "listen" : "");
  // 歌詞行的底色：有要唱的字時整行不染色，只染那幾個字；其他行用第一個不是「唱」的動作
  const lineAct = l => l.sing.length ? "sing" : mainAct(l.acts.filter(a => a !== "sing")) || mainAct(l.acts);
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
  const thumb = (s, w, h, lazy) => `<img class="thumb" src="https://i.ytimg.com/vi/${s.yt}/mqdefault.jpg" alt="" width="${w}" height="${h}" decoding="async"${lazy ? ' loading="lazy"' : ""}>`;
  // 歌名下面那行：中文名（和日文一樣時用英文名）、是不是翻唱
  // 歌名下面那行：中文版放官方中文名，英文版放英文名，日文版不放；翻唱曲加註
  const otherName = s => (LANG === "ja" ? "" : LANG === "en" ? (s.en && s.en !== s.ja ? s.en : "") : (s.zh !== s.ja ? s.zh : (s.en && s.en !== s.ja ? s.en : "")));
  const subOf = s => [otherName(s), s.cover ? T("翻唱") : ""].filter(Boolean).join("・");
  const actIcons = s => s.acts.filter(a => a !== "listen").map(icon).join("");

  const hasLiveVideo = s => Boolean(s.liveVideo || (s.live && s.yt));
  const hasLiveAudio = s => Boolean((s.lives && s.lives.length > 0) && !s.liveVideo && !s.live);
  const hasLive = s => Boolean((s.lives && s.lives.length > 0) || s.liveVideo || s.live);

  const liveTagOf = s => {
    if (filter === "live") {
      if (hasLiveVideo(s)) return `<span class="live-tag is-video">${T("Live 影片")}</span>`;
      if (hasLiveAudio(s)) return `<span class="live-tag is-audio">${T("Live 音源")}</span>`;
    } else if (hasLiveVideo(s)) {
      return `<span class="live-tag is-video">${T("Live 影片")}</span>`;
    }
    return "";
  };

  const rowHtml = s => `<li><a class="song" href="song/${s.id}/" data-id="${s.id}">${thumb(s, 80, 45, true)}<span class="song-main"><span class="name"><span class="ja" lang="ja">${esc(s.ja)}</span><span class="sub"><span class="zh">${esc(subOf(s))}</span>${liveTagOf(s)}${penDots(s)}</span></span><span class="acts">${actIcons(s)}${s.free ? `<span class="free">${T("自由搖")}</span>` : ""}${sort === "cheer" && s.cheer ? `<span class="cnt">${T("{0} 句", s.cheer)}</span>` : ""}</span></span></a></li>`;
  // free：粉絲說沒有固定應援；hold（含 sug）：還查不到可靠的應援資料
  function renderList() {
    const term = q.value.trim().toLowerCase();
    const cleanTerm = term.replace(/[\s\-_'’"!?！？()（）/]/g, "");
    const rows = ordered().filter(s => {
      if (term) {
        const pool = [s.ja, s.zh, s.en || "", s.ro || "", s.id, ...(s.alias || [])];
        const matchPlain = pool.some(x => x.toLowerCase().includes(term));
        const matchClean = cleanTerm ? pool.some(x => x.toLowerCase().replace(/[\s\-_'’"!?！？()（）/]/g, "").includes(cleanTerm)) : false;
        if (!matchPlain && !matchClean) return false;
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
    list.innerHTML = rows.map(rowHtml).join("");
    const plain = !term && filter === "all", total = rows.length;
    // 還沒輪到的歌先藏起來（hidden），還在 HTML 裡
    [...list.children].forEach((li, i) => li.hidden = i >= shown);
    list.classList.remove("collapsed");
    const rest = Math.max(0, total - shown);
    if (plain) session.set(shownKey, shown);
    listMore.hidden = total <= LIMIT;
    listProgress.textContent = rest ? T("已列出 {0}／{1} 首", shown, total) : T("{0} 首都列出來了", total);
    // 列完了換成「收合」，帶回清單開頭
    moreBtn.textContent = rest ? T("再看 {0} 首", Math.min(STEP, rest)) : T("收合清單");
    countEl.textContent = plain ? T("{0} 首", SONGS.length) : T("{0} 首符合", rows.length);
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) emptyEl.textContent = term ? T("找不到「{0}」。換個寫法試試，日文或中文都可以。", q.value.trim()) : T("這個分類目前沒有歌。");
  }
  // 首頁上所有歌曲連結（清單、書架、主視覺）：普通左鍵點擊用 SPA 即時切換；帶修飾鍵就讓瀏覽器開新分頁
  homeEl.addEventListener("click", ev => {
    const a = ev.target.closest("a[data-id]");
    if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return;
    if (BY[a.dataset.id]) {
      ev.preventDefault();
      location.hash = a.dataset.id;
    }
  });
  // 螢光棒顏色的小圓點
  const penDots = s => `<span class="dots" aria-label="${T("螢光棒：")}${penOf(s).keys.map(penName).join(T("、"))}">${penOf(s).keys.map(k => k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`).join("")}</span>`;
  // 兩個搜尋框（主視覺、頂欄）內容同步；在頂欄打字時，清單不在眼前就捲過去
  const songsSec = document.getElementById("songs");
  function onSearch(src) {
    const other = src === q ? barQ : q;
    if (other.value !== src.value) other.value = src.value;
    shown = LIMIT;
    renderList();
  }
  q.addEventListener("input", () => onSearch(q));
  barQ.addEventListener("input", () => {
    onSearch(barQ);
    const r = songsSec.getBoundingClientRect();
    if (r.top > innerHeight * .6 || r.bottom < 120) songsSec.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  });
  let liveSub = "all"; // "all" | "video" | "audio"
  const liveSubFilter = document.getElementById("liveSubFilter");
  function syncLiveSubFilter() {
    if (!liveSubFilter) return;
    liveSubFilter.hidden = filter !== "live";
    const elAll = document.getElementById("cntLiveAll");
    const elVid = document.getElementById("cntLiveVideo");
    const elAud = document.getElementById("cntLiveAudio");
    if (elAll) elAll.textContent = SONGS.filter(hasLive).length;
    if (elVid) elVid.textContent = SONGS.filter(hasLiveVideo).length;
    if (elAud) elAud.textContent = SONGS.filter(hasLiveAudio).length;
    liveSubFilter.querySelectorAll("[data-sub]").forEach(b => {
      const active = b.dataset.sub === liveSub;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
  }

  document.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => {
    filter = b.dataset.f; shown = LIMIT;
    if (filter === "live") liveSub = "all";
    syncLiveSubFilter();
    document.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderList(); replay(list, "swap");
  }));

  if (liveSubFilter) {
    liveSubFilter.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-sub]");
      if (!btn) return;
      liveSub = btn.dataset.sub;
      syncLiveSubFilter();
      shown = LIMIT;
      renderList(); replay(list, "swap");
    });
  }
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
      shown = LIMIT; renderList();
      // 收合時清單變短，把畫面帶回清單開頭，不然會停在頁尾
      if (songsSec.getBoundingClientRect().top < 0) songsSec.scrollIntoView({ block: "start" });
      return;
    }
    shown = Math.min(total, before + STEP);
    renderList();
    // 新露出的這一批依序進場；用鍵盤按的，焦點移到這批第一首
    const fresh = [...list.children].slice(before, shown);
    if (!reduce) fresh.forEach((li, i) => { li.style.setProperty("--k", i); li.classList.add("fresh"); });
    if (e.detail === 0 && fresh[0]) fresh[0].querySelector("a").focus();
  });
  syncSort();
  syncLiveSubFilter();
  renderList();
  lyLoaded.then(renderList);

  // 「隨機練一首」：按下去那一刻才抽（首頁的點擊處理接著用 data-id 換頁）；只抽有應援資料的歌，不抽剛剛練過的那首
  const randomLink = document.getElementById("randomLink");
  const pickRandom = () => {
    const last = recentIds()[0], pool = SONGS.filter(s => !s.hold && s.tips.length && s.id !== last), s = pool[Math.floor(Math.random() * pool.length)];
    if (!s) return;
    randomLink.dataset.id = s.id;
    randomLink.href = `song/${s.id}/`;
  };
  ["pointerdown", "keydown", "click"].forEach(ev => randomLink.addEventListener(ev, e => { if (ev !== "keydown" || e.key === "Enter") pickRandom(); }));

  // 書架：推薦先練的 6 首，6 種應援動作全包；下方進度條跟著捲動走，箭頭到底就停用
  const STARTERS = ["odo", "freedom", "shinjidai", "gyakkou", "ashura", "usseewa"].filter(id => BY[id]);
  const shelf = document.getElementById("shelf"), shelfNav = document.getElementById("shelfNav"), shelfThumb = document.getElementById("shelfThumb");
  const shelfPrev = document.getElementById("shelfPrev"), shelfNext = document.getElementById("shelfNext");
  shelf.innerHTML = STARTERS.map(id => {
    const s = BY[id];
    return `<li><a class="card" href="song/${s.id}/" data-id="${s.id}">${thumb(s, 320, 180, false)}<span class="card-text"><span class="card-ja" lang="ja">${esc(s.ja)}</span><span class="card-sub"><span>${esc(subOf(s))}</span><span class="acts">${actIcons(s)}</span></span></span></a></li>`;
  }).join("");
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
  function applyTheme() {
    const p = themePref();
    document.documentElement.dataset.theme = p === "light" || (p === "system" && sysLight.matches) ? "light" : "dark";
    themeIco.setAttribute("d", THEME_ICON[p]);
    themeBtn.setAttribute("aria-label", T("外觀：{0}", THEME_NAME[p]));
    document.querySelectorAll("[data-theme-pick]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.themePick === p)));
    syncThemeColor();
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
  fetch("https://api.github.com/repos/Gcree/penlight-sync/releases/latest")
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data || !Array.isArray(data.assets)) return;
      const tag = data.tag_name || "";
      const fill = (re, link, desc) => {
        const asset = data.assets.find(a => re.test(a.name));
        if (!asset) return;
        link.href = asset.browser_download_url;
        desc.textContent = `${tag ? `${tag}・` : ""}${(asset.size / 1048576).toFixed(1)} MB`;
      };
      fill(/win/i, lampDlWinLink, lampDlWinDesc);
      fill(/mac/i, lampDlMacLink, lampDlMacDesc);
    })
    .catch(() => {});

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
  const homeV = document.getElementById("home"), songV = document.getElementById("song");
  const box = document.getElementById("lines"), legend = document.getElementById("legend");
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
  let S = null, LINES = [], TAGGED = false, lineEls = [], curLine = -1, curKey = "";

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
      ja: (j => (j && /^（[^）]+）$/.test(j) ? T(j) : j))(String(item.jp || "").trim()) || null,
      zh: String(subLine(item)).trim() || null,
      acts: S.hold ? [] : (item.acts || []).filter(a => ACT[a] && a !== "listen"),
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
  function lineAt(t) { let k = -1; LINES.forEach((l, i) => { if (t >= l.t) k = i; }); return k; }

  // 假名：歌詞裡寫「漢字(かな)」就會標在漢字上方；每個字包成 .k 給卡拉OK與字體飛入動畫用
  // sung 是觀眾要唱的字，取最後一次出現的位置（Ado 先唱、觀眾接時，觀眾在後面）
  function jaHTML(txt, sung = []) {
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
  function renderLines() {
    box.innerHTML = "";
    if (!lyHave(S)) { box.innerHTML = `<div class="empty"><span>${T("正在載入歌詞…")}</span></div>`; legend.innerHTML = ""; singJump.hidden = true; return; }
    if (!LINES.length) {
      box.innerHTML = `<div class="empty"><b>${T("這首還沒有逐行時間軸")}</b>${S.tips.length ? `<ul class="summary">${S.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul><span>${T("先邊看 MV 邊照上面的重點練。")}</span>` : `<span>${T("應援還在整理，先看 MV 熟悉旋律，副歌跟著現場氣氛就好。")}</span>`}<span>${T('歌詞請看<a href="{0}" target="_blank" rel="noopener">歌ネット的正版歌詞頁</a>。', S.ut)}</span></div>`;
      legend.innerHTML = ""; SING = []; singJump.hidden = true; sc.scrollTop = 0; padEnd(); return;
    }
    LINES.forEach((l, i) => {
      const el = document.createElement("div");
      const m = lineAct(l);
      el.className = "ln" + (m ? " a-" + m : "") + (l.acts.includes("sing") ? " sing" : ""); el.tabIndex = 0;
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
    lineEls = [...box.querySelectorAll(".ln")]; curLine = -1; box.classList.remove("has-now");
    const used = new Set(LINES.flatMap(l => l.acts));
    focusAct = "";
    legend.innerHTML = Object.keys(ACT).filter(a => used.has(a)).map(a => `<button class="a-${a}" data-act="${a}" aria-pressed="false" title="${T("只亮出要{0}的句子", ACT[a].name)}"><i></i>${ACT[a].name}</button>`).join("");
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
  let lastUpdateT = -1;

  function applyKaraokeTimingToDom(song) {
    if (!song || !lineEls.length || !LINES.length) return;
    const api = window.KARAOKE_SOURCES;
    lineEls.forEach((el, i) => {
      const lineData = LINES[i];
      if (!lineData) return;
      const timedLine = karaokeTiming && karaokeTiming.lines && karaokeTiming.lines[i];
      const ks = el.querySelectorAll(".k");
      if (!ks.length) return;

      if (timedLine && timedLine.granularity === "word" && Array.isArray(timedLine.words) && timedLine.words.length && api && typeof api.mapUnitsToWords === "function") {
        const units = api.extractUnits(lineData.ja || "");
        const nextTime = LINES[i + 1] ? LINES[i + 1].t : lineData.t + 4;
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
    const seq = ++karaokeLoadSeq;
    karaokeTiming = null;

    const api = window.KARAOKE_SOURCES;
    if (!api || typeof api.load !== "function" || typeof api.alignToLocalLyrics !== "function") {
      applyKaraokeTimingToDom(song);
      return;
    }

    let timed = null;
    try {
      timed = await api.load(song, { duration: DUR() });
    } catch (e) {
      timed = null;
    }

    if (seq !== karaokeLoadSeq || S !== song) return;

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
  let player = null, ready = false, vid = "", slowTimer = 0, START = 0, muteTimer = 0;
  const vstatus = document.getElementById("vstatus"), vmsg = document.getElementById("vmsg");

  // ── 影片版本（MV / Live）控制 ──
  let videoSourceOverride = null; // null | "mv" | "live"
  let routeSource = null;

  function currentVideoSource(s = S) {
    if (!s || !s.liveVideo) return "mv";
    if (videoSourceOverride === "mv" || videoSourceOverride === "live") return videoSourceOverride;
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

  function updateExternalLinks(s = S) {
    if (!s) return;
    const curYt = activeVideoId(s);
    ["ytLink", "ytLink2"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.href = `https://www.youtube.com/watch?v=${curYt}`;
    });
    const cardYt = document.getElementById("cardYt");
    if (cardYt) cardYt.href = `https://www.youtube.com/watch?v=${curYt}`;
  }

  function currentOffset(s = S) {
    if (!s || !s.liveVideo || currentVideoSource(s) !== "live") return 0;
    // 如果這首歌已有手動對時的專屬現場歌詞檔，時間軸已精確對齊現場影片，offset 為 0
    if (LY_LIVE[s.id]) return 0;
    return Number(s.liveVideo.offset) || 0;
  }

  function switchVideoSource(source) {
    if (!S || !S.liveVideo) return;
    const targetSource = source === "live" ? "live" : "mv";
    if (currentVideoSource(S) === targetSource) return;

    const curIdx = lineAt(now());
    videoSourceOverride = targetSource;
    updateVideoSourceUi();

    const doSwitch = () => {
      loadSongData(targetSource);
      renderLines();

      const targetVid = activeVideoId(S);
      if (player && ready) {
        let targetStart = 0;
        if (curIdx >= 0 && LINES[curIdx]) {
          targetStart = LINES[curIdx].t;
        } else {
          targetStart = player.getCurrentTime() || 0;
        }
        vid = targetVid;
        try { player.unMute(); } catch (e) {}
        player.loadVideoById({ videoId: targetVid, startSeconds: targetStart });
        ensurePlaying();
      }
      updateExternalLinks(S);

      if (targetSource === "live") {
        karaokeTiming = null;
        applyKaraokeTimingToDom(S);
      } else {
        loadKaraokeTiming(S);
      }
    };

    if (lyReady && !lyHave(S, targetSource)) {
      loadLyrics(S, targetSource).then(doSwitch);
    } else {
      doSwitch();
    }
  }

  // 長度以 YouTube 回報的為準，還沒載好才用資料裡的長度
  const DUR = () => { try { const d = ready && vid === activeVideoId(S) && player.getDuration(); if (d) return d; } catch (e) {} return S ? S.dur : 1; };
  function videoMsg(text) { vstatus.hidden = !text; if (text) vmsg.textContent = text; }
  const now = () => { try { return ready && player.getCurrentTime() || 0; } catch (e) { return 0; } };
  const isPlaying = () => { try { return ready && [1, 3].includes(player.getPlayerState()); } catch (e) { return false; } };
  function pause() { if (ready) player.pauseVideo(); }
  function seek(t) { if (!ready) return; player.seekTo(Math.max(0, Math.min(DUR(), t)), true); player.playVideo(); }

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
  const singAt = (dir, t) => dir < 0 ? SING.filter(x => x < t - 1.5).pop() : SING.find(x => x > t + .5);
  singPrev.addEventListener("click", () => { const t = singAt(-1, now()); if (t != null) seek(t); });
  singNext.addEventListener("click", () => { const t = singAt(1, now()); if (t != null) seek(t); });

  function createPlayer(videoId, startPlaying = true) {
    if (player || !window.YT || !YT.Player) return;
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
          clearTimeout(slowTimer);
          videoMsg("");
          applyRate();
          // 等播放器的期間已經回首頁：不要在背景出聲
          if (!S || songV.hidden) { try { player.pauseVideo(); } catch (e) {} START = 0; return; }
          // 等播放器的期間換了歌：交給 loadVideo 換片
          if (vid !== activeVideoId(S)) { loadVideo(); return; }
          if (startPlaying) {
            // 點連結時播放器先建好，之後才知道網址上的 @秒數
            if (START && START !== startAt) seek(START);
            try { player.unMute(); player.playVideo(); } catch (e) {}
            ensurePlaying();
          }
          START = 0;
        },
        // 換影片後 YouTube 會把速度重設成 1，播放或載入完成時再套一次
        onStateChange: e => { if (e.data === 1 || e.data === 5) applyRate(); if (e.data === 0) ended(); },
        onError: () => videoMsg(T("無法播放影片，請到 YouTube 觀看。"))
      }
    });
  }

  function loadVideo() {
    if (!S || songV.hidden || !window.YT || !YT.Player) return;
    const targetVid = activeVideoId(S);
    const startSec = START || 0;
    if (!player) {
      vid = targetVid;
      createPlayer(vid, true);
      return;
    }
    if (!ready) return;
    // 打開歌曲或切歌播放
    if (vid !== targetVid) {
      vid = targetVid;
      try { player.unMute(); } catch (e) {}
      player.loadVideoById({ videoId: targetVid, startSeconds: startSec });
    } else {
      if (START) seek(START);
      try { player.unMute(); } catch (e) {}
      player.playVideo();
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
  document.addEventListener("click", e => {
    const a = e.target.closest("a[data-id], a[href^='#'], #prevSong, #nextSong");
    if (!a) return;
    const targetId = getSongIdFromEl(a);
    const targetSong = targetId && BY[targetId];
    if (!targetSong) return;

    const targetVid = activeVideoId(targetSong);
    if (!player && window.YT && YT.Player) {
      vid = targetVid;
      createPlayer(vid, true);
      return;
    }

    if (player && ready) {
      try {
        player.unMute();
        if (vid !== targetVid) {
          vid = targetVid;
          player.loadVideoById({ videoId: targetVid, startSeconds: 0 });
        } else {
          player.playVideo();
        }
      } catch (err) {}
    }
  });
  // 瀏覽器不讓有聲音的影片自己播時（直接打開網址、還沒點過畫面，iPhone 常見），改成靜音播放並提醒
  function ensurePlaying() {
    clearTimeout(muteTimer);
    muteTimer = setTimeout(() => {
      if (!ready || songV.hidden) return;
      const st = player.getPlayerState();
      if (st === 1 || st === 2 || st === 3) return;  // 在播、使用者自己暫停了、或還在緩衝
      player.mute(); player.playVideo();
      toast(T("瀏覽器不讓影片自動出聲，先靜音播放；點影片的喇叭開聲音"));
    }, 3000);
  }
  if (location.protocol === "file:") {
    videoMsg(T("直接點開檔案時 YouTube 不允許嵌入播放。請改用資料夾裡的「開啟網站.command」，或放上 GitHub Pages 再看。"));
  } else {
    // 離線時（加到主畫面、在場館收不到訊號）影片播不了，先說清楚；連回網路就重新載入播放器
    const OFFLINE = T("離線中：影片要連上網路才能播，歌詞和應援重點照樣可以看。");
    const loadYT = () => {
      if (window.YT && YT.Player) return;
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => { if (!ready) videoMsg(navigator.onLine ? T("影片連線延遲，請到 YouTube 觀看。") : OFFLINE); }, 8000);
      const yts = document.createElement("script");
      yts.src = "https://www.youtube.com/iframe_api";
      yts.onerror = () => { yts.remove(); videoMsg(navigator.onLine ? T("無法載入 YouTube 播放器，請到 YouTube 觀看。") : OFFLINE); };
      document.head.appendChild(yts);
    };
    window.onYouTubeIframeAPIReady = loadVideo;
    if (!navigator.onLine) videoMsg(OFFLINE);
    loadYT();
    addEventListener("online", () => { if (!ready) { videoMsg(T("正在載入影片…")); loadYT(); } });
    addEventListener("offline", () => { if (!ready) videoMsg(OFFLINE); });
  }
  // 離線用的 Service Worker：只有建置過的網站才有 sw.js；ROOT 讓英文、日文版也註冊到網站根目錄
  if (LYV && "serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register(ROOT + "sw.js").catch(() => {}));

  function openSong(s, t = 0) {
    quizStop(); closeSheets();
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
    // 上一首播不了留下的錯誤訊息，換歌時先收掉；播放器還沒好時保留「正在載入」那類提示
    if (ready) videoMsg("");
    // 在這首自己的頁面（song/<id>/）時保留建置時寫好的完整標題，給搜尋引擎看
    document.title = s.id === PAGE_SONG ? PAGE_TITLE : `${s.ja}｜${T("Ado 應援指南")}`;
    const sub = otherName(s);
    // 歌名前的小唱片：首頁唱片架飛過來的落點，播放時會轉
    document.getElementById("sTitle").innerHTML = (window.ADO_CD ? `<span class="sdisc" aria-hidden="true">${window.ADO_CD(s)}</span>` : "") + esc(s.ja) + (sub ? `<span lang="${LANG === "zh" && s.zh !== s.ja ? "zh-Hant-TW" : "en"}">${esc(sub)}</span>` : "");
    updateExternalLinks(s);
    document.getElementById("lyLink").href = s.ut;
    const lives = s.lives;
    const liveOpt = document.getElementById("liveOpt");
    if (liveOpt) {
      liveOpt.hidden = lives.length === 0;
      const liveList = document.getElementById("liveList");
      if (liveList) {
        liveList.innerHTML = lives.map(l =>
          `<li><a href="https://www.youtube.com/watch?v=${l.yt}" target="_blank" rel="noopener"><span>${esc(l.concert)}</span><svg class="ext" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a></li>`
        ).join("");
      }
    }
    const p = penOf(s);
    document.getElementById("pen").innerHTML = T("螢光棒") + p.keys.map(k => k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`).join("")
      + `<b>${p.keys.map(penName).join(T("、"))}${p.none ? T("（沒指定）") : ""}</b>`;
    // 接關聯曲：換到的是上一首說好的那首，告訴使用者為什麼接這首
    if (TOOL.related && nextUp && nextUp.id === s.id && nextUp.why) toast(T("接著聽關聯曲：{0}", nextUp.why));
    shuffleSeen(s);
    paintNav(s);
    paintRelated(s);
    fillSong();
    document.querySelectorAll('[data-tool="click"]').forEach(b => b.disabled = !BEAT[s.id]);
    loadVideo();
    loadKaraokeTiming(s);
    updateAmbientColors(s);
    if (!hasDocPip()) prepCanvasPip();
  }
  // 歌詞相關的部分：歌詞檔載好後會再跑一次
  function fillSong() {
    const s = S;
    const curSrc = currentVideoSource(s);
    if (lyReady && !lyHave(s)) loadLyrics(s).then(() => { if (S === s && !songV.hidden) fillSong(); });
    loadSongData(curSrc);
    renderLines();
    if (karaokeTiming && S && karaokeTiming.songId === S.id) {
      applyKaraokeTimingToDom(S);
    }
    // 測驗要有逐行應援才出得了題
    document.getElementById("toolQuiz").disabled = !TAGGED;
    const hasTips = TAGGED && s.tips && s.tips.length > 0 && !s.hold;
    const tipsOpt = document.getElementById("tipsOpt");
    if (tipsOpt) {
      tipsOpt.hidden = !hasTips;
      tipsOpt.open = false;
      document.getElementById("tipsSummary").innerHTML = hasTips ? s.tips.map(t => `<li>${esc(t)}</li>`).join("") : "";
    }
    document.getElementById("cueSummary").innerHTML = TAGGED ? s.tips.map(t => `<li>${esc(t)}</li>`).join("") : "";
    document.getElementById("cueIcon").innerHTML = `<use href="#${ACT[s.acts[0] || "listen"].icon}"/>`;
    cueBox.className = "cue";
    document.getElementById("cueName").textContent = T("按播放開始");
    document.getElementById("cueHow").textContent = !lyHave(s) ? "" : LINES.length ? T("播放後，這裡會顯示現在要做的動作。") : T("這首還沒有逐行時間軸，不會跳提示，照歌詞欄的重點練。");
    document.getElementById("cueNext").innerHTML = "";

    // 同步更新歌曲應援速覽卡片（若存在於 DOM 中）
    const cardJa = document.getElementById("cardJa");
    if (cardJa) {
      cardJa.textContent = s.ja + (otherName(s) ? `（${otherName(s)}）` : "");
      const p = penOf(s);
      const penText = p.keys.map(penName).join(T("、")) + (p.none ? T("（未指定，建議用代表色藍色）") : "");
      document.getElementById("cardPen").textContent = penText;
      const aka = LANG === "zh" ? [...new Set([s.zh !== s.ja ? s.zh : "", ...(s.alias || []), s.en && s.en !== s.ja ? s.en : ""].filter(Boolean))].join("・") : LANG === "en" ? [s.ro && s.ro !== s.en ? s.ro : ""].filter(Boolean).join("・") : "";
      [["cardAka", aka], ["cardTie", s.tie ? T(s.tie) : ""]].forEach(([k, v]) => {
        const dt = document.getElementById(k + "Dt"), dd = document.getElementById(k + "Dd");
        if (dt && dd) { dd.textContent = v; dt.hidden = dd.hidden = !v; }
      });
      document.getElementById("cardTips").textContent = s.tips && s.tips.length ? s.tips.join("；") : (s.free ? T("沒有固定應援，自由跟著節奏搖手燈。") : T("應援還在整理，先熟悉旋律。"));
      const cardYt = document.getElementById("cardYt");
      if (cardYt) cardYt.href = `https://www.youtube.com/watch?v=${activeVideoId(s)}`;
      const cardLiveDt = document.getElementById("cardLiveDt");
      const cardLiveDd = document.getElementById("cardLiveDd");
      if (cardLiveDt && cardLiveDd) {
        const lives = s.lives;
        if (lives.length > 0) {
          cardLiveDt.hidden = false;
          cardLiveDd.hidden = false;
          cardLiveDd.innerHTML = lives.map(l => `<a href="https://www.youtube.com/watch?v=${l.yt}" class="live-chip" target="_blank" rel="noopener">${esc(l.concert)} ↗</a>`).join(" ");
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
    return { key: li, acts: l.acts, name: cueLabel(l), how: l.acts.map(a => ACT[a].how).join("，"), claps: S.claps, beat: true };
  }
  function nextChange(t) {
    const li = lineAt(t), cur = LINES[li], sig = l => l.acts.join(",") + cueLabel(l);
    for (let i = li + 1; i < LINES.length; i++) {
      if (!cur || sig(LINES[i]) !== sig(cur)) { const l = LINES[i]; if (!l.acts.length) continue; return { t: l.t, acts: l.acts, name: cueLabel(l) }; }
    }
    return null;
  }

  // 拍點：x 是第幾拍（含小數）、f 是這拍過了多少、bar 是小節裡的第幾拍、down 是小節第一拍；這首沒有拍點資料回 null
  function beatAt(t) {
    const bt = S && BEAT[S.id]; if (!bt) return null;
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
    const head = { act, name: ACT[act].name + (extra.length ? `<em>＋${extra.join("、")}</em>` : "") };
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
    const mv = document.querySelector(".mv");
    const r = (mv || screenEl).getBoundingClientRect(), c = cueBox.getBoundingClientRect();
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
    const pen = penOf(S).cols;
    cueFrame.style.setProperty("--c1", pen[0]); cueFrame.style.setProperty("--c2", pen[1 % pen.length]);
    al.style.setProperty("--pulse", pulse.toFixed(3));
    // 「唱」最後的 Clap Clap Clap：三下圓點
    if (cue.claps && t >= cue.claps && t < cue.claps + 2.2) {
      showCard("claps3", { act: "clap", name: T("拍三下"), kind: "claps3", body: dotsHTML(3), how: T("啪、啪、啪") });
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
    showCard("l" + cue.key, cardFor(cue, l));
    cueFrame.style.opacity = (.6 + .4 * pulse).toFixed(2);
    if (alKind === "sing") {
      // 唱到的字亮起：要唱的字在這行的位置，照這行的進度換算
      const end = LINES[cue.key + 1] ? LINES[cue.key + 1].t : DUR(), frac = Math.max(0, Math.min(1, (t - l.t) / Math.max(.5, (end - l.t) * .9)));
      const at = Math.min(...alSing.map(w => l.ja.lastIndexOf(w)).filter(i => i >= 0), l.ja.length), len = Math.max(1, l.ja.length - at);
      const lit = Math.round(Math.max(0, Math.min(1, (frac * l.ja.length - at) / len)) * alWords.length);
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
  function spawnGlyphWave(targetEl) {
    if (!targetEl || reduce || QZ) return;
    const old = targetEl.querySelectorAll(".chorus-glyph-wave");
    old.forEach(w => w.remove());

    const wave = document.createElement("span");
    wave.className = "chorus-glyph-wave";
    wave.setAttribute("aria-hidden", "true");
    wave.innerHTML = targetEl.innerHTML;
    targetEl.appendChild(wave);
    wave.addEventListener("animationend", () => wave.remove(), { once: true });
  }

  function triggerChorusRipples(lineEl, lineData, isClimax) {
    if (!lineEl || reduce) return;
    const sungEls = lineEl.querySelectorAll(".sung");
    if (sungEls.length) {
      sungEls.forEach((el, idx) => {
        setTimeout(() => { spawnGlyphWave(el); }, idx * 90);
      });
    } else if (lineData && (lineData.acts.includes("sing") || isClimax)) {
      const jaEl = lineEl.querySelector(".ja");
      if (jaEl) spawnGlyphWave(jaEl);
    }
  }

  // 畫面更新
  const cueBox = document.querySelector(".cue"), cueIcon = document.getElementById("cueIcon"), cueName = document.getElementById("cueName"), cueHow = document.getElementById("cueHow"), cueNext = document.getElementById("cueNext");
  function update() {
    if (!S || songV.hidden) return null;
    const t = now(), playing = isPlaying();
    document.getElementById("sTitle").classList.toggle("spinning", playing);
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
      cueNext.innerHTML = nx ? (nx.t - t <= 5 ? T("{0} 秒後", Math.ceil(nx.t - t)) : T("下一個 {0}", fmt(nx.t))) + `<b class="a-${mainAct(nx.acts)}">${esc(nx.name)}</b>` : "";
    } else if (started) {
      // 第一句之前的前奏：先空著，顯示下一個動作；整首沒有時間軸的新歌：不要一直停在「按播放開始」
      const key = LINES.length ? "intro" : "free";
      if (key !== curKey) {
        cueIcon.innerHTML = "";
        cueBox.className = "cue idle" + (playing ? " playing" : "") + (playing && alertOn ? " alerting" : "");
        cueName.textContent = LINES.length ? "" : T("自由跟著節奏"); cueHow.textContent = LINES.length ? "" : T("應援還在整理，跟著現場氣氛就好"); curKey = key;
      }
      const nx = LINES.length && nextChange(t);
      cueNext.innerHTML = nx ? (nx.t - t <= 5 ? T("{0} 秒後", Math.ceil(nx.t - t)) : T("下一個 {0}", fmt(nx.t))) + `<b class="a-${mainAct(nx.acts)}">${esc(nx.name)}</b>` : "";
    }
    const li = lineAt(t);
    if (started && li !== curLine && lineEls.length) {
      const cx = S && CLIMAX[S.id];
      const isClimax = cx != null && (t >= cx - 2.5 && t <= cx + 28);
      lineEls.forEach((e, i) => {
        const isNow = i === li;
        e.classList.toggle("now", isNow);
        e.classList.toggle("past", i < li);
        e.classList.toggle("climax-surge", isNow && isClimax);
      });
      box.classList.toggle("has-now", li >= 0);
      if (li >= 0 && OPT.scroll) centerLine(lineEls[li]);
      if (li >= 0 && lineEls[li] && !reduce) {
        triggerChorusRipples(lineEls[li], LINES[li], isClimax);
      }
      curLine = li;
    }
    if (OPT.karaoke && li >= 0 && lineEls[li]) {
      const ks = lineEls[li].querySelectorAll(".k");
      if (ks.length) {
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
          const end = LINES[li + 1] ? LINES[li + 1].t : DUR(), frac = Math.max(0, Math.min(1, (t - LINES[li].t) / Math.max(.5, (end - LINES[li].t) * .9)));
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
  try { Object.assign(OPT, JSON.parse(store.get("view-opts") || "{}")); } catch (e) {}
  function applyOpts() {
    box.classList.toggle("hide-ja", !OPT.ja); box.classList.toggle("hide-kana", !OPT.kana); box.classList.toggle("hide-zh", !OPT.zh);
    box.classList.toggle("karaoke", OPT.karaoke); box.classList.toggle("only-sing", OPT.sing);
    box.classList.toggle("size-s", OPT.size === "s"); box.classList.toggle("size-l", OPT.size === "l");
    box.classList.toggle("depth-focus", OPT.blur !== false);
    box.classList.toggle("fly-in", OPT.fly !== false);
    document.body.classList.toggle("no-lights", OPT.light === false);
    if (!OPT.karaoke) {
      box.querySelectorAll(".k.lit").forEach(k => k.classList.remove("lit"));
    }
    document.querySelectorAll("[data-opt]").forEach(b => b.setAttribute("aria-pressed", !!OPT[b.dataset.opt]));
    document.querySelectorAll("[data-size]").forEach(b => b.setAttribute("aria-pressed", b.dataset.size === OPT.size));
    singOnly.setAttribute("aria-pressed", OPT.sing);
  }
  const singOnly = document.getElementById("singOnly");
  const setOpt = (k, v) => { OPT[k] = v; store.set("view-opts", JSON.stringify(OPT)); applyOpts(); holdUntil = 0; if (k === "light") idleDrawn = false; if (OPT.scroll && lineEls[curLine]) centerLine(lineEls[curLine]); };
  singOnly.addEventListener("click", () => setOpt("sing", !OPT.sing));
  document.querySelectorAll("[data-size]").forEach(b => b.addEventListener("click", () => setOpt("size", b.dataset.size)));
  document.querySelectorAll("[data-opt]").forEach(b => b.addEventListener("click", () => setOpt(b.dataset.opt, !OPT[b.dataset.opt])));
  applyOpts();
  // 歌詞下面那一行：中文版是中譯、英文版是羅馬拼音、日文版沒有，開關的名稱跟著換
  const optSub = document.getElementById("optSub");
  if (LANG === "en") optSub.firstElementChild.textContent = T("羅馬拼音");
  if (LANG === "ja") optSub.hidden = true;
  // 點選單外面就收起來（影片下方的「這首重點」）
  const menus = [document.getElementById("tipsOpt")].filter(Boolean);
  document.addEventListener("click", e => menus.forEach(m => { if (m.open && !m.contains(e.target)) m.open = false; }));
  // 按 Esc 也收起來，焦點回到選單按鈕；這一下不再拿去關沉浸模式
  document.addEventListener("keydown", e => {
    const m = e.key === "Escape" && menus.find(x => x.open);
    if (!m) return;
    e.stopImmediatePropagation();
    m.open = false;
    m.querySelector("summary").focus();
  }, true);
  // 下面放不下時往上展開
  menus.forEach(m => m.addEventListener("toggle", () => {
    const box = m.querySelector(".view-opts");
    if (!box) return;
    box.classList.remove("to-right", "to-up");
    box.style.maxHeight = "";
    if (!m.open) return;
    const r = box.getBoundingClientRect();
    if (r.left < 8) box.classList.add("to-right");
    const below = innerHeight - r.top - 8, above = m.getBoundingClientRect().top - 14;
    if (r.height > below) {
      if (above > below) box.classList.add("to-up");
      if (r.height > Math.max(above, below)) box.style.maxHeight = Math.max(above, below) + "px";
    }
  }));

  // ── 「顯示」「更多」兩個選單 ──
  // 電腦：貼著按鈕浮出（非強制回應的 dialog，點外面或 Esc 關掉）；手機、平板直放、手機橫拿：從畫面底部拉出的抽屜（強制回應，點暗處、往下滑或 Esc 關掉）
  const SHEET_MQ = matchMedia("(max-width: 900px), (orientation: landscape) and (max-height: 500px)");
  const SHEETS = [
    { dlg: document.getElementById("dispDlg"), btns: ["dispBtn", "dockDisp"] },
    { dlg: document.getElementById("moreDlg"), btns: ["dockMore"] },
    { dlg: document.getElementById("rateDlg"), btns: ["rateBtn"] }
  ].map(x => ({ ...x, btns: x.btns.map(id => document.getElementById(id)) }));
  let sheetFrom = null;
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
    const asSheet = SHEET_MQ.matches;
    sh.dlg.classList.toggle("as-sheet", asSheet);
    sh.dlg.style.left = sh.dlg.style.top = "";
    if (asSheet) sh.dlg.showModal(); else { sh.dlg.show(); placeSheet(sh, btn); }
    sh.btns.forEach(b => b.setAttribute("aria-expanded", "true"));
    // 用鍵盤打開時焦點移到第一個項目
    if (!asSheet) (sh.dlg.querySelector("button:not(:disabled), a") || sh.dlg).focus();
  }
  SHEETS.forEach(sh => {
    sh.btns.forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); openSheet(sh, b); }));
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
      if (!sh.dlg.classList.contains("as-sheet") || !e.target.closest(".sheet-grip, .sheet-title")) return;
      drag = { y: e.clientY, id: e.pointerId }; panel.setPointerCapture(e.pointerId); sh.dlg.classList.add("dragging");
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
  // 浮出的選單：點外面、按 Esc、捲動或改變視窗大小就關
  document.addEventListener("click", e => SHEETS.forEach(sh => { if (sh.dlg.open && !sh.dlg.classList.contains("as-sheet") && !sh.dlg.contains(e.target)) sh.dlg.close(); }));
  document.addEventListener("keydown", e => {
    const sh = e.key === "Escape" && SHEETS.find(x => x.dlg.open && !x.dlg.classList.contains("as-sheet"));
    if (!sh) return;
    e.stopImmediatePropagation(); sh.dlg.close();
  }, true);
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
      if (x) { a.setAttribute("href", songHref(x.id)); a.setAttribute("aria-label", `${word}：${x.ja}`); a.title = `${word}：${x.ja}${id === "nextSong" && why ? `（${why}）` : ""}`; } else { a.removeAttribute("href"); a.removeAttribute("title"); }
    });
    const nb = document.getElementById("nextSong");
    nb.classList.toggle("is-shuffle", TOOL.shuffle);
    nb.classList.toggle("is-related", TOOL.related);
  }

  // ── 關聯曲：同一位作詞／作曲／編曲者、同一部作品（songs.js 的 CREDIT、SERIES） ──
  // 名字後面括號裡的團名只顯示，比對時拿掉
  const credKey = n => n.replace(/\s*\(.*\)\s*$/, "").trim();
  const credHas = (s, part, key) => !!(s.credit && (s.credit[part] || []).some(n => credKey(n) === key));
  function credRole(s, key) {
    const w = credHas(s, "w", key), c = credHas(s, "c", key);
    return w && c ? T("詞曲") : w ? T("作詞") : c ? T("作曲") : credHas(s, "a", key) ? T("編曲") : "";
  }
  const relCache = {};
  function relatedOf(s) {
    if (relCache[s.id]) return relCache[s.id];
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
    const opt = document.getElementById("relOpt");
    if (opt) {
      opt.hidden = !n; opt.open = false;
      document.getElementById("relCount").textContent = n || "";
      document.getElementById("relPop").innerHTML = n ? relHtml(s) : "";
    }
    // 速覽卡：詞曲、關聯曲、本站沒收的同作者作品（建置出來的歌曲頁沒有這塊，第一次用到時補上）
    const card = document.getElementById("songGuideCard");
    if (!card) return;
    let more = document.getElementById("cardMore");
    if (!more) { more = document.createElement("div"); more.id = "cardMore"; card.appendChild(more); }
    const c = s.credit, who = list => list.map(n => `<span lang="ja">${esc(n)}</span>`).join("、");
    const rows = !c ? [] : [[T("作詞"), c.w], [T("作曲"), c.c], [T("編曲"), c.a]].filter(([, v]) => v && v.length).map(([k, v]) => `<dt>${k}</dt><dd>${who(v)}</dd>`);
    if (c && c.x && c.x.length) rows.push(`<dt>${T("延伸聽")}</dt><dd><span class="card-note">${T("本站還沒收、Ado 也唱過的同作者作品")}</span>${c.x.map(t => `<a href="https://www.youtube.com/results?search_query=${encodeURIComponent("Ado " + t)}" target="_blank" rel="noopener" class="live-chip" lang="ja">${esc(t)} ${extIco}</a>`).join(" ")}</dd>`);
    more.innerHTML = (rows.length ? `<dl class="card-dl card-credit">${rows.join("")}</dl>` : "")
      + (n ? `<section class="rel-block" aria-label="${T("關聯曲")}"><h4 class="rel-title">${T("關聯曲")}<small>${T("同一位創作者、同一部作品，點了直接換歌")}</small></h4>${relHtml(s)}</section>` : "");
  }
  // 點關聯曲：跟上一首、下一首一樣，在歌曲獨立頁不重新載入整頁
  document.addEventListener("click", ev => {
    const a = ev.target.closest("a.rel-link");
    if (!a) return;
    const d = a.closest("details"); if (d) d.open = false;
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
    if (!s || !ambientMesh) return;
    const p = penOf(s);
    const cols = p && p.cols && p.cols.length ? p.cols : ["#5d9dfe", "#ff4a5a"];
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
  const veilFade = (el, from, to, ms) => el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: to ? "cubic-bezier(.4, 0, 1, 1)" : "cubic-bezier(0, 0, .2, 1)", fill: "forwards" }).finished.catch(() => {});
  async function setImmersive(on, instant) {
    if (isImmersive === on || (immBusy && !instant)) return;
    isImmersive = on;
    [toolImmersive, toolImmersiveMenuBtn].forEach(b => b && b.setAttribute("aria-pressed", isImmersive));
    const veil = !reduce && !instant ? document.body.appendChild(Object.assign(document.createElement("div"), { className: "imm-veil" })) : null;
    if (veil) { immBusy = true; await veilFade(veil, 0, 1, on ? 260 : 180); }
    if (isImmersive !== on) { if (veil) veil.remove(); immBusy = false; return; }
    document.body.classList.toggle("immersive-mode", isImmersive);
    syncThemeColor();
    padEnd();
    if (isImmersive) {
      updateAmbientColors(S);
      ensureVenue().then(() => requestAnimationFrame(venueLayout));
      toast(T("✨ 已開啟沉浸播放模式（按 Esc 或 F 退出）"));
      resetSongbarAutohide();
      // 舞台螢幕開機：從全黑亮到過曝再回正常，提示和字幕隨後浮上來
      if (!reduce) {
        const ease = "cubic-bezier(.2, .7, .2, 1)";
        document.querySelector("#song .mv")?.animate([{ opacity: 0, filter: "brightness(0)" }, { opacity: 1, filter: "brightness(1.6)", offset: .45 }, { opacity: 1, filter: "brightness(1)" }], { duration: 1100, delay: 200, easing: ease, fill: "backwards" });
        [cueBox, document.querySelector("#song .lyrics")].forEach((el, i) => el && el.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], { duration: 800, delay: 650 + i * 70, easing: ease, fill: "backwards" }));
      }
    } else {
      [songbar, dockEl].forEach(el => el && el.classList.remove("autohide"));
      clearTimeout(songbarHideTimer);
      document.body.classList.remove("imm-crowd", "has-venue");
    }
    if (curLine >= 0 && lineEls[curLine]) setTimeout(() => centerLine(lineEls[curLine]), 80);
    if (veil) { await veilFade(veil, 1, 0, on ? 700 : 380); veil.remove(); immBusy = false; }
  }

  // ── 3D 場館（assets/stage3d.js，原始碼在 tools/stage3d）：第一次開沉浸模式才載入 ──
  // 減少動態、沒有 WebGL、載入失敗：照舊用 2D 的燈光畫布
  let venue = null, venueP = null, venueRO = null;
  const pointer = { x: 0, y: 0 };
  addEventListener("pointermove", e => { pointer.x = e.clientX / innerWidth * 2 - 1; pointer.y = e.clientY / innerHeight * 2 - 1; }, { passive: true });
  function venueLayout() {
    if (!venue || !isImmersive) return;
    const cv = document.getElementById("venue");
    venue.layout(document.getElementById("screen").getBoundingClientRect(), cv.clientWidth, cv.clientHeight);
  }
  function ensureVenue() {
    if (reduce) return Promise.resolve(null);
    if (!venueP) {
      const app = document.querySelector('script[src*="app.js"]');
      const url = new URL("assets/stage3d.js" + (app ? new URL(app.src).search : ""), app ? app.src : location.href).href;
      venueP = import(url).then(m => {
        const cv = document.createElement("canvas");
        cv.id = "venue"; cv.setAttribute("aria-hidden", "true");
        document.body.insertBefore(cv, document.getElementById("fx"));
        venue = m.createVenue(cv, { mobile: matchMedia("(max-width: 900px), (pointer: coarse)").matches });
        if (S) venue.setPen(penOf(S).cols);
        if (/[?&]debug3d(&|$)/.test(location.search)) window.__venue = venue;
        cv.addEventListener("webglcontextlost", e => { e.preventDefault(); venue = null; document.body.classList.remove("has-venue"); });
        addEventListener("resize", () => requestAnimationFrame(venueLayout));
        venueRO = new ResizeObserver(() => venueLayout());
        venueRO.observe(document.getElementById("screen"));
        return venue;
      }).catch(err => { console.warn("3D venue unavailable", err); return null; });
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
  let pipWin = null;
  let canvasPip = null;
  let isPipActive = false;
  let lastPipLine = -2;
  let lastPipPlayState = null;
  let lastPipSongNo = -1;
  let lastPipLines = null;

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
      background: rgba(255, 255, 255, 0.05);
    }
    .document-pip .pip-current-line .ja {
      font-size: clamp(15px, 3.8vw, 19px); font-weight: 700; line-height: 1.35; color: #fff;
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

  async function openDocPip() {
    if (pipWin && !pipWin.closed) {
      pipWin.close();
      pipWin = null;
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

    pipWin.addEventListener("pagehide", () => {
      pipWin = null;
      updatePipButtonStates(false);
    });

    const doc = pipWin.document;
    doc.documentElement.lang = "zh-Hant-TW";
    doc.title = `${T("歌詞小窗")}｜${S ? S.ja : T("Ado 應援指南")}`;

    copyStylesToPip(doc);
    copySvgIconsToPip(doc);

    const mainEl = doc.createElement("main");
    mainEl.className = "document-pip song-page";
    mainEl.innerHTML = `
      <div class="pip-progress" role="progressbar" aria-label="${T("播放進度")}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span class="pip-progress-fill"></span>
      </div>
      <header class="pip-controls" aria-label="${T("字幕窗控制")}">
        <button type="button" class="pip-action pip-return" title="${T("返回主頁")}" aria-label="${T("返回主頁")}">
          <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        <div class="pip-track-controls" role="group" aria-label="${T("切換歌曲")}">
          <button type="button" class="pip-action pip-prev" title="${T("上一首")}" aria-label="${T("上一首")}">
            <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6"/></svg>
          </button>
          <div class="pip-song-label" aria-live="polite">
            <span class="pip-song-number"></span>
            <span class="pip-title"></span>
          </div>
          <button type="button" class="pip-action pip-next" title="${T("下一首")}" aria-label="${T("下一首")}">
            <svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6"/></svg>
          </button>
        </div>
        <button type="button" class="pip-action pip-play" title="${T("播放")}" aria-label="${T("播放主頁影片")}">
          <svg class="icon-play" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg class="icon-pause" viewBox="0 0 24 24" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
      </header>
      <section class="pip-lyrics" aria-label="${T("同步歌詞")}">
        <div class="pip-line-group pip-current-group">
          <div class="pip-current-line"></div>
        </div>
        <div class="pip-line-group pip-next-group">
          <div class="pip-next-line"></div>
        </div>
      </section>
    `;
    doc.body.appendChild(mainEl);

    doc.querySelector(".pip-return").addEventListener("click", () => {
      try { window.focus(); } catch (e) {}
    });
    doc.querySelector(".pip-prev").addEventListener("click", () => {
      const prev = document.getElementById("prevSong");
      if (prev && prev.getAttribute("href")) prev.click();
    });
    doc.querySelector(".pip-next").addEventListener("click", () => {
      const next = document.getElementById("nextSong");
      if (next && next.getAttribute("href")) next.click();
    });
    doc.querySelector(".pip-play").addEventListener("click", () => {
      if (isPlaying()) pause(); else if (player && ready) player.playVideo();
    });

    updatePip();
  }

  async function openCanvasPip() {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {});
      updatePipButtonStates(false);
      return;
    }

    if (!document.pictureInPictureEnabled) {
      toast(T("您的瀏覽器不支援子母畫面 (Picture-in-Picture) 功能"));
      return;
    }

    prepCanvasPip();
    lastPipLine = -2;
    renderCanvasPip(isPlaying(), curLine >= 0 ? LINES[curLine] : null, curLine >= 0 && curLine + 1 < LINES.length ? LINES[curLine + 1] : null);

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
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("aria-hidden", "true");
    video.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none";
    video.srcObject = canvas.captureStream(25);
    document.body.appendChild(video);
    canvasPip = { canvas, ctx, video };
    video.addEventListener("leavepictureinpicture", () => updatePipButtonStates(false));
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
    const nextL = (curLine >= 0 && curLine + 1 < LINES.length) ? LINES[curLine + 1] : null;

    if (pipWin && !pipWin.closed) {
      const doc = pipWin.document;

      // Progress bar
      const fill = doc.querySelector(".pip-progress-fill");
      if (fill) fill.style.transform = `scaleX(${progress})`;

      // Song header & title
      if (S && lastPipSongNo !== S.no) {
        lastPipSongNo = S.no;
        const noEl = doc.querySelector(".pip-song-number");
        const titleEl = doc.querySelector(".pip-title");
        if (noEl) noEl.textContent = String(S.no).padStart(2, "0");
        if (titleEl) titleEl.textContent = S.ja;
        doc.title = `${T("歌詞小窗")}｜${S.ja}`;
      }

      // Play/Pause button
      if (lastPipPlayState !== playing) {
        lastPipPlayState = playing;
        const playBtn = doc.querySelector(".pip-play");
        if (playBtn) {
          const playSvg = playBtn.querySelector(".icon-play");
          const pauseSvg = playBtn.querySelector(".icon-pause");
          if (playSvg) playSvg.style.display = playing ? "none" : "";
          if (pauseSvg) pauseSvg.style.display = playing ? "" : "none";
          playBtn.setAttribute("title", playing ? T("暫停") : T("播放"));
          playBtn.setAttribute("aria-label", playing ? T("暫停主頁影片") : T("播放主頁影片"));
        }
      }

      // Current Line & Next Line
      if (lastPipLine !== curLine) {
        lastPipLine = curLine;
        const curContainer = doc.querySelector(".pip-current-line");
        const nextContainer = doc.querySelector(".pip-next-line");
        const nextGroup = doc.querySelector(".pip-next-group");

        if (curContainer) {
          if (curLine >= 0 && lineEls[curLine]) {
            curContainer.innerHTML = lineEls[curLine].outerHTML;
          } else {
            curContainer.innerHTML = `<p class="pip-empty">${S ? T("〈{0}〉等待播放…", esc(S.ja)) : T("等待同步…")}</p>`;
          }
        }

        if (nextContainer && nextGroup) {
          if (curLine >= 0 && curLine + 1 < lineEls.length && lineEls[curLine + 1]) {
            nextContainer.innerHTML = lineEls[curLine + 1].outerHTML;
            nextGroup.hidden = false;
          } else {
            nextContainer.innerHTML = "";
            nextGroup.hidden = true;
          }
        }
      }

      // 卡拉OK逐字點亮即時同步至子母小窗
      if (OPT.karaoke && curLine >= 0 && lineEls[curLine]) {
        const curKs = doc.querySelectorAll(".pip-current-line .k");
        const origKs = lineEls[curLine].querySelectorAll(".k");
        if (curKs.length && origKs && curKs.length === origKs.length) {
          curKs.forEach((k, idx) => {
            k.classList.toggle("lit", origKs[idx].classList.contains("lit"));
          });
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
      lampRetryCount = 0;
      lampConnect();
      return;
    }
    TOOL[k] = !TOOL[k]; store.set("tool-" + k, TOOL[k] ? "1" : null); paintTools();
    if (k === "click" && TOOL.click) clickCtx();
    // 隨機播放、接關聯曲只能開一個
    if ((k === "shuffle" || k === "related") && TOOL[k]) { const o = k === "shuffle" ? "related" : "shuffle"; TOOL[o] = false; store.set("tool-" + o, null); paintTools(); }
    if ((k === "shuffle" || k === "related") && S) {
      if (TOOL[k]) { session.set("shuffle-hist", "[]"); session.set("shuffle-queue", "[]"); shuffleSeen(S); }
      paintNav(S);
      if (k === "shuffle") toast(TOOL.shuffle ? T("隨機播放：下一首會隨機挑，{0} 首輪完才重複", SONGS.length) : T("已關閉隨機播放"));
      else toast(TOOL.related ? T("接關聯曲：下一首先接同一位創作者或同一部作品的歌") : T("已關閉接關聯曲"));
    }
    if (k === "lamp") {
      if (TOOL.lamp) { lampRetryCount = 0; lampConnect(); }
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
      if (!btn) return;
      switchVideoSource(btn.dataset.videoSource);
    });
  }
  // 上次就開著拍點聲：瀏覽器要等使用者點一下或按鍵才肯出聲，第一次互動時把聲音準備好
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => { if (TOOL.click) clickCtx(); }, true));

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
    if (!TOOL.click || !playing || !actx) { lastClick = null; return; }
    const b = beatAt(t); if (!b) return;
    // 下一拍在 0.12 秒內就先排進去（影片時間換成真實時間要除以速度）
    const wait = (1 - b.f) * b.P / RATE;
    if (wait < .12 && lastClick !== b.k + 1) {
      lastClick = b.k + 1;
      const bar = (((b.k + 1) % 4) + 4) % 4;
      tick(actx.currentTime + wait, b.known && bar === 0);
    }
  }

  // ── 手燈連動（PenlightSync） ──
  let lampWS = null, lampTimer = null, lampRetryCount = 0, lampHasConnected = false;
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

  function lampDisconnect(sendStop) {
    if (lampTimer) { clearTimeout(lampTimer); lampTimer = null; }
    lampRetryCount = 0;
    if (lampWS) {
      if (sendStop && lampWS.readyState === WebSocket.OPEN) {
        try { lampWS.send(JSON.stringify({ v: 1, type: "stop" })); } catch (e) {}
      }
      try { lampWS.close(); } catch (e) {}
      lampWS = null;
    }
    setLampStatus("", false);
    lampLastSent = null;
  }

  function lampStop() {
    if (lampWS && lampWS.readyState === WebSocket.OPEN) {
      try { lampWS.send(JSON.stringify({ v: 1, type: "stop" })); } catch (e) {}
    }
    lampLastSent = null;
  }

  function lampConnect() {
    if (!TOOL.lamp || matchMedia("(pointer: coarse)").matches) return;
    if (lampWS && (lampWS.readyState === WebSocket.CONNECTING || lampWS.readyState === WebSocket.OPEN)) return;

    setLampStatus(T("連線中…"), false);
    try {
      const ws = new WebSocket("ws://127.0.0.1:51730/ado");
      lampWS = ws;

      ws.onopen = () => {
        if (ws !== lampWS) return;
        lampRetryCount = 0;
        if (!lampHasConnected) {
          lampHasConnected = true;
          toast(T("已連上 PenlightSync"));
        }
        lampLastSent = null;
      };

      ws.onmessage = ev => {
        if (ws !== lampWS) return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.type === "hello") {
            if (msg.lamp === "linked") {
              const wasLinked = lampStatusText === T("已連動");
              setLampStatus(T("已連動"), true);
              if (!wasLinked) toast(T("✨ 已與 PenlightSync 手燈連動！"));
            } else if (msg.lamp === "connecting") {
              setLampStatus(T("手燈連線中…"), false);
            } else {
              setLampStatus(T("App 已開，手燈未連"), false);
            }
          }
        } catch (e) {}
      };

      ws.onerror = () => {
        // 連線失敗時交由 onclose 處理重試，避免重送
      };

      ws.onclose = () => {
        if (ws !== lampWS) return;
        lampWS = null;
        if (!TOOL.lamp) {
          setLampStatus("", false);
          return;
        }
        // 連不上就每 5 秒重試，最多試 1 分鐘（12 次）
        if (lampRetryCount < 12) {
          lampRetryCount++;
          setLampStatus(T("連線中…"), false);
          lampTimer = setTimeout(lampConnect, 5000);
        } else {
          setLampStatus(T("找不到 PenlightSync"), false);
        }
      };
    } catch (e) {
      if (!TOOL.lamp) return;
      if (lampRetryCount < 12) {
        lampRetryCount++;
        setLampStatus(T("連線中…"));
        lampTimer = setTimeout(lampConnect, 5000);
      } else {
        setLampStatus(T("找不到 PenlightSync"));
      }
    }
  }

  function currentCue(t) {
    if (!TAGGED) return "free";
    const li = lineAt(t);
    if (li < 0) return "";
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
    const n = penOf(S).cols.length || 1, bd = BEAT[S.id], cueName = currentCue(t), cx = CLIMAX[S.id];
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
    if (!TOOL.lamp || !lampWS || lampWS.readyState !== WebSocket.OPEN) return;
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
      } else if (nowWall - lampLastSentWallTime >= 1000) {
        shouldSend = true; // 每 1 秒心跳校時
      }
    }

    if (shouldSend) {
      const pen = penOf(S);
      const bData = BEAT[S.id];
      const beat = bData ? { bpm: bData[0], offset: bData[1], barKnown: Boolean(bData[2]) } : null;
      const climax = CLIMAX[S.id] != null ? CLIMAX[S.id] : null;
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
        lampWS.send(JSON.stringify(payload));
        lampLastSent = { song: S.id, playing: Boolean(playing), rate: RATE, cue, t: roundedT };
        lampLastSentWallTime = nowWall;
      } catch (e) {}
    }
  }

  if (TOOL.lamp && !matchMedia("(pointer: coarse)").matches) {
    lampConnect();
  }
  addEventListener("pagehide", lampStop);

  // ── 測驗模式：應援提示藏起來，該應援的地方自己按空白鍵或點「按這裡」，依時間準不準給分 ──
  // 題目：連續同一個動作（含標籤）的行合成一段；有拍點資料的拍手段每拍一題（反拍只算第 2、4 拍），其他動作只在段落開頭一題
  // 判定窗以真實秒數計（影片秒數 ÷ 速度），放慢練也一樣公平；段落開頭比較難抓，判定窗放寬
  const QZ_WIN = { beat: [.08, .16], onset: [.15, .35] };
  const QZ_POINT = { perfect: 1, good: .6, miss: 0 };
  const quizBtn = document.getElementById("toolQuiz"), quizHud = document.getElementById("quizHud"), quizPad = document.getElementById("quizPad"), quizDlg = document.getElementById("quizDlg");
  const qzScore = document.getElementById("qzScore"), qzJudge = document.getElementById("qzJudge"), qzCombo = document.getElementById("qzCombo"), qzProg = document.getElementById("qzProg");
  let QZ = null;
  // 這行要做的主要動作：跟大字提醒的字卡同一套判斷
  const quizAct = l => isOffbeat(l.call) ? "clap" : l.sing.length ? "sing" : l.call && l.acts.includes("call") ? "call" : mainAct(l.acts);
  function quizTargets() {
    const out = [], bt = BEAT[S.id], sig = l => l.acts.join(",") + cueLabel(l);
    for (let i = 0; i < LINES.length; i++) {
      const l = LINES[i];
      if (!l.acts.length) continue;
      let j = i;
      while (LINES[j + 1] && LINES[j + 1].acts.length && sig(LINES[j + 1]) === sig(l)) j++;
      const end = LINES[j + 1] ? LINES[j + 1].t : DUR(), act = quizAct(l), off = isOffbeat(l.call);
      let n = 0;
      if (bt && act === "clap") {
        const P = 60 / bt[0];
        for (let k = Math.ceil((l.t - .1 - bt[1]) / P); bt[1] + k * P < end - .05; k++) {
          const bar = ((k % 4) + 4) % 4;
          if (off && bar !== 1 && bar !== 3) continue;
          out.push({ t: bt[1] + k * P, act, kind: "beat", res: null }); n++;
        }
      }
      if (!n) out.push({ t: l.t, act, kind: "onset", res: null });
      i = j;
    }
    return out;
  }
  const quizWin = tg => QZ_WIN[tg.kind].map(w => w * RATE);
  function quizStats() {
    const c = { perfect: 0, good: 0, miss: 0, skip: 0 }, per = {};
    QZ.targets.forEach(tg => {
      if (tg.res) c[tg.res]++;
      if (!tg.res || tg.res === "skip") return;
      const p = per[tg.act] = per[tg.act] || { hit: 0, total: 0 };
      p.total++; if (tg.res !== "miss") p.hit++;
    });
    const judged = c.perfect + c.good + c.miss;
    return { c, per, judged, total: QZ.targets.length - c.skip, score: judged ? Math.round((c.perfect + c.good * QZ_POINT.good) / judged * 100) : 0 };
  }
  const quizRank = n => n >= 95 ? "S" : n >= 85 ? "A" : n >= 70 ? "B" : n >= 50 ? "C" : "D";
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
  function quizStart() {
    if (!S || !ready) return;
    if (S.liveVideo && currentVideoSource(S) === "live") {
      switchVideoSource("mv");
    }
    const targets = quizTargets();
    if (!targets.length) { toast(T("這首沒有逐行應援，不能測驗")); return; }
    // lastT 先記現在的位置，seek(0) 之後會當成往回跳，把成績整個清掉
    QZ = { targets, stray: 0, combo: 0, maxCombo: 0, lastT: now(), done: false, rate: RATE };
    document.body.classList.add("quiz-on");
    cueBox.querySelector("h2").textContent = T("測驗模式");
    quizBtn.setAttribute("aria-pressed", "true");
    quizHud.hidden = false; qzJudge.innerHTML = "";
    hideAlert(); quizPaint();
    seek(0);
    toast(T("測驗開始：該應援的地方按空白鍵或點「按這裡」"));
  }
  function quizStop() {
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
    let hit = null, bd = Infinity;
    QZ.targets.forEach(tg => { const d = Math.abs(t - tg.t); if (!tg.res && d <= quizWin(tg)[1] && d < bd) { bd = d; hit = tg; } });
    if (!hit) { QZ.stray++; quizJudge("stray"); return; }
    hit.res = bd <= quizWin(hit)[0] ? "perfect" : "good";
    QZ.combo++; QZ.maxCombo = Math.max(QZ.maxCombo, QZ.combo);
    quizJudge(hit.res, hit.act, t - hit.t);
    quizPaint();
  }
  function quizFrame(t) {
    if (!QZ || QZ.done) return;
    let changed = false;
    if (t < QZ.lastT - .5) {
      // 往回跳：跳回點之後的題目重新作答，可以只重練一段
      QZ.targets.forEach(tg => { if (tg.t >= t - .2 && tg.res) { tg.res = null; changed = true; } });
      QZ.combo = 0;
    } else if (t - QZ.lastT > 1.2) {
      // 往前跳（點歌詞、按 →、切到別的分頁回來）：中間沒機會按的題目不算分
      QZ.targets.forEach(tg => { if (!tg.res && tg.t >= QZ.lastT && tg.t < t - quizWin(tg)[1]) { tg.res = "skip"; changed = true; } });
    }
    QZ.targets.forEach(tg => {
      if (tg.res || t <= tg.t + quizWin(tg)[1]) return;
      tg.res = "miss"; QZ.combo = 0; changed = true;
      quizJudge("miss", tg.act);
    });
    QZ.lastT = t;
    if (changed) quizPaint();
    const last = QZ.targets[QZ.targets.length - 1];
    if (t > last.t + 2 && QZ.targets.every(tg => tg.res)) quizFinish();
  }
  function quizFinish() {
    if (!QZ || QZ.done) return;
    QZ.targets.forEach(tg => { if (!tg.res) tg.res = "miss"; });
    QZ.done = true;
    pause();
    const st = quizStats(), rank = quizRank(st.score);
    // 最佳成績：整首都有作答（沒有略過）才記
    let best = {};
    try { best = JSON.parse(store.get("quiz-best") || "{}") || {}; } catch (e) {}
    const prev = best[S.id], full = !st.c.skip, isNew = full && (!prev || st.score > prev.score);
    if (isNew) { best[S.id] = { score: st.score, rate: QZ.rate }; store.set("quiz-best", JSON.stringify(best)); }
    QZ.result = { score: st.score, rank, c: st.c };
    document.getElementById("qrRank").textContent = rank;
    document.getElementById("qrScore").textContent = T("{0} 分", st.score);
    document.getElementById("qrMeta").textContent = `〈${S.ja}〉${QZ.rate !== 1 ? `・${QZ.rate}×` : ""}${QZ.maxCombo > 1 ? "・" + T("最多 {0} 連擊", QZ.maxCombo) : ""}`;
    ["perfect", "good", "miss"].forEach(k => document.getElementById("qr" + k[0].toUpperCase() + k.slice(1)).textContent = st.c[k]);
    document.getElementById("qrStray").textContent = QZ.stray;
    document.getElementById("qrActs").innerHTML = Object.keys(ACT).filter(a => st.per[a]).map(a => {
      const p = st.per[a], pct = Math.round(p.hit / p.total * 100);
      return `<li class="a-${a}"><span>${ACT[a].name}</span><i><span style="width:${pct}%"></span></i><b>${p.hit}／${p.total}</b></li>`;
    }).join("");
    document.getElementById("qrBest").textContent = !full ? T("中間有跳過的段落，這次不記最佳成績。") : isNew ? (prev ? T("刷新最佳成績！（之前 {0} 分）", prev.score) : T("第一次挑戰這首，已記下成績。")) : T("最佳成績 {0} 分", prev.score);
    quizDlg.showModal();
  }
  quizDlg.addEventListener("close", async () => {
    const v = quizDlg.returnValue;
    quizDlg.returnValue = "";
    if (!QZ) return;
    if (v === "retry") { quizStop(); quizStart(); }
    else if (v === "answer") quizStop();
    else if (v === "copy" && QZ.result) {
      const r = QZ.result, text = T("〈{0}〉應援測驗 {1}（{2} 分，Perfect {3}・Good {4}・Miss {5}）", S.ja, r.rank, r.score, r.c.perfect, r.c.good, r.c.miss) + `｜${T("Ado 應援指南")} ${LYV ? new URL(`song/${S.id}/`, document.baseURI).href : location.href.split("#")[0] + "#" + S.id}`;
      try { await navigator.clipboard.writeText(text); toast(T("已複製成績")); } catch (e) { prompt(T("複製這段內容："), text); }
      quizDlg.showModal();
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
      open(`${REPORT.form}?usp=pp_url&${q}`, "_blank", "noopener");
      return;
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
    if (!S || songV.hidden || !ready || e.metaKey || e.ctrlKey || e.altKey || dlg.open || logDlg.open || quizDlg.open) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    // 測驗中空白鍵拿來作答（播放／暫停改用 K）；按住不放不算連按
    if (QZ && e.key === " ") {
      e.preventDefault();
      if (!e.repeat) quizTap();
    } else if (e.key === "q" || e.key === "Q") {
      e.preventDefault();
      if (!quizBtn.disabled) QZ ? quizStop() : quizStart();
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleImmersive();
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      togglePip();
    } else if (e.key === "Escape" && isImmersive) {
      e.preventDefault();
      setImmersive(false);
    } else if (e.key === "Escape" && QZ) {
      e.preventDefault();
      quizStop();
    } else if (e.key === " " || e.key === "k") {
      if (e.target.closest("button, summary, a") && e.key === " ") return;
      e.preventDefault(); isPlaying() ? pause() : player.playVideo();
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && LINES.length) {
      e.preventDefault();
      const t = now(), li = lineAt(t);
      // 往前：這句剛開始 1.5 秒內就回上一句，不然回這句開頭
      const to = e.key === "ArrowRight" ? LINES[li + 1] : (li >= 0 && t - LINES[li].t > 1.5 ? LINES[li] : LINES[li - 1]);
      if (to) { holdUntil = 0; seek(to.t); }
    }
  });

  // ── 路由：#歌曲 id 開歌曲頁，其他回首頁 ──
  // 回清單時捲回離開前的位置
  let listY = 0, lastView = null;
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
    const qIdx = h.indexOf("?");
    if (qIdx >= 0) {
      const q = new URLSearchParams(h.slice(qIdx + 1));
      const sVal = (q.get("src") || "").toLowerCase();
      if (sVal === "live" || sVal === "mv") routeSource = sVal;
      h = h.slice(0, qIdx);
    }
    const [id, at] = h.split("@"), s = BY[id];
    syncLangLinks(s);
    if (s) {
      if (!homeV.hidden) listY = scrollY;
      document.documentElement.classList.add("seen");
      document.body.classList.add("on-song"); document.documentElement.classList.add("on-song"); syncThemeColor();
      hidePwaToast(false);
      homeV.hidden = true; songV.hidden = false; openSong(s, Math.max(0, Math.floor(+at || 0))); scrollTo(0, 0);
      trackView(s);
    } else {
      setImmersive(false, true); quizStop();
      lampStop(); pause(); hideAlert(); karaokeLoadSeq++; karaokeTiming = null; document.body.classList.remove("on-song"); document.documentElement.classList.remove("on-song"); syncThemeColor(); songV.hidden = true; homeV.hidden = false; document.title = PAGE_SONG ? T("Ado 應援指南") : PAGE_TITLE;
      renderRecent(); crateShow();
      const target = h && document.getElementById(h);
      if (target) target.scrollIntoView({ block: "start" }); else scrollTo(0, listY);
      trackView(null);
    }
  }
  // 唱片架點下去時自己做轉場（CD 和封面飛過去），這次換頁不用交叉淡化
  let quietNav = false, crateShow = () => {};
  addEventListener("hashchange", () => { if (quietNav) { quietNav = false; route(); } else transition(route); });

  // ── 首頁主視覺的唱片架：每次隨機抽 3～5 首 MV，插圖做成 CD 封套；滑過 CD 浮出，點了 CD 和封面飛去那首的頁面 ──
  {
    // 縮圖是 16:9，封套是正方形：數字是裁切的水平位置（0 最左、100 最右），逐首看過縮圖決定。
    // 踊、ロックスター、エルフ 的縮圖以大字為主或角色太小，裁成正方形不好看，先不放；還沒確認螢光棒色（hold）的也不放
    const FX = { show: 55, usseewa: 45, readymade: 40, gyakkou: 50, shinjidai: 55, giragira: 35, kurakura: 58, saikyo: 55, aiaia: 50, totmusica: 50, kira: 40, ibara: 45, rebellion: 50, chocolat: 62, ashura: 45, kokoro: 50, himawari: 50, dignity: 55, hibana: 50, magic: 50, kanjaa: 65 };
    const POOL = Object.keys(FX).map(id => BY[id]).filter(s => s && !s.hold);
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
      i.src = `https://i.ytimg.com/vi/${s.yt}/maxresdefault.jpg`;
      // 沒有高解析縮圖時 YouTube 回 120×90 的灰圖，改用中尺寸
      i.onload = () => { if (i.naturalWidth < 200) i.src = `https://i.ytimg.com/vi/${s.yt}/mqdefault.jpg`; };
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
      shuffleBtn.classList.add("turning"); setTimeout(() => shuffleBtn.classList.remove("turning"), 600);
      clearInterval(cycle); setOn(null);
      [...crate.children].forEach((li, i) => setTimeout(() => li.classList.add("is-out"), reduce ? 0 : i * 60));
      setTimeout(deal, reduce ? 0 : 520);
    });

    // 點擊：那張轉正抽出 → 首頁淡掉 → 換到歌曲頁 → CD 弧線飛到歌名旁變成小唱片，封面展開成 16:9 的 MV 畫面
    crate.addEventListener("click", e => {
      const a = e.target.closest("a[data-crate]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      e.preventDefault();
      if (swallowClick) return;
      // 手指點：還沒選起來的那張先抽起來，再點一下才打開（滑鼠滑過時已經選好了，點了直接打開）
      if (lastPointer === "touch" && e.detail !== 0 && !wasOn) { setOn(a.parentElement, "tap"); holdCycle(); return; }
      // detail 是 0：用鍵盤按 Enter，落地後把焦點交給歌曲頁的返回鍵
      fly(a.parentElement, e.detail === 0);
    });
    // 飛行替身放在一層 .crate 裡，封套、側帶、反光、CD 直接套唱片架原本的樣式，交接那一格看起來完全一樣。
    // 只動 transform／opacity／clip-path，交給合成器跑：歌曲頁在背後建播放器、排歌詞時也不會掉格
    const box = (el, r) => (Object.assign(el.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }), el);
    const div = (cls, html = "") => Object.assign(document.createElement("div"), { className: cls, innerHTML: html });
    const move = (from, to) => `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`;
    const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
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
      setOn(li);
      crate.classList.add("pulling"); li.classList.add("is-pull");
      // 抽出的轉場快結束就起飛，不停在原地等
      await wait(DUR.pull);
      const cd = li.querySelector(".cd"), sleeve = li.querySelector(".sleeve"), fx = FX[s.id];
      const dr = cd.getBoundingClientRect(), sr = sleeve.getBoundingClientRect();
      const layer = div("crate crate-fly");
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
      const fades = [homeV, bar].map(el => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fade, easing: "cubic-bezier(.3, 0, 1, 1)", fill: "forwards" }));
      // 等首頁淡完才換頁；換頁那一下主執行緒很忙，第一段還在合成器上跑，畫面不會停
      await Promise.all(fades.map(f => f.finished));
      const routed = new Promise(r => addEventListener("hashchange", r, { once: true }));
      quietNav = true;
      location.hash = s.id;
      await routed;
      fades.forEach(f => f.cancel());
      const left = Math.max(0, DUR.up - (performance.now() - t0));
      // 歌曲頁（連同背景的舞台燈）先藏著，第二段開始才淡入
      [songV, document.getElementById("fx")].forEach(el => el && el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: left + 60, easing: "cubic-bezier(.05, .7, .1, 1)", fill: "backwards" }));
      const screen = document.getElementById("screen"), mini = document.querySelector("#sTitle .sdisc");
      const fr = screen.getBoundingClientRect(), mr = mini ? mini.getBoundingClientRect() : { left: fr.left + fr.width / 2, top: fr.top, width: 1, height: 1 };
      [screen, mini].forEach(x => x && (x.style.visibility = "hidden"));
      await wait(left);

      // 第二段：封面換成終點大小的 16:9 畫面，先裁成剛才那塊正方形（上面疊著同一張封套，側帶和反光都在），
      // 一邊展開一邊讓封套淡掉；CD 弧線飛到歌名旁縮成小唱片
      const k = up.width / fr.height, ox = (fr.width - fr.height) * fx / 100, radius = parseFloat(getComputedStyle(screen).borderTopLeftRadius) || 0;
      const gArt = box(div("fly-g fly-art", `<img src="${sleeve.querySelector("img").currentSrc || sleeve.querySelector("img").src}" alt="">`), fr);
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
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.land, easing: "ease-out", fill: "forwards" }).finished.then(() => layer.remove());
      if (kb) document.querySelector(".songbar a.ib")?.focus({ preventScroll: true });
      reset();
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
  const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${Math.max(0, Math.min(1, a))})`; };
  const BLUE = "#02b4f5", DEEP = "#075073", IVORY = "#f8fafc";
  function stage(cv, o) {
    const ctx = cv.getContext("2d"); let W = 0, H = 0;
    const size = () => { const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
    addEventListener("resize", size); size();
    const sticks = Array.from({ length: o.sticks }, () => ({ x: Math.random(), y: Math.random(), ph: Math.random() * 6.28, c: BLUE }));
    const petals = Array.from({ length: o.petals }, () => ({ x: Math.random(), y: Math.random(), r: 3 + Math.random() * 4, s: .2 + Math.random() * .4, a: Math.random() * 6.28 }));
    // pal：這首的螢光棒顏色；null 是首頁的藍白
    let pal = null, beams = [];
    const pen = cols => {
      pal = cols && cols.length ? cols : null;
      beams = pal ? [0, 1, 2, 3].map(i => pal[i % pal.length]) : [DEEP, BLUE, IVORY, DEEP];
      sticks.forEach((s, i) => s.c = pal ? pal[i % pal.length] : Math.random() < .75 ? BLUE : IVORY);
    };
    pen(null);
    // hit：重拍的亮度（1 → 0），beat：第幾拍，用來輪流換閃光的顏色
    const draw = (tt, energy, hit, listen, playing, beat) => {
      if (!cv.width) size();
      if (!W) return;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      [.12, .34, .58, .86].forEach((bx, i) => {
        const col = beams[i], sway = reduce ? 0 : Math.sin(tt * .45 + i * 1.7) * .16;
        const ox = W * (bx + (i % 2 ? .08 : -.08)), oy = H * 1.05, tx = W * (bx + sway), w = W * (.06 + .03 * hit);
        const g = ctx.createLinearGradient(ox, oy, tx, 0), a = (.05 + .12 * energy + .3 * hit) * o.k;
        g.addColorStop(0, hex(col, 0)); g.addColorStop(.4, hex(col, a)); g.addColorStop(1, hex(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ox - 4, oy); ctx.lineTo(tx - w, -20); ctx.lineTo(tx + w, -20); ctx.lineTo(ox + 4, oy); ctx.fill();
      });
      // 重拍：從台下往上整片亮一下
      if (hit > .01) {
        const col = (pal || [BLUE])[beat % (pal || [BLUE]).length], g = ctx.createRadialGradient(W / 2, H * 1.1, 0, W / 2, H * 1.1, Math.max(W, H) * .95);
        g.addColorStop(0, hex(col, .2 * hit * o.k)); g.addColorStop(1, hex(col, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      petals.forEach((p, i) => {
        if (!reduce && playing) { p.y += p.s * .0015 * (1 + energy); p.a += .008; if (p.y > 1.05) { p.y = -.05; p.x = Math.random(); } }
        ctx.save(); ctx.translate(p.x * W + Math.sin(p.a) * 12, p.y * H); ctx.rotate(p.a);
        ctx.fillStyle = hex(pal ? pal[i % pal.length] : BLUE, .28 * o.k); ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .55, 0, 0, 6.28); ctx.fill(); ctx.restore();
      });
      // raise：0 一般、沉浸模式約 .35、大合唱時 1；手燈海變高、往上舉、更亮
      const rz = draw.raise * (Math.min(W, H) < 600 ? .45 : 1), baseY = H - 4, band = Math.min(70, H * .14) * (1 + rz * .8);
      sticks.forEach(s => {
        const swing = reduce ? 0 : Math.sin(tt * (playing ? 4.2 : 1.3) + s.ph) * (playing ? .5 : .2) * (listen ? .3 : 1);
        ctx.save(); ctx.translate(s.x * W, baseY - s.y * band - 6 * hit - rz * 8); ctx.rotate(swing);
        ctx.strokeStyle = hex(s.c, (.16 + .3 * energy + .45 * hit) * (.45 + s.y * .55) * o.k * (1 + rz * .5));
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
          ctx.fillStyle = hex(p.c, a);
          for (let i = 1; i < p.trail.length; i++) {
            const [x0, y0] = p.trail[i - 1], [x1, y1] = p.trail[i], dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
            const w = 3.5 * Math.abs(Math.cos(p.spin + i * .55)) + .6, nx = -dy / l * w, ny = dx / l * w;
            ctx.beginPath(); ctx.moveTo(x0 + nx, y0 + ny); ctx.lineTo(x1 + nx, y1 + ny); ctx.lineTo(x1 - nx, y1 - ny); ctx.lineTo(x0 - nx, y0 - ny); ctx.fill();
          }
        } else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin * .6); ctx.scale(1, Math.cos(p.spin));
          ctx.fillStyle = hex(p.c, a); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
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
  addEventListener("hashchange", () => setTimeout(() => dispatchEvent(new Event("resize")), 0));

  // 背景燈光只在播放時動；沒播放時畫一次就停，不在閱讀時晃
  let stageT = 0, lastMs = 0, idleDrawn = false, penSong, blasted = false, crowdOn = false, venueOn = false, venueRaise = 0, venueClap = 0, venueJump = 0;
  addEventListener("resize", () => { idleDrawn = false; });
  function frame(ms) {
    const cue = update(), playing = S && !songV.hidden && isPlaying(), t = now();
    clicks(t, playing);
    lampFrame(t, playing);
    quizFrame(t);
    // 歌曲頁燈光換成這首的螢光棒顏色，回首頁換回藍白
    const want = S && !songV.hidden ? S : null;
    if (want !== penSong) { penSong = want; bg.pen(want && penOf(want).cols); idleDrawn = false; blasted = false; }
    // 播到副歌高潮噴一次彩帶；倒回高潮前再播到會再噴
    const cx = want && CLIMAX[want.id];
    if (cx != null) {
      if (t < cx - .3) blasted = false;
      else if (playing && !blasted && t >= cx - .05 && t < cx + .8 && OPT.light !== false) { blasted = true; blast(penOf(want).cols); }
    }
    // 「交給觀眾」：沉浸模式播到大合唱的句子，舞台螢幕退暗、字幕和手燈海亮起來
    const cl = isImmersive && playing && LINES.length ? lineAt(t) : -1;
    const crowd = cl >= 0 && LINES[cl].acts.includes("sing");
    if (crowd !== crowdOn) { crowdOn = crowd; document.body.classList.toggle("imm-crowd", crowd); }
    const prevMs = lastMs || ms;
    if (OPT.light !== false) {
      if (playing) stageT += Math.min(.1, (ms - lastMs) / 1000);
      lastMs = ms;
      // 每拍亮一下再退，小節第一拍最亮；這首沒有拍點資料時，改在每句歌詞開頭亮
      const li = lineAt(t), l = LINES[li], b = beatAt(t);
      let hit = 0, beat = Math.max(0, li);
      if (playing && !reduce && b) { hit = beatPulse(b) * (b.down ? 1 : .5); beat = Math.max(0, Math.floor(b.k / 4)); }
      else if (playing && !reduce && l) hit = Math.exp(-(t - l.t) / .4) * (l.acts.length ? 1 : .65);
      const energy = playing && cue ? (cue.listen ? .2 : cue.beat ? 1 : .45) : .4;
      if (isImmersive && ambientMesh) {
        const bh = (playing && !reduce) ? hit.toFixed(3) : "0";
        ambientMesh.style.setProperty("--beat-hit", bh);
        songV.style.setProperty("--beat-hit", bh);
      }
      // 沉浸模式的手燈海比較高；大合唱時整片舉起來
      const raiseTo = isImmersive ? (crowd ? 1 : .35) : 0;
      if (Math.abs(bg.raise - raiseTo) > .005) { bg.raise += (raiseTo - bg.raise) * Math.min(1, (ms - prevMs) / 1000 * 2.4); idleDrawn = false; }
      // 3D 場館載好了就由它畫，2D 畫布休息
      const useVenue = isImmersive && !!venue;
      if (useVenue !== venueOn) { venueOn = useVenue; document.body.classList.toggle("has-venue", useVenue); idleDrawn = false; if (useVenue) venueLayout(); }
      if (useVenue) {
        const ease = Math.min(1, (ms - prevMs) / 1000 * 2.2), look = lampLook(t);
        // 拍手：手燈舉高不擺，每拍往下一頓再亮一下（反拍拍手只在第 2、4 拍）；跳躍：全場跟著拍子彈
        const offb = !!(cue && isOffbeat(cue.name)), clapOn = playing && (look.cue === "clap" || offb), jumpOn = playing && look.cue === "jump";
        venueRaise += ((crowd ? 1 : 0) - venueRaise) * ease;
        venueClap += ((clapOn ? 1 : 0) - venueClap) * ease * 1.5;
        venueJump += ((jumpOn ? .16 : 0) - venueJump) * ease;
        const clapPulse = clapOn ? (b ? ((!offb || b.bar % 2 === 1) ? beatPulse(b) : 0) : hit) : 0;
        venue.render({ t: ms / 1000, swing: b ? b.x : ms / 1000 * (playing ? 1.6 : .35), amp: playing ? (look.cue === "listen" && !crowd ? .14 : .42) : .08,
          hit: playing && !reduce ? hit : 0, raise: venueRaise, px: pointer.x, py: pointer.y, still: false,
          colIdx: look.idx, bright: look.bright, clap: venueClap, clapPulse, jump: venueJump });
      } else if (playing || !idleDrawn) { bg(stageT, playing ? Math.max(energy, crowd ? .9 : 0) : energy, hit, cue && cue.listen && !crowd, playing, beat); idleDrawn = !playing && Math.abs(bg.raise - raiseTo) <= .005; }
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
        idleDrawn = true;
      }
    }
    updatePip();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
