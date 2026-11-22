// Does a guess count as the right title? Two steps:
//   1. normalize both: ignore case, punctuation and spaces
//   2. compare with edit distance: allow a few typos, more for longer titles

// Keeps only letters (from any language) and digits, lowercased.
// \p{L} = any letter, \p{N} = any digit; the `u` flag makes \p{...} work.
// NFC first, so "é" typed as one character or as "e" + accent is the same.
export function normalizeTitle(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

// The fewest single-letter edits that turn `a` into `b`. An edit is: add a
// letter, remove one, change one, or swap two neighbours ("rhapsdoy" ->
// "rhapsody" is one typo, not two). This is the "optimal string alignment"
// distance, a small extension of the classic Levenshtein distance.
//
// How: table[i][j] = edits needed between the first i letters of a and the
// first j letters of b. Each cell is built from cells already filled in.
export function editDistance(a: string, b: string): number {
  const x = [...a]; // [...text] splits by character (safe for ł, é, emoji)
  const y = [...b];
  const table: number[][] = [];
  for (let i = 0; i <= x.length; i++) {
    table.push([i]); // turning i letters into "" takes i removals
  }
  for (let j = 1; j <= y.length; j++) {
    table[0][j] = j; // turning "" into j letters takes j additions
  }
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const change = x[i - 1] === y[j - 1] ? 0 : 1;
      table[i][j] = Math.min(
        table[i - 1][j] + 1, // remove a letter
        table[i][j - 1] + 1, // add a letter
        table[i - 1][j - 1] + change, // keep or change a letter
      );
      const swapped = i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1];
      if (swapped) {
        table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1);
      }
    }
  }
  return table[x.length][y.length];
}

// Longer titles forgive more typos. Short ones must be exact: "love" and
// "lose" are one edit apart but different words.
export function allowedTypos(answerLength: number): number {
  if (answerLength < 5) return 0;
  if (answerLength < 10) return 1;
  return 2;
}

export function titlesMatch(guess: string, answer: string): boolean {
  const normalizedGuess = normalizeTitle(guess);
  const normalizedAnswer = normalizeTitle(answer);
  if (normalizedGuess === '') {
    return false;
  }
  const typos = editDistance(normalizedGuess, normalizedAnswer);
  return typos <= allowedTypos([...normalizedAnswer].length);
}
