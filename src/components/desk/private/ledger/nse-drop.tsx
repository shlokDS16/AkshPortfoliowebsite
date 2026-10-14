"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DROP_BUTTON, DROP_DATE_LABEL, DROP_INDEX_LABEL, DROP_INTRO, DROP_LIMITS_TEXT, DROP_PENDING, DROP_ZIP_HINT, DROP_ZIP_LABEL, NOT_SIGNED_IN_TEXT,
  uploadDoneText, uploadRefusalText,
} from "@/lib/messages-closes";
import { UPLOAD_LIMITS, UPLOAD_REFUSALS, type UploadRefusal, type UploadResult } from "@/modules/ledger/client";
import { Hint } from "./fields";

type Outcome = { kind: "done" | "refused"; text: string } | null;
const subscribeNothing = (): (() => void) => () => {};

const knownCode = (value: unknown): UploadRefusal => (typeof value === "string" && (UPLOAD_REFUSALS as readonly string[]).includes(value) ? (value as UploadRefusal) : "store_failed");

/**
 * Drop NSE's official files. The files are sent to the owner-only route with fetch and are not kept anywhere on this page;
 * the answer is a closed code that this page turns into plain words. A file over its limit is turned away here, before it is
 * sent, with the limit stated; the route checks again. Nothing from the file or a parser is ever shown.
 */
export function NseDrop({ today }: { today: string }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const sending = useRef(false);
  const result = useRef<HTMLParagraphElement>(null);

  const show = (next: Outcome) => {
    setOutcome(next);
    setTimeout(() => result.current?.focus(), 0);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const sizeOf = (name: string): number => (form.elements.namedItem(name) as HTMLInputElement | null)?.files?.[0]?.size ?? 0;
    if (sizeOf("bhavcopy") > UPLOAD_LIMITS.zipBytes || sizeOf("index") > UPLOAD_LIMITS.indexBytes) return show({ kind: "refused", text: uploadRefusalText("too_large") });
    sending.current = true;
    setPending(true);
    setOutcome(null);
    try {
      const response = await fetch("/desk/ledger/closes/upload", { method: "POST", body: data, credentials: "same-origin" });
      if (response.status === 401) return show({ kind: "refused", text: NOT_SIGNED_IN_TEXT });
      const body = (await response.json().catch(() => null)) as (UploadResult & { code?: unknown }) | null;
      if (body && body.ok === true) {
        show({ kind: "done", text: uploadDoneText(body) });
        form.reset();
        router.refresh();
      } else {
        const fileDate = body && body.ok === false ? body.fileDate : undefined;
        show({ kind: "refused", text: uploadRefusalText(knownCode(body?.code), fileDate) });
      }
    } catch {
      show({ kind: "refused", text: uploadRefusalText("store_failed") });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return (
    <form method="post" encType="multipart/form-data" onSubmit={onSubmit} data-ready={ready ? "" : undefined} className="max-w-[44rem] space-y-4">
      <p className="max-w-[60ch] text-small text-ink-muted">{DROP_INTRO}</p>
      <div className="max-w-56 space-y-1">
        <Label htmlFor="drop-date">{DROP_DATE_LABEL}</Label>
        <Input id="drop-date" name="date" type="date" max={today} required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="drop-zip">{DROP_ZIP_LABEL}</Label>
        <Input id="drop-zip" name="bhavcopy" type="file" required className="py-2" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="drop-index">{DROP_INDEX_LABEL}</Label>
        <Input id="drop-index" name="index" type="file" className="py-2" aria-describedby="drop-hint" />
        <Hint id="drop-hint">{DROP_ZIP_HINT}</Hint>
      </div>
      <Hint>{DROP_LIMITS_TEXT}</Hint>
      <Button type="submit" disabled={!ready} aria-disabled={!ready || pending}>
        {pending ? DROP_PENDING : DROP_BUTTON}
      </Button>
      <p
        ref={result}
        tabIndex={-1}
        data-testid="drop-result"
        role={outcome?.kind === "refused" ? "alert" : "status"}
        className={outcome ? (outcome.kind === "refused" ? "rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink" : "rounded-sm border border-rule px-3 py-2 text-small text-ink") : "sr-only"}
      >
        {outcome?.text}
      </p>
    </form>
  );
}
