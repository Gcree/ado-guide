(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ADO_SETLIST = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const STORAGE_KEY = "practice-setlist";
  const QUIZ_BEST_KEY = "quiz-best";

  function isValidId(id, validIdSet) {
    if (typeof id !== "string" || !id) return false;
    if (validIdSet == null) return true;
    if (typeof validIdSet.has === "function") return validIdSet.has(id);
    if (Array.isArray(validIdSet)) return validIdSet.includes(id);
    if (typeof validIdSet === "object") return Object.prototype.hasOwnProperty.call(validIdSet, id);
    return false;
  }

  function dedupeIds(list, validIdSet) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const id = raw.trim();
      if (!id || seen.has(id) || !isValidId(id, validIdSet)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function readStorage(storage, key) {
    if (!storage) return null;
    try {
      if (typeof storage.get === "function") return storage.get(key);
      if (typeof storage.getItem === "function") return storage.getItem(key);
    } catch (e) {}
    return null;
  }

  function parseListHash(hash, validIdSet) {
    if (typeof hash !== "string") return null;
    const m = hash.match(/^#?list=([^@?#]+)/);
    if (!m) return null;
    return dedupeIds(m[1].split(","), validIdSet);
  }

  function formatListHash(ids) {
    const clean = dedupeIds(ids);
    return "#list=" + clean.join(",");
  }

  function loadSetlist(storage, validIdSet) {
    const raw = readStorage(storage, STORAGE_KEY);
    if (!raw || typeof raw !== "string") return [];
    try {
      const parsed = JSON.parse(raw);
      return dedupeIds(parsed, validIdSet);
    } catch (e) {
      return [];
    }
  }

  function saveSetlist(storage, ids) {
    const clean = dedupeIds(ids);
    if (!storage) return clean;
    try {
      if (ids == null) {
        if (typeof storage.set === "function") storage.set(STORAGE_KEY, null);
        else if (typeof storage.removeItem === "function") storage.removeItem(STORAGE_KEY);
        return clean;
      }
      const serialized = JSON.stringify(clean);
      if (typeof storage.set === "function") storage.set(STORAGE_KEY, serialized);
      else if (typeof storage.setItem === "function") storage.setItem(STORAGE_KEY, serialized);
    } catch (e) {}
    return clean;
  }

  function toggleSetlistId(ids, id) {
    const clean = dedupeIds(ids);
    if (typeof id !== "string" || !id.trim()) return { ids: clean, added: false };
    const target = id.trim();
    const idx = clean.indexOf(target);
    if (idx >= 0) {
      return { ids: clean.filter(x => x !== target), added: false };
    }
    return { ids: [...clean, target], added: true };
  }

  function gradeOf(score) {
    const n = Number(score);
    return n >= 95 ? "S" : n >= 85 ? "A" : n >= 70 ? "B" : n >= 50 ? "C" : "D";
  }

  function loadQuizBest(storage) {
    const raw = readStorage(storage, QUIZ_BEST_KEY);
    if (!raw || typeof raw !== "string") return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const out = {};
      for (const id of Object.keys(parsed)) {
        if (id === "__proto__" || id === "constructor" || id === "prototype") continue;
        const entry = parsed[id];
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        if (typeof entry.score !== "number" || !Number.isFinite(entry.score)) continue;
        const rate = typeof entry.rate === "number" && Number.isFinite(entry.rate) && entry.rate > 0 ? entry.rate : 1;
        out[id] = { score: entry.score, rate };
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function computeMastery(best, freqIds) {
    const map = best && typeof best === "object" && !Array.isArray(best) ? best : {};
    const ids = Array.isArray(freqIds) ? freqIds : [];
    let completed = 0;
    let mastered = 0;
    for (const id of ids) {
      const entry = Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
      if (entry && typeof entry === "object" && typeof entry.score === "number" && Number.isFinite(entry.score)) {
        completed++;
        if (entry.score >= 85) mastered++;
      }
    }
    return { completed, mastered, total: ids.length };
  }

  return {
    STORAGE_KEY,
    QUIZ_BEST_KEY,
    parseListHash,
    formatListHash,
    loadSetlist,
    saveSetlist,
    toggleSetlistId,
    gradeOf,
    loadQuizBest,
    computeMastery
  };
});
