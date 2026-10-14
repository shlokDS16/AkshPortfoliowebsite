import Link from "next/link";
import { EmptyState } from "@/components/desk/empty-state";
import { IdeaTable } from "@/components/desk/private/ledger/idea-table";
import { LedgerNeeds } from "@/components/desk/private/ledger/ledger-needs";
import { LedgerStatus, type JobRun } from "@/components/desk/private/ledger/ledger-status";
import { LedgerTiles } from "@/components/desk/private/ledger/ledger-tiles";
import { buttonVariants } from "@/components/ui/button";
import { istDate } from "@/lib/dates";
import { errorText, noticeText } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Db } from "@/lib/supabase/types";
import { requireAdmin } from "@/modules/identity";
import { getLedgerHome } from "@/modules/ledger";
import { LEDGER_EMPTY_TEXT, windowOf } from "@/modules/ledger/client";
import { createSupabaseHeartbeatRepo } from "@/modules/ops";

const JOBS = ["ledger:prices", "ledger:score", "ledger:anchor"] as const;
const OPEN_WINDOW = 50;
const CLOSED_WINDOW = 25;

/** The daily steps' last runs, from the heartbeat table (the admin's session may read it). A failure to read is no row, not a crash. */
async function readRuns(db: Db): Promise<JobRun[] | null> {
  try {
    const latest = await createSupabaseHeartbeatRepo(db).latestRuns(JOBS);
    return JOBS.map((job) => ({ job, ranAt: latest[job]?.ranAt ?? null, ok: latest[job]?.ok ?? null, detail: latest[job]?.detail }));
  } catch (error) {
    console.error("ledger page: could not read the daily steps", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

type Props = { searchParams: Promise<{ error?: string; notice?: string; open?: string; closed?: string }> };

export default async function LedgerPage({ searchParams }: Props) {
  await requireAdmin();
  const params = await searchParams;
  const db = await createSupabaseServerClient();
  const [home, runs] = await Promise.all([getLedgerHome(db, istDate(new Date())), readRuns(db)]);
  const openLimit = windowOf(params.open, OPEN_WINDOW);
  const closedLimit = windowOf(params.closed, CLOSED_WINDOW);
  const more = (key: "open" | "closed") =>
    `/desk/ledger?open=${key === "open" ? openLimit + OPEN_WINDOW : openLimit}&closed=${key === "closed" ? closedLimit + CLOSED_WINDOW : closedLimit}#${key}`;
  const message = errorText(params.error);
  const notice = noticeText(params.notice);
  const empty = home.open.length + home.closed.length === 0;
  return (
    <div className="space-y-(--block-gap)">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title text-ink desk:text-title-desk">Ledger</h1>
        <Link href="/desk/ledger/new" className={buttonVariants({ className: "min-h-11 no-underline" })}>
          Record an idea
        </Link>
      </div>
      {message ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {message}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-sm border border-rule px-3 py-2 text-small text-ink">
          {notice}
        </p>
      ) : null}
      <LedgerStatus closes={home.closes} anchors={home.anchors} chain={home.chain} runs={runs} />
      <LedgerTiles summary={home.summary} asOf={home.closes?.latestOpenDay ?? null} />
      {empty ? (
        <EmptyState body={LEDGER_EMPTY_TEXT} shape={["Company", "Expects", "Entry", "Days held", "Share and Nifty 50", "Result"]} />
      ) : (
        <>
          <LedgerNeeds cards={home.needs} />
          <IdeaTable id="open" title="Open ideas" ideas={home.open} limit={openLimit} moreHref={more("open")} emptyBody="No open ideas." />
          <IdeaTable id="closed" title="Closed ideas" ideas={home.closed} limit={closedLimit} moreHref={more("closed")} emptyBody="No closed ideas yet." />
        </>
      )}
    </div>
  );
}
