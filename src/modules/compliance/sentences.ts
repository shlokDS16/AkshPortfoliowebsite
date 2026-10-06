// Client-safe (no node imports): the sentence splitter and normaliser are shared with the editor UI.
// The hash lives in hash.ts, which is server-only.

// Lines that open a new Markdown block. A list item or quote may wrap onto following plain lines.
const BLOCK_START = /^\s*(?:[-*+]\s|\d+[.)]\s|>)/;
// Headings and table rows are always a block of their own line.
const SINGLE_LINE_BLOCK = /^\s*(?:#{1,6}(?:\s|$)|\|)/;

const NUMBERED_PREFIX = /^\s*\d+[.)]\s+/;

/** Splits one block at sentence ends, keeping a "1. " list number attached to its item. */
function splitBlock(block: string): string[] {
  const prefix = NUMBERED_PREFIX.exec(block)?.[0] ?? "";
  const [first = "", ...rest] = block.slice(prefix.length).split(/(?<=[.!?])\s+/);
  return [prefix + first, ...rest];
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
