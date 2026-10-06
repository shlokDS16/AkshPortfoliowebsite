import { createHash } from "node:crypto";

export function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

export function normaliseSentence(sentence: string): string {
  return sentence.replace(/\s+/g, " ").trim().toLowerCase();
}

/** The value stored in lint_allowances.sentence_hash. */
export function sentenceHash(sentence: string): string {
  return createHash("sha256").update(normaliseSentence(sentence)).digest("hex");
}
