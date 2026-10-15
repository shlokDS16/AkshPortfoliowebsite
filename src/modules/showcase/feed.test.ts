import { describe, expect, it } from "vitest";
import { buildRichSnapshot, buildSeedSnapshot } from "@/test/fakes/showcase-snapshot";
import { KAVERI, NOTES } from "@/test/fixtures/casefile";
import { derivedProblems } from "./derived-scan";
import { escapeXml, feedEntries, FEED_FIXED_LINE, renderRss } from "./feed";

const SITE = "https://desk.example";
const rich = buildRichSnapshot();

describe("feedEntries", () => {
  const entries = feedEntries(rich);

  it("is one entry per gated revision of a served file, a learning note, a process note or a case, newest first", () => {
    expect(entries.map((e) => e.guid)).toEqual([
      "/companies/kavpump#r2", "/companies/sahcold#r1", "/companies/kavpump#r1", "/process/how-i-keep-a-case-file#r1",
      `/notes/${NOTES[1].slug}#r1`, `/notes/${NOTES[0].slug}#r1`, "/cases/lc1-a-closed-idea#r1",
    ]);
    const dates = entries.map((e) => e.on);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("caps the list at the limit, newest kept", () => {
    expect(feedEntries(rich, 3).map((e) => e.guid)).toEqual(["/companies/kavpump#r2", "/companies/sahcold#r1", "/companies/kavpump#r1"]);
    expect(feedEntries(rich)).toHaveLength(7);
    expect(feedEntries(rich, 0)).toEqual([]);
  });

  it("a file revision: title with the file number and R-number, his reason, the machine line, his objective, then the fixed line", () => {
    const [second] = entries;
    expect(second).toMatchObject({ title: "Kaveri Pumps (fictional) · File 01 · R2", path: "/companies/kavpump", on: "2026-08-20" });
    const parts = second.description.split("\n\n");
    expect(parts).toEqual([
      KAVERI.revisions[1].reason,
      "Revision R2 · 2 sentences changed · figures to 22 Aug 2026",
      KAVERI.learningObjective,
      FEED_FIXED_LINE,
    ]);
    expect(FEED_FIXED_LINE).toBe("For learning, not advice. Figures on the page are at least 30 days old.");
  });

  it("the first revision of a file says so in the machine's line; a note is titled as he titled it", () => {
    const first = entries.find((e) => e.guid === "/companies/kavpump#r1")!;
    expect(first.description.split("\n\n")[0]).toBe("First version.");
    expect(first.description).toMatch(/New file · \d+ tests · figures to 22 Aug 2026/);
    const note = entries.find((e) => e.guid === `/notes/${NOTES[0].slug}#r1`)!;
    expect(note.title).toBe(NOTES[0].title);
    expect(note.description.split("\n\n")).toEqual([NOTES[0].reason, "Learning note · R1", NOTES[0].learningObjective, FEED_FIXED_LINE]);
  });

  it("a case with the chart switched on is titled company then title and prints no figure, verdict or id", () => {
    const entry = entries.find((e) => e.path === "/cases/lc1-a-closed-idea")!;
    expect(entry.title).toBe("Kaveri Seed Company Limited: Kaveri Seed Company Limited: a closed idea, Jan 2026 to Jun 2026");
    expect(entry.description.split("\n\n")).toEqual([
      "Drafted from the ledger", "Closed case · written 12 Jan 2026", "How a margin story can fail while the demand story holds.", FEED_FIXED_LINE,
    ]);
    expect(derivedProblems(JSON.stringify(entry))).toEqual([]);
  });

  it("is empty for a snapshot with nothing public", () => {
    expect(feedEntries({ ...buildSeedSnapshot(), items: [], revisions: [] })).toEqual([]);
  });
});

describe("renderRss", () => {
  const xml = renderRss(feedEntries(rich), SITE);

  it("is RSS 2.0 with a self link, the channel's fixed fields and a lastBuildDate equal to the newest entry", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">')).toBe(true);
    expect(xml).toContain("<title>Case files · Aksh Agrawal</title>");
    expect(xml).toContain(`<link>${SITE}/</link>`);
    expect(xml).toContain(`<atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/>`);
    expect(xml).toContain("<language>en-IN</language>");
    expect(xml).toContain("<lastBuildDate>Thu, 20 Aug 2026 00:00:00 +0530</lastBuildDate>");
  });

  it("writes each item with an absolute link, a guid that is not a link and a day-precision IST pubDate", () => {
    expect(xml).toContain(`<link>${SITE}/companies/kavpump</link>`);
    expect(xml).toContain('<guid isPermaLink="false">/companies/kavpump#r2</guid>');
    expect(xml).toContain("<pubDate>Thu, 20 Aug 2026 00:00:00 +0530</pubDate>");
    expect(xml).toContain("<pubDate>Mon, 20 Jul 2026 00:00:00 +0530</pubDate>");
    expect((xml.match(/<item>/g) ?? []).length).toBe(7);
  });

  it("is byte-identical for the same snapshot, so an unchanged feed is not a new one", () => {
    expect(renderRss(feedEntries(buildRichSnapshot()), SITE)).toBe(xml);
  });

  it("builds nothing from the clock: an empty feed has no lastBuildDate", () => {
    expect(renderRss([], SITE)).not.toContain("lastBuildDate");
  });

  it("a snapshot of every kind, chart on, renders no id and no figure the builders added", () => {
    expect(derivedProblems(xml)).toEqual([]);
  });
});

describe("escapeXml", () => {
  it("escapes & < > \" ' and drops C0 control characters except tab and newline", () => {
    expect(escapeXml(`A & B <c> "d" 'e'`)).toBe("A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;");
    expect(escapeXml("a\u0000b\u0008c\td\ne\u001ff\r")).toBe("abc\td\nef");
  });

  it("drops U+FFFE and U+FFFF too: XML 1.0 forbids them", () => {
    expect(escapeXml("a￿b￾c")).toBe("abc");
  });

  it("a title that tries to close the markup stays text", () => {
    const entries = [{ title: "</title><x/>", path: "/notes/a", guid: "/notes/a#r1", on: "2026-08-01", description: "a & b" }];
    const out = renderRss(entries, SITE);
    expect(out).toContain("<title>&lt;/title&gt;&lt;x/&gt;</title>");
    expect(out).not.toContain("<x/>");
  });
});
