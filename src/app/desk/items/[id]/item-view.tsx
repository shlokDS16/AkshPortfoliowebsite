import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BodyPreview } from "@/components/desk/private/body-preview";
import { LedgerRecordPanel } from "@/components/desk/private/case/ledger-record-panel";
import { ItemConcepts } from "@/components/desk/private/concepts/item-concepts";
import { DocLayout } from "@/components/desk/private/doc-pane/doc-layout";
import { DocWorkspace, OpenDocumentButton } from "@/components/desk/private/doc-pane/workspace";
import { FiguresToHint } from "@/components/desk/private/figures-to-hint";
import { FocusOnHash } from "@/components/desk/private/focus-on-hash";
import { GateDecisionPanel } from "@/components/desk/private/gate-decision";
import { History } from "@/components/desk/private/history";
import { PublishChecklist } from "@/components/desk/private/publish-checklist";
import { RevisionEditor } from "@/components/desk/private/revision-editor";
import { WordingGuide } from "@/components/desk/private/wording-guide";
import { istDate } from "@/lib/dates";
import { errorText, noticeText } from "@/lib/messages";
import { saveCaseFileRevisionAction, setFiguresToAction } from "@/modules/casefile/actions";
import { refreshCaseStudyAction } from "@/modules/cases/actions";
import { makeCompanyPublicAction, makeConceptPublicAction } from "@/modules/catalog/actions";
import { publishCheckedAction, unpublishItemAction } from "@/modules/compliance/actions";
import type { ChecklistItem } from "@/modules/compliance/client";
import { unstageAction } from "@/modules/ingestion/actions";
import { saveConceptsAction } from "@/modules/knowledge/actions";
import { conceptChecks } from "./concepts";
import { loadEditor } from "./load";
import { MetaForm } from "./meta-form";

export type EditorData = NonNullable<Awaited<ReturnType<typeof loadEditor>>>;
/** What the video page adds to the item page (Plan 5b): its YouTube, transcript and chapters panels, and the rule 12 rows of the checklist. */
export type VideoExtras = { panel: ReactNode; checks: ChecklistItem[] };
export type ItemQuery = { error?: string; notice?: string; also?: string; from?: string; to?: string };

const search = (query: ItemQuery) => {
  const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => typeof e[1] === "string"));
  return params.size > 0 ? `?${params}` : "";
};

/**
 * The item page (editor, gate, history), shared by /desk/items/[id] and /desk/videos/[id]. A video item is shown only by the second: the first sends
 * it there with its message, so every link and every redirect that names an item by id keeps working. `video` is given by the second only.
 */
export async function ItemView({ id, query, video }: { id: string; query: ItemQuery; video?: (data: EditorData) => Promise<VideoExtras> }) {
  const data = await loadEditor(id);
  if (!data) notFound();
  if (data.item.kind === "video" && !video) redirect(`/desk/videos/${id}${search(query)}`);
  if (video && data.item.kind !== "video") notFound();
  const extras = video ? await video(data) : null;
  const { item, revisions, current, pending, latest, candidate, isFile, isLedger, ledgerRecord, ledgerStatus, concepts, company, documents, staged, stagedReadings, provenance, preview, body, sheet, decision, decisionRevNo, latestFigure, model } = data;
  const { from, to } = query;
  const isPublic = item.visibility === "public";
  const isRead = item.kind === "reading_note";
  const errorMessage = errorText(query.error);
  const noticeMessage = noticeText(query.notice);
  const alsoMessage = noticeText(query.also);
  const companyLabel = company ? (company.nseSymbol ? `$${company.nseSymbol}` : company.name) : null;
  // A read is never published (D52): its side panel says so instead of offering the gate.
  const gate = isRead ? (
    <aside id="gate" tabIndex={-1} className="min-w-0 desk:sticky desk:top-[calc(var(--top-bar-h)+16px)] desk:self-start">
      <p className="rounded-sm border border-rule px-3 py-2 text-small text-ink">A read stays private. It is not published.</p>
    </aside>
  ) : (
    <aside id="gate" tabIndex={-1} className="min-w-0 space-y-4 desk:sticky desk:top-[calc(var(--top-bar-h)+16px)] desk:self-start">
      <PublishChecklist
        items={preview ? [...preview.items, ...(extras?.checks ?? [])] : []}
        rule4Needed={preview?.rule4Needed ?? false}
        companyName={company?.name ?? null}
        companyAction={company ? makeCompanyPublicAction.bind(null, company.id, item.id) : null}
        concepts={candidate && concepts ? conceptChecks(concepts.linked, (cid) => makeConceptPublicAction.bind(null, cid, item.id)) : []}
        publishAction={candidate ? publishCheckedAction.bind(null, item.id, candidate.id) : null}
        publishLabel={candidate ? `Run the publishing gate on revision #${candidate.revNo}` : ""}
        figureReminder={isFile}
        live={isPublic && current ? { revNo: current.revNo, unpublish: unpublishItemAction.bind(null, item.id), dataAsOf: item.dataAsOf, today: istDate(new Date()) } : null}
      />
      <GateDecisionPanel itemId={item.id} decision={decision} decisionRevNo={decisionRevNo} latestId={latest?.id ?? null} />
    </aside>
  );
  return (
    <article className="space-y-6">
      <DocWorkspace documents={documents} company={companyLabel}>
        <header className="space-y-1">
          <h1 className="text-display text-ink desk:text-display-desk">{item.title}</h1>
          <p className="text-small text-ink-muted">
            {item.kind.replace("_", " ")} · <span data-testid="visibility">{isPublic ? "Public" : "Private"}</span>
            {current ? ` · current revision #${current.revNo}` : ""}
          </p>
          {isFile || model ? (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {isFile ? <OpenDocumentButton /> : null}
              {model ? (
                <Link
                  href={`/desk/models/${model.versionId}`}
                  className="inline-flex min-h-11 items-center rounded-sm border border-rule-strong bg-paper px-3 text-body font-medium text-ink no-underline"
                >
                  Model
                  <span className="sr-only">, version {model.versionNo} (private)</span>
                </Link>
              ) : null}
            </div>
          ) : null}
        </header>
        {errorMessage ? (
          <p role="alert" className="rounded-sm border border-bad bg-bad-wash px-3 py-2 text-small text-ink">
            {errorMessage}
          </p>
        ) : null}
        {noticeMessage ? (
          <p role="status" className="rounded-sm border border-rule px-3 py-2 text-small text-ink">
            {noticeMessage}
            {alsoMessage ? <span className="mt-1 block">{alsoMessage}</span> : null}
          </p>
        ) : null}
        {isPublic && pending.length > 0 ? (
          <p data-testid="pending-gate" className="rounded-sm border border-warn bg-warn-wash px-3 py-2 text-small text-ink">
            {pending.length} {pending.length === 1 ? "revision is" : "revisions are"} waiting for the publishing gate. The public page still shows revision #
            {current?.revNo}.
          </p>
        ) : null}
        {extras?.panel}
        {concepts ? <ItemConcepts linked={concepts.linked} options={concepts.screened} save={saveConceptsAction.bind(null, item.id)} blocked={isPublic && pending.length > 0} /> : null}
        <DocLayout gate={gate}>
          {body ? <BodyPreview itemId={item.id} body={body} named={item.companyId !== null} /> : null}
          {isLedger ? <LedgerRecordPanel record={ledgerRecord} status={ledgerStatus} refreshAction={refreshCaseStudyAction.bind(null, item.id)} /> : null}
          {!isPublic ? <FiguresToHint latest={latestFigure} figuresTo={item.dataAsOf} action={setFiguresToAction.bind(null, item.id)} /> : null}
          <MetaForm item={item} figuresToFromLedger={isLedger} />
          <RevisionEditor
            key={`${latest?.id ?? "none"}:${staged.map((s) => s.proposalId).join(",")}:${stagedReadings.map((s) => s.proposalId).join(",")}`}
            action={saveCaseFileRevisionAction.bind(null, item.id)}
            bodyMd={latest?.bodyMd ?? ""}
            sheet={sheet}
            isPublic={isPublic}
            figuresTo={item.dataAsOf}
            staged={staged}
            stagedReadings={stagedReadings}
            provenance={provenance}
            sendBack={unstageAction.bind(null, item.id)}
            ledgerCase={isLedger}
          />
          <WordingGuide />
          <History revisions={revisions} currentId={current?.id ?? null} pendingIds={new Set(pending.map((r) => r.id))} from={from} to={to} />
        </DocLayout>
        <FocusOnHash />
      </DocWorkspace>
    </article>
  );
}
