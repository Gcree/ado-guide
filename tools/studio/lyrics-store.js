// 把一首歌的對時結果寫回歌詞檔的共用邏輯：工作站的 core.mjs、server.mjs（require）都用這一份
// MV 版寫進 song-lyrics.js（SONGS）；現場版（type: "live" 或 id 結尾 -live）寫進 song-lyrics-live.js（LIVE_SONGS）並依 id 排序
// 原檔必須是 JSON.stringify(…, null, 2) 的排版，寫回時其他歌一個字都不會動，換行（CRLF / LF）照原檔
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LyricsStore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const TARGETS = {
    mv: { file: "song-lyrics.js", varName: "SONGS", sort: false },
    live: { file: "song-lyrics-live.js", varName: "LIVE_SONGS", sort: true }
  };
  const VALID_ACTS = ["sing", "call", "clap", "wave", "jump", "gesture", "listen"];

  const kindOf = entry => (entry.type === "live" || /-live$/.test(entry.id || "") ? "live" : "mv");

  // 讀出檔案裡的歌曲陣列；排版跟預期不同就丟錯，不冒險寫入
  function parse(raw, kind) {
    const target = TARGETS[kind];
    const crlf = raw.includes("\r\n"), src = raw.replace(/\r\n/g, "\n");
    const HEAD = `var ${target.varName} = `, TAIL = `;\n\n  return ${target.varName};`;
    const a = src.indexOf(HEAD), b = src.indexOf(TAIL);
    if (a < 0 || b < 0) throw new Error(`${target.file} 的格式跟預期不同（找不到 ${HEAD}… return ${target.varName};），沒有寫入`);
    const body = src.slice(a + HEAD.length, b);
    let songs;
    try { songs = JSON.parse(body); } catch (e) { throw new Error(`${target.file} 讀不出歌曲資料（${e.message}），沒有寫入`); }
    if (body !== JSON.stringify(songs, null, 2)) throw new Error(`${target.file} 不是 JSON.stringify(…, null, 2) 的排版，為了不動到其他歌，沒有寫入`);
    return { target, crlf, src, a: a + HEAD.length, b, songs };
  }

  // 把 entry 換進（或加進）原檔內容，回傳新的檔案內容
  function merge(raw, entry) {
    const kind = kindOf(entry);
    const p = parse(raw, kind);
    const i = p.songs.findIndex(s => s.id === entry.id);
    const old = i >= 0 ? p.songs[i] : null;
    if (i >= 0) p.songs[i] = entry; else p.songs.push(entry);
    if (p.target.sort) p.songs.sort((x, y) => x.id.localeCompare(y.id));
    let text = p.src.slice(0, p.a) + JSON.stringify(p.songs, null, 2) + p.src.slice(p.b);
    if (p.crlf) text = text.replace(/\n/g, "\r\n");
    return { text, kind, file: p.target.file, replaced: !!old, unchanged: !!old && JSON.stringify(old) === JSON.stringify(entry), oldCount: old ? old.lyrics.length : 0 };
  }

  const lenToSec = len => (typeof len === "string" ? len.split(":").reduce((a, b) => a * 60 + +b, 0) : NaN);

  // 跟 scripts/check-data.mjs 同樣的逐行檢查；errors 會擋下存檔，warnings 只是提醒
  // song：songs.js 裡的那首歌（MV 版用來比對影片和曲長）
  function validate(entry, song) {
    const errors = [], warnings = [];
    if (!entry || !entry.id || !Array.isArray(entry.lyrics)) {
      errors.push("不是對時工具輸出的格式（要有 id 和 lyrics）");
      return { errors, warnings };
    }
    const live = kindOf(entry) === "live";
    const dur = entry.duration;
    if (typeof dur !== "number" || !(dur > 0)) errors.push(`duration 不是有效的秒數（${dur}）`);
    if (!entry.lyrics.length) errors.push("一句有時間的歌詞都沒有");
    if (!live && song) {
      if (entry.youtubeId !== song.yt) errors.push(`YouTube ID 跟 songs.js 不一致（${entry.youtubeId} / ${song.yt}）`);
      const sDur = lenToSec(song.len);
      if (typeof dur === "number" && Math.abs(sDur - dur) > 2) errors.push(`曲長跟 songs.js 差超過 2 秒（${dur}s / ${song.len}）`);
    }
    let prev = -Infinity, missingTr = 0;
    entry.lyrics.forEach((l, idx) => {
      const n = idx + 1;
      if (typeof l.time !== "number" || isNaN(l.time)) { errors.push(`第 ${n} 句的時間不是有效數字（${l.time}）`); return; }
      if (l.time < 0 || (typeof dur === "number" && l.time > dur)) errors.push(`第 ${n} 句在 ${l.time}s，超出曲長 0~${dur}s`);
      if (l.time < prev) errors.push(`第 ${n} 句（${l.time}s）比上一句（${prev}s）早`);
      prev = l.time;
      if (l.acts != null) {
        if (!Array.isArray(l.acts)) errors.push(`第 ${n} 句的 acts 不是陣列`);
        else l.acts.forEach(a => { if (!VALID_ACTS.includes(a)) errors.push(`第 ${n} 句有不認得的應援動作「${a}」`); });
      }
      if (l.sing != null) {
        if (!Array.isArray(l.sing)) errors.push(`第 ${n} 句的 sing 不是陣列`);
        else l.sing.forEach(w => { if (!(l.jp || "").includes(w)) errors.push(`第 ${n} 句的合唱詞「${w}」不在日文歌詞「${l.jp}」裡`); });
      }
      const jp = (l.jp || "").trim();
      if (!(l.tr || "").trim() && jp && !/^[（(].*[）)]$/.test(jp)) missingTr++;
    });
    if (missingTr) warnings.push(`有 ${missingTr} 句沒有中文翻譯`);
    return { errors, warnings };
  }

  return { TARGETS, VALID_ACTS, kindOf, parse, merge, validate };
});
