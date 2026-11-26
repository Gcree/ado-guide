(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ADO_SHARED = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ACT_MAP = {
    sing:    { name: "大合唱",   icon: "i-sing",    how: "跟著一起唱" },
    clap:    { name: "拍手",     icon: "i-clap",    how: "跟著節拍拍手" },
    wave:    { name: "舉手揮動", icon: "i-wave",    how: "舉手左右揮" },
    jump:    { name: "跳躍",     icon: "i-jump",    how: "跟著節奏跳" },
    call:    { name: "喊聲",     icon: "i-call",    how: "跟著喊短句" },
    gesture: { name: "手勢",     icon: "i-gesture", how: "跟 Ado 做同樣的動作" },
    listen:  { name: "安靜聽",   icon: "i-listen",  how: "留給 Ado 唱" }
  };

  const PENC = {
    青: ["藍", "#5d9dfe"],
    水: ["水藍", "#5fd4ff"],
    白: ["白", "#f2efe8"],
    赤: ["紅", "#ff4a5a"],
    桃: ["粉紅", "#ff7ab8"],
    紫: ["紫", "#a374ff"],
    橙: ["橘", "#ff9a3c"],
    黄: ["黃", "#ffd84a"],
    緑: ["綠", "#4ee08a"]
  };

  const RAINBOW = [..."赤橙黄緑水青紫"];
  const PEN_ORDER = ["青", "水", "白", "赤", "桃", "紫", "橙", "黄", "緑", "彩"];
  const TIER_LABEL = { 1: "必練", 2: "跟唱・聆聽", 3: "看巡演" };

  const defaultT = (src, ...args) =>
    String(src).replace(/\{(\d+)\}/g, (m, i) => (args[i] !== undefined ? args[i] : m));
  const resolveT = T => (typeof T === "function" ? T : defaultT);

  const ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = str => String(str ?? "").replace(/[&<>"']/g, c => ESC_MAP[c]);

  const fmt = sec => {
    const n = Math.max(0, Number(sec) || 0);
    return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
  };

  function isoDuration(len) {
    if (!len) return "";
    const match = String(len).trim().match(/^(\d+):([0-5]\d)$/);
    if (!match) return "";
    return `PT${Number(match[1])}M${Number(match[2])}S`;
  }

  const isNote = txt => /^（[^）]+）$/.test(String(txt || "").trim());

  function isOffbeat(txt, T) {
    if (!txt) return false;
    const s = String(txt);
    if (s.includes("反拍")) return true;
    if (typeof T === "function") {
      const tr = T("反拍");
      return !!tr && s.includes(tr);
    }
    return false;
  }

  function penName(k, T, full = false) {
    const t = resolveT(T);
    if (k === "彩") return t("彩色");
    const entry = PENC[k];
    if (!entry) return String(k || "");
    const word = t(entry[0]);
    return full ? t("{0}色", word) : word;
  }

  function penOf(s, PEN, T) {
    if (typeof PEN === "function") {
      T = PEN;
      PEN = undefined;
    }
    const t = resolveT(T);
    const raw = s && !s.hold && PEN && PEN[s.id];
    const pen = raw && raw[0] !== "?" ? raw : "";
    const keys = [...(pen || "青")];
    const words = keys.map(k => penName(k, t));
    const none = !pen;
    const sep = t("、");
    return {
      keys,
      words,
      none,
      text: none
        ? t("藍色（未指定）")
        : keys.map(k => penName(k, t, true)).join(sep),
      shortText: none ? t("藍（未指定）") : words.join(sep),
      cols: keys.flatMap(k => (k === "彩" ? RAINBOW : [k]).map(c => (PENC[c] ? PENC[c][1] : PENC.青[1])))
    };
  }

  function penDots(s, PEN, T) {
    if (typeof PEN === "function") {
      T = PEN;
      PEN = undefined;
    }
    const t = resolveT(T);
    const p = penOf(s, PEN, t);
    const dots = p.keys
      .map(k => (k === "彩" ? '<i class="rb"></i>' : `<i style="--c:${PENC[k] ? PENC[k][1] : PENC.青[1]}"></i>`))
      .join("");
    return `<span class="dots" aria-label="${esc(t("螢光棒：") + p.shortText)}">${dots}</span>`;
  }

  function jaHTML(txt, sung = []) {
    const str = String(txt ?? "");
    const out = [];
    const re = /([\u4e00-\u9fff々〆ヵヶ]+)[(（]([\u3040-\u30ffー]+)[)）]/g;
    const hit = new Set();
    (Array.isArray(sung) ? sung : []).forEach(w => {
      if (!w) return;
      const i = str.lastIndexOf(w);
      if (i >= 0) for (let j = i; j < i + w.length; j++) hit.add(j);
    });
    // 英文、數字連在一起的字包成一組（.kw），一個單字不會被拆到兩行
    let kIndex = 0;
    let word = [];
    const flush = () => {
      if (word.length) out.push(word.length > 1 ? `<span class="kw">${word.join("")}</span>` : word[0]);
      word = [];
    };
    const k = (i, html, latin) => {
      const rot = (((kIndex * 7) % 15) - 7).toFixed(1) + "deg";
      const span = `<span class="k${hit.has(i) ? " sung" : ""}" style="--i:${kIndex++};--rot:${rot}">${html}</span>`;
      if (latin) word.push(span);
      else {
        flush();
        out.push(span);
      }
    };
    const chars = (chunk, at) => {
      for (const c of chunk) {
        k(at, esc(c), /[A-Za-z0-9'’!?,.\-]/.test(c));
        at += c.length;
      }
    };
    let last = 0;
    let m;
    while ((m = re.exec(str))) {
      chars(str.slice(last, m.index), last);
      k(m.index, `<ruby>${esc(m[1])}<rt>${esc(m[2])}</rt></ruby>`);
      last = re.lastIndex;
    }
    chars(str.slice(last), last);
    flush();
    return out.join("");
  }

  const credKey = n => String(n || "").replace(/\s*\(.*\)\s*$/, "").trim();
  const credHas = (s, part, key) =>
    !!(s && s.credit && Array.isArray(s.credit[part]) && s.credit[part].some(n => credKey(n) === key));

  function credRole(s, key, T) {
    const t = resolveT(T);
    const w = credHas(s, "w", key);
    const c = credHas(s, "c", key);
    return w && c ? t("詞曲") : w ? t("作詞") : c ? t("作曲") : credHas(s, "a", key) ? t("編曲") : "";
  }

  function relatedOf(s, SONGS, SERIES, T) {
    if (!s) return [];
    const t = resolveT(T);
    const songsList = Array.isArray(SONGS) ? SONGS : [];
    const seriesList = Array.isArray(SERIES) ? SERIES : [];
    const groups = [];
    const c = s.credit;
    if (c) {
      const names = [...(c.w || []), ...(c.c || []), ...(c.a || [])];
      const keys = [...new Set(names.map(credKey))];
      keys.forEach(key => {
        const songs = songsList.filter(
          x => x && x !== s && (!s.id || x.id !== s.id) && ["w", "c", "a"].some(p => credHas(x, p, key))
        );
        if (songs.length) {
          groups.push({
            kind: "who",
            name: names.find(n => credKey(n) === key),
            role: credRole(s, key, t),
            songs: songs.map(x => ({ s: x, role: credRole(x, key, t) }))
          });
        }
      });
    }
    const byId = new Map(songsList.map(x => [x.id, x]));
    seriesList.forEach(g => {
      if (!g || !Array.isArray(g.ids) || !g.ids.includes(s.id)) return;
      const songs = g.ids.filter(id => id !== s.id && byId.has(id)).map(id => ({ s: byId.get(id), role: "" }));
      if (songs.length) groups.push({ kind: "work", name: t(g.name), songs });
    });
    return groups;
  }

  const mainAct = acts => {
    const list = Array.isArray(acts) ? acts : [];
    return list.find(a => a !== "listen") || (list.length ? "listen" : "");
  };

  const lineAct = l => {
    if (!l) return "";
    const sing = Array.isArray(l.sing) ? l.sing : [];
    const acts = Array.isArray(l.acts) ? l.acts : [];
    return sing.length ? "sing" : mainAct(acts.filter(a => a !== "sing")) || mainAct(acts);
  };

  const defaultNamePart = (s, code) =>
    code === "ja"
      ? ""
      : code === "en"
        ? (s.en && s.en !== s.ja ? s.en : "")
        : (s.zh && s.zh !== s.ja ? s.zh : (s.en && s.en !== s.ja ? s.en : ""));

  function songInlineSummary(s, code, pen, tips, lines, T, namePart) {
    const t = resolveT(T);
    const dn = typeof namePart === "function"
      ? namePart(s, code)
      : typeof namePart === "string"
        ? namePart
        : defaultNamePart(s, code);
    const safeLines = Array.isArray(lines) ? lines : [];
    const safeTips = Array.isArray(tips) ? tips : [];
    const safePen = pen || { none: true, words: [] };
    const cheerLines = safeLines.filter(l => (l.acts || []).some(a => a !== "listen")).length;
    const actNames = (s.acts || []).filter(a => a !== "listen" && ACT_MAP[a]).map(a => t(ACT_MAP[a].name));
    const tie = s.tie ? t(s.tie) : "";
    const album = s.album ? t(s.album) : "";
    const liveNames = (s.lives || []).map(l => l.concert);
    const dateSlash = String(s.date || "").replace(/-/g, "/");
    const lenEn = s.len ? ` (${s.len})` : "";
    const lenJa = s.len ? `（${s.len}）` : "";
    const lenZh = s.len ? `（長度 ${s.len}）` : "";

    if (code === "en") {
      const leadEn = s.upcoming
        ? `Ado's "${dn || s.ja}"${dn ? ` (${s.ja})` : ""} is scheduled for cover album release on ${s.date}${lenEn}${tie ? `, featured in ${tie}` : ""}${album ? `, included on "${album}"` : ""}.`
        : `Ado's "${dn || s.ja}"${dn ? ` (${s.ja})` : ""} was released on ${s.date}${lenEn}${s.cover ? " as a cover track" : ""}${tie ? `, featured in ${tie}` : ""}${album ? `, and included on "${album}"` : ""}.`;
      const parts = [
        leadEn,
        safePen.none
          ? "No live penlight color on record yet: leave it to central control if the venue uses it, otherwise follow the stage lighting or the crowd."
          : `Recommended concert penlight color: ${(safePen.words || []).join(", ")}.`,
        safeTips.length
          ? `Main audience participation${actNames.length ? ` (${actNames.join(", ")})` : ""}${cheerLines ? ` across ${cheerLines} cued lyric lines` : ""}: ${safeTips.join("; ")}.`
          : (s.free
            ? "There is no fixed chant or clap routine for this track—sway your penlight naturally to the beat and enjoy Ado's vocals."
            : s.upcoming
              ? "This track has not been released yet; official MV, audio, and chant cues will be updated after release."
              : "Confirmed live chant cues for this track are still being documented; practice along with the official MV and synced lyrics above."),
        liveNames.length ? `Official live audio/video releases are also available (${liveNames.join(", ")}).` : ""
      ];
      return parts.filter(Boolean).join(" ");
    }
    if (code === "ja") {
      const leadJa = s.upcoming
        ? `「${s.ja}」は ${dateSlash} リリース予定の Ado の${s.cover ? "カバー" : ""}楽曲${lenJa}です${tie ? `。タイアップ：${tie}` : ""}${album ? `${tie ? "、" : "。"}収録：${album}` : ""}。`
        : `「${s.ja}」は ${dateSlash} に公開された Ado の楽曲${lenJa}です${s.cover ? "（カバー曲）" : ""}${tie ? `。タイアップ：${tie}` : ""}${album ? `${tie ? "、" : "。"}収録：${album}` : ""}。`;
      const parts = [
        leadJa,
        safePen.none
          ? "ライブでのペンライト色の情報はまだありません。無線制御があればそのままで、なければステージの照明や周りに合わせましょう。"
          : `ライブのおすすめペンライト色は「${(safePen.words || []).join("・")}」です。`,
        safeTips.length
          ? `主な応援ポイント${actNames.length ? `（${actNames.join("・")}）` : ""}${cheerLines ? `（同期歌詞 ${cheerLines} 行に合図あり）` : ""}：${safeTips.join("／")}。`
          : (s.free
            ? "この曲は固定のコールや手拍子の決まりがなく、リズムに合わせて自由にペンライトを振りながら Ado の歌声を聴くスタイルです。"
            : s.upcoming
              ? "この曲は未公開のため、リリース後に公式動画・音源やライブ応援情報を更新予定です。"
              : "この曲のライブ応援はまだ情報整理中のため、まずは公式MVと同期歌詞でメロディーを予習しておくのがおすすめです。"),
        liveNames.length ? `公式ライブ音源・映像（${liveNames.join("・")}）も公開されています。` : ""
      ];
      return parts.filter(Boolean).join(" ");
    }
    const leadZh = s.upcoming
      ? `〈${s.ja}〉${dn ? `（${dn}）` : ""}是 Ado 預計於 ${dateSlash} 發行的翻唱專輯曲目${lenZh}${tie ? `，為${tie}` : ""}${album ? `，收錄於${album.startsWith("《") ? album : `《${album}》`}` : ""}。`
      : `〈${s.ja}〉${dn ? `（${dn}）` : ""}是 Ado 於 ${dateSlash} 推出的${s.cover ? "翻唱" : ""}歌曲${lenZh}${tie ? `，為${tie}` : ""}${album ? `，收錄於${album.startsWith("《") ? album : `《${album}》`}` : ""}。`;
    const parts = [
      leadZh,
      safePen.none
        ? "本站還沒有這首的現場手燈色資料：有開中控就交給中控，沒有的話跟著舞台燈光或周圍觀眾。"
        : `演唱會推薦手燈顏色為「${(safePen.words || []).join("、")}」，也可搭配 PenlightSync 隨音樂自動變色。`,
      safeTips.length
        ? `主要應援方式包含${actNames.join("、")}${cheerLines ? `（共 ${cheerLines} 句標記動作）` : ""}：${safeTips.join("；")}。`
        : (s.free
          ? "這首歌沒有固定喊聲或拍手口號，現場可依節奏輕鬆揮動手燈、專心聆聽 Ado 的演唱。"
          : s.upcoming
            ? "這首曲目尚未正式發行，待官方釋出音源或影片後將補充歌詞與應援資訊。"
            : "這首歌的現場固定應援仍在蒐集確認中，建議先搭配官方 MV 與上方同步歌詞熟悉旋律與斷句。"),
      liveNames.length ? `目前已釋出官方演唱會現場紀錄（${liveNames.join("、")}），可切換 Live 版本對照現場氣氛。` : ""
    ];
    return parts.filter(Boolean).join("");
  }

  return {
    ACT_MAP,
    PENC,
    RAINBOW,
    PEN_ORDER,
    TIER_LABEL,
    esc,
    fmt,
    isoDuration,
    isNote,
    isOffbeat,
    penName,
    penOf,
    penDots,
    jaHTML,
    credKey,
    credHas,
    credRole,
    relatedOf,
    mainAct,
    lineAct,
    songInlineSummary
  };
});
