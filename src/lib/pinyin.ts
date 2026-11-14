/**
 * Fold Mandarin pinyin for answer checking: tone marks, tone numbers, case,
 * and spaces are optional. Hanzi is left intact so character answers still match.
 */

const TONE_VOWEL: Record<string, string> = {
  ā: "a",
  á: "a",
  ǎ: "a",
  à: "a",
  ē: "e",
  é: "e",
  ě: "e",
  è: "e",
  ī: "i",
  í: "i",
  ǐ: "i",
  ì: "i",
  ō: "o",
  ó: "o",
  ǒ: "o",
  ò: "o",
  ū: "u",
  ú: "u",
  ǔ: "u",
  ù: "u",
  // Fold ü (and tone variants) to v before NFD, or the diaeresis is stripped to plain u.
  ǖ: "v",
  ǘ: "v",
  ǚ: "v",
  ǜ: "v",
  ü: "v",
  Ü: "v",
  Ā: "a",
  Á: "a",
  Ǎ: "a",
  À: "a",
  Ē: "e",
  É: "e",
  Ě: "e",
  È: "e",
  Ī: "i",
  Í: "i",
  Ǐ: "i",
  Ì: "i",
  Ō: "o",
  Ó: "o",
  Ǒ: "o",
  Ò: "o",
  Ū: "u",
  Ú: "u",
  Ǔ: "u",
  Ù: "u",
  Ǖ: "v",
  Ǘ: "v",
  Ǚ: "v",
  Ǜ: "v",
};

const HAS_LATIN = /[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüÜ]/u;
const HAS_HAN = /\p{Script=Han}/u;

/** True when the string looks like typed pinyin rather than Hanzi. */
export function looksLikePinyin(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || HAS_HAN.test(trimmed)) return false;
  return HAS_LATIN.test(trimmed);
}

/**
 * Normalize pinyin so tone marks, tone numbers (ni3), ü/v/u:, case, and
 * spaces all collapse to one form. Non-pinyin (Hanzi) is NFC-trimmed only.
 */
export function foldPinyin(value: string): string {
  let next = value.normalize("NFC").trim().toLocaleLowerCase("zh-CN");
  if (!next) return "";
  if (!looksLikePinyin(next)) {
    return next.replace(/\s+/g, "");
  }
  let out = "";
  for (const ch of next) {
    out += TONE_VOWEL[ch] ?? ch;
  }
  out = out.replace(/u:/g, "v").replace(/ü/g, "v");
  out = out.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
  // Tone numbers sit after a syllable vowel (ni3, hao3, lü4 / lv4).
  out = out.replace(/([aeiouv])([1-5])/gi, "$1");
  out = out.replace(/[\s'_\-]+/g, "");
  return out;
}
