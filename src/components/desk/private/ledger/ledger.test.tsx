// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { chainReport, combineChecks, eventLine, ideaLine, summarise, type ChainState, type IdeaLine } from "@/modules/ledger/client";
import { change, closedIdea, event, finalScore, idea, score } from "@/test/fixtures/ledger";
import { expectTokenOnly } from "@/test/ui";
import { EventForm } from "./event-form";
import { IdeaForm } from "./idea-form";
import { IdeaScoreBlock } from "./idea-score";
import { IdeaTable } from "./idea-table";
import { IdeaTimeline } from "./idea-timeline";
import { LedgerNeeds } from "./ledger-needs";
import { LedgerStatus } from "./ledger-status";
import { LedgerTiles } from "./ledger-tiles";

const TODAY = "2026-10-13";
const FORBIDDEN = /cannot be altered|tamper|tamper-proof|unaltered|\bproves?\b|\bproof\b|ahead of the nifty|beat the nifty/i;

const summaryOf = (ideas: ReturnType<typeof idea>[], scores: ReturnType<typeof score>[]) => summarise(ideas, scores, TODAY);

function closedSet(n: number, asExpected: number) {
  const ideas = Array.from({ length: n }, (_, i) => closedIdea({ id: `c${i}` }));
  const scores = ideas.map((idea, i) => finalScore({ ideaId: idea.id, excess: i < asExpected ? 0.05 : -0.05 }));
  return summaryOf(ideas, scores);
}

describe("LedgerTiles", () => {
  it("shows 4 of 7 ended as expected, with a percentage from five closed ideas up", () => {
    render(<LedgerTiles summary={closedSet(7, 4)} asOf="2026-10-12" />);
    const tile = screen.getByText("Closed ideas").parentElement!;
    expect(tile).toHaveTextContent("4 of 7");
    expect(tile).toHaveTextContent("ended as expected (57%)");
  });

  it("shows no percentage under five closed ideas, and says so", () => {
    render(<LedgerTiles summary={closedSet(4, 3)} asOf="2026-10-12" />);
    const tile = screen.getByText("Closed ideas").parentElement!;
    expect(tile).toHaveTextContent("3 of 4");
    expect(tile.textContent).not.toMatch(/%/);
    expect(tile).toHaveTextContent("Fewer than 5 closed ideas: no percentage is shown.");
  });

  it("names the closed ideas the figure leaves out, right beside it", () => {
    const ideas = [closedIdea({ id: "ok" }), closedIdea({ id: "flag" }), closedIdea({ id: "wait" })];
    const scores = [finalScore({ ideaId: "ok" }), finalScore({ ideaId: "flag", flags: ["jump"] }), finalScore({ ideaId: "wait", isFinal: false, flags: ["exit_pending"] })];
    render(<LedgerTiles summary={summaryOf(ideas, scores)} asOf="2026-10-12" />);
    const tile = screen.getByText("Closed ideas").parentElement!;
    expect(within(tile).getByTestId("not-counted")).toHaveTextContent("2 closed ideas not counted yet (needs a check, waiting for a close, or exit not fixed).");
  });

  it("says nothing about left-out ideas when there are none", () => {
    render(<LedgerTiles summary={closedSet(2, 1)} asOf="2026-10-12" />);
    expect(screen.queryByTestId("not-counted")).toBeNull();
  });

  it("speaks of the call ending as expected, never ahead or behind, and shows the direction counts", () => {
    const ideas = [idea({ id: "a" }), idea({ id: "b", expects: "underperform" })];
    const scores = [score({ ideaId: "a", excess: 0.03 }), score({ ideaId: "b", excess: 0.02 })];
    const { container } = render(<LedgerTiles summary={summaryOf(ideas, scores)} asOf="2026-10-12" />);
    expect(container).toHaveTextContent("as expected so far");
    expect(container).toHaveTextContent("1 idea expecting to do better than the Nifty 50, 1 expecting to do worse.");
    expect(container).toHaveTextContent("an idea that expected to do worse than the Nifty 50 counts as expected when it did");
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expect(container).toHaveTextContent("Figures to 12 Oct 2026");
  });

  it("an empty ledger shows nothing counted yet", () => {
    const { container } = render(<LedgerTiles summary={summaryOf([], [])} asOf={null} />);
    expect(container).toHaveTextContent("none counted yet");
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
});

const okState = (): ChainState => {
  const status = combineChecks({
    chain: { ok: true, events: 42, firstBadSeq: null, badIdea: null },
    anchors: { ok: true, days: 9, firstBadDate: null, reason: null },
  });
  return { kind: "checked", status, report: chainReport(status) };
};
const closes = { latestOpenDay: "2026-10-12", latestOfficialDay: "2026-10-12", handEnteredDays: 0 };
const anchors = { sealedDays: 9, latestSealedDate: "2026-10-12", publishedDays: 9, waitingDays: 0, latestPublishedDate: "2026-10-12" };

describe("LedgerStatus", () => {
  it("a pass shows the headline and the standing limit together, and claims nothing stronger", () => {
    const { container } = render(<LedgerStatus closes={closes} anchors={anchors} chain={okState()} runs={null} />);
    const ok = screen.getByTestId("chain-ok");
    expect(ok).toHaveTextContent("Consistent with itself: 42 entries, 9 sealed days.");
    expect(ok).toHaveTextContent("It does not show that nothing could have been changed.");
    expect(container).toHaveTextContent("Closes to 12 Oct 2026.");
    expect(container).toHaveTextContent("Public copy of the fingerprints to 12 Oct 2026.");
    expect(container.textContent).not.toMatch(FORBIDDEN);
    expectTokenOnly(container);
  });

  it("a failure names the check that found it and offers no reassurance", () => {
    const status = combineChecks({
      chain: { ok: false, events: 42, firstBadSeq: 17, badIdea: "i" },
      anchors: { ok: false, days: 9, firstBadDate: "2026-10-10", reason: "head" },
    });
    render(<LedgerStatus closes={closes} anchors={anchors} chain={{ kind: "checked", status, report: chainReport(status) }} runs={null} />);
    const failed = screen.getByTestId("chain-failed");
    expect(failed).toHaveAttribute("role", "alert");
    expect(failed).toHaveTextContent("Entry chain check");
    expect(failed).toHaveTextContent("The ledger chain is broken at entry 17.");
    expect(failed).toHaveTextContent("Sealed-day check");
    expect(failed).toHaveTextContent("The sealed days and the entries disagree from 10 Oct 2026 (the fingerprint differs). This check changed nothing. Tell Shlok.");
    expect(screen.queryByTestId("chain-ok")).toBeNull();
    expect(failed.textContent).not.toMatch(/Consistent|intact|does not show/i);
  });

  it("a check that could not run says could not check, and nothing that reads as intact or broken", () => {
    const { container } = render(<LedgerStatus closes={closes} anchors={anchors} chain={{ kind: "unreadable" }} runs={null} />);
    const alert = screen.getByTestId("chain-unreadable");
    expect(alert).toHaveTextContent(/^Could not check/);
    expect(container.textContent).not.toMatch(/Consistent|intact|broken|sound|ok\b/i);
    expect(screen.queryByTestId("chain-ok")).toBeNull();
  });

  it("says plainly when the other status lines could not be read", () => {
    render(<LedgerStatus closes={null} anchors={null} chain={okState()} runs={null} />);
    expect(screen.getByText("Could not read how current the closes are.")).toBeInTheDocument();
    expect(screen.getByText("Could not read the public copy's state.")).toBeInTheDocument();
  });

  it("lists the daily steps, opening the list when one failed", () => {
    render(
      <LedgerStatus
        closes={closes}
        anchors={anchors}
        chain={okState()}
        runs={[
          { job: "ledger:prices", ranAt: "2026-10-13T00:40:00Z", ok: true, detail: "up to date" },
          { job: "ledger:score", ranAt: "2026-10-13T00:41:00Z", ok: false, detail: "the ledger failed its own check (chain_broken); nothing was scored" },
          { job: "ledger:anchor", ranAt: null, ok: null },
        ]}
      />,
    );
    expect(screen.getByText(/Daily steps: one failed/).closest("details")).toHaveAttribute("open");
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/has not run yet/)).toBeInTheDocument();
  });
});

function build(i: Parameters<typeof idea>[0], s: Parameters<typeof score>[0] | null, changes: ReturnType<typeof change>[] = [], past = false): IdeaLine {
  return ideaLine(i.status === "closed" ? closedIdea(i) : idea(i), s ? (s.isFinal ? finalScore(s) : score(s)) : null, changes, past);
}

describe("IdeaTable", () => {
  it("an empty ledger says what will appear", () => {
    render(<IdeaTable id="open" title="Open ideas" ideas={[]} limit={50} moreHref={null} />);
    expect(screen.getByText("No ideas yet. Write the first one when you have a view you would stand behind.")).toBeInTheDocument();
  });

  it("one open idea: company, direction, entry, days held, both moves, the result in points with its word and the as-of date", () => {
    const line = build({ id: "a", companyName: "Acme Ltd" }, { ideaId: "a", ideaReturn: 0.123, indexReturn: 0.05, excess: 0.073, holdingDays: 40, markDate: "2026-10-12" });
    const { container } = render(<IdeaTable id="open" title="Open ideas" ideas={[line]} limit={50} moreHref={null} />);
    const row = container.querySelector("[data-idea=a]") as HTMLElement;
    expect(within(row).getByRole("link", { name: "Acme Ltd" })).toHaveAttribute("href", "/desk/ledger/a");
    expect(row).toHaveTextContent("Expects to do better than the Nifty 50");
    expect(row).toHaveTextContent("+12.3%");
    expect(row).toHaveTextContent("+5.0%");
    expect(row).toHaveTextContent("+7.3 pp");
    expect(row).toHaveTextContent("as expected");
    expect(row).toHaveTextContent("as of 12 Oct 2026");
    expectTokenOnly(container);
  });

  it("an idea that expects to do worse shows its direction and is never called ahead", () => {
    const line = build({ id: "a", expects: "underperform" }, { ideaId: "a", ideaReturn: -0.1, indexReturn: 0.02, excess: 0.12 });
    const { container } = render(<IdeaTable id="open" title="Open ideas" ideas={[line]} limit={50} moreHref={null} />);
    expect(container).toHaveTextContent("Expects to do worse than the Nifty 50");
    expect(container).toHaveTextContent("+12.0 pp");
    expect(container.textContent).not.toMatch(FORBIDDEN);
  });

  it("closed ideas with every mark: each mark is visible, and a flagged idea shows its sentence instead of a result", () => {
    const all = build(
      { id: "m", status: "closed" },
      { ideaId: "m", isFinal: true, flags: ["hand_price", "attested", "stale"], entrySkippedDays: 2, exitSkippedDays: 1 },
      [change({ ideaId: "m", id: 8, changedAt: "2026-10-10T00:30:00Z", changed: ["entry_close"], was: { entry_close: 100 }, became: { entry_close: 101.5 } })],
    );
    const flagged = build({ id: "f", status: "closed", companyName: "Flagged Ltd" }, { ideaId: "f", isFinal: true, flags: ["jump"], excess: 0.4 });
    const implausible = build({ id: "p", status: "closed" }, { ideaId: "p", isFinal: true, flags: ["implausible"], excess: 9 });
    const isin = build({ id: "n", status: "closed" }, { ideaId: "n", isFinal: true, flags: ["isin_changed"] });
    const { container } = render(<IdeaTable id="closed" title="Closed ideas" ideas={[all, flagged, implausible, isin]} limit={25} moreHref={null} />);
    const row = (id: string) => container.querySelector(`[data-idea=${id}]`) as HTMLElement;
    for (const text of [
      "Includes a close that was entered by hand.",
      "Includes a split, bonus or note about a price move that you entered by hand.",
      "The latest close is three or more weekdays old.",
      "Entry taken 2 trading days late",
      "Exit taken 1 trading day late",
      "Restated on 10 Oct 2026.",
      "Entry close: was 100.00, now 101.50.",
    ]) {
      expect(row("m")).toHaveTextContent(text);
    }
    expect(row("f")).toHaveTextContent("Needs a check: the price moved sharply. Was there a split or bonus?");
    expect(row("f")).not.toHaveTextContent("pp");
    expect(row("p")).toHaveTextContent("Needs a check: the return is too large to be believed.");
    expect(row("n")).toHaveTextContent("Needs a check: the share's identity code changed.");
    expect(row("m")).toHaveTextContent("Closed 1 Jun 2026 · Played out · Lesson written");
  });

  it("a closed idea with no lesson says so", () => {
    const line = build({ id: "c", status: "closed", processCall: null }, { ideaId: "c", isFinal: true });
    render(<IdeaTable id="closed" title="Closed ideas" ideas={[line]} limit={25} moreHref={null} />);
    expect(screen.getByText(/No lesson yet/)).toBeInTheDocument();
  });

  it("a waiting idea says the entry will be set at the next close in place of a result", () => {
    const line = build({ id: "w" }, { ideaId: "w", entryDate: null, entryClose: null, excess: null, ideaReturn: null, indexReturn: null, flags: ["entry_pending"] });
    render(<IdeaTable id="open" title="Open ideas" ideas={[line]} limit={50} moreHref={null} />);
    expect(screen.getByText("Entry will be set at the next close.")).toBeInTheDocument();
  });

  it("pages explicitly: shows the window, says how many more, and links to more", () => {
    const lines = Array.from({ length: 5 }, (_, i) => build({ id: `x${i}` }, { ideaId: `x${i}` }));
    render(<IdeaTable id="open" title="Open ideas" ideas={lines} limit={3} moreHref="/desk/ledger?open=100#open" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/2 more ideas not shown/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Show more" })).toHaveAttribute("href", "/desk/ledger?open=100#open");
  });
});

describe("LedgerNeeds", () => {
  it("lists flagged ideas as cards that open the idea, and explains itself when empty", () => {
    const { rerender } = render(<LedgerNeeds cards={[]} />);
    expect(screen.getByText(/Nothing needs you/)).toBeInTheDocument();
    rerender(<LedgerNeeds cards={[{ kind: "check", ideaId: "f", name: "Flagged Ltd", body: "Needs a check: the price moved sharply. Was there a split or bonus?" }]} />);
    expect(screen.getByRole("link", { name: "Open the idea" })).toHaveAttribute("href", "/desk/ledger/f#new-entry");
    expect(screen.getByText("Needs a check", { selector: "p" })).toBeInTheDocument();
  });
});

describe("the score block and Aksh's entries are separate blocks", () => {
  const typed = "  Margins will hold at 14% because of mix.\n\n<b>not markup</b>  Net: +12.3 pp  ";
  const line = build({ id: "a" }, { ideaId: "a", ideaReturn: 0.123, indexReturn: 0.05, excess: 0.073 });
  const sc = score({ ideaId: "a", ideaReturn: 0.123, indexReturn: 0.05, excess: 0.073 });
  const events = [eventLine(event({ id: "e1", ideaId: "a", seq: 5, kind: "open", bodyMd: typed, hash: "0123456789abcdef", stance: { expects: "outperform", horizon_days: 365, held: false, benchmark: "NIFTY 50" } }))];

  it("has two headings, the machine's first", () => {
    render(
      <>
        <IdeaScoreBlock line={line} score={sc} />
        <IdeaTimeline events={events} />
      </>,
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Scored by the desk", "What you wrote"]);
  });

  it("shows his words exactly as typed, as text, with the date, the kind and the first 8 characters of the hash", () => {
    const { container } = render(<IdeaTimeline events={events} />);
    const words = container.querySelector("[data-words]") as HTMLElement;
    expect(words.textContent).toBe(typed);
    expect(words.querySelector("b")).toBeNull();
    const item = container.querySelector("[data-event]") as HTMLElement;
    expect(item).toHaveTextContent("Idea recorded");
    expect(item).toHaveTextContent("01234567");
    expect(item).not.toHaveTextContent("0123456789");
    expect(item).toHaveTextContent("Expects to do better than the Nifty 50 · Horizon: 1 year · You hold no position");
  });

  it("no score figure is inside his block, and none of his text is inside the score block", () => {
    const { container } = render(
      <>
        <section data-testid="score">
          <IdeaScoreBlock line={line} score={sc} />
        </section>
        <section data-testid="mine">
          <IdeaTimeline events={events} />
        </section>
      </>,
    );
    const mine = screen.getByTestId("mine");
    const theirs = screen.getByTestId("score");
    // His block carries his words and his own choices only: no return, no close, no result.
    const own = (mine.querySelector("[data-words]") as HTMLElement).textContent;
    mine.querySelectorAll("[data-words]").forEach((el) => el.remove());
    expect(mine.textContent).not.toMatch(/\+12\.3%|\+5\.0%|\+7\.3 pp|close \d|Result for the call/);
    expect(theirs.textContent).not.toContain("Margins will hold");
    expect(own).toBe(typed);
    expect(container.querySelectorAll("[data-words] *").length).toBe(0);
  });

  it("the score block shows the dates, the closes with their source, the result, and the price-only note", () => {
    render(<IdeaScoreBlock line={line} score={sc} />);
    expect(screen.getByText("Result for the call").nextElementSibling).toHaveTextContent("+7.3 pp as expected");
    expect(screen.getAllByText(/NSE's official file, fetched by the desk/, { selector: "span" })).toHaveLength(2);
    expect(screen.getByText("Price return only: dividends are left out on both sides.")).toBeInTheDocument();
    expect(screen.getAllByText(/as of 2 Jun 2026/).length).toBeGreaterThan(0);
  });

  it("a flagged idea shows the flag's sentence in place of the result", () => {
    const flagged = build({ id: "a" }, { ideaId: "a", flags: ["implausible"], excess: 9 });
    render(<IdeaScoreBlock line={flagged} score={score({ ideaId: "a", flags: ["implausible"], excess: 9 })} />);
    expect(screen.getByText("Needs a check: the return is too large to be believed.")).toBeInTheDocument();
    expect(screen.queryByText("Result for the call")).toBeNull();
  });
});

const COMPANIES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Acme Ltd", symbol: "ACME", needsReview: false },
  { id: "22222222-2222-4222-8222-222222222222", name: "No Symbol Ltd", symbol: null, needsReview: false },
  { id: "33333333-3333-4333-8333-333333333333", name: "Stub Ltd", symbol: "STUB", needsReview: true },
];

async function fillIdea(user: ReturnType<typeof userEvent.setup>, body: string) {
  await user.selectOptions(screen.getByLabelText("Company"), COMPANIES[0]!.id);
  await user.click(screen.getByLabelText("Expects to do worse than the Nifty 50"));
  await user.click(screen.getByLabelText("1 year"));
  await user.click(screen.getByLabelText("No, I do not hold it"));
  await user.click(screen.getByLabelText("Why do you think so, and what would prove you wrong?"));
  await user.paste(body);
}

describe("IdeaForm", () => {
  it("lists companies without an NSE symbol or still waiting for review as disabled options, with the reason", () => {
    render(<IdeaForm companies={COMPANIES} action={vi.fn()} />);
    const options = within(screen.getByLabelText("Company")).getAllByRole("option");
    expect(options.map((o) => [o.textContent, (o as HTMLOptionElement).disabled])).toEqual([
      ["Choose a company", true],
      ["Acme Ltd (ACME)", false],
      ["No Symbol Ltd: no NSE symbol yet", true],
      ["Stub Ltd: waiting for review", true],
    ]);
  });

  it("has no date field anywhere, labels on every control, and the wording guide beside the box", () => {
    const { container } = render(<IdeaForm companies={COMPANIES} action={vi.fn()} />);
    expect(container.querySelector('input[type="date"], input[type="datetime-local"], input[type="time"]')).toBeNull();
    for (const control of container.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), select, textarea")) {
      expect(control.name, "no field a date could be typed into").not.toMatch(/date|opened|recorded|sealed/i);
      expect(control.labels?.length, `a label for <${control.tagName.toLowerCase()} name=${control.name}>`).toBeGreaterThan(0);
    }
    expect(screen.getByText("Wording guide")).toBeInTheDocument();
  });

  it("submits the choices and his exact words", async () => {
    const action = vi.fn(async () => ({ error: null }));
    render(<IdeaForm companies={COMPANIES} action={action} />);
    const user = userEvent.setup();
    await fillIdea(user, "  Why.\n  Because.  ");
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    expect(action).toHaveBeenCalledTimes(1);
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(data.entries())).toEqual({
      companyId: COMPANIES[0]!.id, expects: "underperform", horizon: "365", held: "no", bodyMd: "  Why.\n  Because.  ",
    });
  });

  for (const code of ["ledger-words-required", "ledger-opposite-open", "ledger-company-not-ready", "ledger-no-symbol", "ledger-integrity", "ledger-bad-horizon", "ledger-body-too-long", "save-failed"] as const) {
    it(`shows the plain message for ${code} beside the form and keeps what was typed`, async () => {
      const action = vi.fn(async () => ({ error: code }));
      render(<IdeaForm companies={COMPANIES} action={action} />);
      const user = userEvent.setup();
      await fillIdea(user, "My long thesis stays.");
      await user.click(screen.getByRole("button", { name: "Record the idea" }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent?.length).toBeGreaterThan(10);
      expect(alert.textContent).not.toMatch(/ledger:|relation|violates|P0001/);
      expect(screen.getByLabelText("Why do you think so, and what would prove you wrong?")).toHaveValue("My long thesis stays.");
      expect(screen.getByLabelText("Company")).toHaveValue(COMPANIES[0]!.id);
      expect(screen.getByLabelText("Expects to do worse than the Nifty 50")).toBeChecked();
      expect(screen.getByLabelText("1 year")).toBeChecked();
      expect(screen.getByLabelText("No, I do not hold it")).toBeChecked();
    });
  }

  it("asks for the number of days only when 'a number of days' is chosen, and keeps it after a refusal", async () => {
    const action = vi.fn(async () => ({ error: "ledger-bad-horizon" as const }));
    render(<IdeaForm companies={COMPANIES} action={action} />);
    const user = userEvent.setup();
    expect(screen.queryByLabelText("Days (30 to 3650)")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Company"), COMPANIES[0]!.id);
    await user.click(screen.getByLabelText("Expects to do better than the Nifty 50"));
    await user.click(screen.getByLabelText("A number of days"));
    await user.type(screen.getByLabelText("Days (30 to 3650)"), "10");
    await user.click(screen.getByLabelText("Yes, I hold a position"));
    await user.click(screen.getByLabelText("Why do you think so, and what would prove you wrong?"));
    await user.paste("Words");
    await user.click(screen.getByRole("button", { name: "Record the idea" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a horizon from 30 days to 10 years.");
    expect(screen.getByLabelText("Days (30 to 3650)")).toHaveValue("10");
  });
});

describe("EventForm", () => {
  const ID = "33333333-3333-4333-8333-333333333333";
  const open = ["note", "revise", "upsize", "downsize", "close", "void"] as const;

  it("offers each entry kind by its plain name, with withdraw only while allowed", () => {
    const { rerender } = render(<EventForm ideaId={ID} allowed={[...open]} voidUntil="2026-10-13T09:30:00.000Z" action={vi.fn()} />);
    expect(within(screen.getByLabelText("What do you want to add?")).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Add a note", "Revise the thesis or the horizon", "Record that I bought more", "Record that I sold some", "Close this idea", "Withdraw this idea",
    ]);
    rerender(<EventForm ideaId={ID} allowed={["note", "close"]} voidUntil={null} action={vi.fn()} />);
    expect(screen.queryByRole("option", { name: "Withdraw this idea" })).toBeNull();
  });

  it("a withdrawn idea gets no form at all", () => {
    render(<EventForm ideaId={ID} allowed={[]} voidUntil={null} action={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("This idea was withdrawn, so nothing more can be added to it.")).toBeInTheDocument();
  });

  it("a close asks for a reason and says the exit is the next close and the idea cannot be reopened; no date field", async () => {
    const action = vi.fn(async () => ({ error: null }));
    const { container } = render(<EventForm ideaId={ID} allowed={["note", "close"]} voidUntil={null} action={action} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("What do you want to add?"), "close");
    expect(screen.getByText("The exit is set at the next close. A closed idea cannot be reopened.")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Reason"), "thesis_broken");
    await user.click(screen.getByLabelText("Why you are closing it"));
    await user.paste("The moat is gone.");
    await user.click(screen.getByRole("button", { name: "Close the idea" }));
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(data.entries())).toEqual({ ideaId: ID, kind: "close", reason: "thesis_broken", bodyMd: "The moat is gone." });
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it("a lesson asks for the process call and at least one tag", async () => {
    const action = vi.fn(async () => ({ error: null }));
    render(<EventForm ideaId={ID} allowed={["review"]} voidUntil={null} action={action} />);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Process was flawed"));
    await user.click(screen.getByLabelText("Timing"));
    await user.click(screen.getByLabelText("Luck"));
    await user.click(screen.getByLabelText("What you learned"));
    await user.paste("I sized it too big.");
    await user.click(screen.getByRole("button", { name: "Save what I learned" }));
    const data = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(data.getAll("tags")).toEqual(["timing", "luck"]);
    expect(data.get("process")).toBe("flawed");
  });

  it("explains the withdrawal window", async () => {
    render(<EventForm ideaId={ID} allowed={["note", "void"]} voidUntil="2026-10-13T09:30:00.000Z" action={vi.fn()} />);
    await userEvent.setup().selectOptions(screen.getByLabelText("What do you want to add?"), "void");
    expect(screen.getByText(/You can withdraw this idea until 13 Oct 2026, 15:00\. After that its entry price is fixed/)).toBeInTheDocument();
  });

  it("a refusal shows its plain message, keeps the words, and never shows a raw database message", async () => {
    const action = vi.fn(async () => ({ error: "ledger-void-too-late" as const }));
    render(<EventForm ideaId={ID} allowed={["note", "void"]} voidUntil="2026-10-13T09:30:00.000Z" action={action} />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("What do you want to add?"), "void");
    await user.click(screen.getByLabelText("Why you are withdrawing it"));
    await user.paste("Changed my mind.");
    await user.click(screen.getByRole("button", { name: "Withdraw the idea" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This idea can no longer be withdrawn, because its entry price is about to be fixed. Close it instead.");
    expect(screen.getByLabelText("Why you are withdrawing it")).toHaveValue("Changed my mind.");
    expect(screen.getByLabelText("What do you want to add?")).toHaveValue("void");
  });
});
