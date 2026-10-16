import { z } from "zod";
import { isRecord } from "@/lib/records";
import { isLedgerCase } from "@/modules/casefile/client";
import { SourceError } from "./errors";
import type { SourcesRepo } from "./repo";
import { MAX_STUDIED, STUDIED_NOTE_MAX } from "./types";

// What a company file's revision says about the outside sources it shows (spec s5, rule 14). `structured.studied` is a list of at most 12
// entries, each exactly { link, show, metaSha, note }: `link`, `show` and `metaSha` are the machine's keys, `note` is his public words for
// that source. Only this module writes the key; saveCaseFileRevisionAction carries it forward. `metaSha` is always read from the table, never
// from the form: the hash is what ties "he chose to show this title" to the exact words the lint read.

export const STUDIED_KEY = "studied";
export { MAX_STUDIED, STUDIED_NOTE_MAX };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export const studiedEntrySchema = z.strictObject({
  link: z.string().regex(UUID),
  show: z.boolean(),
  metaSha: z.string().regex(HEX64).nullable(),
  note: z.string().max(STUDIED_NOTE_MAX),
});
export type StudiedEntry = z.infer<typeof studiedEntrySchema>;

/** One row of the panel: a source he ticked "Show on the public file", whether he left "Show its title and picture" ticked, and the words readers see. */
export type StudiedRow = { link: string; showTitle: boolean; note: string };

/**
 * Reads the panel's form. Fields: `link` (repeated, in the order he wants), and for each link `showTitle:<link>` ("on" when ticked) and
 * `note:<link>`. A value that is not a lower-case UUID, a repeat and a file are dropped.
 */
export function readStudiedForm(form: FormData): StudiedRow[] {
  const rows: StudiedRow[] = [];
  for (const value of form.getAll("link")) {
    const link = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!UUID.test(link) || rows.some((r) => r.link === link)) continue;
    const note = form.get(`note:${link}`) ?? form.get(`note:${String(value).trim()}`);
    const tick = form.get(`showTitle:${link}`) ?? form.get(`showTitle:${String(value).trim()}`);
    rows.push({ link, showTitle: tick === "on", note: typeof note === "string" ? note.trim() : "" });
  }
  return rows;
}

/** The entries for `rows`. A shown title carries the hash the table holds for the link; a source never read cannot be shown, whatever the tick. */
export function buildStudiedEntries(rows: readonly StudiedRow[], metaShaOf: (link: string) => string | null): StudiedEntry[] {
  if (rows.length > MAX_STUDIED) throw new SourceError("studied-too-many");
  return rows.map((row) => {
    if (row.note.length > STUDIED_NOTE_MAX) throw new SourceError("studied-note-long");
    const sha = row.showTitle ? metaShaOf(row.link) : null;
    return { link: row.link, show: sha !== null, metaSha: sha, note: row.note };
  });
}

/** The record with the key set; an empty list takes the key off (a revision with no sources has no key). Every other key is kept as it is. */
export function withStudied(structured: Record<string, unknown>, entries: readonly StudiedEntry[]): Record<string, unknown> {
  const rest = Object.fromEntries(Object.entries(structured).filter(([key]) => key !== STUDIED_KEY));
  return entries.length === 0 ? rest : { ...rest, [STUDIED_KEY]: [...entries] };
}

/** The well-formed entries of a revision's record (the panel's starting state); anything else is ignored. */
export function readStudied(structured: unknown): StudiedEntry[] {
  const list = isRecord(structured) ? structured[STUDIED_KEY] : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    const parsed = studiedEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export type StudiedFile = { kind: string; companyId: string | null; previous: Record<string, unknown> };

/**
 * The next revision's record for a company file: its previous record with the chosen sources. Refuses (SourceError) any kind but a thesis
 * or a case study that is not a ledger case, a source that is missing, archived or gone, and one not attached to the file's company: the
 * gate would refuse each too (rule 14.1, 14.2), this says so earlier and in plainer words.
 */
export async function studiedStructured(repo: SourcesRepo, file: StudiedFile, rows: readonly StudiedRow[]): Promise<Record<string, unknown>> {
  const companyFile = file.companyId !== null && (file.kind === "thesis" || (file.kind === "case_study" && !isLedgerCase(file.previous)));
  if (!companyFile) throw new SourceError("studied-not-company-file");
  const shas = new Map<string, string | null>();
  if (rows.length > MAX_STUDIED) throw new SourceError("studied-too-many");
  for (const row of rows) {
    const source = await repo.get(row.link);
    if (!source || source.archivedAt !== null || source.gone) throw new SourceError("studied-unavailable");
    if (!source.companyIds.includes(file.companyId as string)) throw new SourceError("studied-not-attached");
    shas.set(row.link, source.metaSha);
  }
  return withStudied(file.previous, buildStudiedEntries(rows, (link) => shas.get(link) ?? null));
}
