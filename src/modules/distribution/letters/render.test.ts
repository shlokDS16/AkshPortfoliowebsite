import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { derivedProblems } from "@/modules/showcase";
import { UNSUBSCRIBE_PLACEHOLDER } from "./copy";
import { renderConfirmation, renderLetter } from "./render";
import type { LetterEntry, LetterView } from "./types";

const SITE = "https://desk.example";
const RID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const entry = (n: number, patch: Partial<LetterEntry> = {}): LetterEntry => ({
  revisionId: RID(n), kind: "learning", path: `/notes/note-${n}`, revNo: 1, detail: "Learning note · R1", title: `Note number ${n}`,
  learningObjective: "Learn a thing.", changeReason: "First version.", holdsPosition: null, companyName: null, ...patch,
});
const view = (patch: Partial<LetterView> = {}): LetterView => ({
  itemId: "item-1", revisionId: "rev-1", subject: "What changed on the desk", objective: "Two notes and one file moved.", note: "First paragraph.\nStill the first.\n\nSecond paragraph.",
  entries: [entry(1), entry(2, { kind: "file", path: "/companies/kavpump", title: "Kaveri Seed: why margins matter", changeReason: "Added the kill test.", holdsPosition: "no", companyName: "Kaveri Seed Company Limited", detail: "Revision R2 · 3 sentences changed · figures to 22 Aug 2026", revNo: 2 })],
  ...patch,
});

describe("renderLetter", () => {
  it("makes the subject his title and puts his objective first, as the preheader and the first line", () => {
    const out = renderLetter(view(), SITE);
    expect(out.subject).toBe("What changed on the desk");
    expect(out.text.startsWith("Two notes and one file moved.\n")).toBe(true);
    expect(out.html).toContain("Two notes and one file moved.");
    expect(out.html).toMatch(/display:\s*none[^>]*>\s*Two notes and one file moved\./);
  });

  it("carries every entry's title, change reason and position exactly as copied, and links each title to its page", () => {
    const v = view();
    const out = renderLetter(v, SITE);
    for (const e of v.entries) {
      expect(out.text).toContain(e.title);
      expect(out.html).toContain(e.title);
      expect(out.text).toContain(`${SITE}${e.path}`);
      expect(out.html).toContain(`href="${SITE}${e.path}"`);
      expect(out.text).toContain(`"${e.changeReason}"`);
      expect(out.text).toContain(e.detail);
    }
    expect(out.text).toContain("Position: No");
    expect(out.html).toContain("Position: No");
    // A page that names no company prints no position line at all.
    expect(out.text.match(/Position:/g)).toHaveLength(1);
  });

  it("shows a null change reason as nothing, and a missing position for a company page as 'Not disclosed'", () => {
    const out = renderLetter(view({ entries: [entry(1, { changeReason: null }), entry(2, { companyName: "Kaveri", holdsPosition: null })] }), SITE);
    expect(out.text).not.toContain('""');
    expect(out.text).toContain("Position: Not disclosed");
  });

  it("escapes every word in the HTML part and never in the text part (his bytes stay as they are)", () => {
    const title = `A & B <i>"x"</i> it's`;
    const v = view({ subject: title, note: `<script>alert(1)</script> & more`, entries: [entry(1, { title, changeReason: `<b>why</b>` })] });
    const out = renderLetter(v, SITE);
    expect(out.html).not.toContain("<script>");
    expect(out.html).not.toContain("<i>");
    expect(out.html).toContain("A &amp; B &lt;i&gt;&quot;x&quot;&lt;/i&gt; it&#39;s");
    expect(out.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(out.text).toContain(title);
    expect(out.text).toContain("<script>alert(1)</script> & more");
    expect(out.subject).toBe(title);
  });

  it("writes his note as plain paragraphs: a blank line starts a paragraph, a line break stays one, and a link is not made", () => {
    const out = renderLetter(view({ note: "See https://elsewhere.example/page now.\nSame paragraph.\n\n\nNext." }), SITE);
    expect(out.html).toContain("<p");
    expect(out.html).toContain("Same paragraph.");
    expect(out.html.match(/<br/g)?.length).toBeGreaterThanOrEqual(1);
    expect(out.html).not.toContain('href="https://elsewhere.example');
    expect(out.text).toContain("See https://elsewhere.example/page now.\nSame paragraph.\n\nNext.");
  });

  it("an empty note adds no paragraph", () => {
    const out = renderLetter(view({ note: "" }), SITE);
    expect(out.text).not.toMatch(/\n\n\n/);
  });

  it("ends with the fixed footer: the disclosure, why the reader gets it, the unsubscribe placeholder and the archive", () => {
    const out = renderLetter(view(), SITE);
    for (const part of [out.html, out.text]) {
      expect(part).toContain("Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser.");
      expect(part).toContain("Each page states the position in the company it discusses.");
      expect(part).toContain("You get this because you asked on desk.example and confirmed by email.");
      expect(part).toContain(UNSUBSCRIBE_PLACEHOLDER);
      expect(part).toContain(`${SITE}/letters`);
    }
    expect(out.html).toContain(`href="${UNSUBSCRIBE_PLACEHOLDER}"`);
  });

  it("for a test copy the placeholder is replaced by the site's own leave page in both parts", () => {
    const out = renderLetter(view(), SITE, { unsubscribeUrl: `${SITE}/letters/leave` });
    expect(out.html).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
    expect(out.text).not.toContain(UNSUBSCRIBE_PLACEHOLDER);
    expect(out.html).toContain(`href="${SITE}/letters/leave"`);
    expect(out.text).toContain(`${SITE}/letters/leave`);
  });

  it("has no image, no pixel, no script, no tracking link and no database id", () => {
    const out = renderLetter(view(), SITE);
    expect(out.html).not.toMatch(/<img|<script|<iframe|<link|<style|background-image|utm_|track/i);
    expect(derivedProblems(out.text)).toEqual([]);
    expect(derivedProblems(out.html)).toEqual([]);
    expect(out.html).not.toContain("item-1");
    expect(out.html).not.toContain(RID(1));
  });

  it("is a single column of inline styles, under 30 KB with 20 entries at the longest his own limits allow", () => {
    const words = (n: number) => "word ".repeat(Math.ceil(n / 5)).slice(0, n);
    const entries = Array.from({ length: 20 }, (_, n) => entry(n + 1, { title: words(200), learningObjective: words(300), changeReason: words(300) }));
    const out = renderLetter(view({ entries, note: words(4000) }), SITE);
    expect(Buffer.byteLength(out.html)).toBeLessThan(30 * 1024);
    expect(out.html).toMatch(/<table[^>]*role="presentation"/);
  });

  it("does not link a page that is not on this site (a damaged path shows the title unlinked)", () => {
    const out = renderLetter(view({ entries: [entry(1, { path: "https://elsewhere.example/x" })] }), SITE);
    expect(out.html).not.toContain("elsewhere.example");
    expect(out.text).not.toContain("elsewhere.example");
    expect(out.text).toContain("Note number 1");
  });

  it("is deterministic", () => {
    expect(renderLetter(view(), SITE)).toEqual(renderLetter(view(), SITE));
  });
});

describe("renderConfirmation (a plain-text transactional email, only when Aksh presses)", () => {
  it("says what was asked, gives the confirm link and says what to do if it was not them", () => {
    const out = renderConfirmation(SITE, "TOKEN_abc-123");
    expect(out.subject).toBe("Confirm your letters from Aksh Agrawal");
    expect(out.text).toBe(
      "Someone, probably you, asked to get letters from desk.example. To confirm, open: https://desk.example/letters/confirm?t=TOKEN_abc-123 (valid for 7 days). If you did not ask, ignore this email; nothing else will be sent.",
    );
  });

  it("encodes a token it was handed oddly, so it can never add a second parameter", () => {
    expect(renderConfirmation(SITE, "a&b=c d").text).toContain("?t=a%26b%3Dc%20d ");
  });
});

describe("the renderer changes none of his words (D83, D85)", () => {
  it("has no function that shortens, summarises, re-cases or asks a model", () => {
    const text = readFileSync(resolve(__dirname, "render.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(text).not.toMatch(/\.slice\(|\.substring\(|\.substr\(|truncate|cutWords|ellipsis|…|summar|\bllm\b|groq|toLowerCase|toUpperCase|\.trim\(/i);
  });
});
