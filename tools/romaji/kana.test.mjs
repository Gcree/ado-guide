import test from "node:test";
import assert from "node:assert/strict";
import { kanaToRomaji, tokensToRomaji, applyRuby } from "./kana.mjs";

test("kanaToRomaji: 基本假名、拗音、外來語音與長音", () => {
  assert.equal(kanaToRomaji("あいうえお"), "aiueo");
  assert.equal(kanaToRomaji("アイウエオ"), "aiueo");
  assert.equal(kanaToRomaji("かきくけこ"), "kakikukeko");
  assert.equal(kanaToRomaji("さしすせそ"), "sashisuseso");
  assert.equal(kanaToRomaji("たちつてと"), "tachitsuteto");
  assert.equal(kanaToRomaji("きゃきゅきょ"), "kyakyukyo");
  assert.equal(kanaToRomaji("しゃしゅしょしぇ"), "shashushoshe");
  assert.equal(kanaToRomaji("ちゃちゅちょちぇ"), "chachuchoche");
  assert.equal(kanaToRomaji("じゃじゅじょじぇ"), "jajujoje");
  assert.equal(kanaToRomaji("ファフィフェフォ"), "fafifefo");
  assert.equal(kanaToRomaji("ティディトゥドゥ"), "tiditudu");
  assert.equal(kanaToRomaji("ヴァヴィヴェヴォ"), "vavivevo");
  assert.equal(kanaToRomaji("スーパースター"), "suupaasutaa");
  assert.equal(kanaToRomaji("うっせぇわ"), "usseewa");
});

test("kanaToRomaji: ん 在母音與 y 前面加上撇號 n'", () => {
  assert.equal(kanaToRomaji("れんあい"), "ren'ai");
  assert.equal(kanaToRomaji("レンアイ"), "ren'ai");
  assert.equal(kanaToRomaji("しんえん"), "shin'en");
  assert.equal(kanaToRomaji("あんい"), "an'i");
  assert.equal(kanaToRomaji("かんう"), "kan'u");
  assert.equal(kanaToRomaji("ほんお"), "hon'o");
  assert.equal(kanaToRomaji("こんや"), "kon'ya");
  assert.equal(kanaToRomaji("しんや"), "shin'ya");
  assert.equal(kanaToRomaji("きんようび"), "kin'youbi");
  assert.equal(kanaToRomaji("ほんや"), "hon'ya");
  // 子音或詞尾不加撇號
  assert.equal(kanaToRomaji("あんない"), "annai");
  assert.equal(kanaToRomaji("でんわ"), "denwa");
  assert.equal(kanaToRomaji("かんじ"), "kanji");
  assert.equal(kanaToRomaji("しんぱい"), "shinpai");
  assert.equal(kanaToRomaji("ほん"), "hon");
});

test("kanaToRomaji: ヶ 與 ヵ 不會變成未定義的 ゖ／ゕ", () => {
  assert.equal(kanaToRomaji("ヶ"), "ka");
  assert.equal(kanaToRomaji("ヵ"), "ka");
  assert.equal(kanaToRomaji("一ヶ月"), "一ka月");
  assert.equal(kanaToRomaji("3ヵ月"), "3ka月");
  assert.ok(!kanaToRomaji("一ヶ月・三ヵ月").includes("ゖ"));
  assert.ok(!kanaToRomaji("一ヶ月・三ヵ月").includes("ゕ"));
});

test("kanaToRomaji: 促音 っ 在子音、ch、母音與詞尾的處理", () => {
  assert.equal(kanaToRomaji("きっと"), "kitto");
  assert.equal(kanaToRomaji("ロック"), "rokku");
  assert.equal(kanaToRomaji("まっちゃ"), "matcha");
  assert.equal(kanaToRomaji("こっち"), "kotchi");
  // 母音前的促音不重複母音
  assert.equal(kanaToRomaji("っあ"), "a");
  assert.equal(kanaToRomaji("あっあ"), "aa");
  assert.equal(kanaToRomaji("えっえ"), "ee");
  assert.equal(kanaToRomaji("あっ!"), "a!");
  assert.equal(kanaToRomaji("えっ"), "e");
});

test("tokensToRomaji: 助詞は／へ／を、標點與詞間黏合規則", () => {
  const tokens = [
    { surface_form: "私", pos: "名詞", reading: "ワタシ" },
    { surface_form: "は", pos: "助詞", reading: "ハ" },
    { surface_form: "最強", pos: "名詞", reading: "サイキョウ" },
    { surface_form: "へ", pos: "助詞", reading: "ヘ" },
    { surface_form: "夢", pos: "名詞", reading: "ユメ" },
    { surface_form: "を", pos: "助詞", reading: "ヲ" },
    { surface_form: "見", pos: "動詞", reading: "ミ" },
    { surface_form: "て", pos: "助詞", pos_detail_1: "接続助詞", reading: "テ" },
    { surface_form: "いる", pos: "動詞", pos_detail_1: "非自立", reading: "イル" },
    { surface_form: "！", pos: "記号", reading: "！" }
  ];
  assert.equal(tokensToRomaji(tokens), "watashi wa saikyou e yume o mite iru!");
});

test("applyRuby: 漢字括號讀音標記替換為假名", () => {
  assert.equal(applyRuby("模(かたど)る"), "かたどる");
  assert.equal(applyRuby("一ヶ月（いっかげつ）の夢"), "いっかげつの夢");
  assert.equal(applyRuby("(Two-Sided) 歌"), "(Two-Sided) 歌");
});
