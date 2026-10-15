// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildCaseStudyView, buildMistakes, listCaseSummaries } from "@/modules/showcase";
import { caseRecordFixture, FIXTURE_CHART } from "@/test/fixtures/case-record";
import { buildSeedSnapshot, withLedgerCase } from "@/test/fakes/showcase-snapshot";
import { expectNoMotion, expectTokenOnly } from "@/test/ui";
import { CaseList } from "./case-list";
import { CasePage } from "./case-page";
import { MistakesList } from "./mistakes-list";
import { RecordKeeping } from "./record-keeping";

const BODY = "## What I would watch next time\n\nThe monsoon signal, earlier.";
function setup(patch: Parameters<typeof caseRecordFixture>[0] = {}, item: Parameters<typeof withLedgerCase>[2] = {}, listed = false) {
  const record = caseRecordFixture(patch);
  if (listed) record.events[0].listed_on = "2026-02-03";
  const snapshot = withLedgerCase(buildSeedSnapshot(), record, { bodyMd: BODY, ...item });
  return { snapshot, view: buildCaseStudyView(snapshot, "lc1-a-closed-idea")!, record };
}
const section = (name: RegExp | string) => screen.getByRole("region", { name });

describe("the case page (spec s33.5)", () => {
  it("is headed by the company as the one h1, with the closed-case tag, the title, the standfirst and the dateline", () => {
    const { view } = setup();
    render(<CasePage view={view} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Kaveri Seed Company Limited" })).toBeInTheDocument();
    expect(screen.getByText("CLOSED CASE · R1")).toBeInTheDocument();
    expect(screen.getByText("Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026")).toBeInTheDocument();
    expect(screen.getByText(/How a margin story can fail/)).toBeInTheDocument();
    expect(screen.getByText("Written 12 Jan 2026 · Closed 15 Jun 2026 · Figures to 16 Jun 2026")).toBeInTheDocument();
  });

  it("has its sections in the order of the spec, each a named region", () => {
    const { view } = setup();
    render(<CasePage view={view} />);
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(["What he expected", "What happened", "What he learned", "Looking back", "How to check these entries", "Disclosure"]);
    for (const n of names) expect(section(n as string)).toBeInTheDocument();
  });

  it("what he expected: the sentence, his open words as quoted text with the sealed time, the fingerprint line, then the change of period", () => {
    const { view, record } = setup();
    render(<CasePage view={view} />);
    const s = section("What he expected");
    expect(within(s).getByText("Expected Kaveri Seed Company Limited to do better than the Nifty 50 over 1 year.")).toBeInTheDocument();
    const quote = within(s).getByText("Seed demand looks steady and the balance sheet is clean.");
    expect(quote.closest("blockquote")).not.toBeNull();
    expect(quote.closest("figure")).toHaveTextContent("His words, sealed 12 Jan 2026, 11:00 IST");
    expect(within(s).getByText(`${record.events[0].hash}`)).toBeInTheDocument();
    expect(within(s).getByText("Changed the period to 2 years on 2 Mar 2026.")).toBeInTheDocument();
    expect(within(s).getByText("I now think this needs two seasons, not one.")).toBeInTheDocument();
  });

  it("keeps his words and the machine's fields apart: his words are quoted text in the reading face, hashes, dates and days are in the mono face", () => {
    const { view, record } = setup();
    const { container } = render(<CasePage view={view} />);
    for (const quote of container.querySelectorAll("blockquote")) {
      expect(quote.className).not.toMatch(/font-mono/);
      expect(quote.textContent).not.toMatch(/[0-9a-f]{64}/);
      expect(quote.querySelector("code, .font-mono")).toBeNull();
    }
    const hash = screen.getAllByText(record.events[0].hash)[0];
    expect(hash.closest(".font-mono, code")).not.toBeNull();
    expect(hash.closest("blockquote")).toBeNull();
    const priceLine = within(section("What happened")).getByText(/Entry: NSE close of 13 Jan 2026/);
    expect(priceLine.closest(".font-mono")).not.toBeNull();
    expect(screen.getByText("Written 12 Jan 2026 · Closed 15 Jun 2026 · Figures to 16 Jun 2026").className).toMatch(/font-mono/);
  });

  it("what happened: the price line, the closing entry with his reason; no chart when the record has none", () => {
    const { view } = setup();
    render(<CasePage view={view} />);
    const s = section("What happened");
    expect(within(s).getByText("Entry: NSE close of 13 Jan 2026. Exit: NSE close of 16 Jun 2026. 154 days from entry to exit.")).toBeInTheDocument();
    expect(within(s).getByText("Closed on 15 Jun 2026. His reason: thesis broken.")).toBeInTheDocument();
    expect(within(s).getByText("Closing: the margin story did not hold.")).toBeInTheDocument();
    expect(within(s).queryByRole("img")).toBeNull();
    expect(within(s).queryByText(/Rebased to 100/)).toBeNull();
  });

  it("with a chart: one labelled image with the text alternative and the visible caption; a legend that does not rest on colour", () => {
    const { view } = setup({ chart: FIXTURE_CHART });
    render(<CasePage view={view} />);
    const s = section("What happened");
    const chart = within(s).getByRole("img");
    expect(chart).toHaveAccessibleName(/^Weekly line chart of Kaveri Seed Company Limited and the Nifty 50, both rebased to 100 at the entry close on 13 Jan 2026, to 16 Jun 2026\. Values are not printed/);
    expect(within(s).getByText(/^Closing prices, NSE\. Rebased to 100 on 13 Jan 2026\. Figures to 16 Jun 2026\. Price only, dividends not included\. A past case, not a view on the share today\.$/)).toBeInTheDocument();
    const legend = within(s).getByRole("list", { name: "Key" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Kaveri Seed Company Limited", "Nifty 50"]);
    expect(chart.querySelectorAll("polyline")).toHaveLength(2);
    expect(chart.querySelector("polyline[stroke-dasharray]")).not.toBeNull(); // the two lines differ by style, not only by colour
    expect(chart.querySelector("text")).toBeNull(); // no value labels inside the drawing
    expect(within(s).getByText("100")).toBeInTheDocument(); // the labelled baseline
  });

  it("what he learned: his call, the kinds of mistake, his words and their fingerprint", () => {
    const { view } = setup();
    render(<CasePage view={view} />);
    const s = section("What he learned");
    expect(within(s).getByText("His call on his own process: flawed.")).toBeInTheDocument();
    expect(within(s).getByText("Kinds of mistake he named: timing, valuation.")).toBeInTheDocument();
    expect(within(s).getByText("I waited too long on the monsoon signal.")).toBeInTheDocument();
  });

  it("looking back shows the revision body as text; the section is absent when there is no body", () => {
    render(<CasePage view={setup().view} />);
    const s = section("Looking back");
    expect(within(s).getByText("What I would watch next time")).toBeInTheDocument();
    expect(within(s).getByText("The monsoon signal, earlier.")).toBeInTheDocument();
    render(<CasePage view={setup({}, { bodyMd: "" }).view} />);
    expect(screen.getAllByRole("region", { name: "Looking back" })).toHaveLength(1);
  });

  it("the listing line appears only for an entry whose sealed day was listed", () => {
    const { rerender } = render(<CasePage view={setup().view} />);
    expect(screen.queryByText(/Listed in the public file/)).toBeNull();
    rerender(<CasePage view={setup({}, {}, true).view} />);
    expect(screen.getAllByText("Listed in the public file on 3 Feb 2026.")).toHaveLength(1);
    expect(screen.getAllByText("Find 12 Jan 2026's line in the public file; its list of fingerprints includes this one.")).toHaveLength(1);
  });

  it("how to check: the rule, one collapsed block per entry with the previous fingerprint and the sealed text, and what the check does not show", () => {
    const { view, record } = setup();
    const { container } = render(<CasePage view={view} />);
    const s = section("How to check these entries");
    expect(within(s).getByText("Each fingerprint is the SHA-256 of the fingerprint before it, one line break, and the sealed text below, in UTF-8, with nothing after it.")).toBeInTheDocument();
    const blocks = s.querySelectorAll("details");
    expect(blocks).toHaveLength(4);
    for (const d of blocks) expect(d.open).toBe(false);
    expect(blocks[0].querySelector("summary")).toHaveTextContent("Opening entry, 12 Jan 2026");
    expect(blocks[1]).toHaveTextContent(record.events[1].prev_hash);
    expect(blocks[1].querySelector("pre")?.textContent).toBe(record.events[1].canonical);
    expect(within(blocks[1] as HTMLElement).getByRole("button", { name: "Check in this browser" })).toBeInTheDocument();
    expect(within(s).getByText("This shows the text is the one the desk sealed at that place in its chain. It does not show when it was written: the public copy of the fingerprints is not switched on.")).toBeInTheDocument();
    expect(container.querySelectorAll("button")).toHaveLength(4);
  });

  it("ends with the standard disclosure and the closing line", () => {
    render(<CasePage view={setup().view} />);
    expect(section("Disclosure")).toHaveTextContent("Position in the security discussed: No.");
    expect(section("Disclosure")).toHaveTextContent("Last reviewed 20 Jul 2026.");
    expect(screen.getByText("A past case, not a view on the share today.")).toBeInTheDocument();
  });

  it("uses only token classes and never animates", () => {
    const { container } = render(<CasePage view={setup({ chart: FIXTURE_CHART }).view} />);
    expectTokenOnly(container);
    expectNoMotion(container);
  });
});

const BANNED = /%|₹|\bRs\b|\bahead\b|\bbehind\b|\bhit\b|\bproof\b|\bproves?\b|\bverified\b|tamper|cannot be altered|\bbuy\b|\bsell\b/i;
/** Every sealed string a page may repeat: the fixture's words, sealed text and fingerprints, which are his and the machine's, not the desk's. */
function withoutSealed(text: string, record: ReturnType<typeof caseRecordFixture>): string {
  let out = text;
  for (const e of record.events) for (const sealed of [e.canonical, e.words]) out = out.split(sealed).join(" ");
  return out.replace(/[0-9a-f]{64}/g, " ");
}

describe("no result is ever printed (publishing rule 10.7)", () => {
  const { snapshot, view, record } = setup({ chart: FIXTURE_CHART }, {}, true);
  // The disclosure's own sentences are fixed and excluded from the scan, like the standard disclosure everywhere.
  const pages: [string, () => ReturnType<typeof render>][] = [
    ["the case page", () => render(<CasePage view={view} />)],
    ["the case index", () => render(<CaseList cases={listCaseSummaries(snapshot)} />)],
    ["Mistakes", () => render(<MistakesList entries={buildMistakes(snapshot)} />)],
    ["How this record is kept", () => render(<RecordKeeping publicFile={null} />)],
  ];
  for (const [name, draw] of pages) {
    it(`${name}: no percent, rupee, verdict, hit or proof word, and no decimal outside a fingerprint or his sealed text`, () => {
      const { container } = draw();
      const clone = container.cloneNode(true) as HTMLElement;
      clone.querySelector("#disclosure")?.remove();
      const text = withoutSealed(clone.textContent ?? "", record);
      expect(text).not.toMatch(BANNED);
      expect(text).not.toMatch(/\d\.\d/);
      expect(text).not.toMatch(/return|excess|outperform|underperform/i);
    });
  }

  it("the chart's values are not in any text, label or attribute a reader or a screen reader meets", () => {
    const { container } = render(<CasePage view={view} />);
    const labels = [...container.querySelectorAll("[aria-label], title, desc")].map((el) => el.getAttribute("aria-label") ?? el.textContent ?? "").join(" ");
    // 100 is the labelled baseline and may be said; every other value is the result and may not.
    for (const v of FIXTURE_CHART.points.flatMap((p) => [p.share, p.index]).filter((n) => n !== 100)) expect(labels).not.toContain(String(v));
    expect(container.textContent).not.toMatch(/96\.5|101\.25|104\.7|90\.1/);
  });
});

describe("the index and Mistakes lists", () => {
  it("the index links each case with its company, title, standfirst and close month", () => {
    const { snapshot } = setup();
    render(<CaseList cases={listCaseSummaries(snapshot)} />);
    expect(screen.getByRole("link", { name: "Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026" })).toHaveAttribute("href", "/cases/lc1-a-closed-idea");
    expect(screen.getByText("Closed Jun 2026")).toBeInTheDocument();
  });

  it("Mistakes shows his call, the kinds of mistake and his review words with the sealed time, and links to the case", () => {
    const { snapshot } = setup();
    render(<MistakesList entries={buildMistakes(snapshot)} />);
    expect(screen.getByText("His call on his own process: flawed.")).toBeInTheDocument();
    expect(screen.getByText("Kinds of mistake he named: timing, valuation.")).toBeInTheDocument();
    expect(screen.getByText("I waited too long on the monsoon signal.").closest("figure")).toHaveTextContent("His words, sealed 16 Jun 2026, 09:30 IST");
    expect(screen.getByRole("link", { name: /Kaveri Seed Company Limited/ })).toHaveAttribute("href", "/cases/lc1-a-closed-idea");
  });
});

describe("How this record is kept (spec s33.6)", () => {
  it("says the six things, links to the cases, and while the public copy is off says what a fingerprint does not show", () => {
    render(<RecordKeeping publicFile={null} />);
    expect(screen.getByRole("heading", { level: 2, name: "How this record is kept" })).toBeInTheDocument();
    expect(screen.getByText(/^Aksh keeps a private record of his investment ideas\./)).toBeInTheDocument();
    expect(screen.getByText(/The database owner could still rewrite the whole chain; a public copy of the fingerprints is what would show that\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^No entry carries a date he chooses\./)).toBeInTheDocument();
    expect(screen.getByText(/Results are price only, against the Nifty 50 price index, without dividends\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Results stay private\. This site shows no figure for how his ideas did\./)).toBeInTheDocument();
    expect(screen.getByText(/^The public copy of the fingerprints is not switched on\. Until it is, a fingerprint shows that an entry is the one the desk sealed at that place in its chain, not when it was written\.$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read the closed cases" })).toHaveAttribute("href", "/cases");
  });

  it("when the public file is set, says since when, links it, and what an earlier entry can be dated to", () => {
    render(<RecordKeeping publicFile={{ url: "https://example.org/fingerprints.txt", since: "2026-11-02" }} />);
    expect(screen.queryByText(/is not switched on/)).toBeNull();
    expect(screen.getByText(/^Since 2 Nov 2026 the desk publishes each day's fingerprints in a public file, /)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.org/fingerprints.txt" })).toHaveAttribute("href", "https://example.org/fingerprints.txt");
    expect(screen.getByText(/An entry sealed before 2 Nov 2026 can be dated by that file only to 2 Nov 2026\.$/)).toBeInTheDocument();
  });
});
