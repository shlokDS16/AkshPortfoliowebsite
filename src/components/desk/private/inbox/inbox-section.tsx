import { cn } from "@/lib/utils";
import { DATABASE_BYTES, STORAGE_BYTES } from "@/modules/documents/client";
import type { InboxDoc, Tray as TrayName } from "@/modules/ingestion/client";
import { Tray } from "../tray";
import { BudgetMeter } from "./budget-meter";
import { DocumentCard } from "./document-card";
import { DropBar, type CompanyOption } from "./drop-bar";
import { KeepReading } from "./keep-reading";
import type { InboxActions } from "./types";

// design-dna 13.2 / spec s7: the five trays in this order; every tray but the first is hidden while empty.
const TRAYS: { tray: Exclude<TrayName, "finished">; title: string; empty?: string }[] = [
  { tray: "ready", title: "Ready for you", empty: "Nothing to review." },
  { tray: "attention", title: "Needs attention" },
  { tray: "reading", title: "Being read" },
  { tray: "paused", title: "Paused, nothing lost" },
  { tray: "waiting", title: "Waiting to start" },
];
export const AI_OFF_BANNER = "AI reading is off. Pages are still read and searchable; open a document beside your file to enter figures.";

type Props = {
  docs: InboxDoc[];
  usage: { storageBytes: number; databaseBytes: number };
  aiOn: boolean;
  /** Pages of today's free AI allowance used, or null when the ledger could not be read. Never shown while AI is off. */
  aiPages: { used: number; total: number } | null;
  companies: CompanyOption[];
  actions: InboxActions;
};

/** The inbox: drop bar, the two real quotas, then every document in the tray its state puts it in (segment 4 C). */
export function InboxSection({ docs, usage, aiOn, aiPages, companies, actions }: Props) {
  const storageShare = usage.storageBytes / STORAGE_BYTES;
  const finished = docs.filter((d) => d.view.tray === "finished");
  // The tab keeps the reader going while a live document is being read, queued or waiting for the allowance.
  const active = docs.some((d) => d.status === "active" && ["reading", "waiting", "paused"].includes(d.view.tray));
  return (
    <div className="space-y-(--block-gap)">
      <h1 className="sr-only">Inbox</h1>
      {aiOn ? null : (
        <p role="status" className="rounded-sm border border-rule bg-surface px-3 py-2 text-small text-ink">
          {AI_OFF_BANNER}
        </p>
      )}
      <DropBar companies={companies} actions={actions} storageShare={storageShare} />
      <section aria-label="Free plan room" className={cn("grid grid-cols-1 gap-4", aiOn && aiPages ? "md:grid-cols-3" : "md:grid-cols-2")}>
        {aiOn && aiPages ? <BudgetMeter label="AI pages today:" used={aiPages.used} limit={aiPages.total} count /> : null}
        <BudgetMeter label="Storage" used={usage.storageBytes} limit={STORAGE_BYTES} />
        <BudgetMeter label="Database" used={usage.databaseBytes} limit={DATABASE_BYTES} />
      </section>
      {TRAYS.map(({ tray, title, empty }) => {
        const inTray = docs.filter((d) => d.view.tray === tray);
        if (inTray.length === 0 && !empty) return null;
        return (
          <Tray key={tray} title={title} count={inTray.length} empty={{ body: empty ?? "" }}>
            {inTray.length > 0 ? (
              <div className="grid grid-cols-1 items-start gap-3 desk:grid-cols-2">
                {inTray.map((doc) => (
                  <DocumentCard key={doc.id} doc={doc} aiOn={aiOn} actions={actions} />
                ))}
              </div>
            ) : null}
          </Tray>
        );
      })}
      {finished.length > 0 ? (
        <details className="space-y-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-label uppercase text-ink-muted">Finished {finished.length}</summary>
          <div className="grid grid-cols-1 items-start gap-3 desk:grid-cols-2">
            {finished.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} aiOn={aiOn} actions={actions} />
            ))}
          </div>
        </details>
      ) : null}
      <KeepReading active={active} />
    </div>
  );
}
