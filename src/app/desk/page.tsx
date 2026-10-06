import { CaptureBar } from "@/components/desk/private/capture-bar";
import { NeedsYouCard } from "@/components/desk/private/needs-you-card";
import { QueuedCard } from "@/components/desk/private/queued-card";
import { TodayList } from "@/components/desk/private/today-list";
import { Tray } from "@/components/desk/private/tray";
import { StreakStrip } from "@/components/desk/streak-strip";
import { addDays, istDate, istDayStartUtc } from "@/lib/dates";
import { formatCount, formatDate } from "@/lib/format";
import { errorText, noticeText } from "@/lib/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  captureStreak,
  filingErrorText,
  groupTodayByCompany,
  listCapturesSince,
  needsRefile,
  toStreakData,
  type CaptureListEntry,
} from "@/modules/capture";
import { refileCaptureAction } from "@/modules/capture/actions";
import { listBlockedItems, type BlockedItem } from "@/modules/compliance";
import { requireAdmin } from "@/modules/identity";
import { knownTokens, namesToReview } from "./desk-data";

/** Name only in the log: a database message can carry row data. */
async function read<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`desk home: could not load ${label}`, error instanceof Error ? error.name : typeof error);
    return fallback;
  }
}

const firstLine = (text: string) => Array.from(text.split("\n")[0]).slice(0, 120).join("");

export default async function DeskHome({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireAdmin();
  const { error, notice } = await searchParams;
  const db = await createSupabaseServerClient();
  const now = new Date();
  const today = istDate(now);
  const [entries, blocked, names, known] = await Promise.all([
    read<CaptureListEntry[] | null>("captures", () => listCapturesSince(db, istDayStartUtc(addDays(today, -29))), null),
    read<BlockedItem[]>("blocked items", () => listBlockedItems(db), []),
    namesToReview(),
    knownTokens(),
  ]);
  const unfiled = (entries ?? []).filter((e) => needsRefile(e, now) || e.parseError === "thesis-full");
  const groups = entries === null ? [] : groupTodayByCompany(entries, today);
  const errorMessage = errorText(error);
  const noticeMessage = noticeText(notice);
  // The box always renders (spec s9: never a blank form), even when the list could not be read.
  return (
    <div className="space-y-(--block-gap)">
      <h1 className="sr-only">Desk</h1>
      {errorMessage ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorMessage}
        </p>
      ) : null}
      {noticeMessage ? <p className="rounded-sm border border-rule px-3 py-2 text-small text-ink">{noticeMessage}</p> : null}
      <CaptureBar known={known} />
      <QueuedCard />
      {entries === null ? (
        <p role="alert" className="text-small text-ink-muted">
          Could not load today&apos;s captures. New captures are still saved; reload to try again.
        </p>
      ) : null}
      <div className="grid gap-(--block-gap) desk:grid-cols-2">
        <Tray
          title="Needs you"
          count={blocked.length + unfiled.length + (names > 0 ? 1 : 0)}
          empty={{ body: "Nothing needs you. New gate failures and new names appear here." }}
        >
          {blocked.map((b) => (
            <NeedsYouCard
              key={b.itemId}
              tone="bad"
              stateWord="Publish stopped"
              title={b.title}
              body={`${formatCount(b.failureCount, "check")} failed on ${formatDate(b.decidedAt)}. Each flagged sentence has a note beside it.`}
              action={{ label: "Open the gate notes", href: `/desk/items/${b.itemId}#gate` }}
            />
          ))}
          {unfiled.map((e) => (
            <NeedsYouCard
              key={e.id}
              tone="warn"
              stateWord="Not filed"
              title={firstLine(e.rawText)}
              body={filingErrorText(e.parseError === "thesis-full" ? "thesis-full" : "filing-failed")}
              form={e.parseError === "thesis-full" ? undefined : { label: "File it now", action: refileCaptureAction.bind(null, e.id) }}
            />
          ))}
          {names > 0 ? (
            <NeedsYouCard
              tone="warn"
              stateWord="New names"
              title={`${formatCount(names, "new name")} to screen`}
              body="Like a screener: say who each one is. Your notes were saved either way."
              action={{ label: "Screen new names", href: "/desk/names" }}
            />
          ) : null}
        </Tray>
        <Tray title="Today" count={groups.reduce((n, g) => n + g.entries.length, 0)} empty={{ body: "Nothing captured yet today." }}>
          <TodayList groups={groups} known={known} />
        </Tray>
      </div>
      {entries === null ? null : (
        <section aria-label="Capture streak">
          <StreakStrip variant="desk" {...toStreakData(captureStreak(entries.map((e) => istDate(e.createdAt)), today))} />
        </section>
      )}
    </div>
  );
}
