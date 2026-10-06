import { Button } from "@/components/ui/button";
import { istDateTime } from "@/lib/dates";
import { Input } from "@/components/ui/input";
import { RULE_TITLES, type GateDecision, type LintField } from "@/modules/compliance/client";
import { allowSentenceAction, publishRevisionAction, unpublishItemAction } from "@/modules/compliance/actions";
import type { Item, Revision } from "@/modules/research";

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

/** `match` comes from the folded text, so it may not occur verbatim: highlight when it does, always name it. */
function Highlight({ sentence, match }: { sentence: string; match: string | null }) {
  const at = match ? sentence.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (!match || at < 0) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, at)}
      <mark>{sentence.slice(at, at + match.length)}</mark>
      {sentence.slice(at + match.length)}
    </>
  );
}

type Props = {
  item: Item;
  latest: Revision | null;
  current: Revision | null;
  decision: GateDecision | null;
  /** rev_no of the revision the decision was made on, when it still exists in the history. */
  decisionRevNo: number | null;
};

export function GatePanel({ item, latest, current, decision, decisionRevNo }: Props) {
  const isPublic = item.visibility === "public";
  // A decision made on an older revision is history, not a basis for allowing a sentence.
  const stale = decision !== null && decision.revisionId !== latest?.id;
  const candidate = latest && (!isPublic || latest.id !== current?.id) ? latest : null;
  return (
    <section id="gate" className="space-y-3 rounded border p-3">
      <h2 className="text-sm font-medium">Publish gate</h2>
      {isPublic && current ? <p className="text-sm">Live: revision #{current.revNo}</p> : null}
      {!isPublic && !candidate ? <p className="text-sm text-muted-foreground">Save a revision to publish it.</p> : null}
      <div className="flex flex-wrap gap-2">
        {candidate ? (
          <form action={publishRevisionAction.bind(null, item.id, candidate.id)}>
            <Button type="submit" size="sm">
              Publish revision #{candidate.revNo}
            </Button>
          </form>
        ) : null}
        {isPublic ? (
          <form action={unpublishItemAction.bind(null, item.id)}>
            <Button type="submit" size="sm" variant="outline">
              Unpublish
            </Button>
          </form>
        ) : null}
      </div>
      {decision ? (
        <div data-testid="gate-decision" data-verdict={decision.verdict} className="space-y-2 text-sm">
          <p className="font-medium">
            {decision.verdict === "pass" ? "Passed the gate" : "Blocked by the gate"}
            {decisionRevNo !== null ? `, revision #${decisionRevNo}` : ""} ({istDateTime(decision.decidedAt)}, {decision.policyVersion})
          </p>
          {stale ? (
            <p data-testid="stale-decision" className="text-muted-foreground">
              This decision was made on {decisionRevNo !== null ? `revision #${decisionRevNo}` : "an earlier revision"}. Publish the latest revision to run
              the gate on it.
            </p>
          ) : null}
          <ul className="space-y-3">
            {decision.failures.map((failure, index) => (
              <li key={index} data-testid="gate-failure" data-rule={failure.rule} className="rounded border border-red-600 p-2">
                <p className="font-medium">{RULE_TITLES[failure.rule] ?? `Rule ${failure.rule}`}</p>
                <p>{failure.message}</p>
                {failure.field ? (
                  <p className="text-muted-foreground">In: {FIELD_LABELS[failure.field as LintField] ?? failure.field}</p>
                ) : null}
                {failure.sentence ? (
                  <>
                    <q data-testid="flagged-sentence" className="mt-1 block">
                      <Highlight sentence={failure.sentence} match={failure.match} />
                    </q>
                    {failure.match ? (
                      <p className="text-muted-foreground">
                        Matched: <span data-testid="flagged-match">{failure.match}</span>
                      </p>
                    ) : null}
                  </>
                ) : null}
                {failure.sentenceHash && failure.rule === "1" && !stale ? (
                  <form action={allowSentenceAction.bind(null, item.id, failure.sentenceHash)} className="mt-2 flex gap-2">
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
            <p className="text-muted-foreground">Allowed as educational usage: {decision.allowedBy.map((a) => `"${a.sentence}"`).join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
