// 離線用的 Service Worker：建置時 scripts/build.mjs 把 VERSION 和 PRECACHE（先存起來的檔案）填進來
// 網頁（HTML）先問網路，沒網路才用存起來的；同網站帶 ?v= 版本號的檔案內容不會變，先用存起來的；字型存在另一格，換版也不用重抓
// MV 是 YouTube 的，離線時播不了；歌詞和應援重點照樣能看
const VERSION = "__VERSION__", CORE_PRECACHE = __PRECACHE__, LYRICS_PRECACHE = __LYRICS_PRECACHE__;
const CACHE = `ado-${VERSION}`, FONTS = "ado-fonts";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "font.emtech.cc"];
const SCOPE = self.registration.scope;

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(CORE_PRECACHE);
    const missing = [];
    await Promise.all(LYRICS_PRECACHE.map(async url => {
      const hit = await caches.match(url);
      if (hit) await c.put(url, hit);
      else missing.push(url);
    }));
    for (let i = 0; i < missing.length; i += 16) {
      const batch = missing.slice(i, i + 16);
      await Promise.allSettled(batch.map(url => c.add(url)));
    }
    await self.skipWaiting();
  })());
});
// 新版接手後把舊版存的刪掉（字型那格留著）
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("ado-") && k !== CACHE && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (req.mode === "navigate") return e.respondWith(page(req, url));
  if (url.origin === location.origin) return e.respondWith(url.searchParams.has("v") ? cacheFirst(req, CACHE) : networkFirst(req));
  if (FONT_HOSTS.includes(url.hostname)) return e.respondWith(fontCache(req, e));
});

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") (await caches.open(name)).put(req, res.clone());
  return res;
}
// 字型：有存就先用存的，同時在背景重抓一份換掉。字型樣式表是 opaque 回應（看不到成功或失敗），
// 只用 cacheFirst 的話，字型伺服器出錯一次，錯誤回應就會一直被拿來用；背景重抓讓它下次就恢復
async function fontCache(req, e) {
  const cache = await caches.open(FONTS), hit = await cache.match(req);
  const fresh = fetch(req).then(res => {
    if (res.ok || (!hit && res.type === "opaque")) return cache.put(req, res.clone()).then(() => res);
    return res;
  });
  if (!hit) return fresh;
  e.waitUntil(fresh.catch(() => {}));
  return hit;
}
// 沒有版本號的檔案（更新日誌、圖示）：有網路就拿新的，順便存一份
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw err;
  }
}
async function page(req, url) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // 沒打開過的歌曲頁：改開同語言首頁的 #歌曲，網頁會照網址開那首（歌詞都先存好了）
    const rel = url.href.startsWith(SCOPE) ? url.href.slice(SCOPE.length) : "";
    const m = rel.match(/^((?:en|jp)\/)?song\/([^/?#]+)/);
    if (m) return Response.redirect(`${SCOPE}${m[1] || ""}#${m[2]}`, 302);
    const langMatch = rel.match(/^(en|jp)(?:\/|$)/);
    if (langMatch) {
      const langHome = await caches.match(`${SCOPE}${langMatch[1]}/`);
      if (langHome) return langHome;
    }
    const home = await caches.match(SCOPE);
    if (home) return home;
    throw err;
  }
}
