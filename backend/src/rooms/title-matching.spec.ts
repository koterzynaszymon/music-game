import { describe, it, expect } from 'vitest';
import { allowedTypos, editDistance, normalizeTitle, titlesMatch } from './title-matching.js';

// Pure functions (text in, answer out): no service, no room, no Redis needed.

describe('normalizeTitle', () => {
  // The idea: keep only what makes a title a title (letters and digits),
  // drop everything people type differently (case, punctuation, spaces)
  it.each([
    ["That's Life", 'thatslife'], // apostrophe
    ['That’s Life', 'thatslife'], // the curly apostrophe phones type
    ["Don't Stop Me Now!", 'dontstopmenow'],
    ['Hi-Fi', 'hifi'], // hyphen
    ['"Heroes"', 'heroes'], // quotes
    ['Mr. Brightside', 'mrbrightside'], // dot
    ['Hello, Goodbye', 'hellogoodbye'], // comma
    ['  hey   jude ', 'heyjude'], // spaces anywhere
    ['99 Luftballons', '99luftballons'], // digits are kept
  ])('%j -> %j', (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });

  it('keeps letters from any language (only punctuation goes, not é or ł)', () => {
    expect(normalizeTitle('Beyoncé')).toBe('beyoncé');
    expect(normalizeTitle('Żółć')).toBe('żółć');
  });

  it('a title made only of punctuation becomes empty', () => {
    expect(normalizeTitle('!!! ...')).toBe('');
  });
});

describe('editDistance (how many single-letter edits turn one text into the other)', () => {
  it.each([
    ['life', 'life', 0],
    ['rapsody', 'rhapsody', 1], // one letter missing
    ['rhapsodyy', 'rhapsody', 1], // one letter too many
    ['rhapsady', 'rhapsody', 1], // one letter wrong
    ['rhapsdoy', 'rhapsody', 1], // two neighbours swapped: ONE typo, not two
    ['efil', 'life', 3], // same letters, wrong order: 3 edits, far from a match
    ['', 'abc', 3],
  ])('%j vs %j = %i', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected);
  });
});

describe('allowedTypos (longer titles forgive more)', () => {
  // Short titles get none: "love" vs "lose" is one edit, but a different word
  it.each([
    [1, 0],
    [4, 0],
    [5, 1],
    [9, 1],
    [10, 2],
    [30, 2],
  ])('a %i-character answer allows %i typo(s)', (length, expected) => {
    expect(allowedTypos(length)).toBe(expected);
  });
});

describe('titlesMatch', () => {
  // --- the request: punctuation doesn't matter ---
  it("'thats life' matches \"That's Life\"", () => {
    expect(titlesMatch('thats life', "That's Life")).toBe(true);
  });
  it("and the other way round: \"that's life\" matches 'Thats Life'", () => {
    expect(titlesMatch("that's life", 'Thats Life')).toBe(true);
  });
  it("'hi fi' matches 'Hi-Fi' (spaces are ignored too)", () => {
    expect(titlesMatch('hi fi', 'Hi-Fi')).toBe(true);
  });

  // --- small typos ---
  it("'bohemian rapsody' matches 'Bohemian Rhapsody' (1 typo)", () => {
    expect(titlesMatch('bohemian rapsody', 'Bohemian Rhapsody')).toBe(true);
  });
  it("'bohemain rapsody' matches 'Bohemian Rhapsody' (2 typos, long title)", () => {
    expect(titlesMatch('bohemain rapsody', 'Bohemian Rhapsody')).toBe(true);
  });
  it("'bohemain rapsodi' does NOT match (3 typos is too many)", () => {
    expect(titlesMatch('bohemain rapsodi', 'Bohemian Rhapsody')).toBe(false);
  });
  it("'lose' does NOT match 'Love' (short titles must be exact)", () => {
    expect(titlesMatch('lose', 'Love')).toBe(false);
  });

  // --- clearly wrong guesses ---
  it('a different song does not match', () => {
    expect(titlesMatch('yesterday', 'Bohemian Rhapsody')).toBe(false);
  });
  it('a guess with no letters at all does not match', () => {
    expect(titlesMatch('!!!', 'Life')).toBe(false);
  });
  it('only part of the title does not match', () => {
    expect(titlesMatch('bohemian', 'Bohemian Rhapsody')).toBe(false);
  });
});
