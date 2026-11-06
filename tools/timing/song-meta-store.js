// 歌曲資料（顯示在網站上、原本由 AI 補的部分）的讀寫：songs.js 的狀態／應援動作／應援重點、PEN 手燈色、CLIMAX 副歌高潮、
// LIVE_VIDEOS 官方 LIVE 映像，以及應援重點在 i18n.js 的英日翻譯。對時工作台（window.SongMetaStore）和 node（require）共用
// 原則：只改這一首歌碰到的那幾行，其他行一個字都不動；某一行的排版跟預期不同就丟錯，不冒險寫入
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SongMetaStore = api;
})(typeof self !== "undefined" ? self : this, function () {
  const PEN_KEYS = [..."青水白赤桃紫橙黄緑彩"];
  const VALID_ACTS = ["sing", "call", "clap", "wave", "jump", "gesture", "listen"];
  const STATUSES = ["", "sug", "free", "hold"];
  const LANGS = ["en", "ja"];
  const STATUS_NAME = { "": "正式", sug: "暫定建議", free: "自由應援", hold: "整理中" };

  // 執行 UMD 檔（songs.js、i18n.js）拿到它輸出的資料
  function evalUmd(src) {
    const module = { exports: {} };
    new Function("module", "exports", "define", src)(module, module.exports, undefined);
    return module.exports;
  }

  const str = v => JSON.stringify(v);
  const val = v => (Array.isArray(v) ? `[${v.map(str).join(", ")}]` : str(v));
  // 一行物件的排版：{ id: "x", ja: "…", acts: ["a", "b"], cover: true  }
  const objLine = (o, close = "  }") => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${val(v)}`).join(", ")}${close}`;
  // 一行對照表的排版：{ a: "x", b: 1.5 }
  const mapLine = o => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${val(v)}`).join(", ")} }`;

  const splitLines = raw => ({ crlf: raw.includes("\r\n"), lines: raw.replace(/\r\n/g, "\n").split("\n") });
  const joinLines = (p, lines) => (p.crlf ? lines.join("\n").replace(/\n/g, "\r\n") : lines.join("\n"));

  // 找出 `  const NAME = {…};` 這一行（一行寫完的對照表）
  function findMapLine(lines, name) {
    const i = lines.findIndex(l => l.startsWith(`  const ${name} = {`) && l.endsWith("};"));
    if (i < 0) throw new Error(`songs.js 裡找不到一行寫完的 const ${name} = {…};`);
    return i;
  }

  // ── 讀取：這首歌目前的資料 ──
  function readMeta(songsSrc, i18nSrc, id) {
    const data = evalUmd(songsSrc), dict = i18nSrc ? evalUmd(i18nSrc) : {};
    const s = data.SONGS.find(x => x.id === id);
    if (!s) throw new Error(`songs.js 裡沒有 ${id}`);
    const status = s.hold ? "hold" : s.sug ? "sug" : s.free ? "free" : "";
    const pen = data.PEN[id] || "";
    const lv = data.LIVE_VIDEOS[id];
    return {
      id,
      status,
      acts: (s.acts || []).slice(),
      tips: (s.tips || []).map(zh => ({ zh, en: (dict.en || {})[zh] || "", ja: (dict.ja || {})[zh] || "" })),
      pen: pen.replace(/^\?/, ""),
      penGuess: pen.startsWith("?"),
      climax: typeof data.CLIMAX[id] === "number" ? data.CLIMAX[id] : null,
      liveVideo: lv ? { yt: lv.yt, concert: lv.concert || "" } : null,
      len: s.len
    };
  }

  // ── 檢查：跟 scripts/check-data.mjs 同樣的規則 ──
  function validate(meta) {
    const errors = [], warnings = [];
    if (!STATUSES.includes(meta.status)) errors.push(`不認得的狀態「${meta.status}」`);
    meta.acts.forEach(a => { if (!VALID_ACTS.includes(a)) errors.push(`不認得的應援動作「${a}」`); });
    const tips = meta.tips.filter(t => t.zh.trim());
    if (!meta.status && !tips.length) errors.push("狀態是「正式」時至少要有一條應援重點（或把狀態改成自由、整理中）");
    [...meta.pen].forEach(c => { if (!PEN_KEYS.includes(c)) errors.push(`手燈色有不認得的顏色「${c}」`); });
    if (new Set(meta.pen).size !== meta.pen.length) errors.push("手燈色有重複的顏色");
    const dur = typeof meta.len === "string" ? meta.len.split(":").reduce((a, b) => a * 60 + +b, 0) : NaN;
    if (meta.climax != null && !(typeof meta.climax === "number" && meta.climax > 0 && !(meta.climax > dur))) errors.push(`副歌高潮 ${meta.climax} 秒無效或超出 MV 長度（${meta.len}）`);
    if (meta.liveVideo) {
      if (!/^[\w-]{11}$/.test(meta.liveVideo.yt || "")) errors.push(`LIVE 映像的 YouTube ID 要是 11 碼（${meta.liveVideo.yt}）`);
      if (!(meta.liveVideo.concert || "").trim()) errors.push("LIVE 映像要填演唱會名稱");
    }
    if (meta.status && meta.status !== "free") warnings.push(`狀態是「${STATUS_NAME[meta.status]}」，網站上不會顯示應援重點、動作和手燈色`);
    tips.forEach(t => { if (!t.en.trim() || !t.ja.trim()) warnings.push(`「${t.zh}」沒有${!t.en.trim() && !t.ja.trim() ? "英、日" : !t.en.trim() ? "英文" : "日文"}翻譯，那個語言的網頁會顯示中文`); });
    return { errors, warnings };
  }

  // ── 寫入：回傳新的 songs.js、i18n.js 內容和變更摘要 ──
  function applyMeta(songsSrc, i18nSrc, meta) {
    const id = meta.id, changes = [];
    const data = evalUmd(songsSrc);
    const p = splitLines(songsSrc), lines = p.lines;

    // 1. SONGS 那一行
    const si = lines.findIndex(l => l.startsWith(`    { id: ${str(id)},`));
    if (si < 0) throw new Error(`songs.js 裡找不到 ${id} 那一行`);
    // 只讀這一行本身（songs.js 執行時會替每首歌補上 credit、lives 等欄位，原檔裡沒有）
    const trail = lines[si].endsWith(",") ? "," : "";
    const song = new Function(`return (${lines[si].trim().replace(/,$/, "")});`)();
    const close = /  },?$/.test(lines[si]) ? "  }" : " }";
    if (`    ${objLine(song, close)}${trail}` !== lines[si]) throw new Error(`songs.js 裡 ${id} 那一行的排版跟預期不同，為了不改壞，沒有寫入`);
    const next = {};
    const tips = meta.tips.map(t => t.zh.trim()).filter(Boolean);
    // acts、tips 固定接在 len 後面；sug/free/hold 拿掉，下面再依新狀態放回去
    for (const [k, v] of Object.entries(song)) {
      if (["acts", "tips", "sug", "free", "hold"].includes(k)) continue;
      next[k] = v;
      if (k === "len") {
        // 原本就有的欄位（即使是空陣列）照樣留著
        if (meta.acts.length || "acts" in song) next.acts = meta.acts.slice();
        if (tips.length || "tips" in song) next.tips = tips;
      }
    }
    // 狀態放在 tips（或 claps）後面、cover 等標記前面，跟原本的寫法一樣
    const ordered = {};
    let placed = !meta.status;
    for (const [k, v] of Object.entries(next)) {
      if (!placed && (k === "cover" || k === "live")) { ordered[meta.status] = true; placed = true; }
      ordered[k] = v;
    }
    if (!placed) ordered[meta.status] = true;
    const newLine = `    ${objLine(ordered, close)}${trail}`;
    if (newLine !== lines[si]) {
      const old = data.SONGS.find(x => x.id === id);
      const oldStatus = old.hold ? "hold" : old.sug ? "sug" : old.free ? "free" : "";
      if (oldStatus !== meta.status) changes.push(`狀態：${STATUS_NAME[oldStatus]} → ${STATUS_NAME[meta.status]}`);
      if (str(old.acts || []) !== str(meta.acts)) changes.push(`應援動作：${meta.acts.join(", ") || "（無）"}`);
      if (str(old.tips || []) !== str(tips)) changes.push(`應援重點：${tips.length} 條`);
      lines[si] = newLine;
    }

    // 2. 一行對照表：PEN、CLIMAX
    // 只換掉這首歌那一項（其他項原樣保留，連 154.0 這種寫法都不動）；沒有就加在最後，清空就拿掉
    const setMap = (name, value, label) => {
      const i = findMapLine(lines, name), line = lines[i];
      const re = new RegExp(`(\\{ |, )${id}: ("[^"]*"|-?[\\d.]+)(?=, | \\})`);
      const m = line.match(re), has = id in data[name];
      if (has !== !!m) throw new Error(`songs.js 的 ${name} 裡 ${id} 那一項的寫法跟預期不同，為了不改壞，沒有寫入`);
      const empty = value == null || value === "";
      if (m && !empty && JSON.parse(m[2]) === value) return;
      if (!m && empty) return;
      let nl;
      if (m && empty) nl = m[1] === "{ " ? line.replace(new RegExp(`\\{ ${id}: ${m[2].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(, )?`), "{ ") : line.replace(m[0], "");
      else if (m) nl = line.replace(m[0], `${m[1]}${id}: ${str(value)}`);
      else nl = line.replace(/ \};$/, `${Object.keys(data[name]).length ? "," : ""} ${id}: ${str(value)} };`);
      lines[i] = nl;
      changes.push(label);
    };
    setMap("PEN", meta.pen ? (meta.penGuess ? "?" : "") + meta.pen : null, `手燈色：${meta.pen || "（不指定，網站顯示藍）"}`);
    setMap("CLIMAX", meta.climax, `副歌高潮：${meta.climax == null ? "（不指定）" : meta.climax + " 秒"}`);

    // 3. LIVE_VIDEOS（多行的表）：整段照原本的格式重排
    {
      const a = lines.indexOf("  const LIVE_VIDEOS = {");
      const b = a < 0 ? -1 : lines.indexOf("  };", a);
      if (a < 0 || b < 0) throw new Error("songs.js 裡找不到 const LIVE_VIDEOS = { … };");
      // 每一項一行：    id: { yt: "…", concert: "…" },（最後一項沒有逗號）
      const k = lines.slice(a + 1, b).findIndex(l => l.startsWith(`    ${id}: {`));
      const has = id in data.LIVE_VIDEOS;
      if (has !== k >= 0) throw new Error(`songs.js 的 LIVE_VIDEOS 裡 ${id} 那一項的寫法跟預期不同，為了不改壞，沒有寫入`);
      const lv = meta.liveVideo, old = data.LIVE_VIDEOS[id];
      const want = lv ? { ...(old || {}), yt: lv.yt, concert: lv.concert.trim() } : null;
      if (str(want) !== str(old || null)) {
        if (k >= 0) {
          const j = a + 1 + k, last = j === b - 1;
          if (want) lines[j] = `    ${id}: ${mapLine(want)}${last ? "" : ","}`;
          else {
            lines.splice(j, 1);
            if (last && j - 1 > a) lines[j - 1] = lines[j - 1].replace(/,$/, "");
          }
        } else {
          if (b - 1 > a) lines[b - 1] = lines[b - 1].replace(/,?$/, ",");
          lines.splice(b, 0, `    ${id}: ${mapLine(want)}`);
        }
        changes.push(lv ? `LIVE 映像：${lv.concert.trim()}（${lv.yt}）` : "LIVE 映像：移除");
      }
    }
    const songsOut = joinLines(p, lines);

    // 4. i18n.js：應援重點的英日翻譯（有填才寫；已有的 key 就換掉值）
    let i18nOut = i18nSrc;
    if (i18nSrc) {
      const q = splitLines(i18nSrc), il = q.lines, dict = evalUmd(i18nSrc);
      let n = 0;
      for (const lang of LANGS) {
        const start = il.indexOf(`    ${lang}: {`);
        if (start < 0) throw new Error(`i18n.js 裡找不到 ${lang}: {`);
        let end = start + 1;
        while (end < il.length && !/^    }/.test(il[end])) end++;
        for (const t of meta.tips) {
          const zh = t.zh.trim(), tr = (t[lang] || "").trim();
          if (!zh || !tr || (dict[lang] || {})[zh] === tr) continue;
          const prefix = `      ${str(zh)}: `;
          const k = il.slice(start + 1, end).findIndex(l => l.startsWith(prefix));
          if (k >= 0) {
            const j = start + 1 + k;
            il[j] = prefix + str(tr) + (il[j].endsWith(",") ? "," : "");
          } else {
            if (!il[end - 1].endsWith(",")) il[end - 1] += ",";
            il.splice(end, 0, prefix + str(tr));
            end++;
          }
          n++;
        }
      }
      if (n) { i18nOut = joinLines(q, il); changes.push(`翻譯：${n} 句`); }
      // 確認改完的檔案還讀得出來，而且值是我們要的
      const check = evalUmd(i18nOut);
      for (const lang of LANGS) for (const t of meta.tips) if (t.zh.trim() && (t[lang] || "").trim() && check[lang][t.zh.trim()] !== t[lang].trim()) throw new Error(`i18n.js 寫入後讀回來不一致（${lang}：${t.zh}），沒有寫入`);
    }

    // 寫入前再讀一次確認
    const after = readMeta(songsOut, i18nOut, id);
    if (after.status !== meta.status || str(after.acts) !== str(meta.acts) || after.pen !== meta.pen || after.climax !== meta.climax) {
      throw new Error("songs.js 寫入後讀回來不一致，沒有寫入");
    }
    return { songs: songsOut, i18n: i18nOut, changes, songsChanged: songsOut !== songsSrc, i18nChanged: i18nOut !== i18nSrc };
  }

  return { PEN_KEYS, VALID_ACTS, STATUSES, STATUS_NAME, evalUmd, readMeta, validate, applyMeta };
});
