import { createHash } from "node:crypto";

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/** Whitespace-collapsed, lower-cased. Only whitespace and case are forgiven when matching an allowance. */
export function normaliseSentence(sentence: string): string {
  return sentence.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The value stored in lint_allowances.sentence_hash: sha256 of the sentence AS TYPED (whitespace-collapsed,
 * lower-cased), deliberately not of the lexicon-folded text. Folding (confusables, hyphen joins) would let
 * an allowance granted to one spelling silently cover a different one; whitespace changes are harmless.
 * Rule 1 only; see lint.ts.
 */
export function sentenceHash(sentence: string): string {
  return createHash("sha256").update(normaliseSentence(sentence)).digest("hex");
}
