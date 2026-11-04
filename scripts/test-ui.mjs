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
  setTimeout(() => o.events.onReady && o.events.onReady(), 0);
} };
setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
`;

const browser = await chromium.launch();
let failed = 0, passed = 0;
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
  await page.waitForFunction(() => window.__yt && document.querySelectorAll("#lines .ln").length > 0);
};
const press = (page, key) => page.evaluate(k => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })), key);

console.log("=== UI smoke tests ===");

await test("首頁：歌單、搜尋、篩選", async page => {
  await page.goto(BASE);
  assert.match(await page.textContent("#songCount"), /^\d+ 首$/);
  await page.fill("#q", "usseewa");
  assert.equal(await page.locator("#songList li:not([hidden])").count(), 1);
  assert.match(await page.textContent("#songList li:not([hidden]) .ja"), /うっせぇわ/);
  await page.fill("#q", "完全找不到的字");
  assert.equal(await page.isVisible("#songEmpty"), true);
  await page.fill("#q", "");
  await page.click('[data-f="cover"]');
  assert.match(await page.textContent("#songCount"), /符合/);
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
  await page.click('.dock-rate [data-rate="0.75"]');
  assert.equal(await page.getAttribute('.dock-rate [data-rate="0.75"]', "aria-pressed"), "true");
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

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
