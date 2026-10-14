"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentListItem } from "@/modules/documents/client";
import type { CheckableFact } from "../facts-form/checkable";

type Workspace = {
  documents: DocumentListItem[];
  /** "$KAVPUMP" (or the company name when it has no symbol); null for an item with no company. */
  company: string | null;
  open: boolean;
  setOpen(open: boolean): void;
  docId: string;
  setDocId(id: string): void;
  /** The page open in each document, kept while the pane is closed. */
  pageOf(id: string): number;
  setPage(id: string, n: number): void;
  facts: CheckableFact[];
  publishFacts(facts: CheckableFact[]): void;
};

const WorkspaceContext = createContext<Workspace | null>(null);

/** Null outside the item editor (and in tests of the form alone): the form then simply publishes nowhere. */
export const useDocWorkspace = () => useContext(WorkspaceContext);

type Props = { documents: DocumentListItem[]; company: string | null; children: ReactNode };

/** Which document is open beside the editor and on which page, and the editor's facts the pane checks. UI state only; nothing is saved. */
export function DocWorkspace({ documents, company, children }: Props) {
  const [open, setOpen] = useState(false);
  const [picked, setDocId] = useState(documents[0]?.id ?? "");
  const [pages, setPages] = useState<Record<string, number>>({});
  const [facts, setFacts] = useState<CheckableFact[]>([]);
  const value = useMemo<Workspace>(
    () => ({
      documents,
      company,
      open,
      setOpen,
      docId: documents.some((d) => d.id === picked) ? picked : (documents[0]?.id ?? ""),
      setDocId,
      pageOf: (id) => pages[id] ?? 1,
      setPage: (id, n) => setPages((p) => ({ ...p, [id]: n })),
      facts,
      publishFacts: setFacts,
    }),
    [documents, company, open, picked, pages, facts],
  );
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** The editor tells the pane which facts it holds (the quoted lines to check). */
export function usePublishFacts(facts: CheckableFact[]) {
  const publish = useDocWorkspace()?.publishFacts;
  useEffect(() => publish?.(facts), [publish, facts]);
}

/** "Open a document" (header of the item page). With none filed for the company it says where to put one. */
export function OpenDocumentButton() {
  const ws = useDocWorkspace();
  if (!ws || !ws.company) return null;
  if (ws.documents.length === 0) {
    return (
      <p className="text-small text-ink-muted">
        No document is filed for {ws.company} yet. <Link href="/desk/inbox">Upload one in the Inbox</Link> to read it beside this editor.
      </p>
    );
  }
  return (
    <Button variant="outline" aria-expanded={ws.open} aria-controls="doc-pane" onClick={() => ws.setOpen(!ws.open)}>
      <FileText aria-hidden strokeWidth={1.5} />
      {ws.open ? "Close the document" : "Open a document"}
    </Button>
  );
}
