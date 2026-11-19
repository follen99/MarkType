export interface TextStats {
  words: number;
  characters: number;
  lines: number;
  /** Estimated reading time in minutes (at least 1 for non-empty text). */
  readingMinutes: number;
}

// Latin/Cyrillic/… words, plus every CJK character counted as one word.
const WORD =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const WORDS_PER_MINUTE = 230;

/** `plainText` is the visible text (no markdown syntax); `lineCount` the markdown source lines. */
export function computeStats(plainText: string, lineCount: number): TextStats {
  const words = plainText.match(WORD)?.length ?? 0;
  const characters = plainText.replace(/\s/g, '').length;
  return {
    words,
    characters,
    lines: lineCount,
    readingMinutes: words ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0,
  };
}
