import { describe, expect, it } from "vitest";
import { badDates, countDates } from "@/test/iso-dates";
import { buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { buildNoteView, listNoteSummaries, readingMinutes } from "./notes";

const s = buildSeedSnapshot();

describe("notes", () => {
  it("lists learning notes newest first and process notes separately", () => {
    expect(listNoteSummaries(s, "learning").map((n) => n.slug)).toEqual(["why-utilisation-is-not-pricing-power", "how-to-read-receivable-days"]);
    expect(listNoteSummaries(s, "process").map((n) => n.href)).toEqual(["/process/how-i-keep-a-case-file"]);
  });

  it("a learning note lists the public files that use it, since their first gated use (D25)", () => {
    const note = buildNoteView(s, "learning", "how-to-read-receivable-days")!;
    expect(note.usedIn).toEqual([
      { fileNo: "01", company: "Kaveri Pumps (fictional)", where: "Read first", href: "/companies/kavpump", since: "2026-08-05" },
    ]);
    expect(note.body[0]).toMatchObject({ kind: "p" });
    expect(buildNoteView(s, "process", "how-to-read-receivable-days")).toBeNull();
  });

  it("estimates reading time at 200 words a minute, at least one minute", () => {
    expect(readingMinutes("word ".repeat(450))).toBe(3);
    expect(readingMinutes("")).toBe(1);
  });

  it("rule 2: every date in a note view or summary is a real calendar date; a note without figures has no dataAsOf", () => {
    const view = buildNoteView(s, "learning", "how-to-read-receivable-days")!;
    const models = [view, listNoteSummaries(s, "learning"), listNoteSummaries(s, "process")];
    expect(countDates(models)).toBeGreaterThan(5);
    expect(badDates(models)).toEqual([]);
    expect(view.dataAsOf).toBeNull();
    const dirty = { ...s, items: s.items.map((i) => (i.slug === view.slug ? { ...i, dataAsOf: "2026-02-30" } : i)) };
    expect(buildNoteView(dirty, "learning", view.slug)!.dataAsOf).toBeNull();
  });
});
