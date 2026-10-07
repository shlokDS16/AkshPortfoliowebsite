import { notFound } from "next/navigation";
import { BodyPreview } from "@/components/desk/private/body-preview";
import { FiguresToHint } from "@/components/desk/private/figures-to-hint";
import { FocusOnHash } from "@/components/desk/private/focus-on-hash";
import { GateDecisionPanel } from "@/components/desk/private/gate-decision";
import { History } from "@/components/desk/private/history";
import { PublishChecklist } from "@/components/desk/private/publish-checklist";
import { RevisionEditor } from "@/components/desk/private/revision-editor";
import { WordingGuide } from "@/components/desk/private/wording-guide";
import { errorText, noticeText } from "@/lib/messages";
import { setFiguresToAction, saveCaseFileRevisionAction } from "@/modules/casefile/actions";
import { makeCompanyPublicAction } from "@/modules/catalog/actions";
import { publishCheckedAction, unpublishItemAction } from "@/modules/compliance/actions";
import { requireAdmin } from "@/modules/identity";
import { isItemId } from "@/modules/research";
import { loadEditor } from "./load";
import { MetaForm } from "./meta-form";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string; from?: string; to?: string }>;
};

export default async function ItemPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { id } = await params;
  const { error, notice, from, to } = await searchParams;
  if (!isItemId(id)) notFound();
  const data = await loadEditor(id);
  if (!data) notFound();
  const { item, revisions, current, pending, latest, candidate, isFile, company, preview, body, sheet, decision, decisionRevNo, latestFigure } = data;
  const isPublic = item.visibility === "public";
  const errorMessage = errorText(error);
  const noticeMessage = noticeText(notice);
  return (
    <article className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-display text-ink desk:text-display-desk">{item.title}</h1>
        <p className="text-small text-ink-muted">
          {item.kind.replace("_", " ")} · <span data-testid="visibility">{isPublic ? "Public" : "Private"}</span>
          {current ? ` · current revision #${current.revNo}` : ""}
        </p>
      </header>
      {errorMessage ? (
        <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
          {errorMessage}
        </p>
      ) : null}
      {noticeMessage ? (
        <p role="status" className="rounded-sm border border-rule px-3 py-2 text-small text-ink">
          {noticeMessage}
        </p>
      ) : null}
      {isPublic && pending.length > 0 ? (
        <p data-testid="pending-gate" className="rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">
          {pending.length} {pending.length === 1 ? "revision is" : "revisions are"} waiting for the publishing gate. The public page still shows revision #
          {current?.revNo}.
        </p>
      ) : null}
      <div className="grid gap-(--block-gap) desk:grid-cols-[330px_minmax(0,1fr)]">
        <aside id="gate" tabIndex={-1} className="min-w-0 space-y-4 desk:sticky desk:top-[calc(var(--top-bar-h)+16px)] desk:self-start">
          <PublishChecklist
            items={preview?.items ?? []}
            rule4Needed={preview?.rule4Needed ?? false}
            companyName={company?.name ?? null}
            companyAction={company ? makeCompanyPublicAction.bind(null, company.id, item.id) : null}
            publishAction={candidate ? publishCheckedAction.bind(null, item.id, candidate.id) : null}
            publishLabel={candidate ? `Run the publishing gate on revision #${candidate.revNo}` : ""}
            figureReminder={isFile}
            live={isPublic && current ? { revNo: current.revNo, unpublish: unpublishItemAction.bind(null, item.id) } : null}
          />
          <GateDecisionPanel itemId={item.id} decision={decision} decisionRevNo={decisionRevNo} latestId={latest?.id ?? null} />
        </aside>
        <div className="min-w-0 space-y-(--block-gap)">
          {body ? <BodyPreview itemId={item.id} body={body} named={item.companyId !== null} /> : null}
          {!isPublic ? <FiguresToHint latest={latestFigure} figuresTo={item.dataAsOf} action={setFiguresToAction.bind(null, item.id)} /> : null}
          <MetaForm item={item} />
          <RevisionEditor key={latest?.id ?? "none"} action={saveCaseFileRevisionAction.bind(null, item.id)} bodyMd={latest?.bodyMd ?? ""} sheet={sheet} isPublic={isPublic} />
          <WordingGuide />
          <History revisions={revisions} currentId={current?.id ?? null} pendingIds={new Set(pending.map((r) => r.id))} from={from} to={to} />
        </div>
      </div>
      <FocusOnHash />
    </article>
  );
}
