// Zero-width space, non-joiner, joiner, word joiner and byte-order mark.
const ZERO_WIDTH = /[​-‍⁠﻿]/g;
// `\s` also matches line/paragraph separators (U+2028/U+2029) and NBSP, which
// render as nothing visible in a title input and can't be selected by hand.
const WHITESPACE_RUN = /\s+/g;

/** Removes invisible characters, collapses whitespace runs to one space and trims. */
export function normalizeTitle(title: string): string {
  return title.replace(ZERO_WIDTH, '').replace(WHITESPACE_RUN, ' ').trim();
}
