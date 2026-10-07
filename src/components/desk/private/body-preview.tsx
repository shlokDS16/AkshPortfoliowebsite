import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/format";
import { removeAllowanceAction } from "@/modules/compliance/actions";
import { RULE_TITLES, type AnnotatedBody } from "@/modules/compliance/client";
import { GateNote } from "./gate-note";
import { GatedSentence } from "./gated-sentence";

/** The saved revision as it will be read, with B's notes directly under the paragraph that needs them. Advisory: the gate decides. */
export function BodyPreview({ itemId, body }: { itemId: string; body: AnnotatedBody }) {
  // The first flagged sentence takes #first-flag (focus target); found before render so rendering stays pure.
  const firstParagraph = body.paragraphs.findIndex((segments) => segments.some((s) => s.flag));
  const firstSegment = firstParagraph < 0 ? -1 : body.paragraphs[firstParagraph].findIndex((s) => s.flag);
  return (
    <section aria-labelledby="check-heading" className="space-y-3">
      <h2 id="check-heading" className="text-title text-ink desk:text-title-desk">
        Check before publishing
      </h2>
      <div className="prose-read text-read text-ink-body desk:text-read-desk">
        {body.paragraphs.map((segments, i) => (
          <div key={i}>
            <p className="my-(--para)">
              {segments.map((segment, j) => {
                return <GatedSentence key={j} segment={segment} first={i === firstParagraph && j === firstSegment} />;
              })}
            </p>
            {segments.map((s, j) => (s.flag ? <GateNote key={j} itemId={itemId} flag={s.flag} /> : null))}
            {segments.map((s, j) =>
              s.allowed ? (
                <form key={j} action={removeAllowanceAction.bind(null, itemId, s.allowed.hash)} className="my-2 flex flex-wrap items-center gap-2 text-small text-ink-muted">
                  <Check aria-hidden strokeWidth={1.5} className="size-4 text-ink" />
                  <span>
                    Allowed by you: &quot;{s.allowed.reason}&quot;{s.allowed.at ? `, ${formatTime(s.allowed.at)}` : ""}
                  </span>
                  <Button type="submit" variant="link" size="sm">
                    Remove allowance
                  </Button>
                </form>
              ) : null,
            )}
          </div>
        ))}
      </div>
      {body.unplaced.length > 0 ? (
        <div className="rounded-sm border border-rule p-3">
          <p className="text-label uppercase text-ink-muted">Elsewhere in this item</p>
          <ul className="mt-1 space-y-1 text-small">
            {body.unplaced.map((f, i) => (
              <li key={i}>
                <span className="text-bad">{RULE_TITLES[f.rule] ?? `Rule ${f.rule}`}</span>
                {f.field ? ` (${f.field})` : ""}: {f.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
