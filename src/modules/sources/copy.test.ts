import { describe, expect, it } from "vitest";
import { SOURCE_ERROR_TEXT } from "@/lib/messages-sources";
import { GONE_TEXT, longDate, NO_LINK_ANSWER, noteDateLine, PROBLEM_TEXT, repeatAnswer, SAVED_ANSWER } from "./copy";
import { PROBLEM_CODES } from "./types";

describe("the desk's words about a source (spec s6.1, s6.2, s6.4)", () => {
  it("has a sentence for every problem code the database accepts", () => {
    expect(Object.keys(PROBLEM_TEXT).sort()).toEqual([...PROBLEM_CODES].sort());
  });

  it("says the spec's sentences", () => {
    expect(PROBLEM_TEXT.not_found).toBe("YouTube says this video does not exist or is private.");
    expect(PROBLEM_TEXT.not_embeddable).toBe("YouTube does not share this video's details. The link is saved.");
    expect(PROBLEM_TEXT.timeout).toBe("The site did not answer. The desk tries again (3 tries), or press Read again.");
    expect(PROBLEM_TEXT.unavailable).toBe(PROBLEM_TEXT.timeout);
    expect(PROBLEM_TEXT.refused).toBe("This link cannot be read by the desk (only public https pages).");
    expect(PROBLEM_TEXT.not_page).toBe("This link is not a web page. The link is saved.");
    expect(PROBLEM_TEXT.too_big_image).toBe("The thumbnail was too large and was not kept.");
    expect(PROBLEM_TEXT.purged).toBe("YouTube details older than 30 days were removed. They are read again at the next check.");
    expect(GONE_TEXT).toBe("This video is no longer on YouTube. It is hidden on the public file; save the sources again to drop it.");
    expect(SAVED_ANSWER).toBe("Source saved. Reading its title.");
    expect(NO_LINK_ANSWER).toBe("A source needs a link.");
    expect(NO_LINK_ANSWER).toBe(SOURCE_ERROR_TEXT["source-no-link"]);
  });

  it("writes a date as 3 Oct 2026, with no leading zero", () => {
    expect(longDate("2026-10-03")).toBe("3 Oct 2026");
    expect(longDate("2026-12-31")).toBe("31 Dec 2026");
    expect(noteDateLine("2026-10-16")).toBe("— 16 Oct 2026");
  });

  it("answers a repeated link with when it was saved, and what was added", () => {
    expect(repeatAnswer("2026-10-03", true, false)).toBe("You saved this link on 3 Oct 2026. Your note was added to it.");
    expect(repeatAnswer("2026-10-03", false, false)).toBe("You saved this link on 3 Oct 2026.");
    expect(repeatAnswer("2026-10-03", true, true)).toBe("You saved this link on 3 Oct 2026. Your note was added to it. It is back on your list.");
  });

  it("uses none of the words the desk never says in its own copy", () => {
    const all = [...Object.values(PROBLEM_TEXT), GONE_TEXT, SAVED_ANSWER, NO_LINK_ANSWER, repeatAnswer("2026-10-03", true, true), ...Object.values(SOURCE_ERROR_TEXT)].join(" ");
    expect(all).not.toMatch(/\b(proof|proven|verified|buy|sell|guarantee)\b/i);
  });
});
