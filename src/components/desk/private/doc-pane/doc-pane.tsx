"use client";

import { ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/format";
import type { DocumentListItem } from "@/modules/documents/client";
import { ADD_SOURCE_EVENT, type AddSourceDetail } from "../add-source-event";
import type { CheckableFact } from "../facts-form/checkable";
import { PageView } from "./page-view";
import { PaneSearch } from "./pane-search";
import { QuoteCheck } from "./quote-check";
import { usePage } from "./use-page";

type Props = {
  documents: DocumentListItem[];
  docId: string;
  onPick(id: string): void;
  pageNo: number;
  onPage(n: number): void;
  facts: CheckableFact[];
  onClose(): void;
  /** After "Use as source" (the phone sheet closes so the new row is in view). */
  onUsed?(): void;
};

/**
 * A filed document beside the editor: step through its pages, search it, and check the quoted lines typed in the Facts
 * form. It only reads. "Use as source" sends an event; the Facts form decides what to do with it and stays the only save path.
 */
export function DocPane({ documents, docId, onPick, pageNo, onPage, facts, onClose, onUsed }: Props) {
  const doc = documents.find((d) => d.id === docId) ?? documents[0];
  const result = usePage(doc.id, pageNo);
  const [words, setWords] = useState<string[]>([]);
  const [used, setUsed] = useState<string | null>(null);

  function addAsSource() {
    const detail: AddSourceDetail = { doc: doc.title, type: doc.sourceType, filedOn: doc.filedOn ?? "", url: doc.sourceUrl ?? "" };
    // Cancelled = the Facts form took it. No form listening (or a sheet it cannot read) leaves it unsaid.
    const added = !window.dispatchEvent(new CustomEvent(ADD_SOURCE_EVENT, { detail, cancelable: true }));
    setUsed(added ? doc.id : null);
    if (added) onUsed?.();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-subtitle text-ink">{doc.title}</h2>
          <p className="text-small text-ink-muted tabular-nums">
            {doc.sourceType}
            {doc.filedOn ? ` · filed ${formatDate(doc.filedOn)}` : ""}
            {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
          </p>
          {doc.sourceUrl ? (
            <a href={doc.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-small">
              Original link <ExternalLink aria-hidden strokeWidth={1.5} className="size-3.5" />
            </a>
          ) : null}
        </div>
        <Button variant="ghost" size="icon" aria-label="Hide the document" onClick={onClose}>
          <X aria-hidden strokeWidth={1.5} />
        </Button>
      </div>
      {documents.length > 1 ? (
        <div className="space-y-1">
          <Label htmlFor="pane-doc" className="block">
            Document
          </Label>
          <select
            id="pane-doc"
            value={doc.id}
            onChange={(e) => {
              setWords([]);
              onPick(e.target.value);
            }}
            className="min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink"
          >
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={addAsSource}>Use as source</Button>
        <span role="status" className="text-small text-ink-muted">
          {used === doc.id ? "It is in the Sources list." : ""}
        </span>
      </div>
      <QuoteCheck
        documentId={doc.id}
        title={doc.title}
        facts={facts}
        currentPage={pageNo}
        onGo={(n) => {
          setWords([]);
          onPage(n);
        }}
      />
      <PaneSearch
        documentId={doc.id}
        onGo={(n, w) => {
          setWords(w);
          onPage(n);
        }}
      />
      <PageView
        pageNo={pageNo}
        pageCount={doc.pageCount}
        result={result}
        words={words}
        onPage={(n) => {
          setWords([]);
          onPage(n);
        }}
      />
    </div>
  );
}
