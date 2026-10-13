import { Info, TriangleAlert } from "lucide-react";
import type { Mark, Restated } from "@/modules/ledger/client";

/**
 * The marks on a score, one plain sentence each. A check carries a warning glyph and the words "Needs a check" (the glyph is
 * decoration; the meaning is in the words), a note carries a quiet info glyph. Rendered wherever a score is shown.
 */
export function MarkList({ marks }: { marks: Mark[] }) {
  if (marks.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-small text-ink-body" aria-label="Marks on this score">
      {marks.map((m) => {
        const Icon = m.check ? TriangleAlert : Info;
        return (
          <li key={m.key} data-mark={m.key} className="flex items-start gap-1.5">
            <Icon aria-hidden strokeWidth={1.5} className={m.check ? "mt-0.5 size-4 shrink-0 text-warn" : "mt-0.5 size-4 shrink-0 text-ink-muted"} />
            <span className={m.check ? "font-medium text-ink" : undefined}>{m.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** The restatement log of an idea: the date, then each figure that moved with the old and the new value. */
export function RestatedList({ items }: { items: Restated[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-2 border-l-2 border-rule-strong pl-3 text-small text-ink-body" aria-label="Restatements of this score">
      {items.map((r) => (
        <li key={r.id} data-restated={r.id}>
          <p className="font-medium text-ink">{r.headline}</p>
          {r.lines.length > 0 ? (
            <ul className="tabular-nums">
              {r.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
