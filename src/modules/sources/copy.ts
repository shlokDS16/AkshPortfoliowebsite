import type { ProblemCode } from "./problem-codes";

// The desk's words about a source (spec s6.1, s6.2, s6.4). Browser-safe. Every sentence is pending Shlok's approval.

/** What a link that could not be read says, by problem code (spec s6.4). */
export const PROBLEM_TEXT: Record<ProblemCode, string> = {
  not_found: "YouTube says this video does not exist or is private.",
  not_embeddable: "YouTube does not share this video's details. The link is saved.",
  timeout: "The site did not answer. The desk tries again (3 tries), or press Read again.",
  unavailable: "The site did not answer. The desk tries again (3 tries), or press Read again.",
  refused: "This link cannot be read by the desk (only public https pages).",
  not_page: "This link is not a web page. The link is saved.",
  too_big_image: "The thumbnail was too large and was not kept.",
  purged: "YouTube details older than 30 days were removed. They are read again at the next check.",
};

/** A YouTube link found missing at a re-check (spec s6.4). */
export const GONE_TEXT = "This video is no longer on YouTube. It is hidden on the public file; save the sources again to drop it.";

/** The answer to a capture or a form that saved a new link (spec s6.1). */
export const SAVED_ANSWER = "Source saved. Reading its title.";
/** A capture with no usable link (spec s6.1). Nothing is filed. */
export const NO_LINK_ANSWER = "A source needs a link.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "3 Oct 2026" from an India calendar date (YYYY-MM-DD). */
export function longDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1] ?? "Jan"} ${year}`;
}

/** The answer when the link was already saved (spec s6.2): when, and whether his new note went in, and whether it came back from the archive. */
export function repeatAnswer(savedOn: string, noteAdded: boolean, restored: boolean): string {
  return `You saved this link on ${longDate(savedOn)}.${noteAdded ? " Your note was added to it." : ""}${restored ? " It is back on your list." : ""}`;
}

/** The line that heads a note added to a link he had already saved (spec s6.2): "— 16 Oct 2026". */
export const noteDateLine = (isoDate: string): string => `— ${longDate(isoDate)}`;
