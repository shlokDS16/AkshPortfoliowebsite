import { splitSentences } from "@/modules/compliance";
import { diffRevisions } from "@/modules/research";
import { inlineText, parseProse, splitThesisBody } from "./body";

export type SentenceDiffGroup = { location: string; removed: string[]; added: string[] };
type Located = { location: string; sentence: string };

// Sentences are Aksh's words: only [F1] tokens are removed (inlineText), splitSentences cuts at sentence ends,
// and nothing is re-cased, re-spaced or trimmed inside a sentence.
function locate(md: string): Located[] {
  const { viewMd, conditions } = splitThesisBody(md);
  const out: Located[] = [];
  parseProse(viewMd)
    .filter((b) => b.kind === "p")
    .forEach((b, i) => {
      if (b.kind !== "p") return;
      for (const s of splitSentences(inlineText(b.inline))) out.push({ location: `Aksh's view, paragraph ${i + 1}`, sentence: s });
    });
  for (const c of conditions) out.push({ location: "I would be wrong if", sentence: `${c.id}: ${c.text}` });
  return out;
}

/** Phone-readable prose diff (B+): sentences grouped by where they sit; chip tokens never shown. */
export function sentenceDiff(olderMd: string, newerMd: string): SentenceDiffGroup[] {
  const older = locate(olderMd);
  const newer = locate(newerMd);
  const lines = diffRevisions(older.map((l) => l.sentence).join("\n"), newer.map((l) => l.sentence).join("\n"));
  const groups = new Map<string, SentenceDiffGroup>();
  const group = (location: string) => {
    const existing = groups.get(location);
    if (existing) return existing;
    const created = { location, removed: [], added: [] };
    groups.set(location, created);
    return created;
  };
  let i = 0;
  let j = 0;
  for (const line of lines) {
    if (line.op === "equal") {
      i += 1;
      j += 1;
    } else if (line.op === "remove") {
      group(older[i]?.location ?? "Aksh's view").removed.push(line.text);
      i += 1;
    } else {
      group(newer[j]?.location ?? "Aksh's view").added.push(line.text);
      j += 1;
    }
  }
  return [...groups.values()];
}

/** "R1 in full": the view's paragraphs, then the tests, as plain reading text. */
export function fullTextOf(md: string): string[] {
  const { viewMd, conditions } = splitThesisBody(md);
  const paragraphs = parseProse(viewMd).flatMap((b) => (b.kind === "p" ? [inlineText(b.inline)] : b.kind === "h" ? [b.text] : b.items.map(inlineText)));
  return [...paragraphs, ...conditions.map((c) => `${c.id}: ${c.text}`)];
}
