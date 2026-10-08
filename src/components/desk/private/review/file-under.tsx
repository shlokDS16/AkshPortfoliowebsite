"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorText } from "@/lib/messages";
import { fileUnderAction, saveValuesAction } from "@/modules/ingestion/actions";
import type { ReviewData, ValueDecision } from "@/modules/ingestion/client";
import { startFileAction } from "@/modules/research/actions";

const SOURCE_TYPES = ["Annual report", "Presentation", "Filing", "Transcript", "Other"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];
const field = "min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink";

type Props = { document: ReviewData["document"]; target: ReviewData["target"]; count: number; decisions: ValueDecision[] };

/**
 * Files the ticked figures under the company's file (spec s6.5). The document's source row is confirmed here once:
 * title, type, filed-on (required) and link. "Start a file for X" is Aksh's own click on the existing item service.
 */
export function FileUnder({ document: doc, target, count, decisions }: Props) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!doc.companyId || !doc.companyName) {
    return (
      <section aria-label="File under" className="space-y-3 rounded-sm border border-rule bg-surface p-4">
        <p className="text-body text-ink">{errorText("no-company")}</p>
        <Link href="/desk/inbox" className="inline-flex min-h-11 items-center text-body text-geru underline decoration-1 underline-offset-3">
          Back to the inbox
        </Link>
      </section>
    );
  }
  const companyId = doc.companyId;
  const companyName = doc.companyName;

  async function file(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? "").trim();
    if (get("filedOn") === "") return setError(errorText("filed-on-required"));
    setBusy(true);
    setError(null);
    try {
      const saved = await saveValuesAction(doc.id, decisions);
      if (!saved.ok) return setError(saved.message);
      let itemId = target?.itemId;
      if (!itemId) {
        const started = await startFileAction(companyId);
        if (!started.ok) return setError(started.message);
        itemId = started.itemId;
      }
      const filed = await fileUnderAction(doc.id, {
        itemId,
        title: get("title"),
        sourceType: get("sourceType") as SourceType,
        filedOn: get("filedOn"),
        sourceUrl: get("sourceUrl") === "" ? null : get("sourceUrl"),
      });
      if (!filed.ok) return setError(filed.message);
      router.push(`/desk/items/${filed.itemId}#facts`);
    } catch {
      setError(errorText("save-failed"));
    } finally {
      setBusy(false);
    }
  }

  const figures = count === 1 ? "this figure" : `these ${count} figures`;
  return (
    <form noValidate onSubmit={file} aria-label="File under" className="space-y-4 rounded-sm border border-rule bg-surface p-4">
      <fieldset className="space-y-3">
        <legend className="mb-1 font-mono text-mono-label uppercase text-ink-muted">Where {count === 1 ? "it" : "they"} come from</legend>
        <div className="space-y-1">
          <Label htmlFor={`${id}-title`}>Document title</Label>
          <Input id={`${id}-title`} name="title" required maxLength={160} defaultValue={doc.title} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${id}-type`}>Type</Label>
            <select id={`${id}-type`} name="sourceType" defaultValue={doc.sourceType} className={field}>
              {SOURCE_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-filed`}>Filed on</Label>
            <Input id={`${id}-filed`} name="filedOn" type="date" required defaultValue={doc.filedOn ?? ""} className="tabular-nums" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`}>Public link (optional)</Label>
          <Input id={`${id}-url`} name="sourceUrl" type="url" defaultValue={doc.sourceUrl ?? ""} placeholder="https://" />
        </div>
      </fieldset>
      {target ? null : (
        <p className="text-body text-ink-body">
          {companyName} has no file yet. This starts one, private and empty, and puts {figures} in its Facts form.
        </p>
      )}
      <Button type="submit" disabled={busy || count === 0}>
        {target ? `File ${figures} under ${target.title}` : `Start a file for ${companyName}`}
      </Button>
      {count === 0 ? <p className="text-small text-ink-muted">{errorText("nothing-to-file")}</p> : null}
      {error ? (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : null}
    </form>
  );
}
