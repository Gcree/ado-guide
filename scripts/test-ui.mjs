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
  let t = (o.playerVars && o.playerVars.start) || 0, st = -1, rate = 1, last = performance.now();
  const sync = () => { const n = performance.now(); if (st === 1) t += (n - last) / 1000 * rate; last = n; };
  Object.assign(this, {
    getCurrentTime: () => { sync(); return t; }, getPlayerState: () => st, getDuration: () => 0,
    playVideo: () => { sync(); st = 1; }, pauseVideo: () => { sync(); st = 2; },
    seekTo: x => { sync(); t = x; }, loadVideoById: v => { sync(); t = (v && v.startSeconds) || 0; st = 1; },
    setPlaybackRate: r => { sync(); rate = r; }, mute() {}, unMute() {},
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
      const bad = res.violations.filter(v => v.impact === "serious" || v.impact === "critical");
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
});

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
