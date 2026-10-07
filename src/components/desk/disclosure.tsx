import type { HoldsPosition, ISODate } from "@/lib/desk-types";
import { formatDate, positionWord } from "@/lib/format";

/** publishing-rules "Standard disclosure", verbatim; excluded from the rule-1 scan. */
export const STANDARD_DISCLOSURE = (position: string, reviewed: string) =>
  `Educational content only. Aksh Agrawal is not a SEBI-registered Research Analyst or Investment Adviser. Nothing here is a recommendation, offer or solicitation to buy or sell any security. Figures are shown with a minimum 30-day lag. Position in the security discussed: ${position}. Investments in securities are subject to market risk; consult a SEBI-registered adviser before acting. Last reviewed ${reviewed}.`;

/** Never empty, never collapsible, never animated. Heading "Disclosure" (ratified 2026-10-06). */
export function Disclosure({ holdsPosition, reviewedOn }: { holdsPosition: HoldsPosition; reviewedOn: ISODate }) {
  return (
    <section id="disclosure" aria-labelledby="disclosure-heading" data-lint-exclude data-section className="border-t-2 border-ink bg-surface p-4 desk:p-6">
      <h2 id="disclosure-heading" className="text-title text-ink desk:text-title-desk">
        Disclosure
      </h2>
      <p className="mt-2 max-w-[72ch] text-small text-ink-body desk:text-small-desk">{STANDARD_DISCLOSURE(positionWord(holdsPosition), formatDate(reviewedOn))}</p>
    </section>
  );
}
