"use client";

import { Dialog } from "@base-ui/react/dialog";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { scrimMotion, sheetMotion } from "@/components/ui/motion-presets";
import { usePrefersReducedMotion } from "@/components/ui/use-reduced-motion";
import { cn } from "@/lib/utils";
import { DocPane } from "./doc-pane";
import { useDocWorkspace } from "./workspace";

const RAIL = "(min-width: 60rem)"; // the `desk` breakpoint: the rail layout
const subscribe = (onChange: () => void) => {
  const query = window.matchMedia(RAIL);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useRail = () => useSyncExternalStore(subscribe, () => window.matchMedia(RAIL).matches, () => false);

type Props = { gate: ReactNode; children: ReactNode };

/**
 * The item page's grid. Closed: the publishing checklist beside the editor, as before. Open on a wide screen: the
 * document takes the checklist's column, so it sits beside the editor (the checklist is back when the document closes).
 * Open on a phone: a full-height sheet over the page.
 */
export function DocLayout({ gate, children }: Props) {
  const ws = useDocWorkspace();
  const rail = useRail();
  const reduced = usePrefersReducedMotion();
  const open = !!ws?.open && ws.documents.length > 0;
  const inline = open && rail;
  const pane = ws && open ? (
    <DocPane
      documents={ws.documents}
      docId={ws.docId}
      onPick={ws.setDocId}
      pageNo={ws.pageOf(ws.docId)}
      onPage={(n) => ws.setPage(ws.docId, n)}
      facts={ws.facts}
      onClose={() => ws.setOpen(false)}
      onUsed={rail ? undefined : () => ws.setOpen(false)}
    />
  ) : null;
  return (
    <>
      <div className={cn("grid gap-(--block-gap)", inline ? "desk:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]" : "desk:grid-cols-[330px_minmax(0,1fr)]")}>
        {inline ? (
          <aside
            key="pane"
            id="doc-pane"
            aria-label="Document"
            className="sticky top-[calc(var(--top-bar-h)+16px)] max-h-[calc(100dvh-var(--top-bar-h)-32px)] min-w-0 self-start overflow-y-auto pr-1"
          >
            {pane}
          </aside>
        ) : (
          <Fragment key="gate">{gate}</Fragment>
        )}
        <div className="min-w-0 space-y-(--block-gap)">{children}</div>
      </div>
      <Dialog.Root open={open && !rail} onOpenChange={(next) => ws?.setOpen(next)}>
        <AnimatePresence>
          {open && !rail ? (
            <Dialog.Portal keepMounted>
              <Dialog.Backdrop render={<m.div {...scrimMotion(reduced)} className="fixed inset-0 z-(--z-scrim) bg-(--scrim)" />} />
              <Dialog.Popup
                id="doc-pane"
                aria-label="Document"
                render={<m.div {...sheetMotion(reduced)} className="fixed inset-x-0 top-[env(safe-area-inset-top)] bottom-0 z-(--z-sheet) flex flex-col rounded-t-sm bg-paper shadow-(--shadow-sheet)" />}
              >
                <Dialog.Title className="sr-only">Document</Dialog.Title>
                <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{pane}</div>
              </Dialog.Popup>
            </Dialog.Portal>
          ) : null}
        </AnimatePresence>
      </Dialog.Root>
    </>
  );
}
