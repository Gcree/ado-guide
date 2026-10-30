(() => {
  // ── 動作 ──
  const ACT = {
    sing:    { name: "大合唱",   icon: "i-sing",    how: "跟著一起唱" },
    clap:    { name: "拍手",     icon: "i-clap",    how: "跟著節拍拍手" },
    wave:    { name: "舉手揮動", icon: "i-wave",    how: "舉手左右揮" },
    jump:    { name: "跳躍",     icon: "i-jump",    how: "跟著節奏跳" },
    call:    { name: "喊聲",     icon: "i-call",    how: "跟著喊短句" },
    gesture: { name: "手勢",     icon: "i-gesture", how: "跟 Ado 做同樣的動作" },
    listen:  { name: "安靜聽",   icon: "i-listen",  how: "留給 Ado 唱" }
  };

  const { SONGS, UT, PEN, BEAT, CLIMAX } = window.ADO_SONGS;
  // hold：應援和螢光棒顏色還沒有可靠來源（例如剛出的新歌），資料先留著、畫面不顯示，確認後拿掉 hold；sug 的建議也一樣先不顯示；沒有 tips 又不是 free 的歌也先視為 hold
  SONGS.forEach(s => { if (s.sug || (!s.free && (!s.tips || !s.tips.length))) s.hold = true; if (s.hold) { s.acts = []; s.tips = []; } });
  SONGS.forEach(s => { s.ut = UT[s.id] ? `https://www.uta-net.com/song/${UT[s.id]}/` : `https://www.uta-net.com/artist/29298/`; s.acts = s.acts || []; s.tips = s.tips || []; s.dur = s.len.split(":").reduce((a, b) => a * 60 + +b, 0); });
  // 推出順序：MV 在 YouTube 公開的日期（日本時間）；編號照這個順序
  SONGS.sort((a, b) => a.date.localeCompare(b.date)).forEach((s, i) => s.no = i + 1);
  // 歌詞：正式網站由 scripts/build.mjs 拆成每首一個檔（lyrics/<id>.json），<html data-lyrics> 是版本；
  // 先讀小小的 lyrics/index.json（每首的應援數量），打開哪首才載那首。直接開原始檔時沒有拆，改讀整份 song-lyrics.js
  // 應援數量：歌詞裡有動作的行數（「安靜聽」不算）；index.json 裡沒有的歌就是沒有逐行歌詞
  const LYV = document.documentElement.dataset.lyrics, LY = {}, lyWait = {};
  let lyReady = false;
  const loadScript = src => new Promise(res => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = el.onerror = res;
    document.head.appendChild(el);
  });
  const getJSON = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const lyLoaded = (LYV
    ? getJSON(`lyrics/index.json?v=${LYV}`)
    : loadScript("song-lyrics.js").then(() => {
        const idx = {};
        (window.SONG_LYRICS || []).forEach(b => { LY[b.id] = b; if (b.lyrics && b.lyrics.length) idx[b.id] = b.lyrics.filter(l => (l.acts || []).some(a => a !== "listen")).length; });
        return idx;
      })
  ).then(idx => {
    lyReady = true;
    SONGS.forEach(s => { s.lines = !!idx && s.id in idx; s.cheer = s.lines && !s.hold ? idx[s.id] : 0; });
  });
  // 這首的歌詞載好了沒（拆檔時打開才載）；網址一開始就指向的歌，和 index.json 一起先載
  const lyHave = s => lyReady && (!s.lines || !!LY[s.id]);
  const fetchLy = id => lyWait[id] = lyWait[id] || getJSON(`lyrics/${id}.json?v=${LYV}`).then(b => { if (b) LY[id] = b; });
  function loadLyrics(s) {
    if (!LYV || lyHave(s)) return Promise.resolve();
    return fetchLy(s.id).then(() => { if (!LY[s.id]) s.lines = false; });
  }
  const firstSong = (location.hash.slice(1) || document.documentElement.dataset.song || "").split("@")[0];
  if (LYV && SONGS.some(s => s.id === firstSong)) fetchLy(firstSong);
  const BY = Object.fromEntries(SONGS.map(s => [s.id, s]));
  const PENC = { 青: ["藍", "#5d9dfe"], 水: ["水藍", "#5fd4ff"], 白: ["白", "#f2efe8"], 赤: ["紅", "#ff4a5a"], 桃: ["粉紅", "#ff7ab8"], 紫: ["紫", "#a374ff"], 橙: ["橘", "#ff9a3c"], 黄: ["黃", "#ffd84a"], 緑: ["綠", "#4ee08a"] };
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
  const cueLabel = l => l.call || (l.sing.length ? `唱「${l.sing.join("」「")}」` : l.acts.map(a => ACT[a].name).join("、"));
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const toast = (() => { const el = document.getElementById("toast"); let t = 0; return msg => { el.textContent = msg; el.classList.add("show"); clearTimeout(t); t = setTimeout(() => el.classList.remove("show"), 2600); }; })();

  // ── 首頁 ──
  const homeEl = document.getElementById("home");
  const list = document.getElementById("songList"), q = document.getElementById("q"), barQ = document.getElementById("barQ"), countEl = document.getElementById("songCount");
  const moreBtn = document.getElementById("moreBtn"), emptyEl = document.getElementById("songEmpty");
  const sortBtn = document.getElementById("sortBtn"), sortLabel = document.getElementById("sortLabel");
  let filter = "all", sort = store.get("list-sort") === "cheer" ? "cheer" : "date", showAll = false;
  // 清單先只露 8 首，按「看全部」才展開；76 首的連結都在 HTML 裡，搜尋引擎照樣看得到
  const LIMIT = 8;
  // 目前排序下的歌曲順序；切換上一首、下一首也照這個
  const ordered = () => sort === "cheer" ? [...SONGS].sort((a, b) => b.cheer - a.cheer || a.no - b.no) : SONGS;
  const thumb = (s, w, h, lazy) => `<img class="thumb" src="https://i.ytimg.com/vi/${s.yt}/mqdefault.jpg" alt="" width="${w}" height="${h}" decoding="async"${lazy ? ' loading="lazy"' : ""}>`;
  // 歌名下面那行：中文名（和日文一樣時用英文名）、是不是翻唱
  const subOf = s => [s.zh !== s.ja ? s.zh : (s.en && s.en !== s.ja ? s.en : ""), s.cover ? "翻唱" : ""].filter(Boolean).join("・");
  const actIcons = s => s.acts.filter(a => a !== "listen").map(icon).join("");
  const rowHtml = s => `<li><a class="song" href="song/${s.id}/" data-id="${s.id}">${thumb(s, 80, 45, true)}<span class="song-main"><span class="name"><span class="ja" lang="ja">${esc(s.ja)}</span><span class="sub"><span class="zh">${esc(subOf(s))}</span>${penDots(s)}</span></span><span class="acts">${actIcons(s)}${s.free ? '<span class="free">自由搖</span>' : ""}${sort === "cheer" && s.cheer ? `<span class="cnt">${s.cheer} 句</span>` : ""}</span></span></a></li>`;
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
      if (filter === "live") return !!(s.lives && s.lives.length > 0);
      if (filter === "cover") return !!s.cover;
      return true;
    });
    list.innerHTML = rows.map(rowHtml).join("");
    const plain = !term && filter === "all", more = rows.length > LIMIT;
    list.classList.toggle("collapsed", more && !showAll);
    moreBtn.hidden = !more;
    moreBtn.textContent = showAll ? "收合" : plain ? `看全部 ${SONGS.length} 首` : `再看 ${rows.length - LIMIT} 首`;
    moreBtn.setAttribute("aria-expanded", String(more && showAll));
    countEl.textContent = plain ? `${SONGS.length} 首` : `${rows.length} 首符合`;
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) emptyEl.textContent = term ? `找不到「${q.value.trim()}」。換個寫法試試，日文或中文都可以。` : "這個分類目前沒有歌。";
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
  const penDots = s => `<span class="dots" aria-label="螢光棒：${penOf(s).keys.map(k => k === "彩" ? "彩色" : PENC[k][0]).join("、")}">${penOf(s).keys.map(k => k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`).join("")}</span>`;
  // 兩個搜尋框（主視覺、頂欄）內容同步；在頂欄打字時，清單不在眼前就捲過去
  const songsSec = document.getElementById("songs");
  function onSearch(src) {
    const other = src === q ? barQ : q;
    if (other.value !== src.value) other.value = src.value;
    showAll = false;
    renderList();
  }
  q.addEventListener("input", () => onSearch(q));
  barQ.addEventListener("input", () => {
    onSearch(barQ);
    const r = songsSec.getBoundingClientRect();
    if (r.top > innerHeight * .6 || r.bottom < 120) songsSec.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  });
  document.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => {
    filter = b.dataset.f; showAll = false;
    document.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderList();
  }));
  const SORT_NAME = { date: "推出順序", cheer: "動作多的在前" };
  function syncSort() {
    sortLabel.textContent = SORT_NAME[sort];
    sortBtn.setAttribute("aria-label", `排序：${SORT_NAME[sort]}（點一下切換）`);
  }
  sortBtn.addEventListener("click", () => {
    sort = sort === "cheer" ? "date" : "cheer"; store.set("list-sort", sort === "cheer" ? "cheer" : null);
    syncSort(); renderList();
  });
  moreBtn.addEventListener("click", () => {
    showAll = !showAll;
    renderList();
    // 收合時清單變短，把畫面帶回清單開頭，不然會停在頁尾
    if (!showAll && songsSec.getBoundingClientRect().top < 0) songsSec.scrollIntoView({ block: "start" });
  });
  syncSort();
  renderList();
  lyLoaded.then(renderList);

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
  // 圖示說明：只列清單裡用得到的動作；主視覺的數字也照實際資料
  const usedActs = new Set(SONGS.flatMap(s => s.acts.filter(a => a !== "listen")));
  document.getElementById("homeLegend").innerHTML = Object.keys(ACT).filter(a => usedActs.has(a))
    .map(a => `<span class="a-${a}">${icon(a)}${ACT[a].name}</span>`).join("");
  document.getElementById("factSongs").textContent = SONGS.length;
  document.getElementById("factActs").textContent = usedActs.size;

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
  const barMenus = [["lampBtn", "lampPop"], ["themeBtn", "themePop"]].map(([b, p]) => ({ btn: document.getElementById(b), pop: document.getElementById(p) }));
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
  const THEME_NAME = { light: "淺色", dark: "深色", system: "跟隨系統" };
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
    themeBtn.setAttribute("aria-label", `外觀：${THEME_NAME[p]}`);
    document.querySelectorAll("[data-theme-pick]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.themePick === p)));
    syncThemeColor();
  }
  document.querySelectorAll("[data-theme-pick]").forEach(b => b.addEventListener("click", () => {
    store.set("theme", b.dataset.themePick === "system" ? null : b.dataset.themePick);
    applyTheme();
  }));
  if (sysLight.addEventListener) sysLight.addEventListener("change", applyTheme);
  applyTheme();

  // ── 手燈 App 下載（PenlightSync）：抓最新版本，把下載連結、版本和檔案大小填進選單 ──
  const lampDlWinLink = document.getElementById("lampDlWinLink"), lampDlMacLink = document.getElementById("lampDlMacLink");
  const lampDlWinDesc = document.getElementById("lampDlWinDesc"), lampDlMacDesc = document.getElementById("lampDlMacDesc");
  [[lampDlWinLink, "Windows"], [lampDlMacLink, "macOS"]].forEach(([a, os]) => a.addEventListener("click", () => toast(`✨ 已開始下載 PenlightSync ${os} 版！`)));
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
    toast("✨ 已成功加入主畫面！");
  });

  function showPwaToast(autoDismiss = 8000) {
    if (!pwaToast || isPWA) return;
    clearTimeout(pwaToastTimer);
    pwaToast.hidden = false;
    pwaToastText.textContent = "將網站加到主畫面練習？";
    pwaActionBtn.textContent = "加入主畫面";
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

    if (pwaActionBtn.textContent === "知道了") {
      hidePwaToast(true);
      return;
    }

    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then(choice => {
        if (choice.outcome === "accepted") {
          pwaToastText.textContent = "✨ 正在加入主畫面…";
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
      pwaToastText.innerHTML = '請點下方 <b>⎋</b> 再選<b>「加入主畫面 ＋」</b>';
      pwaActionBtn.textContent = "知道了";
      pwaToastTimer = setTimeout(() => hidePwaToast(true), 6000);
      return;
    }

    if (isPWA) {
      pwaToastText.textContent = "目前已在主畫面 App 模式下開啟囉！";
      pwaActionBtn.hidden = true;
      pwaToastTimer = setTimeout(() => hidePwaToast(false), 2600);
      return;
    }

    // 一般桌面瀏覽器
    pwaToastText.textContent = "請點網址列右側 ⊕ 或選單選擇加入主畫面";
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
      if (isPWA) toast("目前已在主畫面 App 模式下開啟囉！");
      else { showPwaToast(0); handlePwaInstall(); }
    });
  }
  if (toolInstallBtn) {
    toolInstallBtn.addEventListener("click", () => {
      if (isPWA) toast("目前已在主畫面 App 模式下開啟囉！");
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
  const padEnd = () => { sc.style.paddingBottom = LINES.length ? Math.round(sc.clientHeight / 2) + "px" : ""; };
  addEventListener("resize", padEnd);

  const getBuiltinSong = id => LY[id] || null;
  // 內建歌詞：動作只看每行的 acts，依 じゅん🌝ぴ 的 note 整理
  function parseBuiltin(builtin) {
    const lines = (builtin.lyrics || []).map(item => ({
      t: +item.time || 0,
      ja: String(item.jp || "").trim() || null,
      zh: String(item.tr || "").trim() || null,
      acts: S.hold ? [] : (item.acts || []).filter(a => ACT[a] && a !== "listen"),
      sing: S.hold ? [] : item.sing || [],
      call: S.hold ? null : item.call || null
    }));
    return lines.sort((a, b) => a.t - b.t);
  }
  function loadSongData() {
    const builtin = getBuiltinSong(S.id);
    LINES = builtin && builtin.lyrics ? parseBuiltin(builtin) : [];
    TAGGED = LINES.some(l => l.acts.length);
  }
  function lineAt(t) { let k = -1; LINES.forEach((l, i) => { if (t >= l.t) k = i; }); return k; }

  // 假名：歌詞裡寫「漢字(かな)」就會標在漢字上方；每個字包成 .k 給卡拉OK與字體飛入動畫用
  // sung 是觀眾要唱的字，取最後一次出現的位置（Ado 先唱、觀眾接時，觀眾在後面）
  function jaHTML(txt, sung = []) {
    const out = [], re = /([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g, hit = new Set();
    sung.forEach(w => { const i = txt.lastIndexOf(w); if (i >= 0) for (let j = i; j < i + w.length; j++) hit.add(j); });
    let kIndex = 0;
    const k = (i, html) => {
      const rot = (((kIndex * 7) % 15) - 7).toFixed(1) + "deg";
      out.push(`<span class="k${hit.has(i) ? " sung" : ""}" style="--i:${kIndex++};--rot:${rot}">${html}</span>`);
    };
    const chars = (str, at) => { for (const c of str) { k(at, esc(c)); at += c.length; } };
    let last = 0, m;
    while ((m = re.exec(txt))) { chars(txt.slice(last, m.index), last); k(m.index, `<ruby>${esc(m[1])}<rt>${esc(m[2])}</rt></ruby>`); last = re.lastIndex; }
    chars(txt.slice(last), last);
    return out.join("");
  }
  function renderLines() {
    box.innerHTML = "";
    if (!lyHave(S)) { box.innerHTML = '<div class="empty"><span>正在載入歌詞…</span></div>'; legend.innerHTML = ""; singJump.hidden = true; return; }
    if (!LINES.length) {
      box.innerHTML = `<div class="empty"><b>這首還沒有逐行時間軸</b>${S.tips.length ? `<ul class="summary">${S.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul><span>先邊看 MV 邊照上面的重點練。</span>` : "<span>應援還在整理，先看 MV 熟悉旋律，副歌跟著現場氣氛就好。</span>"}<span>歌詞請看<a href="${S.ut}" target="_blank" rel="noopener">歌ネット的正版歌詞頁</a>。</span></div>`;
      legend.innerHTML = ""; SING = []; singJump.hidden = true; sc.scrollTop = 0; padEnd(); return;
    }
    LINES.forEach((l, i) => {
      const el = document.createElement("div");
      const m = lineAct(l);
      el.className = "ln" + (m ? " a-" + m : "") + (l.acts.includes("sing") ? " sing" : ""); el.tabIndex = 0;
      const ja = l.ja ? jaHTML(l.ja, l.sing) : `<span class="ph">日文歌詞（${fmt(l.t)}）</span>`;
      const zh = l.zh ? esc(l.zh) : (l.ja ? "" : `<span class="ph">中譯</span>`);
      // 喊聲標籤只放在同一句喊聲的第一行
      let callHtml = "";
      if (l.call && !(i && LINES[i - 1].call === l.call)) {
        if (l.call.includes("反拍")) {
          callHtml = `<span class="call call-offbeat"><svg class="ico-clap"><use href="#i-clap"/></svg><span class="call-txt">反拍拍手</span><span class="call-rhythm"><b>空</b><i>拍</i><b>空</b><i>拍</i></span></span>`;
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
    legend.innerHTML = Object.keys(ACT).filter(a => used.has(a)).map(a => `<button class="a-${a}" data-act="${a}" aria-pressed="false" title="只亮出要${ACT[a].name}的句子"><i></i>${ACT[a].name}</button>`).join("");
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
  // 長度以 YouTube 回報的為準，還沒載好才用資料裡的長度
  const DUR = () => { try { const d = ready && vid === S.yt && player.getDuration(); if (d) return d; } catch (e) {} return S ? S.dur : 1; };
  function videoMsg(text) { vstatus.hidden = !text; if (text) vmsg.textContent = text; }
  const now = () => { try { return ready && player.getCurrentTime() || 0; } catch (e) { return 0; } };
  const isPlaying = () => { try { return ready && [1, 3].includes(player.getPlayerState()); } catch (e) { return false; } };
  function pause() { if (ready) player.pauseVideo(); }
  function seek(t) { if (!ready) return; player.seekTo(Math.max(0, Math.min(DUR(), t)), true); player.playVideo(); }

  // 播放速度：放慢練應援時間點，記在這台裝置
  let RATE = [.5, .75].includes(+store.get("mv-rate")) ? +store.get("mv-rate") : 1;
  const rateSel = document.getElementById("rateSel");
  rateSel.value = String(RATE);
  const applyRate = () => { try { player.setPlaybackRate(RATE); } catch (e) {} };
  rateSel.addEventListener("change", () => { RATE = +rateSel.value; store.set("mv-rate", RATE === 1 ? null : String(RATE)); if (ready) applyRate(); });

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
          if (vid !== S.yt) { loadVideo(); return; }
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
        onError: () => videoMsg("無法播放影片，請到 YouTube 觀看。")
      }
    });
  }

  function loadVideo() {
    if (!S || songV.hidden || !window.YT || !YT.Player) return;
    if (!player) {
      vid = S.yt;
      createPlayer(vid, true);
      return;
    }
    if (!ready) return;
    // 打開歌曲或切歌播放
    if (vid !== S.yt) {
      vid = S.yt;
      try { player.unMute(); } catch (e) {}
      player.loadVideoById({ videoId: S.yt, startSeconds: START });
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
    if (href.startsWith("#")) return href.slice(1).split("@")[0];
    const m = href.match(/(?:^|\/)song\/([^\/]+)/);
    return m ? m[1] : null;
  }

  // 使用者手勢直接啟動播放，避免瀏覽器與 YouTube 判定為背景自動播放而插入廣告與強制靜音
  document.addEventListener("click", e => {
    const a = e.target.closest("a[data-id], a[href^='#'], #prevSong, #nextSong");
    if (!a) return;
    const targetId = getSongIdFromEl(a);
    const targetSong = targetId && BY[targetId];
    if (!targetSong) return;

    if (!player && window.YT && YT.Player) {
      vid = targetSong.yt;
      createPlayer(vid, true);
      return;
    }

    if (player && ready) {
      try {
        player.unMute();
        if (vid !== targetSong.yt) {
          vid = targetSong.yt;
          player.loadVideoById({ videoId: targetSong.yt, startSeconds: 0 });
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
      toast("瀏覽器不讓影片自動出聲，先靜音播放；點影片的喇叭開聲音");
    }, 3000);
  }
  if (location.protocol === "file:") {
    videoMsg("直接點開檔案時 YouTube 不允許嵌入播放。請改用資料夾裡的「開啟網站.command」，或放上 GitHub Pages 再看。");
  } else {
    slowTimer = setTimeout(() => { if (!ready) videoMsg("影片連線延遲，請到 YouTube 觀看。"); }, 8000);
    window.onYouTubeIframeAPIReady = loadVideo;
    const yts = document.createElement("script");
    yts.src = "https://www.youtube.com/iframe_api";
    yts.onerror = () => videoMsg("無法載入 YouTube 播放器，請到 YouTube 觀看。");
    document.head.appendChild(yts);
  }

  function openSong(s, t = 0) {
    S = s; curKey = null; hideAlert(); START = t; remember(s.id);
    // 在這首自己的頁面（song/<id>/）時保留建置時寫好的完整標題，給搜尋引擎看
    document.title = s.id === PAGE_SONG ? PAGE_TITLE : `${s.ja}｜Ado 應援指南`;
    const sub = s.zh !== s.ja ? s.zh : s.en;
    document.getElementById("sTitle").innerHTML = esc(s.ja) + (sub ? `<span lang="zh-Hant-TW">${esc(sub)}</span>` : "");
    ["ytLink", "ytLink2"].forEach(id => document.getElementById(id).href = `https://www.youtube.com/watch?v=${s.yt}`);
    document.getElementById("lyLink").href = s.ut;
    const lives = s.lives;
    const liveOpt = document.getElementById("liveOpt");
    if (liveOpt) {
      liveOpt.hidden = lives.length === 0;
      liveOpt.open = false;
      const liveList = document.getElementById("liveList");
      if (liveList) {
        liveList.innerHTML = lives.map(l =>
          `<li><a href="https://www.youtube.com/watch?v=${l.yt}" target="_blank" rel="noopener"><span>${esc(l.concert)}</span><svg class="ext" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a></li>`
        ).join("");
      }
    }
    const liveLink = document.getElementById("liveLink");
    if (liveLink) {
      if (lives.length > 0) {
        liveLink.hidden = false;
        liveLink.href = `https://www.youtube.com/watch?v=${lives[0].yt}`;
        liveLink.textContent = `現場音源（${lives[0].concert}）↗`;
      } else {
        liveLink.hidden = true;
      }
    }
    const p = penOf(s);
    document.getElementById("pen").innerHTML = "螢光棒" + p.keys.map(k => k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k][1]}"></i>`).join("")
      + `<b>${p.keys.map(k => k === "彩" ? "彩色" : PENC[k][0]).join("、")}${p.none ? "（沒指定）" : ""}</b>`;
    const seq = ordered(), at = seq.indexOf(s);
    [["prevSong", seq[at - 1], "上一首"], ["nextSong", seq[at + 1], "下一首"]].forEach(([id, x, word]) => {
      const a = document.getElementById(id);
      if (x) { a.href = "#" + x.id; a.setAttribute("aria-label", `${word}：${x.ja}`); } else a.removeAttribute("href");
    });
    fillSong();
    document.getElementById("tool-click").disabled = !BEAT[s.id];
    loadVideo();
    loadKaraokeTiming(s);
    updateAmbientColors(s);
    if (!hasDocPip()) prepCanvasPip();
  }
  // 歌詞相關的部分：歌詞檔載好後會再跑一次
  function fillSong() {
    const s = S;
    if (lyReady && !lyHave(s)) loadLyrics(s).then(() => { if (S === s && !songV.hidden) fillSong(); });
    loadSongData();
    renderLines();
    if (karaokeTiming && S && karaokeTiming.songId === S.id) {
      applyKaraokeTimingToDom(S);
    }
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
    document.getElementById("cueName").textContent = "按播放開始";
    document.getElementById("cueHow").textContent = !lyHave(s) ? "" : LINES.length ? "播放後，這裡會顯示現在要做的動作。" : "這首還沒有逐行時間軸，不會跳提示，照歌詞欄的重點練。";
    document.getElementById("cueNext").innerHTML = "";

    // 同步更新歌曲應援速覽卡片（若存在於 DOM 中）
    const cardJa = document.getElementById("cardJa");
    if (cardJa) {
      cardJa.textContent = s.ja + (s.zh !== s.ja ? `（${s.zh}）` : "");
      const p = penOf(s);
      const penText = p.keys.map(k => k === "彩" ? "彩色" : PENC[k][0]).join("、") + (p.none ? "（未指定，建議用代表色藍色）" : "");
      document.getElementById("cardPen").textContent = penText;
      document.getElementById("cardTips").textContent = s.tips && s.tips.length ? s.tips.join("；") : (s.free ? "沒有固定應援，自由跟著節奏搖手燈。" : "應援還在整理，先熟悉旋律。");
      const cardYt = document.getElementById("cardYt");
      if (cardYt) cardYt.href = `https://www.youtube.com/watch?v=${s.yt}`;
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
    if (S.free) return { acts: [], name: "自由跟著節奏", how: "沒有固定應援，跟著現場氣氛就好。" };
    if (S.hold) return { acts: [], name: "應援還在整理", how: "先熟悉旋律，跟著現場氣氛就好。" };
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
        alBody = document.getElementById("alBody"), alHow = document.getElementById("alHow"), cueFrame = document.getElementById("cueFrame"), alertSw = document.getElementById("alertSw");
  const screenEl = document.getElementById("screen");
  let alertOn = store.get("alert-off") !== "1", alKey = "", alKind = "", alDots = [], alWords = [], alSing = [], alSteps = [];
  // 大字提醒開關：電腦在提示框裡，手機在練習工具選單裡
  const alertBtns = [alertSw, document.getElementById("alertTool")];
  const paintAlert = () => alertBtns.forEach(b => b.setAttribute("aria-pressed", alertOn));
  paintAlert();
  alertBtns.forEach(b => b.addEventListener("click", () => { alertOn = !alertOn; paintAlert(); store.set("alert-off", alertOn ? "0" : "1"); }));
  const dotsHTML = (n, first) => `<div class="dots">${Array.from({ length: n }, (_, i) => `<i${first && !i ? ' class="first"' : ""}></i>`).join("")}</div>`;
  // 字卡內容：大合唱寫出要唱的字，喊聲寫出要喊的話，拍手是每拍亮的圓點，揮手是擺動的螢光棒，跳躍是彈起的圖示；反拍拍手特製 4 拍視覺儀
  function cardFor(cue, l) {
    const isOffbeat = (l.call && l.call.includes("反拍")) || (cue.name && cue.name.includes("反拍"));
    if (isOffbeat) {
      return {
        act: "clap",
        name: "反拍拍手（第 2、4 拍）",
        kind: "offbeat",
        body: `<div class="offbeat-meter"><div class="beat-step step-1"><span class="step-num">1</span><span class="step-txt">空</span><span class="step-sub">—</span></div><div class="beat-step target-clap step-2"><span class="step-num">2</span><span class="step-txt">拍！</span><svg class="step-ico" viewBox="0 0 24 24"><use href="#i-clap"/></svg></div><div class="beat-step step-3"><span class="step-num">3</span><span class="step-txt">空</span><span class="step-sub">—</span></div><div class="beat-step target-clap step-4"><span class="step-num">4</span><span class="step-txt">拍！</span><svg class="step-ico" viewBox="0 0 24 24"><use href="#i-clap"/></svg></div></div>`,
        how: "口訣：一 [拍] 三 [拍]（空・拍・空・拍）"
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
    if (!alertOn || !playing || !cue) return hideAlert();
    const b = beatAt(t), pulse = b && !reduce ? beatPulse(b) * (b.known && !b.down ? .6 : 1) : 0;
    const pen = penOf(S).cols;
    cueFrame.style.setProperty("--c1", pen[0]); cueFrame.style.setProperty("--c2", pen[1 % pen.length]);
    al.style.setProperty("--pulse", pulse.toFixed(3));
    // 「唱」最後的 Clap Clap Clap：三下圓點
    if (cue.claps && t >= cue.claps && t < cue.claps + 2.2) {
      showCard("claps3", { act: "clap", name: "拍三下", kind: "claps3", body: dotsHTML(3), how: "啪、啪、啪" });
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
    if (!targetEl || reduce) return;
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
    if (SING.length) { singPrev.disabled = singAt(-1, t) == null; singNext.disabled = singAt(1, t) == null; }
    const started = playing || t > 0, cue = cueAt(t);
    cueBox.classList.toggle("playing", playing); cueBox.classList.toggle("alerting", playing && alertOn);
    if (started && cue) {
      const key = cue.name + cue.acts.join();
      if (key !== curKey) {
        const isOffbeat = cue.name && cue.name.includes("反拍");
        cueIcon.innerHTML = isOffbeat ? `<use href="#i-clap"/>` : (cue.acts.length ? `<use href="#${ACT[cue.acts[0]].icon}"/>` : "");
        cueBox.className = "cue" + (cue.listen ? " idle" : isOffbeat ? " a-clap" : (cue.acts.length ? " a-" + mainAct(cue.acts) : "")) + (playing ? " playing" : "") + (playing && alertOn ? " alerting" : "");
        if (isOffbeat) {
          cueName.innerHTML = `<span class="cue-offbeat-title">反拍拍手</span><span class="cue-offbeat-pattern"><b>1空</b><b class="clap">2拍</b><b>3空</b><b class="clap">4拍</b></span>`;
          cueHow.textContent = "第 2、4 拍拍手（口訣：空・拍・空・拍）";
        } else {
          cueName.textContent = cue.name;
          cueHow.textContent = cue.how;
        }
        curKey = key;
      }
      const nx = nextChange(t);
      cueNext.innerHTML = nx ? (nx.t - t <= 5 ? `${Math.ceil(nx.t - t)} 秒後` : `下一個 ${fmt(nx.t)}`) + `<b class="a-${mainAct(nx.acts)}">${esc(nx.name)}</b>` : "";
    } else if (started) {
      // 第一句之前的前奏：先空著，顯示下一個動作；整首沒有時間軸的新歌：不要一直停在「按播放開始」
      const key = LINES.length ? "intro" : "free";
      if (key !== curKey) {
        cueIcon.innerHTML = "";
        cueBox.className = "cue idle" + (playing ? " playing" : "") + (playing && alertOn ? " alerting" : "");
        cueName.textContent = LINES.length ? "" : "自由跟著節奏"; cueHow.textContent = LINES.length ? "" : "應援還在整理，跟著現場氣氛就好"; curKey = key;
      }
      const nx = LINES.length && nextChange(t);
      cueNext.innerHTML = nx ? (nx.t - t <= 5 ? `${Math.ceil(nx.t - t)} 秒後` : `下一個 ${fmt(nx.t)}`) + `<b class="a-${mainAct(nx.acts)}">${esc(nx.name)}</b>` : "";
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
  // 點選單外面就收起來
  const menus = [document.getElementById("vopt"), document.getElementById("tools"), document.getElementById("tipsOpt"), document.getElementById("liveOpt")].filter(Boolean);
  document.addEventListener("click", e => menus.forEach(m => { if (m.open && !m.contains(e.target)) m.open = false; }));
  // 按 Esc 也收起來，焦點回到選單按鈕；這一下不再拿去關沉浸模式
  document.addEventListener("keydown", e => {
    const m = e.key === "Escape" && menus.find(x => x.open);
    if (!m) return;
    e.stopImmediatePropagation();
    m.open = false;
    m.querySelector("summary").focus();
  }, true);
  // 窄螢幕上按鈕換行到左邊時選單往右展開，下面放不下時往上展開（#vopt 在歌詞頂部，順向往下展開至歌詞區）
  menus.forEach(m => m.addEventListener("toggle", () => {
    const box = m.querySelector(".view-opts");
    if (!box) return;
    box.classList.remove("to-right", "to-up");
    box.style.maxHeight = "";
    if (!m.open) return;
    const r = box.getBoundingClientRect();
    if (r.left < 8) box.classList.add("to-right");
    if (m.id === "vopt") return;
    const below = innerHeight - r.top - 8, above = m.getBoundingClientRect().top - 14;
    if (r.height > below) {
      if (above > below) box.classList.add("to-up");
      if (r.height > Math.max(above, below)) box.style.maxHeight = Math.max(above, below) + "px";
    }
  }));

  // ── 練習工具 ──
  const TOOL = { click: store.get("tool-click") === "1", autonext: store.get("tool-autonext") === "1", lamp: store.get("tool-lamp") === "1" };
  const paintTools = () => document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", TOOL[b.dataset.tool]));

  // ── 沉浸模式 (Folia Immersive Stage) ──
  const ambientMesh = document.getElementById("ambientMesh");
  const toolImmersive = document.getElementById("tool-immersive");
  const toolImmersiveMenuBtn = document.getElementById("toolImmersiveMenuBtn");
  const songbar = document.querySelector(".songbar");
  let isImmersive = false;
  let songbarHideTimer = null;

  function updateAmbientColors(s) {
    if (!s || !ambientMesh) return;
    const p = penOf(s);
    const cols = p && p.cols && p.cols.length ? p.cols : ["#5d9dfe", "#ff4a5a"];
    ambientMesh.style.setProperty("--mesh-c1", cols[0]);
    ambientMesh.style.setProperty("--mesh-c2", cols[1] || cols[0]);
  }

  function resetSongbarAutohide() {
    if (!isImmersive || !songbar) return;
    songbar.classList.remove("autohide");
    clearTimeout(songbarHideTimer);
    songbarHideTimer = setTimeout(() => {
      if (isImmersive) songbar.classList.add("autohide");
    }, 3500);
  }

  function setImmersive(on) {
    if (isImmersive === on) return;
    isImmersive = on;
    document.body.classList.toggle("immersive-mode", isImmersive);
    syncThemeColor();
    if (toolImmersive) toolImmersive.setAttribute("aria-pressed", isImmersive);
    if (isImmersive) {
      updateAmbientColors(S);
      toast("✨ 已開啟沉浸播放模式（按 Esc 或 F 退出）");
      resetSongbarAutohide();
      if (curLine >= 0 && lineEls[curLine]) {
        setTimeout(() => centerLine(lineEls[curLine]), 80);
      }
    } else {
      if (songbar) songbar.classList.remove("autohide");
      clearTimeout(songbarHideTimer);
      if (curLine >= 0 && lineEls[curLine]) {
        setTimeout(() => centerLine(lineEls[curLine]), 80);
      }
    }
  }

  function toggleImmersive() {
    if (!S || songV.hidden) return;
    setImmersive(!isImmersive);
  }

  if (toolImmersive) toolImmersive.addEventListener("click", toggleImmersive);
  if (toolImmersiveMenuBtn) {
    toolImmersiveMenuBtn.addEventListener("click", () => {
      toggleImmersive();
      const toolsMenu = document.getElementById("tools");
      if (toolsMenu) toolsMenu.open = false;
    });
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
      toast(document.pictureInPictureEnabled ? "無法開啟歌詞小窗，請再按一次" : "您的瀏覽器不支援子母畫面 (Picture-in-Picture) 功能");
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
    doc.title = `歌詞小窗｜${S ? S.ja : "Ado 應援指南"}`;

    copyStylesToPip(doc);
    copySvgIconsToPip(doc);

    const mainEl = doc.createElement("main");
    mainEl.className = "document-pip song-page";
    mainEl.innerHTML = `
      <div class="pip-progress" role="progressbar" aria-label="播放進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <span class="pip-progress-fill"></span>
      </div>
      <header class="pip-controls" aria-label="字幕窗控制">
        <button type="button" class="pip-action pip-return" title="返回主頁" aria-label="返回主頁">
          <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
        <div class="pip-track-controls" role="group" aria-label="切換歌曲">
          <button type="button" class="pip-action pip-prev" title="上一首" aria-label="上一首">
            <svg viewBox="0 0 24 24"><path d="M14 6l-6 6 6 6"/></svg>
          </button>
          <div class="pip-song-label" aria-live="polite">
            <span class="pip-song-number"></span>
            <span class="pip-title"></span>
          </div>
          <button type="button" class="pip-action pip-next" title="下一首" aria-label="下一首">
            <svg viewBox="0 0 24 24"><path d="M10 6l6 6-6 6"/></svg>
          </button>
        </div>
        <button type="button" class="pip-action pip-play" title="播放" aria-label="播放主頁影片">
          <svg class="icon-play" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg class="icon-pause" viewBox="0 0 24 24" style="display:none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        </button>
      </header>
      <section class="pip-lyrics" aria-label="同步歌詞">
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
      toast("您的瀏覽器不支援子母畫面 (Picture-in-Picture) 功能");
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
      toast("無法開啟歌詞小窗，請再按一次");
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
    ctx.fillText(S ? `Ado〈${S.ja}〉` : "Ado 應援指南", 24, 38);

    ctx.fillStyle = "#64748b";
    ctx.font = '15px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", sans-serif';
    ctx.textAlign = "right";
    ctx.fillText(playing ? "正在播放 ⏸" : "已暫停 ▶", w - 24, 38);

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
    const curJp = l ? stripFurigana(l.jp) : (S ? `〈${S.ja}〉` : "等待播放…");
    ctx.fillText(curJp, 24, curY, w - 48);

    if (l && l.tr) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = '17px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(l.tr, 24, curY + 34, w - 48);
    }

    if (nextL && nextL.jp) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      ctx.beginPath();
      ctx.moveTo(24, h - 54);
      ctx.lineTo(w - 24, h - 54);
      ctx.stroke();

      ctx.fillStyle = "#475569";
      ctx.font = 'bold 13px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText("下一句", 24, h - 24);

      ctx.fillStyle = "#64748b";
      ctx.font = '14px "LINESeedTW", "LINE Seed TW", "LINE Seed JP", -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText(stripFurigana(nextL.jp), 74, h - 24, w - 100);
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
        doc.title = `歌詞小窗｜${S.ja}`;
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
          playBtn.setAttribute("title", playing ? "暫停" : "播放");
          playBtn.setAttribute("aria-label", playing ? "暫停主頁影片" : "播放主頁影片");
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
            curContainer.innerHTML = `<p class="pip-empty">${S ? `〈${esc(S.ja)}〉等待播放…` : "等待同步…"}</p>`;
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
    toolPipMenuBtn.addEventListener("click", () => {
      togglePip();
      const toolsMenu = document.getElementById("tools");
      if (toolsMenu) toolsMenu.open = false;
    });
  }

  ["mousemove", "touchstart"].forEach(ev => {
    document.addEventListener(ev, () => {
      if (isImmersive) resetSongbarAutohide();
    }, { passive: true });
  });
  document.querySelectorAll("[data-tool]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.tool;
    if (k === "lamp" && TOOL.lamp && lampStatusText === "找不到 PenlightSync") {
      toast("請先在電腦開啟 PenlightSync App，並在色彩頁將「取色來源」選為網站");
      lampRetryCount = 0;
      lampConnect();
      return;
    }
    TOOL[k] = !TOOL[k]; store.set("tool-" + k, TOOL[k] ? "1" : null); paintTools();
    if (k === "click" && TOOL.click) clickCtx();
    if (k === "lamp") {
      if (TOOL.lamp) { lampRetryCount = 0; lampConnect(); }
      else { lampDisconnect(true); }
    }
  }));
  paintTools();
  // 上次就開著拍點聲：瀏覽器要等使用者點一下或按鍵才肯出聲，第一次互動時把聲音準備好
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => { if (TOOL.click) clickCtx(); }, true));

  // 播完自動下一首：照首頁目前的排序
  function ended() {
    if (!TOOL.autonext || !S) return;
    const seq = ordered(), nx = seq[seq.indexOf(S) + 1];
    if (nx) location.hash = nx.id;
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

    setLampStatus("連線中…", false);
    try {
      const ws = new WebSocket("ws://127.0.0.1:51730/ado");
      lampWS = ws;

      ws.onopen = () => {
        if (ws !== lampWS) return;
        lampRetryCount = 0;
        if (!lampHasConnected) {
          lampHasConnected = true;
          toast("已連上 PenlightSync");
        }
        lampLastSent = null;
      };

      ws.onmessage = ev => {
        if (ws !== lampWS) return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg && msg.type === "hello") {
            if (msg.lamp === "linked") {
              const wasLinked = lampStatusText === "已連動";
              setLampStatus("已連動", true);
              if (!wasLinked) toast("✨ 已與 PenlightSync 手燈連動！");
            } else if (msg.lamp === "connecting") {
              setLampStatus("手燈連線中…", false);
            } else {
              setLampStatus("App 已開，手燈未連", false);
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
          setLampStatus("連線中…", false);
          lampTimer = setTimeout(lampConnect, 5000);
        } else {
          setLampStatus("找不到 PenlightSync", false);
        }
      };
    } catch (e) {
      if (!TOOL.lamp) return;
      if (lampRetryCount < 12) {
        lampRetryCount++;
        setLampStatus("連線中…");
        lampTimer = setTimeout(lampConnect, 5000);
      } else {
        setLampStatus("找不到 PenlightSync");
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

  // 分享目前時間：網址後面加 @秒數，打開就從那裡開始
  document.getElementById("shareBtn").addEventListener("click", async () => {
    if (!S) return;
    // 正式網站（有每首歌的獨立頁）分享那首的頁面，連結預覽才會是那首歌；本機預覽沒有獨立頁，用 # 網址
    const t = Math.floor(now()), at = t ? `#${S.id}@${t}` : "";
    const url = location.hostname.endsWith("github.io") ? new URL(`song/${S.id}/`, document.baseURI).href + at : `${location.origin}${location.pathname}${at || "#" + S.id}`;
    document.getElementById("tools").open = false;
    const text = `${S.ja}${t ? " " + fmt(t) : ""}｜Ado 應援指南`;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) { try { await navigator.share({ title: text, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(url); toast(`已複製連結${t ? "（從 " + fmt(t) + " 開始）" : ""}`); }
    catch (e) { prompt("複製這個連結：", url); }
  });

  // 回報錯誤／意見回饋：開啟預先填好的 Google 表單（表單「Ado 應援指南｜回報與意見回饋」，帳號 kuti36.work）
  // entry 是各題的編號；form 留空時改成複製文字
  const REPORT = { form: "https://docs.google.com/forms/d/e/1FAIpQLSd7f7-x0jHfDrObA4cD7D6HiAyZ2CN2BOiP1gTIffZYKW3XPg/viewform", entry: { song: "1258710218", time: "504224952", line: "1328755778", kind: "792721747", note: "1740176641" } };
  const dlg = document.getElementById("reportDlg"), rpKind = document.getElementById("rpKind"), rpNote = document.getElementById("rpNote");
  let rpData = null;
  // 歌曲頁的「回報錯誤」帶入歌曲、時間和這一句；頁尾的「意見回饋」不指定歌曲
  function openReport(onSong) {
    document.getElementById("tools").open = false;
    document.getElementById("reportH").textContent = onSong ? "回報錯誤" : "意見回饋";
    document.getElementById("rpWhere").hidden = !onSong;
    if (onSong) {
      pause();
      const t = now(), l = LINES[lineAt(t)];
      rpData = { song: `${S.ja}（${S.id}）`, time: fmt(t) + `（${t.toFixed(1)} 秒）`, line: l ? (l.ja || l.zh || "") : "（還沒開始）" };
    } else {
      rpData = { song: "", time: "", line: "" };
      rpKind.value = "功能建議";
    }
    document.getElementById("rpSong").textContent = rpData.song;
    document.getElementById("rpTime").textContent = rpData.time;
    document.getElementById("rpLine").textContent = rpData.line;
    rpNote.value = "";
    document.getElementById("rpHint").textContent = REPORT.form ? "按送出會開啟 Google 表單，上面的內容已經幫你填好。" : "回報表單還沒開放，按送出會把內容複製起來。";
    document.getElementById("rpSend").textContent = REPORT.form ? "開啟表單" : "複製內容";
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
    try { await navigator.clipboard.writeText(text); toast("已複製回報內容"); } catch (e) { prompt("複製這段內容：", text); }
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
      const r = await fetch("CHANGELOG.md", { cache: "no-cache" });
      if (!r.ok) throw 0;
      logBody.innerHTML = renderLog(await r.text()); logLoaded = true;
    } catch (e) { logBody.innerHTML = `<p>讀不到更新日誌，可以到 <a href="${LOG_URL}" target="_blank" rel="noopener">GitHub</a> 看。</p>`; }
  });

  // 鍵盤：空白鍵播放／暫停，← → 上一句、下一句（在輸入框裡不搶按鍵）
  addEventListener("keydown", e => {
    if (!S || songV.hidden || !ready || e.metaKey || e.ctrlKey || e.altKey || dlg.open || logDlg.open) return;
    if (e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleImmersive();
    } else if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      togglePip();
    } else if (e.key === "Escape" && isImmersive) {
      e.preventDefault();
      setImmersive(false);
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
  function route() {
    // 每首歌的獨立頁（song/<id>/）沒有 # 時直接開那首
    const h = location.hash.slice(1) || PAGE_SONG, [id, at] = h.split("@"), s = BY[id];
    if (s) {
      if (!homeV.hidden) listY = scrollY;
      document.body.classList.add("on-song"); document.documentElement.classList.add("on-song"); syncThemeColor();
      hidePwaToast(false);
      homeV.hidden = true; songV.hidden = false; openSong(s, Math.max(0, Math.floor(+at || 0))); scrollTo(0, 0);
      trackView(s);
    } else {
      setImmersive(false);
      lampStop(); pause(); hideAlert(); karaokeLoadSeq++; karaokeTiming = null; document.body.classList.remove("on-song"); document.documentElement.classList.remove("on-song"); syncThemeColor(); songV.hidden = true; homeV.hidden = false; document.title = PAGE_SONG ? "Ado 應援指南" : PAGE_TITLE;
      renderRecent();
      const target = h && document.getElementById(h);
      if (target) target.scrollIntoView({ block: "start" }); else scrollTo(0, listY);
      trackView(null);
    }
  }
  addEventListener("hashchange", route);
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
      const baseY = H - 4, band = Math.min(70, H * .14);
      sticks.forEach(s => {
        const swing = reduce ? 0 : Math.sin(tt * (playing ? 4.2 : 1.3) + s.ph) * (playing ? .5 : .2) * (listen ? .3 : 1);
        ctx.save(); ctx.translate(s.x * W, baseY - s.y * band - 6 * hit); ctx.rotate(swing);
        ctx.strokeStyle = hex(s.c, (.16 + .3 * energy + .45 * hit) * (.45 + s.y * .55) * o.k);
        ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -(12 + s.y * 8)); ctx.stroke(); ctx.restore();
      });
      ctx.globalCompositeOperation = "source-over";
    };
    draw.pen = pen;
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
  let stageT = 0, lastMs = 0, idleDrawn = false, penSong, blasted = false;
  addEventListener("resize", () => { idleDrawn = false; });
  function frame(ms) {
    const cue = update(), playing = S && !songV.hidden && isPlaying(), t = now();
    clicks(t, playing);
    lampFrame(t, playing);
    // 歌曲頁燈光換成這首的螢光棒顏色，回首頁換回藍白
    const want = S && !songV.hidden ? S : null;
    if (want !== penSong) { penSong = want; bg.pen(want && penOf(want).cols); idleDrawn = false; blasted = false; }
    // 播到副歌高潮噴一次彩帶；倒回高潮前再播到會再噴
    const cx = want && CLIMAX[want.id];
    if (cx != null) {
      if (t < cx - .3) blasted = false;
      else if (playing && !blasted && t >= cx - .05 && t < cx + .8 && OPT.light !== false) { blasted = true; blast(penOf(want).cols); }
    }
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
        ambientMesh.style.setProperty("--beat-hit", (playing && !reduce) ? hit.toFixed(3) : "0");
      }
      if (playing || !idleDrawn) { bg(stageT, energy, hit, cue && cue.listen, playing, beat); idleDrawn = !playing; }
    } else {
      lastMs = ms;
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
