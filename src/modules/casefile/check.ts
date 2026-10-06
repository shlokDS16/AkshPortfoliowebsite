import { splitThesisBody } from "./body";
import type { CaseFile } from "./schema";
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
  for (const s of cf.sources) if (s.url && !httpUrl(s.url)) problems.add(`${s.id} has a link that is not an http or https address, so readers will not see it.`);
  return [...problems];
}
