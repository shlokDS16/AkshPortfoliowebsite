import type { HoldsPosition, ISODate } from "@/lib/desk-types";
import { formatDate, positionText } from "@/lib/format";
import { StripDrawer } from "./strip-drawer";

type Props = { variant: "site" | "file"; holdsPosition?: HoldsPosition | null; dataAsOf?: ISODate; disclosureHref?: string };

const SITE_DETAILS =
  "Case studies Aksh writes to learn how businesses work. Nothing here is advice, and he is not SEBI-registered. Every figure is at least 30 days old.";
const FILE_DETAILS =
  "A case study Aksh wrote to learn how this business works. It is not advice, and he is not SEBI-registered. Every figure is at least 30 days old.";

/** Rendered, never typed (rules 3 and 5); excluded from the rule-1 scan like the disclosure. */
export function ComplianceStrip({ variant, holdsPosition = null, dataAsOf, disclosureHref = "#disclosure" }: Props) {
  const parts =
    variant === "site"
      ? ["Aksh is not SEBI-registered", "Figures 30+ days old"]
      : [positionText(holdsPosition), dataAsOf ? `Figures to ${formatDate(dataAsOf)}` : "Figures date not set"];
  const summary = (
    <>
      <strong className="font-semibold text-ink">For learning</strong>
      {parts.map((part) => ` · ${part}`).join("")}
    </>
  );
  return (
    <aside aria-label="Disclosure summary" data-lint-exclude className="relative z-(--z-strip) border-b border-rule bg-surface text-small text-ink-muted desk:text-small-desk">
      <StripDrawer summary={summary}>
        <p className="max-w-[72ch] text-ink-body">{variant === "site" ? SITE_DETAILS : FILE_DETAILS}</p>
        <a href={variant === "site" ? "/about#disclosures" : disclosureHref}>Full disclosure</a>
      </StripDrawer>
    </aside>
  );
}
