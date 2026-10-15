import type { ISODate } from "@/lib/desk-types";
import { formatDate } from "@/lib/format";
import { STANDARD_DISCLOSURE } from "./disclosure";

type Props = { position: string; reviewedOn: ISODate };

/**
 * Rule 11.4: every printed public page carries the standard disclosure in full, so a PDF that travels without the site still says it.
 * For a page that already shows the Disclosure block on screen (a file, a case, a note about a company) that block prints, and this
 * one is not rendered; it is for the pages that show only the short strip on screen. Same sentence from the same function; a page
 * that names no one security passes SITE_POSITION ("stated on each file", the /about wording), not a value it cannot hold.
 */
export function PrintDisclosure({ position, reviewedOn }: Props) {
  return (
    <section aria-labelledby="print-disclosure-heading" data-lint-exclude data-print-disclosure className="mt-(--section-gap) hidden border-t-2 border-ink pt-3 print:block">
      <h2 id="print-disclosure-heading" className="text-title text-ink">
        Disclosure
      </h2>
      <p className="mt-2 text-small text-ink-body">{STANDARD_DISCLOSURE(position, formatDate(reviewedOn))}</p>
    </section>
  );
}
