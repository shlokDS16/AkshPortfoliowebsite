/** Site disclosure on non-file pages: bottom of the page on phone (desktop shows the site strip). */
export function SiteDisclosureLine() {
  return (
    <p data-lint-exclude className="border-t border-rule px-(--gutter) py-4 text-small text-ink-muted desk:hidden">
      <strong className="font-semibold text-ink">For learning</strong> · Aksh is not SEBI-registered · Figures 30+ days old.{" "}
      <a href="/about#disclosures">Disclosures</a>
    </p>
  );
}
