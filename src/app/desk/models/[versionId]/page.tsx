import { notFound } from "next/navigation";
import { CalculatorLoader } from "@/components/desk/private/models/calculator-loader";
import { ConfirmCells } from "@/components/desk/private/models/confirm-cells";
import { MismatchReport } from "@/components/desk/private/models/mismatch-report";
import { ModelHeader } from "@/components/desk/private/models/model-header";
import { ReadingState, RefusedState, StuckState } from "@/components/desk/private/models/model-state";
import { isUuid } from "@/lib/ids";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/modules/identity";
import { readWorkbookStep } from "@/modules/ingestion";
import { loadModelPage, refusalMessage, VALUATION_TEXT } from "@/modules/valuation";

// /desk/models/[versionId] (Plan 2.7 Task 3, spec s7): one page, its mode by the version's status. ready: Confirm; confirmed: Scenarios
// (the calculator loads on this route only); refused: the sentence and a fixed upload; reading: the read, or Try again when it stopped.

type Props = { params: Promise<{ versionId: string }> };

export default async function ModelPage({ params }: Props) {
  await requireAdmin();
  const { versionId } = await params;
  if (!isUuid(versionId)) notFound();
  const db = await createSupabaseServerClient();
  const data = await loadModelPage(db, versionId);
  if (!data) notFound();
  const { head } = data;
  const read = data.mode === "reading" ? await readWorkbookStep(db, head.documentId) : null;

  return (
    <article className="space-y-(--block-gap)">
      <ModelHeader head={head} />
      {data.mode === "confirm" ? (
        <>
          {head.report ? <MismatchReport report={head.report} formulaCount={head.formulaCount ?? 0} /> : null}
          <ConfirmCells versionId={head.versionId} data={data.confirm} />
        </>
      ) : null}
      {data.mode === "scenarios" ? (
        <>
          <CalculatorLoader versionId={head.versionId} cells={data.cells} scenarios={data.scenarios} />
          {head.report ? <MismatchReport report={head.report} formulaCount={head.formulaCount ?? 0} open={false} /> : null}
        </>
      ) : null}
      {data.mode === "refused" ? <RefusedState message={head.refusal ? refusalMessage(head.refusal) : VALUATION_TEXT.not_ready} /> : null}
      {data.mode === "unreadable" ? <RefusedState message={VALUATION_TEXT.model_unreadable} /> : null}
      {read ? read.stuck ? <StuckState documentId={head.documentId} message={read.message} retryable={read.retryable} /> : <ReadingState /> : null}
    </article>
  );
}
