"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPagesAction, type PageHit } from "@/modules/documents/actions";
import { queryWords } from "@/modules/documents/client";

type Props = { documentId: string; onGo(pageNo: number, words: string[]): void };

/** Words in the whole document: the pages that hold them, with the line around the first hit. Tapping one opens that page. */
export function PaneSearch({ documentId, onGo }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ asked: string; list: PageHit[] } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const asked = query.trim();
    if (asked === "") return;
    setBusy(true);
    const list = await searchPagesAction(documentId, asked).catch(() => []);
    setHits({ asked, list });
    setBusy(false);
  }
  return (
    <section aria-label="Document search" className="space-y-2">
      <form onSubmit={submit} className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="pane-search" className="block">
            Search this document
          </Label>
          <Input id="pane-search" type="search" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Revenue from operations" />
        </div>
        <Button type="submit" variant="outline" disabled={busy || query.trim() === ""}>
          Search
        </Button>
      </form>
      <div aria-live="polite">
        {hits ? (
          hits.list.length === 0 ? (
            <p className="text-small text-ink-muted">No page has all of those words.</p>
          ) : (
            <ul className="divide-y divide-rule rounded-sm border border-rule">
              {hits.list.map((h) => (
                <li key={h.pageNo}>
                  <button
                    type="button"
                    onClick={() => onGo(h.pageNo, queryWords(hits.asked))}
                    className="flex min-h-11 w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="shrink-0 font-mono text-mono-tag text-ink tabular-nums">p. {h.pageNo}</span>
                    <span className="min-w-0 text-small text-ink-body">{h.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </section>
  );
}
