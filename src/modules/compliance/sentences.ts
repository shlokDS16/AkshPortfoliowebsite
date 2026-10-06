// Client-safe (no node imports): the sentence splitter and normaliser are shared with the editor UI.
// The hash lives in hash.ts, which is server-only.

// Lines that open a new Markdown block. A list item or quote may wrap onto following plain lines.
const BLOCK_START = /^\s*(?:[-*+]\s|\d+[.)]\s|>)/;
// Headings and table rows are always a block of their own line.
const SINGLE_LINE_BLOCK = /^\s*(?:#{1,6}(?:\s|$)|\|)/;

const NUMBERED_PREFIX = /^\s*\d+[.)]\s+/;

// A full stop after one of these does not end a sentence ("Rs. 2,400", "Ltd. reported", "Sl. No. 1").
// Case-insensitive group first, then ambiguous short words that count only when capitalised.
const ABBREVIATION = /^(?:rs|approx|vs|viz|etc|e\.g|i\.e)\.$/i;
const CAPITALISED_ABBREVIATION = /^(?:No|Nos|Sl|Ltd|Pvt|Co|Corp|Inc|Mr|Mrs|Ms|Dr|St|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/;
const INITIAL = /^[A-Z]\.$/;

function endsWithAbbreviation(piece: string): boolean {
  // The last whitespace-delimited token, whatever the whitespace (space, tab, NBSP).
  const token = (/\S+$/.exec(piece)?.[0] ?? "").replace(/^[("'[]+/, "");
  return ABBREVIATION.test(token) || CAPITALISED_ABBREVIATION.test(token) || INITIAL.test(token);
}

/**
 * Splits one block at sentence ends, except after an abbreviation or single initial, and keeps a "1. "
 * list number attached to its item. Decimals ("2.5x", "2,400.50") never split: no whitespace follows the dot.
 */
function splitBlock(block: string): string[] {
  const prefix = NUMBERED_PREFIX.exec(block)?.[0] ?? "";
  const sentences: string[] = [];
  let open: string[] = [];
  for (const piece of block.slice(prefix.length).split(/(?<=[.!?])\s+/)) {
    open.push(piece);
    if (!endsWithAbbreviation(piece)) {
      sentences.push(open.join(" "));
      open = [];
    }
  }
  if (open.length > 0) sentences.push(open.join(" "));
  if (sentences.length > 0) sentences[0] = prefix + sentences[0];
  return sentences;
}

/**
 * Splits text into sentences. Single newlines are soft wraps (a phrase may wrap mid-phrase: "My target\nprice"),
 * so they join with a space; blocks break only at blank lines and at lines that start a Markdown block.
 * Each returned sentence has its soft wraps replaced by single spaces.
 */
export function splitSentences(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) blocks.push(current.join(" "));
    current = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") {
      flush();
    } else if (SINGLE_LINE_BLOCK.test(line)) {
      flush();
      blocks.push(line);
    } else {
      if (BLOCK_START.test(line)) flush();
      current.push(line);
    }
  }
  flush();
  return blocks
    .flatMap(splitBlock)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Whitespace-collapsed, lower-cased. Only whitespace and case are forgiven when matching an allowance. */
export function normaliseSentence(sentence: string): string {
  return sentence.replace(/\s+/g, " ").trim().toLowerCase();
}
