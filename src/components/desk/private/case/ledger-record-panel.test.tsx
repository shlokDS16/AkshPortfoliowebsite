import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CaseRecordV1 } from "@/modules/casefile/client";
import { parseCaseRecord } from "@/modules/casefile/client";
import type { LedgerStatus } from "@/modules/cases/client";
import { caseRecordFixture, FIXTURE_CHART } from "@/test/fixtures/case-record";
import { LedgerRecordPanel } from "./ledger-record-panel";

const record = (patch = {}): CaseRecordV1 => parseCaseRecord(JSON.parse(JSON.stringify(caseRecordFixture(patch))))!;
const CLEAN: LedgerStatus = { differs: false, figuresTo: "2026-06-16", dateOut: false, frozen: false };
const refresh = vi.fn(async () => {});
const html = (status: LedgerStatus | null, rec: CaseRecordV1 | null = record()) =>
  renderToStaticMarkup(<LedgerRecordPanel record={rec} status={status} refreshAction={refresh} />);

describe("the ledger record panel (spec s33.8)", () => {
  it("shows the record read-only under its label, every entry with his words and its fingerprint", () => {
    const rec = record();
    const out = html(CLEAN);
    expect(out).toContain("From the ledger (sealed; cannot be edited)");
    for (const e of rec.events) {
      expect(out).toContain(e.hash);
      expect(out).toContain(e.words);
    }
    expect(out).not.toContain("<textarea");
    expect(out).not.toContain("<input");
    expect(out).not.toContain("Refresh from the ledger");
  });

  it("states the machine's dates once, with no result", () => {
    const out = html(CLEAN);
    expect(out).toContain("Figures to 16 Jun 2026");
    expect(out).toContain("Entry: NSE close of 13 Jan 2026. Exit: NSE close of 16 Jun 2026. 154 days from entry to exit.");
    expect(out).not.toMatch(/₹|%|ahead|behind/);
  });

  it("says whether a chart is part of the record, in words", () => {
    expect(html(CLEAN)).toContain("Chart: not included.");
    expect(html(CLEAN, record({ chart: FIXTURE_CHART }))).toContain("Chart: included (3 weekly points).");
  });

  it("offers the refresh only when the record differs, with the spec's sentence", () => {
    const out = html({ ...CLEAN, differs: true });
    expect(out).toContain("The ledger has changed since this revision (a new lesson, or a day listed in the public file).");
    expect(out).toContain("Refresh from the ledger");
    expect(out).not.toContain("Unpublish");
  });

  it("offers the refresh for a private item whose date is behind the ledger's, and names both dates", () => {
    const out = html({ differs: false, figuresTo: "2026-07-20", dateOut: true, frozen: false });
    expect(out).toContain("Figures to on this case study is not the ledger&#x27;s date, 20 Jul 2026.");
    expect(out).toContain("Refresh from the ledger");
  });

  it("on a public item whose date is frozen: the way out in plain words, and no refresh that would walk into a refusal", () => {
    const out = html({ differs: true, figuresTo: "2026-07-20", dateOut: true, frozen: true });
    expect(out).toContain("Figures to is fixed while a case study is public. To use the ledger&#x27;s date, 20 Jul 2026: Unpublish it, then Refresh from the ledger, then Publish.");
    expect(out).not.toContain("<button");
  });

  it("does not show the frozen sentence when nothing is frozen", () => {
    expect(html({ ...CLEAN, differs: true })).not.toContain("Unpublish");
    expect(html(CLEAN)).not.toContain("Unpublish");
    expect(html(null)).not.toContain("Unpublish");
  });

  it("says nothing about change when the ledger could not be read now", () => {
    const out = html(null);
    expect(out).not.toContain("The ledger has changed since this revision");
    expect(out).not.toContain("Refresh from the ledger");
    expect(out).toContain("Whether the ledger has changed could not be read just now.");
  });

  it("an unreadable record shows one sentence and no entries", () => {
    const out = html(null, null);
    expect(out).toContain("The ledger record could not be read. Run the integrity check on the Ledger page.");
    expect(out).not.toContain("Fingerprint");
  });

  it("shows his words as text, never as markup", () => {
    const rec = record();
    rec.events[0].words = "<img src=x onerror=alert(1)> **bold**";
    const out = html(CLEAN, rec);
    expect(out).toContain("&lt;img src=x onerror=alert(1)&gt; **bold**");
    expect(out).not.toContain("<img");
  });

  it("uses none of the words the site never says", () => {
    const out = html({ differs: true, figuresTo: "2026-07-20", dateOut: true, frozen: true }).replace(/<[^>]+>/g, " ");
    expect(out.replace(/His words[^.]*\./g, "")).not.toMatch(/\b(proof|proves|verified|tamper-proof)\b/i);
  });
});
