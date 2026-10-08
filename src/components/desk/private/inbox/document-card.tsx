"use client";

import { BookOpen, Check, Clock, Info, Pause, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { formatCount, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { retryStepAction, skipDocumentAction, skipStepAction } from "@/modules/ingestion/actions";
import type { InboxDoc, Tray } from "@/modules/ingestion/client";
import { PageChooser } from "./page-chooser";
import type { InboxActions } from "./types";
import { useInboxAction } from "./use-inbox-action";

const LOOK: Record<Tray, { word: string; icon: LucideIcon; rule: string; text: string }> = {
  ready: { word: "Ready", icon: Check, rule: "border-l-ink", text: "text-ink" },
  attention: { word: "Needs attention", icon: TriangleAlert, rule: "border-l-bad", text: "text-bad" },
  reading: { word: "Being read", icon: BookOpen, rule: "border-l-ink-muted", text: "text-ink-muted" },
  paused: { word: "Paused", icon: Pause, rule: "border-l-warn", text: "text-warn" },
  waiting: { word: "Waiting", icon: Clock, rule: "border-l-ink-muted", text: "text-ink-muted" },
  finished: { word: "Finished", icon: Info, rule: "border-l-rule-strong", text: "text-ink-muted" },
};

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div role="progressbar" aria-label="Pages read" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} className="h-1 rounded-xs bg-surface-2">
      <div
        style={{ "--fill": total > 0 ? done / total : 0 } as CSSProperties}
        className="h-full w-full origin-left scale-x-(--fill) rounded-xs bg-ink transition-transform duration-(--motion-slow) ease-snap motion-reduce:transition-none"
      />
    </div>
  );
}

type Props = { doc: InboxDoc; aiOn: boolean; actions: InboxActions };

/** One document in its tray: what state it is in, in a sentence, and the one or two things Aksh can do about it. */
export function DocumentCard({ doc, aiOn, actions }: Props) {
  const { pending, error, run } = useInboxAction();
  const { view } = doc;
  const look = LOOK[view.tray];
  const Icon = look.icon;
  const ticked = doc.pages.filter((p) => p.selected).length;
  // A page ticked while AI was off has no step yet: with AI on, one button queues them all.
  const unqueued = view.tray === "ready" && aiOn && ticked > view.extractTotal;
  const skippable = doc.status === "active" && (view.tray === "waiting" || view.tray === "paused" || (view.tray === "ready" && doc.pending === 0));
  // Review is also the way to Done, so it stays while any figure exists, decided or not, in the ready and attention trays.
  const reviewable = (view.tray === "ready" || view.tray === "attention") && (doc.pending > 0 || doc.decided > 0);
  const link = "inline-flex min-h-11 items-center rounded-sm px-3 text-body font-medium no-underline";

  return (
    <article id={`doc-${doc.id}`} className={cn("scroll-mt-20 space-y-3 rounded-sm border border-l-4 border-rule bg-paper p-4", look.rule)}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("inline-flex items-center gap-1.5 font-mono text-mono-label uppercase", look.text)}>
          <Icon aria-hidden strokeWidth={1.5} className="size-4" />
          {look.word}
        </p>
        {doc.company ? <span className="rounded-sm border border-rule-strong px-1.5 py-0.5 font-mono text-mono-tag text-ink">${doc.company}</span> : null}
      </div>
      <div>
        <h3 className="break-words text-subtitle text-ink">{doc.title}</h3>
        <p className="mt-0.5 text-small text-ink-muted">
          Uploaded {formatDate(doc.createdAt)}
          {doc.pageCount ? ` · ${formatCount(doc.pageCount, "page")}` : ""}
        </p>
      </div>
      <p className="text-body text-ink-body">{view.message}</p>
      {view.tray === "reading" && view.extractTotal > 0 ? <Progress done={view.extractDone} total={view.extractTotal} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {reviewable ? (
          <Link
            href={`/desk/inbox/${doc.id}/review`}
            className={cn(link, "transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale)", view.tray === "ready" ? "bg-ink text-paper" : "border border-rule-strong bg-paper text-ink")}
          >
            Review
          </Link>
        ) : null}
        {view.tray === "attention" ? (
          <>
            <Link href="/desk/items" className={cn(link, "bg-ink text-paper transition-transform duration-(--motion-fast) ease-snap active:scale-(--press-scale)")}>
              Enter manually
            </Link>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void run(() => skipStepAction(doc.id))}>
              Skip
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void run(() => retryStepAction(doc.id))}>
              Try again
            </Button>
          </>
        ) : null}
        {unqueued ? (
          <Button type="button" disabled={pending} onClick={() => void run(() => actions.readSelected(doc.id))}>
            Read the ticked pages
          </Button>
        ) : null}
        {skippable ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => void run(() => skipDocumentAction(doc.id))}>
            Skip this document
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-small text-bad">
          {error}
        </p>
      ) : null}
      {doc.status === "active" && doc.pages.length > 0 ? (
        <PageChooser doc={doc} aiOn={aiOn} pagesLeft={Math.max(0, view.extractTotal - view.extractDone)} actions={actions} />
      ) : null}
    </article>
  );
}
