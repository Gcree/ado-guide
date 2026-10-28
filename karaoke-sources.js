/*
 * Karaoke timed-lyrics sources adapter for ado-guide
 *
 * Keeps local hand-edited lyrics (jp, tr, acts, call, sing) authoritative.
 * Fetches syllable/word timings from open providers (Musixmatch / QQ / KuGou / NetEase / AMLL / LRCLIB),
 * normalises them into a unified schema (timed-lyrics-v1), aligns them to local line anchors,
 * and maps timings to visible .k units.
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.KARAOKE_SOURCES = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CACHE_VERSION = "v1";
  const CACHE_PREFIX = "ado-karaoke-";
  const DEFAULT_WORKER = "https://lyrics.txw.qzz.io";
  const AMLL_API = "https://api.amll.dev";
  const LRCLIB_API = "https://lrclib.net/api";
  const PROVIDER_ORDER = Object.freeze([
    "開源多來源（QQ / 網易雲 / 酷狗 / Musixmatch）",
    "AMLL TTML DB",
    "LRCLIB（逐行時間）"
  ]);

  const pending = new Map();

  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function to22Id(str) {
    const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let h1 = 0x811c9dc5, h2 = 0x41c64e6d, h3 = 0x9e3779b9, h4 = 0x27d4eb2f;
    const text = String(str || "");
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 0x01000193);
      h2 = Math.imul(h2 ^ ch, 0x5bd1e995);
      h3 = Math.imul(h3 ^ ch, 0x1b873593);
      h4 = Math.imul(h4 ^ ch, 0xcc9e2d51);
    }
    let out = "";
    let v1 = Math.abs(h1), v2 = Math.abs(h2), v3 = Math.abs(h3), v4 = Math.abs(h4);
    for (let i = 0; i < 22; i++) {
      const val = (v1 + v2 * 3 + v3 * 7 + v4 * 13 + i * 31) >>> 0;
      out += chars[val % 62];
      v1 = (v1 >>> 1) | ((v2 & 1) << 30);
      v2 = (v2 >>> 1) | ((v3 & 1) << 30);
      v3 = (v3 >>> 1) | ((v4 & 1) << 30);
      v4 = (v4 >>> 1) | ((v1 & 1) << 30);
    }
    return out;
  }

  function normaliseText(value) {
    return String(value == null ? "" : value)
      .normalize("NFKC")
      .replace(/[\[(](?:wave|clap|mic|chant|jump|spin|turn)[\])]/gi, "")
      .toLocaleLowerCase()
      .replace(/[\s\u3000、。！？!?.,，．・「」『』（）()\[\]{}【】<>《》:：;；…—–\-‐‑〜~_「」『』“”‘’'"']/g, "");
  }

  function stripRuby(txt, mode = "kanji") {
    const re = /([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g;
    return String(txt || "").replace(re, mode === "reading" ? "$2" : "$1");
  }

  function extractUnits(jp) {
    const units = [];
    const re = /([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g;
    let last = 0, m;
    while ((m = re.exec(jp))) {
      for (const c of jp.slice(last, m.index)) units.push({ text: c, reading: c, isRuby: false });
      units.push({ text: m[1], reading: m[2], isRuby: true });
      last = re.lastIndex;
    }
    for (const c of jp.slice(last)) units.push({ text: c, reading: c, isRuby: false });
    return units;
  }

  function parseTime(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const text = String(value == null ? "" : value).trim();
    if (!text) return null;
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    const unit = text.match(/^(-?\d+(?:\.\d+)?)(ms|s)$/i);
    if (unit) return Number(unit[1]) * (unit[2].toLowerCase() === "ms" ? 0.001 : 1);
    const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.:](\d+))?$/);
    if (!clock) return null;
    const hours = Number(clock[1] || 0);
    const minutes = Number(clock[2] || 0);
    const seconds = Number(clock[3] || 0);
    const fraction = clock[4] ? Number(`0.${clock[4]}`) : 0;
    return hours * 3600 + minutes * 60 + seconds + fraction;
  }

  function normaliseWords(rawWords) {
    if (!Array.isArray(rawWords)) return [];
    const out = [];
    rawWords.forEach((raw, index) => {
      if (!raw || typeof raw !== "object") return;
      const text = String(raw.text ?? raw.Text ?? raw.c ?? "");
      if (!text) return;
      const start = parseTime(raw.start ?? raw.StartTime ?? raw.ts ?? raw.time);
      let end = parseTime(raw.end ?? raw.EndTime ?? raw.te);
      const next = rawWords[index + 1];
      const nextStart = next && parseTime(next.start ?? next.StartTime ?? next.ts ?? next.time);
      if (end == null && nextStart != null) end = nextStart;
      if (start == null) return;
      if (end == null || end <= start) end = start + 0.04;
      out.push({ text, start, end });
    });
    return out;
  }

  function normaliseLines(lines, sourceName, granularity = "word") {
    if (!Array.isArray(lines)) return null;
    const result = lines.map((line) => {
      const words = normaliseWords(line && (line.words || line.Syllables || line.syllables));
      if (!words.length) return null;
      const start = finite(line.start ?? line.StartTime) ?? words[0].start;
      const end = Math.max(
        finite(line.end ?? line.EndTime) ?? words[words.length - 1].end,
        words[words.length - 1].end
      );
      return {
        start: Math.max(0, start),
        end: Math.max(start + 0.04, end),
        text: words.map((word) => word.text).join(""),
        words
      };
    }).filter(Boolean).sort((a, b) => a.start - b.start);

    if (!result.length) return null;
    return {
      format: "timed-lyrics-v1",
      source: sourceName || "開源來源",
      granularity,
      lines: result
    };
  }

  function normaliseBeautifulLyrics(payload) {
    if (!payload || typeof payload !== "object") return null;
    const type = String(payload.Type ?? payload.type ?? "").toLowerCase();
    if (type !== "syllable" && !Array.isArray(payload.Content) && !Array.isArray(payload.content)) return null;
    const content = payload.Content || payload.content || [];
    const lines = [];
    content.forEach((entry) => {
      if (!entry || String(entry.Type ?? entry.type ?? "").toLowerCase() !== "vocal") return;
      const lead = entry.Lead || entry.lead || entry;
      const syllables = lead.Syllables || lead.syllables || [];
      const words = syllables.map((word) => ({
        text: word.Text ?? word.text ?? "",
        start: word.StartTime ?? word.start,
        end: word.EndTime ?? word.end
      }));
      const line = normaliseLines([{
        start: lead.StartTime ?? lead.start,
        end: lead.EndTime ?? lead.end,
        words
      }], "", "word");
      if (line) lines.push(line.lines[0]);
    });
    const provider = payload.Source?.Provider || payload.Attribution?.provider || "open-provider-pool";
    const providerLabel = {
      qqmusic: "QQ 音樂 QRC",
      netease: "網易雲音樂 YRC",
      kugou: "酷狗音樂 KRC",
      spicylyrics: "Apple Music",
      musixmatch: "Musixmatch RichSync"
    }[provider] || `開源多來源（${provider}）`;
    return normaliseLines(lines, providerLabel, "word");
  }

  function parseTtml(text) {
    if (typeof DOMParser !== "function") return null;
    let doc;
    try {
      doc = new DOMParser().parseFromString(String(text || ""), "application/xml");
    } catch (e) {
      return null;
    }
    if (!doc || doc.querySelector("parsererror")) return null;
    const paragraphs = Array.from(doc.getElementsByTagName("p"));
    const lines = [];
    paragraphs.forEach((paragraph) => {
      const timedNodes = Array.from(paragraph.getElementsByTagName("span"))
        .filter((node) => node.hasAttribute("begin"))
        .filter((node) => !Array.from(node.children || []).some((child) => child.hasAttribute("begin")));
      const words = timedNodes.map((node, index) => ({
        text: node.textContent || "",
        start: parseTime(node.getAttribute("begin")),
        end: parseTime(node.getAttribute("end"))
          ?? (timedNodes[index + 1] ? parseTime(timedNodes[index + 1].getAttribute("begin")) : null)
      }));
      const fallbackText = paragraph.textContent || "";
      const start = parseTime(paragraph.getAttribute("begin"));
      const end = parseTime(paragraph.getAttribute("end"));
      if (words.some((word) => word.text.trim())) {
        lines.push({ start, end, words });
      } else if (fallbackText.trim() && start != null) {
        lines.push({ start, end: end ?? start + 2, words: [{ text: fallbackText, start, end: end ?? start + 2 }] });
      }
    });
    return normaliseLines(lines, "AMLL TTML DB", "word");
  }

  function parseEnhancedLrc(text) {
    const lines = [];
    String(text || "").split(/\r?\n/).forEach((rawLine) => {
      const match = rawLine.match(/^\s*\[(\d+):(\d{1,2}(?:\.\d+)?)\](.*)$/);
      if (!match) return;
      const lineStart = Number(match[1]) * 60 + Number(match[2]);
      const body = match[3] || "";
      const timed = [];
      const token = /<((?:\d+:)?\d{1,2}:\d{1,2}(?:[.:]\d+)?)>/g;
      let cursor = 0;
      let hit;
      while ((hit = token.exec(body))) {
        if (cursor < hit.index && timed.length) {
          timed[timed.length - 1].text += body.slice(cursor, hit.index);
        }
        const start = parseTime(hit[1]);
        if (start != null) timed.push({ text: "", start, end: start + 0.04 });
        cursor = token.lastIndex;
      }
      if (cursor < body.length && timed.length) timed[timed.length - 1].text += body.slice(cursor);
      if (!timed.length) return;
      timed.forEach((word, index) => {
        const next = timed[index + 1];
        word.end = next ? Math.max(word.start + 0.04, next.start) : Math.max(word.start + 0.04, lineStart + 4);
      });
      lines.push({ start: lineStart, end: timed[timed.length - 1].end, words: timed });
    });
    return normaliseLines(lines, "Musixmatch RichSync", "word");
  }

  function parseLrclibSyncedLyrics(text) {
    const lines = [];
    String(text || "").split(/\r?\n/).forEach((rawLine) => {
      const tags = [...rawLine.matchAll(/\[(\d+):(\d{1,2}(?:\.\d+)?)\]/g)];
      if (!tags.length) return;
      const lineText = rawLine.replace(/\[\d+:\d{1,2}(?:\.\d+)?\]/g, "").trim();
      if (!lineText) return;
      tags.forEach((tag) => {
        const start = Number(tag[1]) * 60 + Number(tag[2]);
        if (Number.isFinite(start)) lines.push({ start, text: lineText });
      });
    });
    lines.sort((a, b) => a.start - b.start);
    const timed = lines.map((line, index) => {
      const next = lines[index + 1];
      const end = next ? Math.max(line.start + 0.04, next.start) : line.start + 4;
      return { start: line.start, end, words: [{ text: line.text, start: line.start, end }] };
    });
    return normaliseLines(timed, "LRCLIB syncedLyrics（逐行時間）", "line");
  }

  function parseLrclib(payload) {
    if (!payload || typeof payload !== "object") return null;
    if (payload.syncedLyrics) return parseLrclibSyncedLyrics(payload.syncedLyrics);
    return null;
  }

  function getLocalStorage() {
    try {
      return typeof localStorage !== "undefined" ? localStorage : null;
    } catch (e) {
      return null;
    }
  }

  function cacheKey(song) {
    return `${CACHE_PREFIX}${CACHE_VERSION}-${String(song && song.id || "unknown")}`;
  }

  function readCache(song) {
    const storage = getLocalStorage();
    if (!storage) return null;
    try {
      const val = JSON.parse(storage.getItem(cacheKey(song)) || "null");
      return val && val.format === "timed-lyrics-v1" ? val : null;
    } catch (e) {
      return null;
    }
  }

  function writeCache(song, value) {
    const storage = getLocalStorage();
    if (!storage || !value) return;
    try {
      storage.setItem(cacheKey(song), JSON.stringify(value));
    } catch (e) {
      // Ignore quota errors
    }
  }

  function notify(options, event) {
    if (options && typeof options.onStatus === "function") {
      try { options.onStatus(event); } catch (e) {}
    }
  }

  async function fetchJson(url, options) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = setTimeout(() => controller && controller.abort(), (options && options.timeoutMs) || 9000);
    try {
      const response = await fetch(url, {
        signal: controller ? controller.signal : undefined,
        headers: (options && options.headers) || { Accept: "application/json" }
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function sourceTitle(song) {
    if (!song) return "";
    return song.ja || song.title || "";
  }

  function sourceDuration(song, options) {
    return finite(options && options.duration) || finite(song && song.dur) || null;
  }

  async function fetchWorker(song, options) {
    const base = String((options && options.workerUrl) || DEFAULT_WORKER).replace(/\/$/, "");
    const trackId = to22Id(`ado-${song.id}`);
    const url = new URL(`${base}/lyrics/${trackId}`);
    url.searchParams.set("track_name", sourceTitle(song));
    url.searchParams.set("artist_name", "Ado");
    const dur = sourceDuration(song, options);
    if (dur && dur > 0) url.searchParams.set("duration", String(Math.round(dur)));

    const payload = await fetchJson(url.toString(), {
      timeoutMs: (options && options.timeoutMs) || 9000,
      headers: { Accept: "application/json", Authorization: "Bearer static-site" }
    });
    return normaliseBeautifulLyrics(payload);
  }

  async function fetchAmll(song, options) {
    const url = new URL(`${AMLL_API}/v1/lyrics/search`);
    url.searchParams.set("musicName", sourceTitle(song));
    url.searchParams.set("artistName", "Ado");
    url.searchParams.set("pageSize", "10");

    const search = await fetchJson(url.toString(), { timeoutMs: (options && options.timeoutMs) || 7000 });
    const items = search && search.status === 200 && search.data && Array.isArray(search.data.items)
      ? search.data.items : [];
    const wantedTitle = normaliseText(sourceTitle(song));
    const item = items.find((candidate) => {
      const titles = Array.isArray(candidate.musicNames) ? candidate.musicNames : [];
      return titles.some((t) => normaliseText(t) === wantedTitle);
    }) || items[0];
    if (!item) return null;

    const lyricUrl = new URL(`${AMLL_API}/v1/lyrics/get`);
    lyricUrl.searchParams.set("id", String(item.id));
    const fetched = await fetchJson(lyricUrl.toString(), { timeoutMs: (options && options.timeoutMs) || 7000 });
    const ttml = fetched && fetched.status === 200 && fetched.data && fetched.data.lyrics;
    return ttml ? parseTtml(ttml) : null;
  }

  async function fetchLrclib(song, options) {
    const url = new URL(`${LRCLIB_API}/search`);
    url.searchParams.set("track_name", sourceTitle(song));
    url.searchParams.set("artist_name", "Ado");
    const search = await fetchJson(url.toString(), { timeoutMs: (options && options.timeoutMs) || 7000 });
    if (!Array.isArray(search) || !search.length) return null;

    const wantedDur = sourceDuration(song, options);
    const sorted = search.filter(c => c && c.syncedLyrics).sort((a, b) => {
      const da = wantedDur && a.duration ? Math.abs(a.duration - wantedDur) : 999;
      const db = wantedDur && b.duration ? Math.abs(b.duration - wantedDur) : 999;
      return da - db;
    });
    if (!sorted.length) return null;
    return parseLrclib(sorted[0]);
  }

  async function load(song, options) {
    if (!song || !song.id) return null;
    const opts = options || {};
    const key = cacheKey(song);
    if (pending.has(key)) return pending.get(key);

    const cached = readCache(song);
    if (cached) {
      notify(opts, { state: "cache", source: cached.source, granularity: cached.granularity });
      return cached;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      notify(opts, { state: "offline" });
      return null;
    }

    const request = (async () => {
      notify(opts, { state: "loading", source: PROVIDER_ORDER[0] });
      let timed = await fetchWorker(song, opts);
      if (!timed) {
        notify(opts, { state: "fallback", source: PROVIDER_ORDER[1] });
        timed = await fetchAmll(song, opts);
      }
      if (!timed) {
        notify(opts, { state: "fallback", source: PROVIDER_ORDER[2] });
        timed = await fetchLrclib(song, opts);
      }
      if (timed) {
        writeCache(song, timed);
        notify(opts, { state: "ready", source: timed.source, granularity: timed.granularity });
      } else {
        notify(opts, { state: "miss" });
      }
      return timed;
    })();

    pending.set(key, request);
    try {
      return await request;
    } finally {
      pending.delete(key);
    }
  }

  function flattenWords(lines) {
    const words = [];
    (lines || []).forEach((line) => (line.words || []).forEach((word) => {
      words.push({ ...word, sourceWord: words.length });
    }));
    return words;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function isStageDirection(rawText) {
    const t = String(rawText || "").trim();
    return /^[（(](?:間奏|尾奏|前奏|鼓聲進來|觀眾接唱)[）)]$|^（.*）$/.test(t);
  }

  function alignToLocalLyrics(timedLyrics, localLyrics) {
    if (!timedLyrics || !Array.isArray(timedLyrics.lines) || !Array.isArray(localLyrics)) return null;
    const words = flattenWords(timedLyrics.lines);
    const chars = [];
    words.forEach((word, wordIndex) => {
      Array.from(normaliseText(word.text)).forEach((char) => {
        chars.push({ char, wordIndex, start: word.start, end: word.end });
      });
    });
    const sourceText = chars.map((entry) => entry.char).join("");
    if (!sourceText) return null;

    const matches = [];
    let cursor = 0;
    localLyrics.forEach((line, index) => {
      const rawJp = line && (line.jp || line.ja);
      if (!rawJp || isStageDirection(rawJp)) return;

      const kanjiText = normaliseText(stripRuby(rawJp, "kanji"));
      if (kanjiText.length < 2) return;

      let position = sourceText.indexOf(kanjiText, cursor);
      if (position < 0) position = sourceText.indexOf(kanjiText);
      let matchedText = kanjiText;
      if (position < 0) {
        const readText = normaliseText(stripRuby(rawJp, "reading"));
        if (readText.length >= 2) {
          position = sourceText.indexOf(readText, cursor);
          if (position < 0) position = sourceText.indexOf(readText);
          if (position >= 0) matchedText = readText;
        }
      }
      if (position < 0) return;

      const first = chars[position];
      const last = chars[position + matchedText.length - 1];
      if (!first || !last) return;
      const localStart = finite(line.time ?? line.t);
      if (localStart == null) return;
      const firstWord = first.wordIndex;
      const lastWord = last.wordIndex;
      const matchedWords = words.slice(firstWord, lastWord + 1);
      if (!matchedWords.length) return;

      matches.push({
        index,
        position,
        start: first.start,
        end: Math.max(first.start + 0.04, last.end),
        localStart,
        words: matchedWords
      });
      cursor = position + matchedText.length;
    });

    const eligible = localLyrics.filter((line) => {
      const raw = line && (line.jp || line.ja);
      return raw && !isStageDirection(raw) && normaliseText(stripRuby(raw, "kanji")).length >= 2;
    }).length;
    const minimum = Math.min(3, Math.max(1, eligible));
    if (matches.length < minimum) return null;
    if (eligible >= 6 && matches.length / eligible < 0.20) return null;

    const offset = median(matches.map((match) => match.localStart - match.start));
    const aligned = Array(localLyrics.length).fill(null);
    matches.forEach((match) => {
      const lineOffset = match.localStart - match.start;
      const wordsWithOffset = match.words.map((word) => ({
        text: word.text,
        start: Math.max(0, word.start + lineOffset),
        end: Math.max(word.start + lineOffset + 0.04, word.end + lineOffset)
      }));
      aligned[match.index] = {
        start: Math.max(0, match.localStart),
        end: Math.max(match.localStart + 0.04, match.end + lineOffset),
        granularity: timedLyrics.granularity || "word",
        words: wordsWithOffset
      };
    });

    return {
      format: "timed-lyrics-v1-aligned",
      songId: null,
      source: timedLyrics.source,
      granularity: timedLyrics.granularity || "word",
      offset,
      matchedLines: matches.length,
      totalLines: eligible,
      lines: aligned
    };
  }

  function mapUnitsToWords(units, words, lineStart = 0, lineEnd = 4) {
    if (!Array.isArray(units) || !units.length) {
      return { timings: [], matchedUnits: 0, totalMeaningfulUnits: 0 };
    }

    const charStream = [];
    (words || []).forEach((w) => {
      const norm = normaliseText(w.text);
      const chars = Array.from(norm);
      if (!chars.length) return;
      const dur = Math.max(0.02, w.end - w.start);
      chars.forEach((c, idx) => {
        const cStart = w.start + (dur * idx) / chars.length;
        const cEnd = w.start + (dur * (idx + 1)) / chars.length;
        charStream.push({ char: c, start: cStart, end: cEnd, word: w });
      });
    });

    const fullCharText = charStream.map((c) => c.char).join("");
    const timings = new Array(units.length).fill(null);
    let cursor = 0;
    let matchedUnits = 0;
    let totalMeaningfulUnits = 0;

    units.forEach((u, i) => {
      let wanted = normaliseText(u && u.text);
      if (!wanted && u && u.isRuby) wanted = normaliseText(u.reading);
      if (!wanted) return;
      totalMeaningfulUnits++;

      let pos = fullCharText.indexOf(wanted, cursor);
      if (pos < 0) pos = fullCharText.indexOf(wanted);
      if (pos < 0 && u && u.isRuby) {
        const readWanted = normaliseText(u.reading);
        pos = fullCharText.indexOf(readWanted, cursor);
        if (pos < 0) pos = fullCharText.indexOf(readWanted);
        if (pos >= 0) wanted = readWanted;
      }

      if (pos >= 0) {
        const first = charStream[pos];
        const last = charStream[pos + wanted.length - 1];
        timings[i] = {
          start: first.start,
          end: Math.max(first.start + 0.02, last.end)
        };
        cursor = pos + wanted.length;
        matchedUnits++;
      }
    });

    // Interpolate whitespace / punctuation and unmatched gaps
    for (let i = 0; i < units.length; i++) {
      if (!timings[i]) {
        const prev = timings.slice(0, i).reverse().find((t) => t != null);
        const next = timings.slice(i + 1).find((t) => t != null);
        const s = prev ? prev.end : (next ? Math.max(0, next.start - 0.05) : lineStart);
        const e = next ? next.start : (prev ? prev.end + 0.05 : lineEnd);
        timings[i] = { start: s, end: Math.max(s + 0.02, e) };
      }
    }

    return { timings, matchedUnits, totalMeaningfulUnits };
  }

  return Object.freeze({
    CACHE_VERSION,
    DEFAULT_WORKER,
    AMLL_API,
    LRCLIB_API,
    PROVIDER_ORDER,
    to22Id,
    normaliseText,
    stripRuby,
    extractUnits,
    parseTime,
    normaliseWords,
    normaliseLines,
    normaliseBeautifulLyrics,
    parseTtml,
    parseEnhancedLrc,
    parseLrclib,
    load,
    alignToLocalLyrics,
    mapUnitsToWords
  });
});
