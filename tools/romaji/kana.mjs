// 假名轉羅馬拼音（Hepburn，歌詞常見寫法：長音照假名寫成 ou／uu，不加長音符號）
// 給 tools/romaji/romaji.mjs 用；斷詞與讀音由 kuromoji 提供，這裡只處理「讀音假名 → 羅馬字」與詞之間的空格

const BASE = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o", ゃ: "ya", ゅ: "yu", ょ: "yo", ゎ: "wa"
};
// 兩個假名一組的音（拗音、外來語音）
const PAIR = {};
const YOON = { き: "ky", ぎ: "gy", に: "ny", ひ: "hy", び: "by", ぴ: "py", み: "my", り: "ry", し: "sh", じ: "j", ち: "ch", ぢ: "j" };
for (const [k, c] of Object.entries(YOON)) {
  PAIR[k + "ゃ"] = c + "a"; PAIR[k + "ゅ"] = c + "u"; PAIR[k + "ょ"] = c + "o";
  if (["し", "じ", "ち"].includes(k)) PAIR[k + "ぇ"] = c + "e";
}
Object.assign(PAIR, {
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo", ふゅ: "fyu",
  てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du", てゅ: "tyu", でゅ: "dyu",
  うぃ: "wi", うぇ: "we", うぉ: "wo", いぇ: "ye", つぁ: "tsa", つぃ: "tsi", つぇ: "tse", つぉ: "tso",
  ゔぁ: "va", ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo", くぁ: "kwa", ぐぁ: "gwa"
});

const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

export function kanaToRomaji(kana) {
  const s = toHira(kana);
  let out = "", i = 0, sokuon = false;
  while (i < s.length) {
    const two = s.slice(i, i + 2), one = s[i];
    let r = null, step = 1;
    if (PAIR[two]) { r = PAIR[two]; step = 2; }
    else if (BASE[one] !== undefined) r = BASE[one];
    if (one === "っ" || one === "ッ") { sokuon = true; i++; continue; }
    if (one === "ー") { const m = out.match(/[aeiou]$/); out += m ? m[0] : ""; i++; continue; }
    if (r === null) { // 不是假名：英文字母、數字、符號照抄
      if (sokuon) sokuon = false;
      out += one; i++; continue;
    }
    if (sokuon) { out += r.startsWith("ch") ? "t" : r[0]; sokuon = false; }
    out += r; i += step;
  }
  return out;
}

const PUNCT = { "、": ",", "。": ".", "！": "!", "？": "?", "，": ",", "．": ".", "～": "~", "〜": "~", "…": "...", "・": " ", "　": " ", "「": "", "」": "", "『": "", "』": "", "（": "(", "）": ")", "：": ":", "；": ";", "♪": "♪" };

// 詞要不要黏在前一個詞後面（助動詞、接續助詞「て／で／ば」、接尾、補助動詞），其餘用空格隔開
function glue(t, prev) {
  if (!prev) return false;
  if (t.pos === "記号") return true;
  if (t.pos === "助動詞") return true;
  if (t.pos === "助詞" && t.pos_detail_1 === "接続助詞" && ["て", "で", "ば"].includes(t.surface_form)) return true;
  if (t.pos_detail_1 === "接尾") return true;
  if (t.pos === "動詞" && t.pos_detail_1 === "非自立" && prev.surface_form && /[てで]$/.test(prev.surface_form)) return false;
  return false;
}

// tokens：kuromoji 的斷詞結果
export function tokensToRomaji(tokens) {
  const parts = [];
  let prev = null;
  for (const t of tokens) {
    const surf = t.surface_form;
    if (/^[\s　]+$/.test(surf)) { parts.push(" "); prev = null; continue; }
    let r;
    if (PUNCT[surf] !== undefined) r = PUNCT[surf];
    else if (/^[\x00-\x7f]+$/.test(surf)) r = surf; // 英文照抄
    else if (t.pos === "助詞" && surf === "は") r = "wa";
    else if (t.pos === "助詞" && surf === "へ") r = "e";
    else if (t.pos === "助詞" && surf === "を") r = "o";
    else {
      const reading = t.reading && t.reading !== "*" ? t.reading : surf;
      r = kanaToRomaji(reading);
    }
    const sticky = glue(t, prev) || (PUNCT[surf] !== undefined && /^[,.!?~):;]/.test(r));
    if (parts.length && !sticky && parts[parts.length - 1] !== " ") parts.push(" ");
    parts.push(r);
    prev = t;
  }
  return parts.join("").replace(/\s+/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/\(\s+/g, "(").trim();
}

// 歌詞裡「漢字(かな)」的讀音標記：先換成假名再斷詞，特殊讀音才不會被字典讀錯
export const applyRuby = txt => txt.replace(/([一-鿿々〆ヵヶ]+)[(（]([぀-ヿー]+)[)）]/g, "$2");
