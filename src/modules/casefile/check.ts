import { splitThesisBody } from "./body";
import { fiscalYearEnd } from "./figures";
import { EMPTY_CASEFILE, validateCaseFile, type CaseFile } from "./schema";
import { isLedgerCase, parseCaseRecord } from "./case-record";
import { httpUrl } from "./safe";

/** Editor checklist "File structure": chips and readings must line up with Aksh's text. */
export function checkCaseFile(bodyMd: string, cf: CaseFile): string[] {
  const problems = new Set<string>();
  const { viewMd, conditions } = splitThesisBody(bodyMd);
  const facts = new Set(cf.facts.map((f) => f.id));
  for (const m of viewMd.matchAll(/\[(F\d{1,3})\]/g)) if (!facts.has(m[1])) problems.add(`The view cites [${m[1]}], which is not in the facts sheet.`);
  const ids = conditions.map((c) => c.id);
  ids.forEach((v, i) => ids.indexOf(v) !== i && problems.add(`${v} is written twice under "What would prove me wrong".`));
  for (const t of cf.tests) if (!ids.includes(t.id)) problems.add(`${t.id} has a reading in the facts sheet but no condition under "What would prove me wrong".`);
  if (conditions.length === 0) problems.add('Write each test as "- T1: …" under "What would prove me wrong".');
  // A chart point carrying the figure of a linked test's reading clears on its period end; the reading clears later.
  for (const x of cf.exhibits) {
    const t = x.testId ? cf.tests.find((r) => r.id === x.testId) : undefined;
    if (!t || t.current === null || !t.readingAsOf) continue;
    for (const p of x.points) {
      const end = fiscalYearEnd(p.period);
      if (end && p.value === t.current && end < t.readingAsOf) {
        problems.add(`${x.id} would show ${p.period} before ${t.id}'s reading of the same figure (dated ${t.readingAsOf}) is old enough to show.`);
      }
    }
  }
  for (const s of cf.sources) if (s.url && !httpUrl(s.url)) problems.add(`${s.id} has a link that is not an http or https address, so readers will not see it.`);
  return [...problems];
}

/**
 * Shared by the editor checklist and publishCheckedAction: a new item's {} reads as an empty file. A case study from the ledger has
 * no facts sheet and no tests (it is its body plus the record, D41); the database gate checks the rest. A record that cannot be read
 * is said here, in plain words, instead of leaving it to the gate's less direct refusal.
 */
export function fileProblems(bodyMd: string, structured: unknown): string[] {
  if (isLedgerCase(structured)) {
    return parseCaseRecord((structured as Record<string, unknown>).ledger) ? [] : ["The ledger record in this revision cannot be read. Refresh it from the ledger."];
  }
  const raw = structured && typeof structured === "object" && Object.keys(structured).length > 0 ? structured : EMPTY_CASEFILE;
  const result = validateCaseFile(raw);
  return result.ok ? checkCaseFile(bodyMd, result.data) : result.issues;
}
