"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { errorText } from "@/lib/messages";
import { setDocumentCompanyAction } from "@/modules/ingestion/actions";

type Props = { documentId: string; companies: { id: string; symbol: string }[] };

/** A document uploaded without a company has no file to go under: pick an existing company, then the page carries on. */
export function CompanyChooser({ documentId, companies }: Props) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const companyId = String(new FormData(e.currentTarget).get("company") ?? "");
    if (companyId === "") return setError("Choose the company this document is about.");
    setBusy(true);
    setError(null);
    try {
      const result = await setDocumentCompanyAction(documentId, companyId);
      if (result.ok) router.refresh();
      else setError(result.message);
    } catch {
      setError(errorText("save-failed"));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={link} aria-label="Link to a company" className="space-y-3 rounded-sm border border-rule bg-surface p-4">
      <p className="text-body text-ink">{errorText("no-company")}</p>
      {companies.length === 0 ? (
        <p className="text-small text-ink-muted">No company exists yet. Capture a note that names one, for example $KAVERI, then come back.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1">
            <Label htmlFor={`${id}-company`}>Company</Label>
            <select id={`${id}-company`} name="company" defaultValue="" className="min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink">
              <option value="">Choose</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  ${c.symbol}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={busy}>
            Link to this company
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : null}
    </form>
  );
}
