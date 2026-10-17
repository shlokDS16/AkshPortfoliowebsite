import Link from "next/link";
import { Machine } from "@/components/desk/case/case-entry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { SOURCE_ERROR_TEXT } from "@/lib/messages-sources";
import type { GateDecision, LintField } from "@/modules/compliance/client";
import type { PanelRow } from "@/modules/sources";
import { MAX_STUDIED } from "@/modules/sources/client";
import { FIELD_LABELS } from "../gate-decision";
import { PendingButton } from "../pending-button";
import { NoteField } from "./note-field";

/** The fixed line beside each picture (Q56): the desk cannot read the words inside a picture, so the choice is his. Pending Shlok's approval. */
export const PICTURE_WARNING = "The desk does not read pictures. Untick if this one tells people to buy or sell.";

export type Refusal = { message: string; field: string | null; sentence: string | null };
const OUTSIDE_FIELDS: readonly string[] = ["outsideTitle", "outsideSite", "outsideLink"];

/**
 * What the last gate run refused about outside sources: rule 14 itself, and the wording rules on an outside title, name or link. Only a decision on the
 * newest revision counts; an older one is history. The sentences are the gate's own.
 */
export function outsideRefusals(decision: GateDecision | null, latestRevisionId: string | null): Refusal[] {
  if (!decision || decision.verdict !== "fail" || decision.revisionId !== latestRevisionId) return [];
  return decision.failures
    .filter((f) => f.rule === "14" || OUTSIDE_FIELDS.includes(f.field ?? ""))
    .map((f) => ({ message: f.message, field: f.field ? (FIELD_LABELS[f.field as LintField] ?? null) : null, sentence: f.sentence }));
}

const PROBLEM_TEXT = { archived: SOURCE_ERROR_TEXT["studied-unavailable"], gone: SOURCE_ERROR_TEXT["studied-unavailable"], detached: SOURCE_ERROR_TEXT["studied-not-attached"] } as const;

function Row({ row }: { row: PanelRow }) {
  const { record: r } = row;
  const read = r.title !== null && r.metaSha !== null;
  const id = r.id;
  return (
    <li className="py-(--block-gap) first:pt-0">
      <div className="grid gap-x-4 gap-y-3 desk:grid-cols-[auto_1fr]">
        {r.thumbPath ? (
          <div className="space-y-1 desk:w-40">
            {/* The desk's own admin-only route, never the picture's origin. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/desk/sources/${id}/thumb`} width={160} height={90} alt="Thumbnail of the video" loading="lazy" className="aspect-video h-auto w-40 max-w-full border border-rule bg-surface-2 object-cover" />
            <p className="text-caption text-ink-muted">{PICTURE_WARNING}</p>
          </div>
        ) : null}
        <Machine className={r.thumbPath ? "space-y-1" : "space-y-1 desk:col-span-2"}>
          <p id={`out-${id}`} className="break-words text-data text-ink desk:text-data-desk">
            {r.title ?? "Not read yet"}
          </p>
          {r.siteName ? <p className="break-words">{r.siteName}</p> : null}
          {r.title === null && r.fetchedAt === null ? <p>Reading the link</p> : null}
          <p className="break-all">{r.url}</p>
        </Machine>
      </div>
      {row.problem ? <p className="mt-3 rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">{PROBLEM_TEXT[row.problem]}</p> : null}
      <div className="relative mt-3">
        <input id={`show-${id}`} type="checkbox" name="link" value={id} defaultChecked={row.listed} aria-describedby={`out-${id}`} className="peer absolute top-3 left-0 size-[18px] accent-ink" />
        <label htmlFor={`show-${id}`} className="flex min-h-11 items-center pl-8 text-body font-medium text-ink">
          Show on the public file
        </label>
        <div className="hidden space-y-3 pl-8 peer-checked:block">
          <div>
            <label className="inline-flex min-h-11 items-center gap-2 text-small text-ink">
              <input type="checkbox" name={`showTitle:${id}`} defaultChecked={row.showTitle && read} disabled={!read} className="size-[18px] accent-ink" />
              Show its title and picture
            </label>
            {!read ? <p className="text-small text-ink-muted">Nothing was read from this link yet, so only the link can be shown.</p> : null}
          </div>
          <NoteField name={`note:${id}`} defaultValue={row.publicNote} privateNote={r.note} />
        </div>
      </div>
    </li>
  );
}

type Props = {
  rows: readonly PanelRow[];
  /** The page's bound `saveStudiedRevisionAction(itemId, form)`. */
  save: (formData: FormData) => Promise<void>;
  company: string;
  refusals: readonly Refusal[];
};

/**
 * The company file's "Outside sources" (spec s6.5): the company's saved sources, each with "Show on the public file", "Show its title and picture"
 * and his words for readers. One button saves a new revision carrying the choice (his change reason optional; the machine never writes one), then the
 * usual publish panel runs the gate. Machine data stays in the machine face; his words stay his.
 */
export function OutsidePanel({ rows, save, company, refusals }: Props) {
  return (
    <section aria-labelledby="outside-heading" className="space-y-4 rounded-sm border border-rule p-3">
      <div>
        <h2 id="outside-heading" className="text-title text-ink desk:text-title-desk">
          Outside sources
        </h2>
        <p className="mt-1 max-w-[72ch] text-small text-ink-muted">
          Other people&apos;s work you studied, attached to {company}. A ticked source is listed on the public file once the new revision passes the gate. At most {MAX_STUDIED}.
        </p>
      </div>
      {refusals.length > 0 ? (
        <div role="group" aria-label="The last gate run refused" className="space-y-2 border-l-2 border-bad bg-bad-wash p-2 text-small text-ink">
          <p className="font-semibold">The last gate run refused:</p>
          <ul className="space-y-2">
            {refusals.map((r, i) => (
              <li key={i}>
                <p>{r.message}</p>
                {r.field ? <p className="text-ink-muted">In: {r.field}</p> : null}
                {r.sentence ? <q className="block">{r.sentence}</q> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-small text-ink">
          No source is attached to {company} yet.{" "}
          <Link href="/desk/sources" className="underline decoration-1 underline-offset-3">
            Add a source
            <VisuallyHidden> and attach it to {company}</VisuallyHidden>
          </Link>
        </p>
      ) : (
        <form action={save} className="space-y-4">
          <ul className="divide-y divide-rule">
            {rows.map((row) => (
              <Row key={row.record.id} row={row} />
            ))}
          </ul>
          <div className="space-y-1">
            <Label htmlFor="outside-reason">Change reason (optional)</Label>
            <Input id="outside-reason" name="changeReason" autoComplete="off" />
          </div>
          <PendingButton>Save as a new revision</PendingButton>
          <p className="max-w-[72ch] text-small text-ink-muted">This makes a new revision from the latest saved one. Your view, tests and facts are carried over unchanged.</p>
        </form>
      )}
    </section>
  );
}
