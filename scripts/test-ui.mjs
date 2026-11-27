// 畫面冒煙測試：用 Playwright 開建置好的網站（dist/），把首頁、歌曲頁、分享、測驗模式、離線、手機版面都走一遍
// 外部網路一律擋掉；YouTube 播放器換成假的（時間由測試控制），測驗判定才測得準
// 用法：node scripts/build.mjs dist && node scripts/test-ui.mjs dist
// 需要 Playwright：npm install --no-save --no-package-lock playwright && npx playwright install chromium-headless-shell
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const dir = path.resolve(process.argv[2] || "dist");
if (!fs.existsSync(path.join(dir, "index.html"))) throw new Error(`${dir} 裡沒有 index.html，先跑 node scripts/build.mjs dist`);

// ── 靜態伺服器：資料夾回 index.html，找不到回 404 ──
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain; charset=utf-8" };
const server = http.createServer((req, res) => {
  let p = path.join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!p.startsWith(dir)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ── 假的 YouTube 播放器：時間照真實時間走，測試可以用 window.__yt 暫停、跳到指定秒數、觸發錯誤 ──
const FAKE_YT = `
window.YT = { Player: function (el, o) {
  window.__ytInit = o;
  let t = (o.playerVars && o.playerVars.start) || 0, st = -1, rate = 1, last = performance.now();
  const sync = () => { const n = performance.now(); if (st === 1) t += (n - last) / 1000 * rate; last = n; };
  Object.assign(this, {
    getCurrentTime: () => { sync(); return t; }, getPlayerState: () => st, getDuration: () => 0,
    playVideo: () => { sync(); st = 1; }, pauseVideo: () => { sync(); st = 2; },
    seekTo: x => { sync(); t = x; }, loadVideoById: v => { sync(); window.__ytLastLoad = v; t = (v && v.startSeconds) || 0; st = 1; },
    setPlaybackRate: r => { sync(); rate = r; }, mute() {}, unMute() {},
    fireState: s => { sync(); st = s; o.events.onStateChange && o.events.onStateChange({ data: s }); },
    fireError: () => o.events.onError && o.events.onError({ data: 150 })
  });
  window.__yt = this;
  window.__ytReady = false;
  setTimeout(() => {
    o.events.onReady && o.events.onReady();
    window.__ytReady = true;
  }, 0);
} };
setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
`;

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || undefined });
let failed = 0, passed = 0;
function checkSync(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`); passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${String(e.message).split("\n").join("\n    ")}`); failed++;
  }
}
async function test(name, fn, ctxOpts = {}) {
  const ctx = await browser.newContext({ serviceWorkers: "block", ...ctxOpts });
  await ctx.route("**/*", route => {
    const u = route.request().url();
    if (u.startsWith(BASE)) return route.continue();
    if (u.includes("youtube.com/iframe_api")) return route.fulfill({ contentType: "text/javascript", body: FAKE_YT });
    return route.abort();
  });
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await fn(page, ctx);
    assert.deepEqual(errors, [], "頁面不應該有 JavaScript 錯誤");
    console.log(`  ✓ ${name}`); passed++;
  } catch (e) {
    console.log(`  ✗ ${name}\n    ${String(e.message).split("\n").join("\n    ")}`); failed++;
  } finally { await ctx.close(); }
}
// 等播放器（假的）準備好、歌詞排好
const openSong = async (page, url) => {
  await page.goto(BASE + url);
  await page.waitForFunction(() => window.__yt && window.__ytReady && document.querySelectorAll("#lines .ln").length > 0);
};
const press = (page, key) => page.evaluate(k => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })), key);

console.log("=== UI smoke tests ===");

await test("首頁：歌單、搜尋、篩選", async page => {
  await page.goto(BASE);
  assert.equal(await page.getAttribute('[data-f="original"]', "aria-pressed"), "true");
  const origCount = await page.evaluate(() => window.ADO_SONGS.SONGS.filter(s => !s.cover && !s.collab).length);
  assert.equal(await page.textContent("#songCount"), `${origCount} 首`);
  assert.equal(await page.isVisible('#songList li:not([hidden]) a[data-id="usseewa"]'), true);
  assert.equal(await page.locator('#songList a[data-id="binks"]').count(), 1, "binks 應出現在原創曲列表");
  const nonOrigInInit = await page.evaluate(() =>
    [...document.querySelectorAll('#songList a[data-id]')].map(a => a.dataset.id).filter(id => {
      const s = window.ADO_SONGS.SONGS.find(x => x.id === id);
      return !s || s.cover || s.collab;
    })
  );
  assert.deepEqual(nonOrigInInit, [], "預設原創曲列表不應出現翻唱或合作曲");
  assert.equal(await page.locator("#shelf li").count(), 9);
  assert.match(await page.textContent("#shelf li:first-child .card-ja"), /踊/);

  await page.click('[data-f="collab"]');
  const collabCount = await page.evaluate(() => window.ADO_SONGS.SONGS.filter(s => s.collab).length);
  assert.equal(await page.textContent("#songCount"), `${collabCount} 首符合`);
  for (const id of ["sayonara", "sakura", "dnd"]) {
    assert.equal(await page.locator(`#songList a[data-id="${id}"]`).count(), 1, `合作曲篩選應包含 ${id}`);
  }

  await page.click('[data-f="cover"]');
  const coverCount = await page.evaluate(() => window.ADO_SONGS.SONGS.filter(s => s.cover).length);
  assert.equal(await page.textContent("#songCount"), `${coverCount} 首符合`);
  assert.equal(await page.locator("#songList li").count(), coverCount);
  for (const id of ["soldiergame", "fairytale", "unravel"]) {
    assert.equal(await page.locator(`#songList a[data-id="${id}"]`).count(), 1, `翻唱篩選應包含 ${id}`);
  }
  assert.equal(await page.locator('#songList a[data-id="binks"]').count(), 0, "binks 不應出現在翻唱列表");

  await page.click('[data-f="live"]');
  assert.equal(await page.isVisible("#liveSubFilter"), true);

  await page.click('[data-f="frequent"]');
  assert.equal(await page.textContent("#songCount"), "16 首符合");
  assert.equal(await page.isVisible("#freqSubFilter"), true);
  await page.click('[data-freq-sub="2"]');
  assert.equal(await page.textContent("#songCount"), "4 首符合");

  await page.click('[data-f="original"]');
  await page.fill("#listQ", "unravel");
  assert.equal(await page.isVisible("#emptyShowAllBtn"), true, "原創曲搜翻唱曲應出現跨分類顯示按鈕");
  await page.click("#emptyShowAllBtn");
  assert.equal(await page.getAttribute('[data-f="all"]', "aria-pressed"), "true");
  assert.equal(await page.isVisible('#songList li:not([hidden]) a[data-id="unravel"]'), true);

  await page.click('[data-f="original"]');
  await page.fill("#listQ", "a");
  assert.equal(await page.isVisible("#listSearchHint"), true, "有結果但其他分類也有符合時應顯示提醒");
  await page.click("#listSearchHint [data-switch-all]");
  assert.equal(await page.getAttribute('[data-f="all"]', "aria-pressed"), "true");
  await page.click("#listQClear");
  assert.equal(await page.inputValue("#listQ"), "");
  assert.equal(await page.isVisible("#listQClear"), false);
  assert.equal(await page.isVisible("#listSearchHint"), false);

  await page.click('[data-f="all"]');
  const allCount = await page.evaluate(() => window.ADO_SONGS.SONGS.length);
  assert.equal(await page.textContent("#songCount"), `${allCount} 首`);
  assert.equal(await page.locator("#songList li").count(), allCount);
  await page.fill("#listQ", "usseewa");
  assert.equal(await page.locator("#songList li:not([hidden])").count(), 1);
  assert.match(await page.textContent("#songList li:not([hidden]) .ja"), /うっせぇわ/);
  await page.fill("#listQ", "完全找不到的字");
  assert.equal(await page.isVisible("#songEmpty"), true);
  await page.fill("#listQ", "");

  const titleCheck = await page.evaluate(() => {
    const byId = id => window.ADO_SONGS.SONGS.find(s => s.id === id);
    return {
      eaasou: byId("eaasou"),
      renaesaiban: byId("renaesaiban"),
      lagata: byId("lagata"),
      binks: byId("binks")
    };
  });
  for (const id of ["eaasou", "renaesaiban", "lagata"]) {
    assert.equal(titleCheck[id].zh, titleCheck[id].ja, `${id} 無官方譯名時 zh 應維持原名`);
    assert.equal(titleCheck[id].en, titleCheck[id].ja, `${id} 無官方譯名時 en 應維持原名`);
  }
  assert.notEqual(titleCheck.binks.zh, titleCheck.binks.ja, "binks 應保留官方中文譯名");
  assert.notEqual(titleCheck.binks.en, titleCheck.binks.ja, "binks 應保留官方英文譯名");
});

await test("主視覺快速搜尋（#q）、頂欄搜尋鈕與快捷鍵 /", async page => {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelectorAll("#songList li").length > 0);
  assert.equal(await page.isVisible("#barSearchBtn"), false, "首頁頂端有大搜尋框時不應顯示頂欄搜尋鈕");

  // 停在預設「原創曲」，在主視覺 #q 仍可即時搜尋全部歌曲（含翻唱曲）
  await page.fill("#q", "unravel");
  await page.waitForFunction(() => !document.getElementById("heroSuggest").hidden);
  assert.equal(await page.locator('#heroSuggestList a[data-id="unravel"]').count(), 1);
  assert.equal(await page.locator('#heroSuggestList a[data-id="unravel"] .qs-cat.is-cover').count(), 1);
  assert.equal(await page.isVisible("#qClear"), true);

  // 鍵盤 ArrowDown + Enter 直接開啟該歌曲頁並關閉建議選單
  await page.focus("#q");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.getAttribute('#heroSuggestList .qs-item:first-child', "aria-selected"), "true");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.getElementById("song").hidden && location.hash === "#unravel");
  assert.equal(await page.isVisible("#heroSuggest"), false);

  // 回首頁，重新搜尋並直接按 Enter（未選項目）→ 捲到歌單、填入 #listQ 並自動切換「全部」
  await page.evaluate(() => { location.hash = ""; });
  await page.waitForFunction(() => !document.getElementById("home").hidden && document.getElementById("song").hidden);
  assert.equal(await page.getAttribute('[data-f="original"]', "aria-pressed"), "true");
  await page.fill("#q", "unravel");
  await page.waitForFunction(() => !document.getElementById("heroSuggest").hidden);
  await page.focus("#q");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    document.getElementById("heroSuggest").hidden &&
    document.getElementById("listQ").value === "unravel" &&
    document.querySelector('[data-f="all"]')?.getAttribute("aria-pressed") === "true"
  );
  assert.equal(await page.isVisible('#songList li:not([hidden]) a[data-id="unravel"]'), true);

  await page.click("#qClear");
  assert.equal(await page.inputValue("#q"), "");
  assert.equal(await page.isVisible("#qClear"), false);
  await page.click("#listQClear");

  // `/` 快捷鍵：在頂端聚焦 #q；在歌單區聚焦 #listQ
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); window.dispatchEvent(new Event("scroll")); });
  await page.waitForFunction(() => document.getElementById("barSearchBtn").hidden);
  await page.keyboard.press("/");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "q");
  await page.evaluate(() => document.activeElement?.blur());

  await page.evaluate(() => { document.getElementById("songs").scrollIntoView({ block: "start" }); });
  await page.waitForFunction(() => document.getElementById("heroSearch").getBoundingClientRect().bottom <= document.getElementById("bar").offsetHeight + 8);
  await page.keyboard.press("/");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "listQ");
  await page.evaluate(() => document.activeElement?.blur());

  // 滑到下方 #faq（兩個搜尋框都離開視野）→ 顯示 #barSearchBtn，點擊回到歌單並聚焦 #listQ
  await page.evaluate(() => { document.getElementById("faq").scrollIntoView({ block: "start" }); });
  await page.waitForFunction(() => !document.getElementById("barSearchBtn").hidden);
  await page.click("#barSearchBtn");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "listQ");
});

await test("點歌進歌曲頁，返回首頁", async page => {
  await page.goto(BASE);
  await page.click('#songList a[data-id="usseewa"]');
  await page.waitForFunction(() => location.hash === "#usseewa" && !document.getElementById("song").hidden);
  assert.match(await page.textContent("#sTitle"), /うっせぇわ/);
  await page.waitForFunction(() => document.querySelectorAll("#lines .ln").length > 10);
  assert.ok(await page.getAttribute("#nextSong", "href"));
  await page.click(".songbar a.ib");
  await page.waitForFunction(() => !document.getElementById("home").hidden);
});

await test("歌曲獨立頁：語言連結指向同一首", async page => {
  await openSong(page, "song/show/");
  assert.equal(await page.getAttribute('#langPop [data-lang-link="en"]', "href"), "en/song/show/");
  assert.equal(new URL(await page.$eval('#langPop [data-lang-link="ja"]', a => a.href)).pathname, "/jp/song/show/");
});

await test("歌曲獨立頁：上一首、下一首不重新載入，網址換成那首的頁面", async page => {
  await openSong(page, "en/song/show/");
  const title0 = await page.evaluate(() => { window.__sameDoc = true; return document.title; });
  const next = await page.getAttribute("#nextSong", "href");
  assert.match(next, /^song\/[^/]+\/$/);
  const id = next.split("/")[1];
  await page.click("#nextSong");
  await page.waitForFunction(([i, t]) => location.pathname === `/en/song/${i}/` && document.title !== t, [id, title0]);
  assert.equal(await page.evaluate(() => window.__sameDoc), true, "不應該整頁重新載入");
  await page.goBack();
  await page.waitForFunction(t => location.pathname === "/en/song/show/" && document.title === t, title0);
  assert.equal(await page.evaluate(() => window.__sameDoc), true);
});

// 現場版歌詞只在打開那首時從 lyrics-live/<id>.json 載入，首頁不載整包 song-lyrics-live.js
await test("現場版：Live 用現場版歌詞、MV 用 MV 版歌詞", async page => {
  const reqs = [];
  page.on("request", r => reqs.push(new URL(r.url()).pathname));
  await openSong(page, "song/show/");
  assert.ok(!reqs.some(p => p.endsWith("song-lyrics-live.js")), "不應該載入整包 song-lyrics-live.js");
  assert.ok(reqs.includes("/lyrics-live/show.json"), "打開有現場版的歌，要先載它的現場版歌詞");
  const live = JSON.parse(fs.readFileSync(path.join(dir, "lyrics-live/show.json"), "utf8"));
  const mv = JSON.parse(fs.readFileSync(path.join(dir, "lyrics/show.json"), "utf8"));
  // 點第 6 句，假播放器跳到的時間就是那份歌詞的時間：MV 版和現場版的同一句時間不同
  const i = 5, tMv = mv.lyrics[i].time, tLive = live.lyrics[i].time;
  assert.ok(Math.abs(tLive - tMv) > 2, "測試前提：〈唱〉第 6 句的現場版和 MV 版時間要差得夠遠");
  const seekTo = async () => { await page.locator("#lines .ln").nth(i).click(); return page.evaluate(() => { window.__yt.pauseVideo(); return window.__yt.getCurrentTime(); }); };
  // 預設有現場版就先播現場版
  assert.equal(await page.getAttribute('[data-video-source="live"]', "aria-pressed"), "true");
  const t0 = await seekTo();
  assert.ok(Math.abs(t0 - tLive) < 1, `Live 要用現場版歌詞的時間（第 6 句應在 ${tLive} 秒，實際跳到 ${t0.toFixed(2)} 秒）`);
  await page.click('[data-video-source="mv"]');
  assert.equal(await page.getAttribute('[data-video-source="mv"]', "aria-pressed"), "true");
  await page.waitForTimeout(300);
  const t1 = await seekTo();
  assert.ok(Math.abs(t1 - tMv) < 1, `切到 MV 要用 MV 版歌詞的時間（第 6 句應在 ${tMv} 秒，實際跳到 ${t1.toFixed(2)} 秒）`);
});

await test("分享目前時間：連到正在播的那首歌的頁面", async page => {
  await openSong(page, "song/show/#usseewa");
  await page.evaluate(() => {
    window.__copied = null;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async t => { window.__copied = t; } } });
    window.__yt.pauseVideo(); window.__yt.seekTo(42.5);
  });
  await page.click("#dockMore");
  await page.click("#shareBtn");
  await page.waitForFunction(() => window.__copied);
  assert.equal(await page.evaluate(() => window.__copied), BASE + "song/usseewa/#usseewa@42");
});

await test("練習工具列：速度、選單（電腦浮出）", async page => {
  await openSong(page, "#usseewa");
  // 電腦版工具列：浮在畫面下方正中間，離底部 24px
  const dk = await page.evaluate(() => { const r = document.getElementById("dock").getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(innerHeight - r.bottom), innerWidth]; });
  assert.ok(Math.abs(dk[0] - dk[2] / 2) <= 1 && dk[1] === 24, `工具列要置中、離底部 24px：${dk}`);
  // 歌詞區跟左欄一樣高
  const hs = await page.evaluate(() => [document.querySelector(".left").getBoundingClientRect().height, document.querySelector(".lyrics").getBoundingClientRect().height].map(Math.round));
  assert.ok(Math.abs(hs[0] - hs[1]) <= 1, `歌詞區要跟左欄同高：${hs}`);
  // 速度是下拉選單，選了就收起來
  await page.click("#rateBtn");
  await page.waitForFunction(() => document.getElementById("rateDlg").open);
  await page.click('#rateDlg [data-rate="0.75"]');
  await page.waitForFunction(() => !document.getElementById("rateDlg").open);
  assert.equal((await page.textContent("#rateBtnVal")).trim(), "0.75×");
  assert.equal(await page.evaluate(() => localStorage.getItem("mv-rate")), "0.75");
  await page.click("#dispBtn");
  await page.waitForFunction(() => document.getElementById("dispDlg").open);
  assert.equal(await page.evaluate(() => document.getElementById("dispDlg").classList.contains("as-sheet")), false, "電腦版是浮出的選單");
  await page.click('#dispDlg [data-opt="karaoke"]');
  assert.equal(await page.evaluate(() => document.getElementById("lines").classList.contains("karaoke")), true);
  assert.equal(await page.evaluate(() => document.getElementById("dispDlg").open), true, "切開關不會把選單關掉");
  await page.mouse.click(5, 300);
  await page.waitForFunction(() => !document.getElementById("dispDlg").open);
  await page.click("#dockMore");
  const r = await page.evaluate(() => { const b = document.querySelector("#moreDlg .sheet-panel").getBoundingClientRect(); return [b.left, b.right, b.top, b.bottom, innerWidth, innerHeight]; });
  assert.ok(r[0] >= 0 && r[1] <= r[4] && r[2] >= 0 && r[3] <= r[5], `「更多」選單要在畫面內：${r.join(",")}`);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.getElementById("moreDlg").open);
});

await test("練習工具列：手機在底部，選單從下面拉出", async page => {
  await openSong(page, "#usseewa");
  const dock = await page.evaluate(() => { const r = document.getElementById("dock").getBoundingClientRect(); return [Math.round(r.bottom), innerHeight, getComputedStyle(document.getElementById("dock")).position]; });
  assert.equal(dock[2], "fixed"); assert.ok(Math.abs(dock[0] - dock[1]) <= 1, `工具列要貼著畫面底部：${dock}`);
  await page.click("#rateCycle");
  assert.equal((await page.textContent("#rateNow")).trim(), "0.75×");
  await page.click("#dockMore");
  await page.waitForFunction(() => document.getElementById("moreDlg").open);
  assert.equal(await page.evaluate(() => document.getElementById("moreDlg").classList.contains("as-sheet")), true);
  assert.equal(await page.isVisible('#moreDlg [data-tool="click"]'), true, "手機的拍點聲在「更多」裡");
  await page.mouse.click(180, 40);
  await page.waitForFunction(() => !document.getElementById("moreDlg").open);
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

await test("隨機播放：下一首照洗過的順序，上一首回到剛剛那首，輪完才重複", async page => {
  await openSong(page, "#usseewa");
  const orderedNext = await page.getAttribute("#nextSong", "href");
  await page.click("#dockMore");
  await page.click("#tool-shuffle");
  assert.equal(await page.getAttribute("#tool-shuffle", "aria-pressed"), "true");
  assert.equal(await page.evaluate(() => document.getElementById("nextSong").classList.contains("is-shuffle")), true);
  assert.equal(await page.getAttribute("#prevSong", "href"), null, "剛開隨機播放，還沒有上一首");
  const total = await page.evaluate(() => window.ADO_SONGS.SONGS.length), seen = new Set(["usseewa"]);
  let first = null;
  for (let i = 1; i < total; i++) {
    const next = (await page.getAttribute("#nextSong", "href")).replace(/^#/, "");
    assert.ok(!seen.has(next), `第 ${i} 首重複了：${next}`);
    seen.add(next);
    if (i === 1) first = next;
    await page.evaluate(id => { location.hash = id; }, next);
    // 換頁有過場動畫：等到這首的上一首、下一首都算好了才往下
    await page.waitForFunction(id => location.hash === "#" + id && document.getElementById("nextSong").getAttribute("href") !== "#" + id && document.title.startsWith(window.ADO_SONGS.SONGS.find(x => x.id === id).ja), next);
    if (i === 1) {
      assert.equal(await page.getAttribute("#prevSong", "href"), "#usseewa", "上一首回到剛剛那首");
    }
  }
  assert.equal(seen.size, total, "每首都輪到一次");
  assert.notEqual(first, null);
  // 關掉隨機播放：恢復照排序
  await page.evaluate(() => { location.hash = "usseewa"; });
  await page.waitForFunction(() => location.hash === "#usseewa");
  await page.click("#dockMore");
  await page.click("#tool-shuffle");
  assert.equal(await page.getAttribute("#nextSong", "href"), orderedNext);
});

await test("首頁「隨機練一首」：點了會打開一首有應援的歌", async page => {
  await page.goto(BASE);
  await page.click("#randomLink");
  await page.waitForFunction(() => !document.getElementById("song").hidden);
  const id = await page.evaluate(() => location.hash.slice(1));
  const ok = await page.evaluate(i => { const s = window.ADO_SONGS.SONGS.find(x => x.id === i); return !!s && !s.hold && !s.sug && (s.free || (s.tips && s.tips.length > 0)); }, id);
  assert.ok(ok, `抽到的歌要有應援資料：${id}`);
});

await test("影片錯誤訊息：換歌後收掉", async page => {
  await openSong(page, "#usseewa");
  await page.evaluate(() => window.__yt.fireError());
  assert.equal(await page.isVisible("#vstatus"), true);
  await page.evaluate(() => { location.hash = "readymade"; });
  await page.waitForFunction(() => document.getElementById("vstatus").hidden);
});

await test("測驗模式：按鈕停用、藏提示、判定、結算", async page => {
  await openSong(page, "#totmusica");
  assert.equal(await page.isDisabled("#toolQuiz"), true, "沒有逐行應援的歌不能測驗");
  await page.evaluate(() => { location.hash = "show"; });
  await page.waitForFunction(() => document.title.startsWith("唱") && !document.getElementById("toolQuiz").disabled);
  await press(page, "q");
  await page.waitForFunction(() => document.body.classList.contains("quiz-on"));
  assert.equal(await page.isVisible("#legend"), false, "圖例要藏起來");
  assert.equal(await page.isVisible("#quizHud"), true);
  // 〈唱〉58.6 秒開始一段拍手；暫停在拍點上作答，誤差可以精準控制
  const [bpm, off] = await page.evaluate(() => window.ADO_SONGS.BEAT.show);
  const P = 60 / bpm, beat = Math.ceil((58.7 - off) / P), tk = off + beat * P;
  const answer = async (t, want) => {
    await page.evaluate(x => { window.__yt.pauseVideo(); window.__yt.seekTo(x); }, t);
    await page.waitForTimeout(80);
    await press(page, " ");
    assert.equal((await page.textContent("#qzJudge b")).trim(), want, `${t.toFixed(2)} 秒應該是 ${want}`);
  };
  await page.evaluate(x => { window.__yt.pauseVideo(); window.__yt.seekTo(x); }, tk - 1);
  await page.waitForTimeout(80);
  await answer(tk, "Perfect");
  await answer(tk + P + .12, "Good");
  // 兩拍正中間：離最近的題目超過 Good 的判定窗
  await answer(tk + 2 * P + P / 2, "多按了");
  // 跳到最後：中間沒按的記成略過，播完結算
  await page.evaluate(() => { window.__yt.seekTo(9999); window.__yt.playVideo(); });
  await page.waitForFunction(() => document.getElementById("quizDlg").open);
  assert.match(await page.textContent("#qrBest"), /跳過/);
  assert.equal(await page.textContent("#qrPerfect"), "1");
  assert.equal(await page.textContent("#qrGood"), "1");
  await page.click('#quizDlg button[value="answer"]');
  await page.waitForFunction(() => !document.body.classList.contains("quiz-on"));
});

await test("英文版：介面翻譯", async page => {
  await openSong(page, "en/#usseewa");
  assert.equal((await page.textContent("#toolQuiz")).trim(), "Quiz");
  assert.equal((await page.textContent("#dockMore")).trim(), "More");
  assert.equal(await page.getAttribute("html", "lang"), "en");
});

await test("手機版面：首頁和歌曲頁沒有橫向捲動", async page => {
  for (const url of ["", "#usseewa", "jp/#show"]) {
    await page.goto(BASE + url);
    await page.waitForTimeout(300);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw, `${url || "首頁"}：scrollWidth ${sw} > ${cw}`);
  }
  await page.goto(BASE);
  await page.evaluate(() => document.getElementById("faq").scrollIntoView({ block: "start" }));
  await page.waitForFunction(() => !document.getElementById("barSearchBtn").hidden);
  const [sw2, cw2] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  assert.ok(sw2 <= cw2, `手機顯示頂欄搜尋鈕時 scrollWidth ${sw2} > ${cw2}`);
}, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

await test("離線：沒打開過的歌曲頁改開首頁的 #歌曲，歌詞照樣出來", async (page, ctx) => {
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.goto(BASE + "en/song/readymade/");
  await page.waitForFunction(() => location.hash === "#readymade" && document.querySelectorAll("#lines .ln").length > 10);
  assert.match(await page.textContent("#vmsg"), /offline/i);
}, { serviceWorkers: "allow" });

await test("SPA 換歌：首頁 → #usseewa → #show 更新 #songGuideInline", async page => {
  await page.goto(BASE);
  await page.fill("#listQ", "usseewa");
  await page.click('#songList a[data-id="usseewa"]');
  await page.waitForFunction(() => location.hash === "#usseewa" && document.getElementById("songGuideInline")?.dataset.song === "usseewa");
  assert.match(await page.textContent("#songGuideInline .guide-inline-h"), /うっせぇわ/);
  await page.evaluate(() => { location.hash = "show"; });
  await page.waitForFunction(() => location.hash === "#show" && document.getElementById("songGuideInline")?.dataset.song === "show");
  assert.match(await page.textContent("#songGuideInline .guide-inline-h"), /唱/);
});

await test("測驗模式「再挑戰」在延遲 seek 時不會自動判成 0 分 D", async page => {
  await openSong(page, "#show");
  await press(page, "q");
  await page.waitForFunction(() => document.body.classList.contains("quiz-on"));
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(() => { window.__yt.seekTo(9999); window.__yt.playVideo(); });
  await page.waitForFunction(() => document.getElementById("quizDlg").open);
  // 模擬非同步 seekTo(0) 延遲，驗證 QZ.armed 保護不會馬上結束測驗
  await page.evaluate(() => {
    const origSeek = window.__yt.seekTo.bind(window.__yt);
    window.__yt.seekTo = x => setTimeout(() => origSeek(x), 45);
  });
  await page.click('#quizDlg button[value="retry"]');
  await page.waitForFunction(() => !document.getElementById("quizDlg").open && document.body.classList.contains("quiz-on"));
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => document.getElementById("quizDlg").open), false, "再挑戰不應該立刻跳回 0 分結算框");
  assert.equal(await page.evaluate(() => document.body.classList.contains("quiz-on")), true);
  assert.equal((await page.textContent("#qzScore")).trim(), "0");
  assert.match((await page.textContent("#qzProg")).trim(), /^0／\d+/);
  assert.ok(await page.evaluate(() => window.__yt.getCurrentTime()) < 2, "播放器應該回到開頭附近");
});

await test("淺色主題 + 沉浸模式：手機底部 .dock 維持深色半透明底", async page => {
  await page.goto(BASE);
  await page.click("#themeBtn");
  await page.click('#themePop [data-theme-pick="light"]');
  await page.waitForFunction(() =>
    document.documentElement.dataset.theme === "light" &&
    !document.documentElement.classList.contains("vt-theme")
  );
  await page.evaluate(() => { location.hash = "usseewa"; });
  await page.waitForFunction(() => window.__yt && window.__ytReady && document.querySelectorAll("#lines .ln").length > 0);
  await page.click("#dockMore");
  await page.waitForFunction(() => document.getElementById("moreDlg").open);
  await page.click("#toolImmersiveMenuBtn");
  await page.waitForFunction(() => document.body.classList.contains("immersive-mode"));
  const bg = await page.evaluate(() => getComputedStyle(document.getElementById("dock")).backgroundColor);
  const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  assert.ok(m, `應回傳有效的 rgba/rgb 顏色：${bg}`);
  const [, r, g, b, a] = m.map(Number);
  assert.ok(r < 30 && g < 30 && b < 40, `淺色主題沉浸模式手機 dock 應為深色底，實際：${bg}`);
  assert.ok(a === undefined || (a > 0 && a < 1), `手機沉浸模式 dock 應為半透明，實際：${bg}`);
}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

await test("工作表關閉按鈕：#moreDlg 裡的 .sheet-close 可關閉 #moreDlg", async page => {
  await openSong(page, "#usseewa");
  await page.click("#dockMore");
  await page.waitForFunction(() => document.getElementById("moreDlg").open);
  assert.equal(await page.isVisible("#moreDlg .sheet-close"), true);
  await page.click("#moreDlg .sheet-close");
  await page.waitForFunction(() => !document.getElementById("moreDlg").open);
});

await test("膠捲跑馬燈 stepReel 在切到歌曲頁後停止更新", async page => {
  await page.goto(BASE);
  await page.locator("#songIndex .reel-track").first().waitFor({ state: "attached" });
  await page.locator("#songIndex").scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  await page.evaluate(() => { location.hash = "usseewa"; });
  await page.waitForFunction(() => !document.getElementById("song").hidden && document.getElementById("home").hidden);
  await page.waitForTimeout(100);
  const t1 = await page.evaluate(() => getComputedStyle(document.querySelector("#songIndex .reel-track")).transform);
  await page.waitForTimeout(280);
  const t2 = await page.evaluate(() => getComputedStyle(document.querySelector("#songIndex .reel-track")).transform);
  assert.equal(t1, t2, "切到歌曲頁後 #songIndex .reel-track transform 應該維持靜止");
});

await test("Live / MV 切換：#usseewa 切換 #videoSourcePill 正確更新歌詞與時間軸", async page => {
  await openSong(page, "#usseewa");
  assert.equal(await page.isVisible("#videoSourcePill"), true);
  assert.equal(await page.getAttribute('[data-video-source="live"]', "aria-pressed"), "true");
  assert.match(await page.getAttribute("#ytLink2", "href"), /8dnjqzodjgo/);
  const seekLine48 = async () => {
    await page.locator("#lines .ln").nth(48).click();
    return page.evaluate(() => { window.__yt.pauseVideo(); return window.__yt.getCurrentTime(); });
  };
  const tLive = await seekLine48();
  assert.ok(Math.abs(tLive - 167.96) < 0.8, `Live 第 49 句應在 167.96s 附近，實際 ${tLive.toFixed(2)}s`);

  await page.click('[data-video-source="mv"]');
  await page.waitForFunction(() =>
    document.querySelector('[data-video-source="mv"]')?.getAttribute("aria-pressed") === "true" &&
    /Qp3b-RXtz4w/.test(document.getElementById("ytLink2")?.getAttribute("href") || "")
  );
  await page.waitForTimeout(250);
  const tMv = await seekLine48();
  assert.ok(Math.abs(tMv - 166.72) < 0.8, `MV 第 49 句應在 166.72s 附近，實際 ${tMv.toFixed(2)}s`);

  await page.click('[data-video-source="live"]');
  await page.waitForFunction(() =>
    document.querySelector('[data-video-source="live"]')?.getAttribute("aria-pressed") === "true" &&
    /8dnjqzodjgo/.test(document.getElementById("ytLink2")?.getAttribute("href") || "")
  );
  await page.waitForTimeout(250);
  const tLiveBack = await seekLine48();
  assert.ok(Math.abs(tLiveBack - 167.96) < 0.8, `切回 Live 第 49 句應在 167.96s 附近，實際 ${tLiveBack.toFixed(2)}s`);
});

await test("Live 合輯片段（LIVE_VIDEOS start/end）：tsumitobatsu 預設 Live 帶入區間與 &t=、單曲控制列、區間鎖定、切同影片 villain 正確重載", async page => {
  await openSong(page, "#tsumitobatsu");
  assert.equal(await page.isVisible("#videoSourcePill"), true);
  assert.equal(await page.getAttribute('[data-video-source="live"]', "aria-pressed"), "true");
  assert.equal(await page.isVisible("#clipBar"), true, "合輯片段應顯示單曲控制列 #clipBar");
  const init1 = await page.evaluate(() => window.__ytInit);
  assert.equal(init1.videoId, "mYJshNOfv_w");
  assert.equal(init1.playerVars.start, 849);
  assert.equal(init1.playerVars.end, 1140);
  assert.equal(await page.getAttribute("#cardYt", "href"), "https://www.youtube.com/watch?v=mYJshNOfv_w&t=849s");

  // 單曲控制列應顯示相對長度 4:51，拖動進度條會跳至 849 + 相對秒數
  await page.waitForFunction(() => /\/\s*4:51$/.test(document.getElementById("clipTime")?.textContent || ""));
  await page.evaluate(() => {
    const r = document.getElementById("clipRange");
    r.value = "60";
    r.dispatchEvent(new Event("input", { bubbles: true }));
    r.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const rangeT = await page.evaluate(() => { window.__yt.pauseVideo(); return window.__yt.getCurrentTime(); });
  assert.ok(Math.abs(rangeT - 909) < 1.5, `單曲進度條拉到 60s 應落在 909s 附近，實際 ${rangeT}`);

  // 點重播鈕應回到片段起點 849s
  await page.click("#clipReplay");
  const replayT = await page.evaluate(() => { window.__yt.pauseVideo(); return window.__yt.getCurrentTime(); });
  assert.ok(Math.abs(replayT - 849) < 1.5, `點重播鈕應回到 849s，實際 ${replayT}`);

  // 區間鎖定（Clip Guard）：模擬播畢後 YouTube 原生重播跳到 0:00，應立刻拉回 849s
  await page.evaluate(() => {
    window.__yt.fireState(0);
    window.__yt.seekTo(0);
    window.__yt.fireState(1);
  });
  const guardedReplayT = await page.evaluate(() => { window.__yt.pauseVideo(); return window.__yt.getCurrentTime(); });
  assert.ok(Math.abs(guardedReplayT - 849) < 1.5, `播畢後原生重播跳到 0s 應被拉回 849s，實際 ${guardedReplayT}`);

  // 區間鎖定（Clip Guard）：播放中模擬誤拖原生進度條到區間外（100s），逾寬限期後應拉回 849s
  await page.evaluate(() => {
    window.__yt.seekTo(100);
    window.__yt.playVideo();
  });
  await page.waitForFunction(() => window.__yt.getCurrentTime() >= 848 && window.__yt.getCurrentTime() < 860, { timeout: 3000 });
  await page.evaluate(() => window.__yt.pauseVideo());

  // 點一句歌詞：seek 必須自動加上片段起點 849s
  await page.locator("#lines .ln").nth(2).click();
  const seekedT = await page.evaluate(() => { window.__yt.pauseVideo(); return window.__yt.getCurrentTime(); });
  assert.ok(seekedT >= 849 && seekedT < 1140, `點歌詞跳轉後應落在 849..1140，實際 ${seekedT}`);

  // 切 MV 再切回 Live：MV 應隱藏 #clipBar，切回 Live 應重新顯示並帶入 startSeconds / endSeconds
  await page.click('[data-video-source="mv"]');
  await page.waitForFunction(() => window.__ytLastLoad && window.__ytLastLoad.videoId !== "mYJshNOfv_w");
  assert.equal(await page.evaluate(() => window.__ytLastLoad.endSeconds), undefined);
  await page.waitForFunction(() => document.getElementById("clipBar")?.hidden === true);
  await page.click('[data-video-source="live"]');
  await page.waitForFunction(() => window.__ytLastLoad?.videoId === "mYJshNOfv_w");
  await page.waitForFunction(() => document.getElementById("clipBar")?.hidden === false);
  const loadBack = await page.evaluate(() => window.__ytLastLoad);
  assert.ok(loadBack.startSeconds >= 849 && loadBack.startSeconds < 1140);
  assert.equal(loadBack.endSeconds, 1140);

  // 切到同支合輯的另一首（villain，1375–1577）：vidKey 不同，必須重新呼叫 loadVideoById
  await page.evaluate(() => { location.hash = "villain?src=live"; });
  await page.waitForFunction(() => location.hash === "#villain?src=live" && window.__ytLastLoad?.startSeconds === 1375);
  const load2 = await page.evaluate(() => window.__ytLastLoad);
  assert.equal(load2.videoId, "mYJshNOfv_w");
  assert.equal(load2.startSeconds, 1375);
  assert.equal(load2.endSeconds, 1577);
  assert.equal(await page.getAttribute("#cardYt", "href"), "https://www.youtube.com/watch?v=mYJshNOfv_w&t=1375s");
});

await test("自訂待練清單與常唱熟練度：書籤按鈕、篩選、#list= 分享、quiz-best 等級與進度條", async page => {
  await page.addInitScript(() => {
    localStorage.setItem("quiz-best", JSON.stringify({ usseewa: { score: 96, rate: 1 } }));
  });
  await page.goto(BASE);
  await page.waitForFunction(() => !document.getElementById("masteryBar").hidden);
  assert.equal(await page.isVisible("#masteryBar"), true);
  assert.ok((await page.textContent("#masteryLabel")).trim().length > 0);
  const fillWidth = await page.evaluate(() => document.getElementById("masteryFill").style.width);
  assert.ok(parseFloat(fillWidth) > 0, `#masteryFill 寬度應大於 0，實際：${fillWidth}`);
  await page.fill("#listQ", "usseewa");
  assert.equal((await page.textContent('#songList li:not([hidden]):has(a[data-id="usseewa"]) .quiz-grade')).trim(), "S");

  await page.click('.setlist-btn[data-setlist-id="usseewa"]');
  assert.equal(await page.getAttribute('.setlist-btn[data-setlist-id="usseewa"]', "aria-pressed"), "true");
  assert.equal((await page.textContent("#cntSetlist")).trim(), "1");
  assert.equal(await page.evaluate(() => !document.getElementById("home").hidden), true);

  await page.fill("#listQ", "");
  await page.click('[data-f="setlist"]');
  await page.waitForFunction(() => !document.getElementById("setlistBar").hidden);
  assert.equal(await page.locator("#songList li:not([hidden])").count(), 1);
  assert.equal(await page.isVisible('#songList li:not([hidden]) a[data-id="usseewa"]'), true);

  await page.evaluate(() => { location.hash = "list=usseewa,show"; });
  await page.waitForFunction(() =>
    !document.getElementById("setlistBar").hidden &&
    !document.getElementById("setlistSaveBtn").hidden &&
    document.querySelectorAll("#songList li:not([hidden])").length === 2
  );
  assert.equal(await page.isVisible("#setlistSaveBtn"), true);
  assert.equal(await page.isVisible("#setlistPlayBtn"), true);
  assert.equal(await page.isVisible("#setlistShareBtn"), true);
  assert.equal(await page.isVisible("#setlistClearBtn"), true);
  assert.equal(await page.isVisible("#setlistExitBtn"), true);
  assert.equal(await page.locator("#songList li:not([hidden])").count(), 2);

  await page.click("#setlistSaveBtn");
  await page.waitForFunction(() => document.getElementById("setlistSaveBtn").hidden);
  assert.equal((await page.textContent("#cntSetlist")).trim(), "2");

  // 歌曲頁「更多」裡的 #toolSetlistBtn 同步狀態
  await openSong(page, "#readymade");
  await page.click("#dockMore");
  await page.waitForFunction(() => document.getElementById("moreDlg").open);
  assert.equal(await page.getAttribute("#toolSetlistBtn", "aria-pressed"), "false");
  await page.click("#toolSetlistBtn");
  assert.equal(await page.getAttribute("#toolSetlistBtn", "aria-pressed"), "true");
});

checkSync("建置產物檢查：多語 manifest、字型剝離、karaoke JSON、hashes.json、未複製 song-lyrics.js", () => {
  const enManifest = JSON.parse(fs.readFileSync(path.join(dir, "en/manifest.webmanifest"), "utf8"));
  const jpManifest = JSON.parse(fs.readFileSync(path.join(dir, "jp/manifest.webmanifest"), "utf8"));
  assert.equal(enManifest.lang, "en");
  assert.equal(jpManifest.lang, "ja");

  const enHtml = fs.readFileSync(path.join(dir, "en/index.html"), "utf8");
  const jpHtml = fs.readFileSync(path.join(dir, "jp/index.html"), "utf8");
  assert.equal(enHtml.includes("LINESeedTW"), false, "en/index.html 不應包含 LINESeedTW");
  assert.equal(jpHtml.includes("LINESeedTW"), false, "jp/index.html 不應包含 LINESeedTW");

  const karaokeUss = JSON.parse(fs.readFileSync(path.join(dir, "karaoke/usseewa.json"), "utf8"));
  assert.equal(karaokeUss.format, "timed-lyrics-v1");
  assert.ok(Array.isArray(karaokeUss.lines) && karaokeUss.lines.length > 0);

  const hashes = JSON.parse(fs.readFileSync(path.join(dir, "lyrics/hashes.json"), "utf8"));
  assert.ok(hashes && typeof hashes.mv === "object" && typeof hashes.live === "object" && typeof hashes.karaoke === "object");

  assert.equal(fs.existsSync(path.join(dir, "song-lyrics.js")), false, "song-lyrics.js 不應複製進 dist/");
  assert.equal(fs.existsSync(path.join(dir, "song-lyrics-live.js")), false, "song-lyrics-live.js 不應複製進 dist/");

  const htmlFiles = [];
  const walkHtml = d => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walkHtml(p);
      else if (ent.isFile() && ent.name.endsWith(".html")) htmlFiles.push(p);
    }
  };
  walkHtml(dir);
  assert.ok(htmlFiles.length > 0, "dist/ 應該包含建置好的 HTML 檔");
  for (const f of htmlFiles) {
    const html = fs.readFileSync(f, "utf8");
    assert.equal(/ytimg\.com\/vi\/\//.test(html), false, `${path.relative(dir, f)} 不應含 ytimg.com/vi//`);
    assert.equal(/watch\?v=(?:["'&<\s]|$)/.test(html), false, `${path.relative(dir, f)} 不應含空的 watch?v= 連結`);
  }

  // SEO 檢查：hold / upcoming 頁標 noindex 並移出 sitemap；歌曲頁不輸出不可見 FAQPage、不夾帶首頁文案、含 MV 專屬 og:image、英文 CJK 歌名退回羅馬拼音
  const sitemap = fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8");
  assert.equal(sitemap.includes("https://ado.kuti.cc/song/show/"), true, "sitemap 應包含已確認應援的歌曲頁");
  assert.equal(sitemap.includes("https://ado.kuti.cc/song/renaesaiban/"), false, "sitemap 不應包含無應援資料的 hold 頁");
  assert.equal(sitemap.includes("https://ado.kuti.cc/song/unknownmothergoose/"), false, "sitemap 不應包含尚未發行的預留曲");

  const showSongHtml = fs.readFileSync(path.join(dir, "song/show/index.html"), "utf8");
  assert.equal(showSongHtml.includes('<meta name="robots" content="index, follow'), true, "已確認歌曲頁應為 index, follow");
  assert.equal(showSongHtml.includes('"@type":"FAQPage"'), false, "歌曲頁不應輸出畫面上不可見的 FAQPage JSON-LD");
  assert.equal(showSongHtml.includes('id="homeGuide"'), false, "歌曲頁不應夾帶隱藏的首頁練習原則區塊");
  assert.equal(showSongHtml.includes('id="faq"'), false, "歌曲頁不應夾帶隱藏的首頁 FAQ 區塊");
  assert.equal(showSongHtml.includes('property="og:image" content="https://i.ytimg.com/vi/pgXpM4l_MwI/hqdefault.jpg"'), true, "有 MV 的歌曲頁應使用該曲縮圖作為 og:image");

  const homeZhHtml = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.equal(homeZhHtml.includes('"@type":"FAQPage"'), true, "首頁有可見 FAQ，應保留 FAQPage JSON-LD");

  for (const rel of ["song/renaesaiban/index.html", "en/song/renaesaiban/index.html", "jp/song/renaesaiban/index.html", "song/unknownmothergoose/index.html"]) {
    const h = fs.readFileSync(path.join(dir, rel), "utf8");
    assert.equal(h.includes('<meta name="robots" content="noindex, follow">'), true, `${rel} 應標記 noindex, follow`);
  }
  const enRenaiHtml = fs.readFileSync(path.join(dir, "en/song/renaesaiban/index.html"), "utf8");
  assert.match(enRenaiHtml, /<title>[^<]*Renai Saiban[^<]*<\/title>/, "英文版無官方英文名的日文歌標題應帶入羅馬拼音");

  // 巡演專頁（tour/utattemita-2027/）三語輸出、sitemap 與結構化資料檢查
  for (const [rel, langUrl] of [
    ["tour/utattemita-2027/index.html", "https://ado.kuti.cc/tour/utattemita-2027/"],
    ["en/tour/utattemita-2027/index.html", "https://ado.kuti.cc/en/tour/utattemita-2027/"],
    ["jp/tour/utattemita-2027/index.html", "https://ado.kuti.cc/jp/tour/utattemita-2027/"]
  ]) {
    assert.equal(sitemap.includes(langUrl), true, `sitemap 應包含巡演專頁 ${langUrl}`);
    const th = fs.readFileSync(path.join(dir, rel), "utf8");
    assert.equal(th.includes('<meta name="robots" content="index, follow'), true, `${rel} 應為 index, follow`);
    assert.equal(th.includes('"@type":"MusicEvent"'), true, `${rel} 應含 MusicEvent 結構化資料`);
    assert.equal(th.includes('"@type":"FAQPage"'), true, `${rel} 應含 FAQPage 結構化資料`);
    assert.equal(th.includes('"@type":"ItemList"'), true, `${rel} 應含 ItemList 結構化資料`);
    assert.equal(th.includes('id="warmup"') && th.includes('id="shows"'), true, `${rel} 應含「預熱」與「各場歌單」兩段`);
    assert.equal(/<details class="tour-day[^"]*"[^>]*\sopen/.test(th), false, `${rel} 各場歌單預設必須收合（不暴雷）`);
  }
  assert.equal(showSongHtml.includes('id="tourBanner"'), false, "歌曲頁不應夾帶隱藏的首頁巡演橫幅");
});

// 搜尋結果上看得到的字：<title>、description 解開 HTML 實體後的長度
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const metaOf = html => ({
  title: unesc((html.match(/<title>([^<]*)<\/title>/) || [])[1] || ""),
  desc: unesc((html.match(/<meta name="description" content="([^"]*)">/) || [])[1] || "")
});

checkSync("攻略＆手燈小抄（guide/）：三語輸出、sitemap、hreflang、<base>、FAQPage、區塊順序、色票牆涵蓋可索引歌曲、無重複歌單工具、標題長度、各頁導流連結", () => {
  const sitemap = fs.readFileSync(path.join(dir, "sitemap.xml"), "utf8");
  // 可索引的歌＝sitemap 裡的中文歌曲頁；首頁曲數＝全部歌曲頁（含 noindex）
  const indexableIds = [...sitemap.matchAll(/<loc>https:\/\/ado\.kuti\.cc\/song\/([^/]+)\/<\/loc>/g)].map(m => m[1]);
  const songCount = fs.readdirSync(path.join(dir, "song"), { withFileTypes: true }).filter(d => d.isDirectory()).length;
  assert.ok(indexableIds.length >= 20, "sitemap 應有可索引的歌曲頁");
  const pages = [
    { rel: "guide/index.html", code: "zh", url: "https://ado.kuti.cc/guide/", titleMax: 34, langHref: { zh: "guide/", en: "en/guide/", ja: "jp/guide/" } },
    { rel: "en/guide/index.html", code: "en", url: "https://ado.kuti.cc/en/guide/", titleMax: 60, langHref: { zh: "../guide/", en: "guide/", ja: "../jp/guide/" } },
    { rel: "jp/guide/index.html", code: "ja", url: "https://ado.kuti.cc/jp/guide/", titleMax: 34, langHref: { zh: "../guide/", en: "../en/guide/", ja: "guide/" } }
  ];
  for (const p of pages) {
    const file = path.join(dir, p.rel);
    assert.equal(fs.existsSync(file), true, `${p.rel} 應該存在`);
    const h = fs.readFileSync(file, "utf8");
    assert.equal(sitemap.includes(`<loc>${p.url}</loc>`), true, `sitemap 應包含 ${p.url}`);
    assert.equal(h.includes('<meta name="robots" content="index, follow'), true, `${p.rel} 應為 index, follow`);
    assert.equal(h.includes(`<link rel="canonical" href="${p.url}">`), true, `${p.rel} canonical 應指向自己`);
    for (const [hl, u] of [["zh-Hant", "https://ado.kuti.cc/guide/"], ["en", "https://ado.kuti.cc/en/guide/"], ["ja", "https://ado.kuti.cc/jp/guide/"], ["x-default", "https://ado.kuti.cc/guide/"]]) {
      assert.equal(h.includes(`<link rel="alternate" hreflang="${hl}" href="${u}">`), true, `${p.rel} 應有 hreflang=${hl}`);
    }
    // guide/ 只有一層：中文、英文、日文的 <base> 都是回到該語言根目錄的 ../
    assert.equal(h.includes('<base href="../">'), true, `${p.rel} 的 <base> 應為 ../`);
    assert.equal(/href="(?:\.\.\/)?style\.css\?v=/.test(h), true, `${p.rel} 應載入 style.css`);
    if (p.code !== "zh") assert.equal(h.includes('href="../style.css?v='), true, `${p.rel} 的 style.css 應往上一層找`);
    for (const [code, href] of Object.entries(p.langHref)) {
      assert.match(h, new RegExp(`data-lang-link="${code}"[^>]*href="${href.replace(/[./]/g, "\\$&")}"`), `${p.rel} 語言切換 ${code} 應連到 ${href}`);
    }
    assert.equal(h.includes('<body class="on-guide">'), true, `${p.rel} body 應為 on-guide`);
    assert.equal(/<script[^>]+src="[^"]*(?:app|songs)\.js/.test(h), false, `${p.rel} 不應載入主站 app.js／songs.js`);
    for (const t of ['"@type":"WebPage"', '"@type":"BreadcrumbList"', '"@type":"FAQPage"']) assert.equal(h.includes(t), true, `${p.rel} 應含 ${t}`);
    // FAQPage 只放畫面上看得到的題目：題數與 details.faq-item 一致
    const ld = JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const faq = ld["@graph"].find(x => x["@type"] === "FAQPage");
    const visibleQs = [...h.matchAll(/<details class="faq-item"><summary>([^<]*)<\/summary>/g)].map(m => unesc(m[1]));
    assert.ok(visibleQs.length >= 5, `${p.rel} 應有至少 5 題常見問題`);
    assert.deepEqual(faq.mainEntity.map(q => q.name), visibleQs, `${p.rel} FAQPage 題目應與畫面上一致`);
    const { title, desc } = metaOf(h);
    assert.ok(title.length <= p.titleMax, `${p.rel} <title> ${title.length} 字超過 ${p.titleMax}：${title}`);
    assert.ok(desc.length <= 155, `${p.rel} description ${desc.length} 字超過 155`);
    // 區塊順序：新手規則 → 色票牆 → 常見問題；本頁導覽也是同樣順序
    const [iRules, iColors, iFaq] = ["rules", "colors", "faq"].map(id => h.indexOf(`id="${id}" aria-labelledby="${id}H"`));
    assert.ok(iRules > 0 && iRules < iColors && iColors < iFaq, `${p.rel} 區塊順序應為 #rules → #colors → #faq`);
    const rail = h.match(/<nav class="tour-rail" id="tourRail"[\s\S]*?<\/nav>/)[0];
    const railTop = [...rail.matchAll(/<li class="tour-rail-item"><a href="guide\/#([\w-]+)"/g)].map(m => m[1]);
    assert.deepEqual(railTop, ["rules", "colors", "faq"], `${p.rel} 本頁導覽順序應為 rules → colors → faq`);
    // 規則：不再另外放禁令提醒卡（內容與規則卡重複）；最常踩雷的兩條（warn）排最前面並帶標記
    assert.equal(h.includes("guide-alert"), false, `${p.rel} 不應再有重複規則內容的禁令提醒卡`);
    const rules = [...h.matchAll(/<article class="guide-rule( is-warn)?" id="(rule-[\w-]+)"/g)].map(m => [m[2], !!m[1]]);
    assert.equal(rules.length, 5, `${p.rel} 應有 5 條規則卡`);
    assert.deepEqual(rules.map(r => r[1]), [true, true, false, false, false], `${p.rel} 最常踩雷的兩條應排在最前面：${rules}`);
    assert.deepEqual(rules.slice(0, 2).map(r => r[0]), ["rule-photo", "rule-binoculars"], `${p.rel} 踩雷規則應為攝影、望遠鏡`);
    // 兩條禁令收在同一塊淡紅底裡，「禁止」標籤只出現一次（不在每條重複）
    const warnGroup = h.match(/<div class="guide-group is-warn">[\s\S]*?<\/article><\/div>/);
    assert.ok(warnGroup, `${p.rel} 禁令應收在同一塊 .guide-group.is-warn`);
    assert.equal((h.match(/class="guide-rule-tag"/g) || []).length, 1, `${p.rel} 「禁止」標籤只應出現一次`);
    assert.equal((warnGroup[0].match(/<article class="guide-rule is-warn"/g) || []).length, 2, `${p.rel} 禁令那塊應有兩條規則`);
    // 不再有編號、說明框、跳轉列這些重複的裝飾
    for (const bad of ["guide-rule-no", "guide-callout", "guide-jump", "guide-swatch-card", "guide-map-item"]) assert.equal(h.includes(bad), false, `${p.rel} 不應再有 ${bad}`);
    // 三個段落標題都帶計數；主標下的一行目錄（規定、手燈顏色、常見問題）計數與段落標題一致
    const map = h.match(/<nav class="guide-map"[\s\S]*?<\/nav>/);
    assert.ok(map, `${p.rel} 主標下應有一行目錄`);
    assert.deepEqual([...map[0].matchAll(/href="guide\/#([\w-]+)"/g)].map(m => m[1]), ["rules", "colors", "faq"], `${p.rel} 主標目錄應依序連到三段`);
    for (const id of ["rules", "colors", "faq"]) {
      const headCount = h.match(new RegExp(`<h2 id="${id}H">[^<]*<span class="count">([^<]*)</span>`));
      assert.ok(headCount, `${p.rel} #${id} 標題應帶計數`);
      assert.equal(map[0].match(new RegExp(`<a href="guide/#${id}">[\\s\\S]*?</a>`))[0].includes(headCount[1]), true, `${p.rel} 主標目錄 #${id} 的計數應與段落標題一致`);
    }
    // 嚴重的禁止字眼紅字標示：兩張禁止規則卡都有，文案的 ** 記號不能漏到頁面、結構化資料或導覽
    assert.equal(h.includes("**"), false, `${p.rel} 不應有沒轉換的 ** 記號`);
    for (const id of ["rule-photo", "rule-binoculars"]) {
      assert.match(h.match(new RegExp(`<article class="guide-rule is-warn" id="${id}"[\\s\\S]*?</article>`))[0], /<strong class="guide-hot">/, `${p.rel} ${id} 應有紅字標示`);
    }
    // 望遠鏡：所有場次都不能帶，不寫成只限日本場
    const bino = h.match(/<article class="guide-rule is-warn" id="rule-binoculars"[\s\S]*?<\/article>/)[0];
    assert.equal(/日本場|海外|in Japan|Overseas|国内公演|海外公演/.test(bino), false, `${p.rel} 望遠鏡規定不應限定日本場`);
    // 找歌、篩選交給首頁：這頁不應再有搜尋框、篩選膠囊、檢視切換、大型歌單表
    for (const bad of ['id="guideQ"', 'type="search"', "data-fc=", "data-fa=", "data-fk=", "data-view=", 'class="guide-item"', 'id="guideList"', 'id="guidePlay"']) {
      assert.equal(h.includes(bad), false, `${p.rel} 不應再有重複的歌單工具：${bad}`);
    }
    // 色票牆：涵蓋所有可索引的歌（與 sitemap 的歌曲頁一致），每首只出現一次，不寫死
    const ids = [...h.matchAll(/<a class="guide-pill-song(?: is-must)?" href="song\/([^/]+)\/"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${p.rel} 色票牆不應重複`);
    assert.deepEqual([...ids].sort(), [...indexableIds].sort(), `${p.rel} 色票牆應涵蓋全部可索引的歌`);
    assert.equal(ids.includes("renaesaiban") || ids.includes("unknownmothergoose"), false, `${p.rel} 色票牆不應包含整理中或未發行的歌`);
    // 色票表：一張卡片底、每個主色一列，照 PEN_ORDER 排，每列有可直接連結的 id
    const rowTags = [...h.matchAll(/<section class="guide-color" id="([\w-]+)" data-g="([^"]+)"/g)].map(m => ({ id: m[1], k: m[2] }));
    const rowKeys = rowTags.map(c => c.k);
    assert.ok(rowKeys.length >= 5, `${p.rel} 色票表應有多列`);
    assert.equal((h.match(/<div class="guide-wall">/g) || []).length, 1, `${p.rel} 色票表應是同一塊卡片底`);
    assert.deepEqual(rowKeys.filter(k => k !== "none"), ["青", "水", "白", "赤", "桃", "紫", "橙", "黄", "緑", "彩"].filter(k => rowKeys.includes(k)), `${p.rel} 色列應照 PEN_ORDER 排`);
    assert.equal(new Set(rowTags.map(c => c.id)).size, rowTags.length, `${p.rel} 色列 id 不應重複`);
    // 必練曲在膠囊上有星號（螢幕閱讀器念出「必練」），數量等於必練曲中有在牆上的
    assert.ok((h.match(/class="guide-pill-song is-must"/g) || []).length >= 5, `${p.rel} 必練曲應有標記`);
    // 主標：目錄在 h1 下面、說明之後是兩顆按鈕（去首頁挑歌是主要按鈕、巡演預習是淺底按鈕）；頁尾不再重複放
    const hero = h.match(/<section class="tour-hero guide-hero"[\s\S]*?<\/section>/)[0];
    assert.ok(hero.indexOf('class="guide-map"') < hero.indexOf('class="tour-lead"') && hero.indexOf('class="tour-lead"') < hero.indexOf('class="tour-cta guide-cta"'), `${p.rel} 主標順序應為 h1 → 目錄 → 說明 → 按鈕`);
    assert.match(hero, new RegExp(`<a class="btn primary tour-cta-main guide-home-link" href="\\./">[^<]*${songCount}`), `${p.rel} 主標應有「到首頁挑歌（${songCount} 首）」按鈕`);
    assert.match(hero, /<a class="btn ghost tour-cta-main guide-tour-link" href="tour\/utattemita-2027\/">/, `${p.rel} 主標應有巡演預習按鈕`);
    assert.equal(/guide-foot-cta|tour-foot-cta/.test(h), false, `${p.rel} 頁尾不應再重複放導流連結`);
  }

  const llms = fs.readFileSync(path.join(dir, "llms.txt"), "utf8");
  assert.equal(llms.includes("演唱會新手須知與全曲手燈顏色：https://ado.kuti.cc/guide/"), true, "llms.txt 應列出攻略頁");
  const homeHtml = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  assert.match(homeHtml, /<nav class="bar-nav"[\s\S]*?data-nav="home" aria-current="page"[\s\S]*?href="guide\/"[\s\S]*?href="tour\/utattemita-2027\/"/, "頂欄導覽應含首頁、新手須知與 2027 巡迴連結");
  assert.match(homeHtml, /<section class="home-guide" id="homeGuide"[\s\S]*?href="guide\/"[\s\S]*?<\/section>/, "首頁練習原則區塊應有攻略頁入口");
  assert.equal(fs.readFileSync(path.join(dir, "tour/utattemita-2027/index.html"), "utf8").includes('class="tint-link guide-entry-link" href="guide/"'), true, "巡演頁現場小提醒應連到攻略頁");
  assert.equal(fs.readFileSync(path.join(dir, "song/show/index.html"), "utf8").includes('<a href="guide/">'), true, "歌曲頁頁尾應連到攻略頁");

  // 英文版：首頁 description、歌曲頁 <title> 不超過 Google 顯示長度
  const enHome = metaOf(fs.readFileSync(path.join(dir, "en/index.html"), "utf8"));
  assert.ok(enHome.desc.length <= 155, `en/index.html description ${enHome.desc.length} 字超過 155`);
  assert.ok(enHome.title.length <= 60, `en/index.html <title> ${enHome.title.length} 字超過 60`);
  const longEn = fs.readdirSync(path.join(dir, "en/song")).map(id => metaOf(fs.readFileSync(path.join(dir, "en/song", id, "index.html"), "utf8")).title).filter(t => t.length > 60);
  assert.deepEqual(longEn, [], "英文歌曲頁 <title> 不應超過 60 字");
});

await test("預留曲目（#unknownmothergoose）：顯示 #vstatus、#cardYt 不含 watch?v=、無空 ytimg 網址", async page => {
  await page.goto(BASE + "#unknownmothergoose");
  await page.waitForFunction(() =>
    !document.getElementById("song").hidden &&
    /アンノウン・マザーグース/.test(document.getElementById("sTitle")?.textContent || "") &&
    !document.getElementById("vstatus").hidden
  );
  assert.equal(await page.isVisible("#vstatus"), true);
  assert.ok((await page.textContent("#vmsg")).trim().length > 0, "#vmsg 應顯示尚未公開提示");
  const cardYtHref = await page.getAttribute("#cardYt", "href");
  assert.ok(!cardYtHref || !cardYtHref.includes("watch?v="), `#cardYt 不應含壞掉的 watch?v= 連結：${cardYtHref}`);
  assert.equal((await page.textContent("#cardYt")).trim(), "尚未公開");
  assert.equal(await page.isDisabled("#toolQuiz"), true, "沒有歌詞的預留曲目應停用測驗");
  const badImgs = await page.evaluate(() =>
    [...document.querySelectorAll("img[src]")].map(i => i.getAttribute("src")).filter(s => /ytimg\.com\/vi\/\//.test(s || ""))
  );
  assert.deepEqual(badImgs, [], "不應出現 https://i.ytimg.com/vi// 圖片網址");
});

await test("新收錄歌曲（#binks、#fairytale）：正常開啟且無 JS 錯誤", async page => {
  for (const [id, titlePat] of [["binks", "ビンクスの酒"], ["fairytale", "Fairytale"]]) {
    await page.goto(BASE + "#" + id);
    await page.waitForFunction(([sid, pat]) => {
      const re = new RegExp(pat);
      return !document.getElementById("song").hidden &&
        location.hash === "#" + sid &&
        re.test(document.getElementById("sTitle")?.textContent || "") &&
        window.__yt && window.__ytReady &&
        (document.querySelector("#lines .empty") !== null || document.querySelectorAll("#lines .ln").length > 0);
    }, [id, titlePat]);
    assert.equal(await page.isVisible("#song"), true);
  }
});

await test("巡演專頁（tour/utattemita-2027/）：首頁橫幅導流、外觀切換、各場歌單分 Day、一鍵開練", async page => {
  await page.goto(BASE);
  assert.equal(await page.isVisible("#tourBanner a.tour-banner"), true, "首頁應顯示巡演預習橫幅");
  await page.click("#tourBanner a.tour-banner");
  await page.waitForURL("**/tour/utattemita-2027/");
  assert.match(await page.textContent("#tourH"), /歌ってみたツアー2027/);
  assert.equal(await page.locator(".tour-day").count(), 6, "各場歌單應列出 6 場");
  assert.equal(await page.locator(".tour-city").count(), 3, "6 場應依場館分成 3 組");
  assert.equal(await page.getAttribute(".tour-venue-3d", "href"), "https://twconcertview.com/3d/ariake-arena-tokyo", "東京有明場次應提供外部 3D 視野參考連結");
  assert.equal(await page.getAttribute(".tour-venue-3d", "target"), "_blank");
  assert.equal(await page.locator("#show-tokyo-2 .tour-day-label").textContent(), "Day 2", "同場館第二天應標 Day 2");
  assert.equal(await page.locator("#warmup .tour-shelf").count(), 4, "預熱應有 4 排分組書架");
  // 預熱＋更多翻唱＝本站全部翻唱，每首只出現一次
  const coverIds = await page.evaluate(() => [...document.querySelectorAll("#warmup .card, #covers .song")].map(a => a.dataset.id));
  assert.equal(coverIds.length >= 80, true, "預熱＋更多翻唱應涵蓋所有翻唱曲");
  assert.equal(new Set(coverIds).size, coverIds.length, "同一首翻唱在頁面上不應重複出現");

  // 書架：歌多的那排按下一組會往右捲、上一組解除停用
  await page.click('#group-origin-and-hot [data-dir="1"]');
  await page.waitForFunction(() => document.querySelector("#shelf-origin-and-hot").scrollLeft > 0 && !document.querySelector('#group-origin-and-hot [data-dir="-1"]').disabled);
  // 04 書架最前面應為最新的翻唱曲（brain、andjuly、staywithme）
  const firstThree04 = await page.evaluate(() => [...document.querySelectorAll("#shelf-origin-and-hot .card")].slice(0, 3).map(a => a.dataset.id));
  assert.deepEqual(firstThree04, ["brain", "andjuly", "staywithme"], "04 應依日期由新到舊排在前面");

  // 本頁導覽：點「全部翻唱」會捲到那段並亮起
  await page.click('#tourRail a[data-sec="covers"]');
  await page.waitForFunction(() => document.querySelector('#tourRail a[data-sec="covers"]').classList.contains("is-active"));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("details.tour-day")].some(d => d.open)), false, "各場歌單預設應收合");

  // 頂欄外觀與語言切換在巡演獨立頁正常運作
  await page.click("#themeBtn");
  await page.waitForFunction(() => !document.getElementById("themePop").hidden);
  await page.click('#themePop [data-theme-pick="light"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.equal(await page.getAttribute('#langPop [data-lang-link="ja"]', "href"), "jp/tour/utattemita-2027/");

  // 從巡演頁點歌卡片進歌曲獨立頁 → 點上一步應回到巡演頁（不是強制回首頁）
  await page.click('#shelf-live-verified a[data-id="hibana"]');
  await page.waitForURL("**/song/hibana/");
  await page.waitForFunction(() => document.querySelectorAll("#lines .ln").length > 0);
  await page.click(".songbar a.ib");
  await page.waitForFunction(() => location.pathname.endsWith("/tour/utattemita-2027/"));

  // 「練這組」一按就從清單第一首開始練，下一首照清單走；切下一首後按上一步也應回到巡演頁
  await page.click("#group-live-verified .tour-play");
  await page.waitForFunction(() => location.hash === "#unravel" && !document.getElementById("song").hidden);
  assert.match(await page.getAttribute("#nextSong", "href") || "", /hibana/, "下一首應照清單接〈ヒバナ〉");
  await page.click("#nextSong");
  await page.waitForFunction(() => location.hash === "#hibana");
  await page.click(".songbar a.ib");
  await page.waitForFunction(() => location.pathname.endsWith("/tour/utattemita-2027/"));

  // 外部直接開歌曲頁（無站內 referrer）→ 按上一步應導回首頁
  const extPage = await page.context().newPage();
  await extPage.goto(BASE + "song/hibana/");
  await extPage.waitForFunction(() => document.querySelectorAll("#lines .ln").length > 0);
  assert.equal(await extPage.getAttribute(".songbar a.ib", "href"), "./");
  await extPage.click(".songbar a.ib");
  await extPage.waitForFunction(() => location.pathname === "/" && !document.getElementById("home").hidden);
  await extPage.close();
});

await test("巡演專頁（手機版面）：無橫向捲動、浮動導覽按鈕", async page => {
  for (const url of ["tour/utattemita-2027/", "en/tour/utattemita-2027/", "jp/tour/utattemita-2027/"]) {
    await page.goto(BASE + url);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw, `${url}：scrollWidth ${sw} > ${cw}`);
  }
  // 手機：捲過主標後出現浮動導覽按鈕，點開是本頁導覽清單，點一段會收起並捲過去
  await page.goto(BASE + "tour/utattemita-2027/");
  await page.evaluate(() => document.getElementById("covers").scrollIntoView());
  await page.waitForFunction(() => document.getElementById("tourFab").classList.contains("is-shown"));
  await page.click("#tourFab");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("tourRail")).display !== "none");
  await page.click('#tourRail a[data-sec="faq"]');
  await page.waitForFunction(() => !document.getElementById("tourRail").classList.contains("is-open") && document.getElementById("faq").getBoundingClientRect().top < innerHeight);
}, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

await test("攻略＆手燈小抄（guide/）：首頁導流、規則在色票表前、禁令收成一塊、色列可直接連結、無重複歌單工具、色票膠囊進歌曲頁再返回、主標目錄導流、外觀與語言", async page => {
  await page.goto(BASE);
  await page.click('#homeGuide a[href="guide/"]');
  await page.waitForURL("**/guide/");
  assert.match(await page.textContent("#guideH"), /新手須知/);

  // 畫面上 #rules 在 #colors 上面，#colors 在 #faq 上面；最常踩雷的兩條規則排最前面、帶標記
  const tops = await page.evaluate(() => ["rules", "colors", "faq"].map(id => document.getElementById(id).getBoundingClientRect().top + scrollY));
  assert.ok(tops[0] < tops[1] && tops[1] < tops[2], `區塊順序應為 #rules → #colors → #faq：${tops}`);
  assert.equal(await page.locator("#rules .guide-rule").count(), 5);
  assert.deepEqual(await page.$$eval("#rules .guide-rule.is-warn", els => els.map(e => e.id)), ["rule-photo", "rule-binoculars"]);
  assert.equal(await page.isVisible("#rules .guide-group.is-warn .guide-rule-tag"), true, "禁令那塊應有「禁止」標籤");

  // 找歌、篩選交給首頁：沒有搜尋框、篩選膠囊、檢視切換、大型歌單表
  assert.equal(await page.locator('main input, main [type="search"], [data-fc], [data-fa], [data-fk], [data-view], .guide-item, #guideList, #guidePlay').count(), 0, "攻略頁不應有重複的找歌工具");

  // 色票牆：每張色卡的膠囊數＝卡頭曲數，總數＝全部可索引的歌（每首只出現一次）
  const wall = await page.evaluate(() => [...document.querySelectorAll("#colors .guide-color")].map(c => ({ g: c.dataset.g, n: parseInt(c.querySelector("h3 .count").textContent, 10), ids: [...c.querySelectorAll("a.guide-pill-song")].map(a => a.dataset.id) })));
  assert.ok(wall.length >= 5, "色票表應有多列");
  assert.ok(wall.every(c => c.ids.length === c.n && c.n > 0), "每一列的曲數應與膠囊數一致");
  const allIds = wall.flatMap(c => c.ids);
  assert.equal(new Set(allIds).size, allIds.length, "色票牆每首歌只出現一次");
  const indexable = await page.evaluate(() => fetch("sitemap.xml").then(r => r.text())).then(x => [...x.matchAll(/<loc>https:\/\/ado\.kuti\.cc\/song\/([^/]+)\/<\/loc>/g)].map(m => m[1]));
  assert.deepEqual([...allIds].sort(), [...indexable].sort(), "色票牆應涵蓋全部可索引的歌");
  // 主色：膠囊所在的列＝那首歌的第一個手燈色；迷你色點只放「其他」顏色（主色已經是那一列的色點，不重複）
  const blue = wall.find(c => c.g === "青");
  assert.ok(blue && blue.ids.includes("usseewa"), "うっせぇわ（青赤）應在主色藍色列");
  assert.equal(await page.locator('#colors a.guide-pill-song[data-id="usseewa"] .guide-pill-dots i').count(), 1, "雙色歌只帶一顆其他顏色的迷你色點");

  // 色列可以直接連結：#color-red 捲到紅色那一列
  await page.goto(BASE + "guide/#color-red");
  await page.waitForFunction(() => Math.abs(document.getElementById("color-red").getBoundingClientRect().top) < innerHeight / 2);

  // 點膠囊直接進那首的 MV 同步練習頁；瀏覽器上一頁、歌曲頁返回鈕都回到攻略頁
  await page.click('#colors a.guide-pill-song[data-id="usseewa"]');
  await page.waitForURL("**/song/usseewa/");
  await page.waitForFunction(() => document.querySelectorAll("#lines .ln").length > 0);
  await page.goBack();
  await page.waitForFunction(() => location.pathname.endsWith("/guide/"));
  await page.click('#colors a.guide-pill-song[data-id="usseewa"]');
  await page.waitForURL("**/song/usseewa/");
  await page.waitForFunction(() => document.querySelectorAll("#lines .ln").length > 0);
  await page.click(".songbar a.ib");
  await page.waitForFunction(() => location.pathname.endsWith("/guide/"));

  // 主標目錄跳到現場規定、手燈顏色；主標按鈕去首頁挑歌（曲數＝首頁全部歌）、去巡演預習
  await page.click('.guide-map a[href="guide/#colors"]');
  await page.waitForFunction(() => location.hash === "#colors" && document.getElementById("colors").getBoundingClientRect().top < innerHeight);
  await page.click('.guide-map a[href="guide/#rules"]');
  await page.waitForFunction(() => location.hash === "#rules");
  assert.equal(await page.getAttribute(".guide-cta .guide-tour-link", "href"), "tour/utattemita-2027/");
  await page.click(".guide-home-link");
  await page.waitForFunction(() => location.pathname.replace(/index\.html$/, "").endsWith("/") && !location.pathname.includes("/guide/"));
  const all = await page.evaluate(() => window.ADO_SONGS.SONGS.length);
  await page.goBack();
  await page.waitForFunction(() => location.pathname.endsWith("/guide/"));
  assert.match(await page.textContent(".guide-home-link"), new RegExp(`${all}`), "去首頁挑歌的曲數應等於首頁全部歌");

  // 外觀切換、語言連結
  await page.click("#themeBtn");
  await page.waitForFunction(() => !document.getElementById("themePop").hidden);
  await page.click('#themePop [data-theme-pick="light"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "light");
  assert.equal(await page.getAttribute('#langPop [data-lang-link="en"]', "href"), "en/guide/");
  assert.equal(await page.getAttribute('#langPop [data-lang-link="ja"]', "href"), "jp/guide/");
  await page.click("#langBtn");
  await page.click('#langPop [data-lang-link="en"]');
  await page.waitForURL("**/en/guide/");
  assert.match(await page.textContent("#guideH"), /Beginner Guide/);
  assert.equal(await page.getAttribute('#langPop [data-lang-link="zh"]', "href"), "../guide/");
  await page.click('#colors a.guide-pill-song[data-id="usseewa"]');
  await page.waitForURL("**/en/song/usseewa/");
});

await test("攻略＆手燈小抄（手機版面）：三語無橫向捲動、列改上下排、浮動導覽", async page => {
  for (const url of ["guide/", "en/guide/", "jp/guide/"]) {
    await page.goto(BASE + url);
    const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    assert.ok(sw <= cw, `${url}：scrollWidth ${sw} > ${cw}`);
    // 手機上規定、色列都改成上下排（標籤在上、內容在下），每顆膠囊都不超出畫面
    const [cols, over] = await page.evaluate(() => [
      [".guide-rule", ".guide-color"].map(s => getComputedStyle(document.querySelector(s)).gridTemplateColumns.split(" ").length),
      [...document.querySelectorAll(".guide-pill-song")].filter(a => a.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).length
    ]);
    assert.deepEqual(cols, [1, 1], `${url}：手機規定與色列應為上下排`);
    assert.equal(over, 0, `${url}：有歌名膠囊超出畫面`);
  }
  // 浮動導覽：主標捲出畫面才出現（#rules 緊接在主標下面，所以捲到第三條規則）
  await page.goto(BASE + "guide/");
  await page.evaluate(() => document.getElementById("rule-penlight").scrollIntoView());
  await page.waitForFunction(() => document.getElementById("tourFab").classList.contains("is-shown"));
  await page.click("#tourFab");
  await page.click('#tourRail a[data-sec="colors"]');
  await page.waitForFunction(() => !document.getElementById("tourRail").classList.contains("is-open") && document.getElementById("colors").getBoundingClientRect().top < innerHeight);
  await page.click("#tourFab");
  await page.click('#tourRail a[data-sec="faq"]');
  await page.waitForFunction(() => !document.getElementById("tourRail").classList.contains("is-open") && document.getElementById("faq").getBoundingClientRect().top < innerHeight);
}, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

await test("攻略＆手燈小抄（桌機版面）：左欄標籤｜右欄內容、三段共用同一條標籤欄、內容左緣一致", async page => {
  for (const url of ["guide/", "en/guide/"]) {
    await page.goto(BASE + url);
    const r = await page.evaluate(() => {
      const box = e => e.getBoundingClientRect();
      // 每一列都是兩欄；規定標題、色名在同一條左緣，規定說明、歌名膠囊在同一條左緣（整頁一條連續的欄線）
      const rows = [...document.querySelectorAll(".guide-rule, .guide-color")];
      const cols = new Set(rows.map(el => getComputedStyle(el).gridTemplateColumns.split(" ").length));
      const labelLefts = new Set(rows.map(el => Math.round(box(el.querySelector(".guide-label")).left)));
      const bodyLefts = new Set(rows.map(el => Math.round(box(el.querySelector(".guide-rule-body, .guide-pills")).left)));
      // 主標、目錄、段落標題、規定、色票表、附註、常見問題的左緣都是同一條
      const lefts = [".guide-hero h1", ".guide-map", "#rulesH", ".guide-rules", "#colorsH", ".guide-wall", "#colors .guide-note", "#faqH", ".faq-list"].map(s => Math.round(box(document.querySelector(s)).left));
      return { cols: [...cols], labelLefts: labelLefts.size, bodyLefts: bodyLefts.size, lefts };
    });
    assert.deepEqual(r.cols, [2], `${url}：桌機每一列都應是兩欄`);
    assert.equal(r.labelLefts, 1, `${url}：標籤欄左緣應一致`);
    assert.equal(r.bodyLefts, 1, `${url}：內容欄左緣應一致（規定與色票表共用同一條欄線）`);
    assert.equal(new Set(r.lefts).size, 1, `${url}：內容左緣應一致：${r.lefts}`);
  }
}, { viewport: { width: 1280, height: 900 } });

await test("無障礙（A11y）稽核：圖片 alt、按鈕名稱、表單標籤、跳轉連結與 axe-core", async page => {
  const axeMod = await import("@axe-core/playwright").catch(() => null);
  const AxeBuilder = axeMod?.AxeBuilder || axeMod?.default || null;
  if (!AxeBuilder) console.log("    (未安裝 @axe-core/playwright，執行內建 DOM A11y 稽核)");

  const auditPage = async (label) => {
    const issues = await page.evaluate(() => {
      const errs = [];
      const isShown = el => {
        if (!el || el.closest("[hidden]")) return false;
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      for (const img of document.querySelectorAll("img")) {
        if (isShown(img) && !img.hasAttribute("alt")) errs.push(`img 缺少 alt: ${img.outerHTML.slice(0, 80)}`);
      }
      for (const btn of document.querySelectorAll("button")) {
        if (!isShown(btn)) continue;
        const labelText = (btn.getAttribute("aria-label") || "").trim();
        const labelledBy = (btn.getAttribute("aria-labelledby") || "").trim();
        const txt = (btn.textContent || "").trim();
        const imgAlt = [...btn.querySelectorAll("img[alt]")].map(i => i.alt.trim()).join("");
        if (!labelText && !labelledBy && !txt && !imgAlt) errs.push(`button 缺少無障礙名稱: ${btn.outerHTML.slice(0, 80)}`);
      }
      for (const inp of document.querySelectorAll("input, select, textarea")) {
        if (!isShown(inp) || inp.type === "hidden") continue;
        const id = inp.id;
        const hasFor = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const hasWrap = inp.closest("label");
        const hasAria = (inp.getAttribute("aria-label") || inp.getAttribute("aria-labelledby") || "").trim();
        if (!hasFor && !hasWrap && !hasAria) errs.push(`表單欄位缺少 label: ${inp.outerHTML.slice(0, 80)}`);
      }
      const skip = document.querySelector(".skip-link");
      if (!skip || skip.getAttribute("href") !== "#main" || !document.getElementById("main")) {
        errs.push("缺少有效的 .skip-link -> #main");
      }
      return errs;
    });
    assert.deepEqual(issues, [], `${label} A11y 問題：\n${issues.join("\n")}`);

    if (AxeBuilder) {
      const res = await new AxeBuilder({ page }).analyze();
      // 首頁唱片箱的連結：axe 4.11+ 把 CD 環形字和側帶（都是 aria-hidden 的裝飾）當成可見文字，
      // 要求連結名稱逐字包含「ADO · 歌名 · 応援 · Ado 歌名」。名稱「歌名，打開應援頁」已含歌名，這條只對它跳過。
      const decorative = n => n.target.some(t => /^a\[data-crate=/.test(t));
      const violations = res.violations
        .map(v => v.id === "label-content-name-mismatch" ? { ...v, nodes: v.nodes.filter(n => !decorative(n)) } : v)
        .filter(v => v.nodes.length);
      const bad = violations.filter(v => v.impact === "serious" || v.impact === "critical");
      assert.deepEqual(
        bad.map(v => `${v.id}(${v.impact}): ${v.nodes.map(n => n.target.join(" ")).slice(0, 3).join(", ")}`),
        [],
        `${label} axe-core serious/critical violations`
      );
    }
  };

  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelectorAll("#songList li").length > 0);
  await auditPage("首頁");

  await page.fill("#q", "a");
  await page.waitForFunction(() => !document.getElementById("heroSuggest").hidden && document.querySelectorAll("#heroSuggestList .qs-item").length > 0);
  await auditPage("首頁（深色快速搜尋展開）");

  await page.click("#themeBtn");
  await page.click('#themePop [data-theme-pick="light"]');
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light" && !document.documentElement.classList.contains("vt-theme"));
  await page.focus("#q");
  await page.fill("#q", "u");
  await page.waitForFunction(() => !document.getElementById("heroSuggest").hidden && document.querySelectorAll("#heroSuggestList .qs-item").length > 0);
  await auditPage("首頁（淺色快速搜尋展開）");

  await openSong(page, "#usseewa");
  await auditPage("歌曲頁 #usseewa");

  await page.goto(BASE + "#unknownmothergoose");
  await page.waitForFunction(() =>
    !document.getElementById("song").hidden &&
    !document.getElementById("vstatus").hidden &&
    /アンノウン・マザーグース/.test(document.getElementById("sTitle")?.textContent || "")
  );
  await auditPage("預留曲目頁 #unknownmothergoose");

  // 攻略＆手燈小抄：深色、淺色各稽核一次（禁令那塊、色票表膠囊的對比都在裡面）
  await page.evaluate(() => localStorage.setItem("theme", "dark"));
  await page.goto(BASE + "guide/");
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await auditPage("攻略頁 guide/（深色）");
  await page.evaluate(() => localStorage.setItem("theme", "light"));
  await page.goto(BASE + "guide/");
  await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
  await auditPage("攻略頁 guide/（淺色）");
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
