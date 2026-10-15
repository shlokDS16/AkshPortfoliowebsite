import type { ReactNode } from "react";
import { IdeaScoreBlock } from "@/components/desk/private/ledger/idea-score";
import { IdeaTable } from "@/components/desk/private/ledger/idea-table";
import { IdeaTimeline } from "@/components/desk/private/ledger/idea-timeline";
import { LedgerNeeds } from "@/components/desk/private/ledger/ledger-needs";
import { LedgerStatus } from "@/components/desk/private/ledger/ledger-status";
import { LedgerTiles } from "@/components/desk/private/ledger/ledger-tiles";
import { chainReport, combineChecks, eventLine, ideaLine, needsYou, summarise, type ChainState } from "@/modules/ledger/client";
import { change, closedIdea, event, finalScore, idea, score } from "@/test/fixtures/ledger";
import { ThemeSwitch } from "../preview/theme-switch";
import { FormsPreview } from "./forms-preview";

// Development only (page.dev.tsx): the Ledger components in their states, on invented data, with no database and no sign-in.
const TODAY = "2026-10-13";
const ideas = [
  idea({ id: "a", companyName: "Kaveri Pumps (fictional)", symbol: "KAVPUMPS", openedAt: "2026-03-02T05:00:00Z" }),
  idea({ id: "b", companyName: "Dhanu Textiles (fictional)", symbol: "DHANUTEX", expects: "underperform", openedAt: "2026-06-10T05:00:00Z" }),
  idea({ id: "c", companyName: "Meghna Cables (fictional)", symbol: "MEGHCAB", openedAt: "2025-06-02T05:00:00Z" }),
  idea({ id: "d", companyName: "Fresh Idea Ltd (fictional)", symbol: "FRESHID", openedAt: "2026-10-13T04:00:00Z" }),
  closedIdea({ id: "e", companyName: "Sagar Chemicals (fictional)", symbol: "SAGARCH", closeReason: "thesis_broken", processCall: "flawed" }),
  closedIdea({ id: "f", companyName: "Prabha Foods (fictional)", symbol: "PRABHAF", processCall: null }),
  closedIdea({ id: "g", companyName: "Ekta Steel (fictional)", symbol: "EKTASTL", closeReason: "horizon_reached" }),
];
const scores = [
  score({ ideaId: "a", ideaReturn: 0.123, indexReturn: 0.05, excess: 0.073, holdingDays: 225, markDate: "2026-10-12", flags: ["hand_price"] }),
  score({ ideaId: "b", ideaReturn: -0.08, indexReturn: 0.02, excess: 0.1, holdingDays: 125, markDate: "2026-10-12", flags: ["stale", "attested"], entrySkippedDays: 2 }),
  score({ ideaId: "c", ideaReturn: 0.9, indexReturn: 0.11, excess: 9, markDate: "2026-10-12", flags: ["implausible"] }),
  score({ ideaId: "d", entryDate: null, entryClose: null, ideaReturn: null, indexReturn: null, excess: null, flags: ["entry_pending"] }),
  finalScore({ ideaId: "e", ideaReturn: -0.12, indexReturn: 0.04, excess: -0.16, holdingDays: 120, flags: ["hand_price"], exitSkippedDays: 1 }),
  finalScore({ ideaId: "f", ideaReturn: 0.2, indexReturn: 0.1, excess: 0.1 }),
  finalScore({ ideaId: "g", ideaReturn: 0.05, indexReturn: 0.07, excess: -0.02, holdingDays: 365 }),
];
const changes = [change({ ideaId: "e", id: 3, changedAt: "2026-10-10T00:30:00Z", changed: ["mark_close", "excess"], was: { mark_close: 100, excess: -0.15 }, became: { mark_close: 99, excess: -0.16 } })];
const summary = summarise(ideas, scores, TODAY, changes);
const lines = ideas.map((i) => ideaLine(i, scores.find((s) => s.ideaId === i.id) ?? null, changes, summary.pastHorizon.includes(i.id)));

const okStatus = combineChecks({ chain: { ok: true, events: 42, firstBadSeq: null, badIdea: null }, anchors: { ok: true, days: 9, firstBadDate: null, reason: null } });
const badStatus = combineChecks({ chain: { ok: false, events: 42, firstBadSeq: 17, badIdea: "x" }, anchors: { ok: false, days: 9, firstBadDate: "2026-10-10", reason: "head" } });
const OK: ChainState = { kind: "checked", status: okStatus, report: chainReport(okStatus) };
const BAD: ChainState = { kind: "checked", status: badStatus, report: chainReport(badStatus) };
const closes = { latestOpenDay: "2026-10-12", latestOfficialDay: "2026-10-12", handEnteredDays: 2 };
const anchors = { sealedDays: 9, latestSealedDate: "2026-10-12", publishedDays: 7, waitingDays: 2, latestPublishedDate: "2026-10-10" };

const events = [
  eventLine(event({ id: "e1", ideaId: "a", seq: 5, kind: "open", recordedAt: "2026-03-02T05:00:00Z", hash: "0123456789abcdef", bodyMd: "Orders are growing faster than the street expects.\nI would be wrong if margins fall below 12%.", stance: { expects: "outperform", horizon_days: 365, held: false, benchmark: "NIFTY 50" } })),
  eventLine(event({ id: "e2", ideaId: "a", seq: 9, kind: "note", recordedAt: "2026-04-11T05:00:00Z", hash: "fedcba9876543210", bodyMd: "Q4 margin 14.2%, above my floor." })),
  eventLine(event({ id: "e3", ideaId: "a", seq: 14, kind: "close", recordedAt: "2026-06-01T05:00:00Z", hash: "aa11bb22cc33dd44", bodyMd: "Closing: the order book stopped growing.", stance: { reason: "thesis_broken" } })),
  eventLine(event({ id: "e4", ideaId: "a", seq: 15, kind: "review", recordedAt: "2026-06-02T05:00:00Z", hash: "99887766aabbccdd", bodyMd: "I sized it too big for what I knew.", stance: { process: "flawed", tags: ["sizing", "timing"] } })),
];

function Spec({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule py-(--block-gap)">
      <p className="mb-3 font-mono text-mono-label uppercase text-ink-muted">{name}</p>
      {children}
    </section>
  );
}

export default function LedgerPreview() {
  return (
    <main className="mx-auto max-w-page space-y-2 px-(--gutter) py-4">
      <ThemeSwitch />
      <Spec name="LedgerStatus · pass">
        <LedgerStatus closes={closes} anchors={anchors} chain={OK} runs={[{ job: "ledger:prices", ranAt: "2026-10-13T00:40:00Z", ok: true, detail: "up to date" }, { job: "ledger:score", ranAt: "2026-10-13T00:41:00Z", ok: true, detail: "scored 7 ideas" }, { job: "ledger:anchor", ranAt: null, ok: null }]} />
      </Spec>
      <Spec name="LedgerStatus · failed check · a step failed">
        <LedgerStatus closes={closes} anchors={anchors} chain={BAD} runs={[{ job: "ledger:prices", ranAt: "2026-10-13T00:40:00Z", ok: false, detail: "NSE refused; closes to 2026-10-09" }]} />
      </Spec>
      <Spec name="LedgerStatus · could not check">
        <LedgerStatus closes={null} anchors={null} chain={{ kind: "unreadable" }} runs={null} />
      </Spec>
      <Spec name="LedgerTiles">
        <LedgerTiles summary={summary} asOf="2026-10-12" />
      </Spec>
      <Spec name="LedgerNeeds">
        <LedgerNeeds cards={needsYou(ideas, scores, summary)} />
      </Spec>
      <Spec name="IdeaTable · open">
        <IdeaTable id="open" title="Open ideas" ideas={lines.filter((l) => l.status === "open")} limit={50} moreHref={null} />
      </Spec>
      <Spec name="IdeaTable · closed">
        <IdeaTable id="closed" title="Closed ideas" ideas={lines.filter((l) => l.status === "closed")} limit={2} moreHref="#" />
      </Spec>
      <Spec name="IdeaScoreBlock · IdeaTimeline">
        <div className="space-y-8">
          <IdeaScoreBlock line={lines[4]!} score={scores[4]!} />
          <IdeaTimeline events={events} />
        </div>
      </Spec>
      <Spec name="IdeaForm · EventForm (the action refuses, to show the error)">
        <FormsPreview />
      </Spec>
    </main>
  );
}
