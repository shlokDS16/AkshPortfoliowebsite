"use client";

import Link from "next/link";
import { useState, type ChangeEvent, type DragEvent } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";
import { hashFile, MAX_UPLOAD_BYTES, STORAGE_REFUSE } from "@/modules/documents/client";
import { finishUploadAction, startUploadAction } from "@/modules/ingestion/actions";
import type { InboxActions } from "./types";
import { uploadPdf, type UploadDeps, type UploadStage } from "./upload-file";

export type CompanyOption = { id: string; symbol: string };

const STAGE: Record<UploadStage, string> = { checking: "Checking the file…", uploading: "Uploading…", saving: "Saving…" };
const NO_COMPANY = "No company has that symbol yet. Capture it first as $SYMBOL on the Capture tab, or leave this blank.";
const NO_LINK = "Use a link that starts with http:// or https://, or leave this blank.";
const NO_DATE = "Use a valid date, or leave this blank.";

async function putToStorage(path: string, token: string, file: File) {
  const { error } = await createSupabaseBrowserClient().storage.from("documents").uploadToSignedUrl(path, token, file, { contentType: "application/pdf" });
  return { error };
}

type Notice = { tone: "ok" | "bad"; text: string; earlier?: { id: string; createdAt: string } };

/** Choose or drop a PDF: it goes straight to Storage with a signed path, then the desk starts reading it (spec s6.2). */
export function DropBar({ companies, actions, storageShare = 0 }: { companies: CompanyOption[]; actions: Pick<InboxActions, "kick">; storageShare?: number }) {
  // Past 90% of the free storage the server refuses every upload (spec s10), so the bar says so instead of letting a file wait for it.
  const full = storageShare >= STORAGE_REFUSE;
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dragging, setDragging] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [filedOn, setFiledOn] = useState("");
  const [link, setLink] = useState("");

  /** The optional fields as the server wants them, or the sentence that says what is wrong with one. */
  function extras(): { companyId: string | null; filedOn: string | null; sourceUrl: string | null } | string {
    const wanted = symbol.trim().replace(/^\$/, "").toUpperCase();
    const company = wanted ? companies.find((c) => c.symbol.toUpperCase() === wanted) : null;
    if (wanted && !company) return NO_COMPANY;
    if (link.trim() && !/^https?:\/\/\S+$/i.test(link.trim())) return NO_LINK;
    if (filedOn && Number.isNaN(Date.parse(filedOn))) return NO_DATE;
    return { companyId: company?.id ?? null, filedOn: filedOn || null, sourceUrl: link.trim() || null };
  }

  async function take(file: File | undefined) {
    if (!file || stage || full) return;
    const fields = extras();
    if (typeof fields === "string") return setNotice({ tone: "bad", text: fields });
    setNotice(null);
    const deps: UploadDeps = { hash: hashFile, start: startUploadAction, put: putToStorage, finish: finishUploadAction, kick: actions.kick };
    const outcome = await uploadPdf(file, fields, deps, setStage).catch(() => null);
    setStage(null);
    if (!outcome) return setNotice({ tone: "bad", text: "The upload did not finish. Choose the file again to resume." });
    if (outcome.ok) return setNotice({ tone: "ok", text: `Uploaded ${file.name}. The desk starts reading it now.` });
    setNotice({ tone: "bad", text: outcome.message, earlier: outcome.earlier });
  }

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // choosing the same file again must fire again
    void take(file);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files[0]);
  };
  const busy = stage !== null || full;

  return (
    <section aria-label="Upload a PDF" className="space-y-2">
      <div
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn("space-y-3 rounded-sm border border-dashed p-4", dragging ? "border-ink bg-surface-2" : "border-rule-strong bg-surface")}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-sm bg-ink px-4 text-body font-medium text-paper transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale) has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-geru",
              busy && "pointer-events-none opacity-45",
            )}
          >
            Choose a PDF
            <input type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={onPick} />
          </label>
          <p className="text-small text-ink-muted">
            or drop one here. Annual reports, presentations and filings, up to {MAX_UPLOAD_BYTES / 1_048_576} MB.
          </p>
        </div>
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-small text-ink">Company, filing date and link (optional)</summary>
          <div className="grid gap-3 pt-1 md:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="drop-company">Company, as $SYMBOL</Label>
              <Input id="drop-company" list="drop-companies" autoComplete="off" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="$KAVPUMP" />
              <datalist id="drop-companies">
                {companies.map((c) => (
                  <option key={c.id} value={`$${c.symbol}`} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="drop-filed">Filed on</Label>
              <Input id="drop-filed" type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="drop-link">Public link</Label>
              <Input id="drop-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
            </div>
          </div>
        </details>
      </div>
      <div role="status" className={cn("min-h-5 text-small", full ? "text-bad" : "text-ink-muted")}>
        {full
          ? `Storage is ${Math.floor(storageShare * 100)}% full. Mark finished documents as done to free space.`
          : stage
            ? STAGE[stage]
            : notice?.tone === "ok"
              ? notice.text
              : null}
      </div>
      {notice?.tone === "bad" ? (
        <p role="alert" className={cn("text-small", notice.earlier ? "text-ink" : "text-bad")}>
          {notice.earlier ? `You uploaded this on ${formatDate(notice.earlier.createdAt)}. ` : `${notice.text} `}
          {notice.earlier ? (
            <Link href={`/desk/inbox#doc-${notice.earlier.id}`} className="text-geru underline underline-offset-3">
              Open it
            </Link>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
