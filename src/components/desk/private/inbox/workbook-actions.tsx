"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { retryStepAction, skipDocumentAction } from "@/modules/ingestion/actions";
import type { InboxDoc } from "@/modules/ingestion/client";
import type { useInboxAction } from "./use-inbox-action";

// A valuation workbook's buttons on its inbox card (Plan 2.7 Task 3, spec s8). It has no figures to review and nothing to enter by hand:
// once read it opens on its model page; refused, it needs a fixed upload; a read that stopped can be tried again (a new pass of its step).

const LINK = "inline-flex min-h-11 items-center rounded-sm px-3 text-body font-medium no-underline transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale)";

type Props = { doc: InboxDoc; run: ReturnType<typeof useInboxAction>["run"]; pending: boolean };

export function WorkbookActions({ doc, run, pending }: Props) {
  const { view, model } = doc;
  const open = model && (model.status === "ready" || model.status === "confirmed") && view.tray !== "attention";
  const refused = view.tray === "attention" && model?.status === "refused";
  const stopped = view.tray === "attention" && !refused;
  const skippable = doc.status === "active" && view.tray !== "reading";
  return (
    <>
      {open ? (
        <Link href={`/desk/models/${model.versionId}`} className={cn(LINK, "bg-ink text-paper")}>
          Open model
        </Link>
      ) : null}
      {refused ? (
        <Link href="/desk/inbox#upload" className={cn(LINK, "bg-ink text-paper")}>
          Upload a fixed workbook
        </Link>
      ) : null}
      {stopped ? (
        <Button type="button" disabled={pending} onClick={() => void run(() => retryStepAction(doc.id))}>
          Try again
        </Button>
      ) : null}
      {skippable ? (
        <Button type="button" variant="outline" disabled={pending} onClick={() => void run(() => skipDocumentAction(doc.id))}>
          Skip this document
        </Button>
      ) : null}
    </>
  );
}
