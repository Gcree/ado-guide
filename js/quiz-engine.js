(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ADO_QUIZ = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const QZ_WIN = Object.freeze({ beat: [0.08, 0.16], onset: [0.15, 0.35] });
  const QZ_POINT = Object.freeze({ perfect: 1, good: 0.6, miss: 0 });
  const DEFAULT_ACT_NAMES = {
    sing: "大合唱",
    clap: "拍手",
    wave: "舉手揮動",
    jump: "跳躍",
    call: "喊聲",
    gesture: "手勢",
    listen: "安靜聽"
  };

  function defaultIsOffbeat(txt) {
    if (!txt) return false;
    const s = String(txt);
    const low = s.toLowerCase();
    return s.includes("反拍") || low.includes("offbeat") || low.includes("off-beat");
  }

  function mainAct(acts) {
    const list = Array.isArray(acts) ? acts : [];
    return list.find(a => a !== "listen") || (list.length ? "listen" : "");
  }

  function quizAct(l, isOffbeat) {
    if (!l) return "";
    const offFn = typeof isOffbeat === "function" ? isOffbeat : defaultIsOffbeat;
    const call = l.call || "";
    const sing = Array.isArray(l.sing) ? l.sing : [];
    const acts = Array.isArray(l.acts) ? l.acts.filter(a => a !== "listen") : [];
    if (offFn(call)) return "clap";
    if (sing.length) return "sing";
    if (call && acts.includes("call")) return "call";
    return mainAct(acts);
  }

  function cueLabelOf(l, actMap) {
    if (l.call) return l.call;
    if (l.sing.length) return `唱「${l.sing.join("」「")}」`;
    return l.acts
      .map(a => (actMap && actMap[a] && actMap[a].name) || DEFAULT_ACT_NAMES[a] || a)
      .join("、");
  }

  function buildTargets({ lines = [], beat = null, dur = 0, isOffbeat, lineEnd, actMap } = {}) {
    if (!Array.isArray(lines) || !lines.length) return [];
    const offFn = typeof isOffbeat === "function" ? isOffbeat : defaultIsOffbeat;
    const norm = lines.map(item => ({
      t: item && item.t != null ? Number(item.t) || 0 : Number(item && item.time) || 0,
      dur:
        item && item.dur != null && Number(item.dur) > 0
          ? Number(item.dur)
          : item && item.duration != null && Number(item.duration) > 0
            ? Number(item.duration)
            : null,
      acts: item && Array.isArray(item.acts) ? item.acts.filter(a => a !== "listen") : [],
      sing: item && Array.isArray(item.sing) ? item.sing : [],
      call: item && item.call ? String(item.call) : null
    }));

    const endAt = idx => {
      if (typeof lineEnd === "function") return lineEnd(idx);
      const cur = norm[idx];
      if (!cur) return dur || 0;
      const fallback = dur > cur.t ? dur : (cur.dur != null ? cur.t + cur.dur : cur.t + 4);
      const next = norm[idx + 1] ? norm[idx + 1].t : fallback;
      return cur.dur != null ? Math.min(next, cur.t + cur.dur) : next;
    };

    const sig = l => l.acts.join(",") + cueLabelOf(l, actMap);
    const out = [];
    const hasBeat = Array.isArray(beat) && beat.length >= 2 && Number(beat[0]) > 0;
    const bpm = hasBeat ? Number(beat[0]) : 0;
    const beatOffset = hasBeat ? Number(beat[1]) || 0 : 0;

    for (let i = 0; i < norm.length; i++) {
      const l = norm[i];
      if (!l.acts.length) continue;
      let j = i;
      while (
        norm[j + 1] &&
        norm[j + 1].acts.length &&
        sig(norm[j + 1]) === sig(l) &&
        Math.abs(endAt(j) - norm[j + 1].t) < 0.05
      ) {
        j++;
      }
      const end = endAt(j);
      const act = quizAct(l, offFn);
      const off = offFn(l.call);
      const label = cueLabelOf(l, actMap);
      let n = 0;

      if (hasBeat && act === "clap") {
        const P = 60 / bpm;
        for (let k = Math.ceil((l.t - 0.1 - beatOffset) / P); beatOffset + k * P < end - 0.05; k++) {
          const bar = ((k % 4) + 4) % 4;
          if (off && bar !== 1 && bar !== 3) continue;
          out.push({
            t: beatOffset + k * P,
            act,
            kind: "beat",
            label,
            win: [...QZ_WIN.beat],
            idx: out.length,
            done: false,
            result: null,
            res: null
          });
          n++;
        }
      }

      if (!n) {
        out.push({
          t: l.t,
          act,
          kind: "onset",
          label,
          win: [...QZ_WIN.onset],
          idx: out.length,
          done: false,
          result: null,
          res: null
        });
      }
      i = j;
    }

    return out;
  }

  function judgeTap({ targets = [], t = 0, rate = 1 } = {}) {
    if (!Array.isArray(targets) || !targets.length) {
      return { hit: null, kind: "stray", delta: null };
    }
    const safeRate = typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : 1;
    let hit = null;
    let bestDist = Infinity;
    let hitPerfWin = 0;

    for (const tg of targets) {
      if (!tg || tg.done || tg.res || tg.result) continue;
      const baseWin = Array.isArray(tg.win) && tg.win.length >= 2
        ? tg.win
        : (QZ_WIN[tg.kind] || QZ_WIN.onset);
      const goodWin = baseWin[1] * safeRate;
      const d = Math.abs(t - tg.t);
      if (d <= goodWin && d < bestDist) {
        bestDist = d;
        hit = tg;
        hitPerfWin = baseWin[0] * safeRate;
      }
    }

    if (!hit) {
      return { hit: null, kind: "stray", delta: null };
    }

    return {
      hit,
      kind: bestDist <= hitPerfWin ? "perfect" : "good",
      delta: t - hit.t
    };
  }

  function gradeOf(score) {
    const n = Number(score);
    return n >= 95 ? "S" : n >= 85 ? "A" : n >= 70 ? "B" : n >= 50 ? "C" : "D";
  }

  function summarizeQuiz({ targets = [], perfect, good, miss, extra = 0 } = {}) {
    const list = Array.isArray(targets) ? targets : [];
    let cPerf = 0;
    let cGood = 0;
    let cMiss = 0;
    let cSkip = 0;
    const per = {};

    for (const tg of list) {
      if (!tg) continue;
      const st = tg.result || tg.res || null;
      if (st === "perfect") cPerf++;
      else if (st === "good") cGood++;
      else if (st === "miss") cMiss++;
      else if (st === "skip" || st === "skipped") cSkip++;
      if (st && st !== "skip" && st !== "skipped" && tg.act) {
        const entry = per[tg.act] || (per[tg.act] = { hit: 0, total: 0 });
        entry.total++;
        if (st !== "miss") entry.hit++;
      }
    }

    const p = typeof perfect === "number" ? perfect : cPerf;
    const g = typeof good === "number" ? good : cGood;
    const m = typeof miss === "number" ? miss : cMiss;
    const ex = typeof extra === "number" ? extra : 0;
    const judged = p + g + m;
    const total = list.length ? Math.max(judged, list.length - cSkip) : judged;
    const score = judged
      ? Math.round(((p * QZ_POINT.perfect + g * QZ_POINT.good + m * QZ_POINT.miss) / judged) * 100)
      : 0;

    return {
      score,
      grade: gradeOf(score),
      total,
      skipped: cSkip,
      judged,
      perfect: p,
      good: g,
      miss: m,
      extra: ex,
      per
    };
  }

  return {
    QZ_WIN,
    QZ_POINT,
    quizAct,
    buildTargets,
    judgeTap,
    summarizeQuiz,
    gradeOf
  };
});
