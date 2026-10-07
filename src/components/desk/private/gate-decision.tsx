import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { istDateTime } from "@/lib/dates";
import { allowSentenceAction } from "@/modules/compliance/actions";
import { RULE_TITLES, type GateDecision, type LintField } from "@/modules/compliance/client";
import { splitAtMatch } from "./match-split";

const FIELD_LABELS: Record<LintField, string> = {
  title: "Title",
  slug: "Slug",
  learningObjective: "Learning objective",
  body: "Body",
  structured: "Sources and structured fields",
  changeReason: "Change reason",
  companyName: "Company name",
  companyOneLiner: "Company one-liner",
  themeName: "Theme name",
};

function Highlight({ sentence, match }: { sentence: string; match: string | null }) {
  const split = splitAtMatch(sentence, match);
  if (!split) return <>{sentence}</>;
  return (
    <>
      {split.before}
      <mark className="bg-bad-wash font-semibold text-bad">{split.hit}</mark>
      {split.after}
    </>
  );
}

type Props = {
  itemId: string;
  decision: GateDecision | null;
  /** rev_no of the revision the decision was made on, when it still exists in the history. */
  decisionRevNo: number | null;
  latestId: string | null;
};

/** The recorded decision, exactly as the database gate wrote it. Running the gate is the checklist's job; this only reads it back. */
export function GateDecisionPanel({ itemId, decision, decisionRevNo, latestId }: Props) {
  if (!decision) return null;
  // A decision made on an older revision is history, not a basis for allowing a sentence.
  const stale = decision.revisionId !== latestId;
  return (
    <section aria-labelledby="decision-heading" className="space-y-2 border-t border-rule pt-3">
      <h2 id="decision-heading" className="text-label uppercase text-ink-muted">
        Recorded decision
      </h2>
      <div data-testid="gate-decision" data-verdict={decision.verdict} className="space-y-2 text-small text-ink">
        <p className="font-semibold">
          {decision.verdict === "pass" ? "Passed the gate" : "Blocked by the gate"}
          {decisionRevNo !== null ? `, revision #${decisionRevNo}` : ""} ({istDateTime(decision.decidedAt)}, {decision.policyVersion})
        </p>
        {stale ? (
          <p data-testid="stale-decision" className="text-ink-muted">
            This decision was made on {decisionRevNo !== null ? `revision #${decisionRevNo}` : "an earlier revision"}. Run the publishing gate on the
            latest revision to check it.
          </p>
        ) : null}
        <ul className="space-y-3">
          {decision.failures.map((failure, index) => (
            <li key={index} data-testid="gate-failure" data-rule={failure.rule} className="border-l-2 border-bad bg-bad-wash p-2">
              <p className="font-semibold">{RULE_TITLES[failure.rule] ?? `Rule ${failure.rule}`}</p>
              <p>{failure.message}</p>
              {failure.field ? <p className="text-ink-muted">In: {FIELD_LABELS[failure.field as LintField] ?? failure.field}</p> : null}
              {failure.sentence ? (
                <>
                  <q data-testid="flagged-sentence" className="mt-1 block">
                    <Highlight sentence={failure.sentence} match={failure.match} />
                  </q>
                  {failure.match ? (
                    <p className="text-ink-muted">
                      Matched: <span data-testid="flagged-match">{failure.match}</span>
                    </p>
                  ) : null}
                </>
              ) : null}
              {failure.sentenceHash && failure.rule === "1" && !stale ? (
                <form action={allowSentenceAction.bind(null, itemId, failure.sentenceHash)} className="mt-2 flex gap-2">
                  <Input name="reason" aria-label="Reason for allowing this sentence" placeholder="Why this is educational usage" required minLength={3} />
                  <Button type="submit" size="sm" variant="outline">
                    Allow sentence
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {decision.allowedBy.length > 0 ? (
          <p className="text-ink-muted">Allowed as educational usage: {decision.allowedBy.map((a) => `"${a.sentence}"`).join(", ")}</p>
        ) : null}
      </div>
    </section>
  );
}
