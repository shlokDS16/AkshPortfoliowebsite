// Chromium's PDF text layer, read back with unpdf, is not stable about spaces: on Linux fonts it puts one inside a word ("LEAR NING NO").
// So the print specs compare with every whitespace character removed on both sides. Nothing here touches the product.

/** The text with all whitespace removed. */
export const squash = (s: string): string => s.replace(/\s+/g, "");

/** Escapes a literal for use inside a RegExp. */
export const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A literal phrase as a regex source that matches it with its whitespace removed. */
export const literal = (phrase: string): string => escapeRe(squash(phrase));

/** A regex source written with ordinary spaces, as a regex source that matches whitespace-free text. */
export const squashedSource = (source: string): string => source.replace(/\s+/g, "");

/** A date as the pages print it, "4 Oct 2026", whitespace removed. */
export const DATE_SQUASHED = "\\d{1,2}[A-Z][a-z]{2}\\d{4}";

/** True when `phrase` is in `text` with whitespace ignored on both sides, so a split word cannot slip past. */
export const containsSquashed = (text: string, phrase: string): boolean => squash(text).includes(squash(phrase));
