import "server-only";
import { createHash } from "node:crypto";
import { normaliseSentence } from "./sentences";

/**
 * The value stored in lint_allowances.sentence_hash: sha256 of the sentence AS TYPED (whitespace-collapsed,
 * lower-cased), deliberately not of the lexicon-folded text. Folding (confusables, hyphen joins) would let
 * an allowance granted to one spelling silently cover a different one; whitespace changes, including
 * re-wrapping a line, are harmless. Rule 1 only; see lint.ts.
 */
/** sha256 hex of text as UTF-8: the transcript hash, equal to what migration 0022's insert trigger computes over the segment texts joined by "\n". */
export function textSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sentenceHash(sentence: string): string {
  return createHash("sha256").update(normaliseSentence(sentence)).digest("hex");
}
