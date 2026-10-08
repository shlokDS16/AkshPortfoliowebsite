"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatCount } from "@/lib/format";
import { errorText } from "@/lib/messages";
import { groupValues, type ProposalView, type ReviewData } from "@/modules/ingestion/client";
import { ChangeCompany } from "./change-company";
import { DoneButton } from "./done-button";
import { FileUnder } from "./file-under";
import { FlagCard } from "./flag-card";
import { PageText, wordsOf } from "./page-text";
import { decisionsOf, isTicked, omit, summaryOf, type Ticks, type Typed } from "./review-state";
import { ValuesList } from "./values-list";

type Props = { data: ReviewData; companies?: { id: string; symbol: string }[] };

/**
 * The review screen (segment 4 C): the flagged figures one at a time, then the values list and "File under".
 * Desktop keeps the page text beside the work; a phone opens it under a row on demand.
 */
export function ReviewOneAtATime({ data, companies = [] }: Props) {
  const { document: doc } = data;
  const [rows, setRows] = useState<ProposalView[]>(data.rows);
  const [ticks, setTicks] = useState<Ticks>({});
  const [typed, setTyped] = useState<Typed>({});
  const [openId, setOpenId] = useState<string | null>(null);

  const closed = doc.status === "done" || doc.status === "skipped";
  const flagIds = data.flags.map((f) => f.id);
  const waiting = flagIds.flatMap((id) => rows.filter((r) => r.id === id && r.status === "pending"));
  const current = waiting[0];
  const { values, hiddenBasis } = groupValues(rows, data.preferredBasis);
  const shown = values.flatMap((g) => g.rows);
  const decisions = decisionsOf(shown, ticks, typed);
  const kept = decisions.filter((d) => d.keep).length;
  const summary = summaryOf(rows, shown, ticks, typed);
  const valuesHeading = useRef<HTMLHeadingElement>(null);
  const checking = current !== undefined;
  const focus = current ?? shown.find((r) => r.id === openId) ?? shown[0];

  // The last card goes away: focus moves to the list it hands over to, not to the top of the page.
  useEffect(() => {
    if (!checking && flagIds.length > 0) valuesHeading.current?.focus();
  }, [checking, flagIds.length]);

  const resolved = (view: ProposalView) => {
    setRows((all) => all.map((r) => (r.id === view.id ? view : r)));
    setTicks((t) => omit(t, view.id));
  };
  const setType = (id: string, valueText: string | null) =>
    setTyped((t) => (valueText === null ? omit(t, id) : { ...t, [id]: valueText }));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-small">
          <Link href="/desk/inbox" className="text-geru underline decoration-1 underline-offset-3">
            Inbox
          </Link>
        </p>
        <h1 className="break-words text-title text-ink desk:text-title-desk">Review: {doc.title}</h1>
        {doc.companyName ? <p className="text-small text-ink-muted">{doc.companyName}</p> : null}
        {doc.companyId && doc.companyName && doc.status === "active" ? (
          <ChangeCompany documentId={doc.id} companyId={doc.companyId} companyName={doc.companyName} companies={companies} />
        ) : null}
        {data.counts.filed > 0 ? (
          <p data-testid="filed-count" className="text-small text-ink-body">
            {formatCount(data.counts.filed, "figure")} from this document {data.counts.filed === 1 ? "is" : "are"} filed in a case file.
          </p>
        ) : null}
        {doc.status === "active" || doc.status === "done" ? <DoneButton documentId={doc.id} done={doc.status === "done"} /> : null}
      </header>

      {closed ? (
        <p role="status" className="text-body text-ink-body">
          {errorText("document-closed")}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-body text-ink-body">Nothing to review. No figures are waiting for this document.</p>
      ) : (
        <div className="desk:grid desk:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] desk:items-start desk:gap-8">
          <div className="min-w-0 space-y-5">
            {current ? (
              <FlagCard
                key={current.id}
                documentId={doc.id}
                flag={current}
                n={flagIds.length - waiting.length + 1}
                total={flagIds.length}
                pageText={data.pageTexts[current.page]}
                onResolved={resolved}
              />
            ) : (
              <>
                <section aria-labelledby="values-heading" className="space-y-3">
                  <h2 id="values-heading" ref={valuesHeading} tabIndex={-1} className="text-subtitle text-ink outline-none">
                    {flagIds.length > 0 ? "All checked. " : ""}
                    {formatCount(shown.length, "figure")} to file
                  </h2>
                  <p role="status" className="text-small text-ink-muted">
                    {summary.accepted} accepted · {summary.edited} edited · {summary.rejected} rejected
                  </p>
                  <ValuesList
                    groups={values}
                    hiddenBasis={hiddenBasis}
                    texts={data.pageTexts}
                    ticked={(id) => isTicked(rows.find((r) => r.id === id)!, ticks)}
                    typed={typed}
                    openId={openId}
                    onTick={(id, on) => setTicks((t) => ({ ...t, [id]: on }))}
                    onType={setType}
                    onOpen={(id) => setOpenId((open) => (open === id ? null : id))}
                  />
                </section>
                <FileUnder document={doc} target={data.target} count={kept} decisions={decisions} companies={companies} />
              </>
            )}
          </div>
          <aside aria-label="Page text" className="hidden desk:sticky desk:top-[calc(var(--top-bar-h)+16px)] desk:block">
            {focus ? <PageText page={focus.page} text={data.pageTexts[focus.page]} words={[...(current ? [] : [focus.valueText]), ...wordsOf(focus.label)]} /> : null}
          </aside>
        </div>
      )}
    </div>
  );
}
