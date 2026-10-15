/** The sentence on every printed desk page (spec s5, D71). The same words are in print.css for pages 2 and on; a test keeps them equal. */
export const PRINT_BANNER_TEXT = "Private desk copy. Not for sharing: it has not passed the publish gate and may show figures less than 30 days old.";

/**
 * A desk page may be printed, and the paper must say it is private. This block is the first thing on page 1 (a printer cannot repeat
 * a block, so print.css repeats the sentence in the top margin of the pages after it). Hidden on screen; fixed copy, nothing from the
 * database.
 */
export function PrintBanner() {
  return (
    <p data-print-banner className="mb-4 hidden border-2 border-ink px-3 py-1.5 text-small font-semibold text-ink print:block">
      {PRINT_BANNER_TEXT}
    </p>
  );
}
