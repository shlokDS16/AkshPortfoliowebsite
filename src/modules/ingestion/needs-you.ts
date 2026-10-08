import type { Db } from "@/lib/supabase/types";
import { listInbox, type InboxDoc } from "./inbox";

// The desk home's Needs you tray (spec s7): the inbox's own verdict, one card per document that waits on Aksh.

export type NeedsYouDoc = {
  id: string;
  title: string;
  kind: "ready" | "attention";
  /** The inbox card's sentence, unchanged ("24 figures ready to check.", "Pages 142-147 could not be read."). */
  message: string;
  /** Attention only: the message names pages (not the whole file). */
  pagesUnread: boolean;
  href: string;
};

/**
 * A ready document earns a card only when it has figures to check (a read document with none has nothing to review);
 * `pending` already leaves out the basis repeats, as the review screen does, so the card never promises a hidden row.
 */
export function needsYouFrom(docs: InboxDoc[]): NeedsYouDoc[] {
  return docs.flatMap((d): NeedsYouDoc[] => {
    if (d.status !== "active") return [];
    if (d.view.tray === "ready" && d.pending > 0) {
      return [{ id: d.id, title: d.title, kind: "ready", message: d.view.message, pagesUnread: false, href: `/desk/inbox/${d.id}/review` }];
    }
    if (d.view.tray === "attention") {
      return [{ id: d.id, title: d.title, kind: "attention", message: d.view.message, pagesUnread: d.view.attentionPages.length > 0, href: `/desk/inbox#doc-${d.id}` }];
    }
    return [];
  });
}

export async function listNeedsYou(db: Db, now: Date): Promise<NeedsYouDoc[]> {
  // aiOn only words the "no figures matched" line of a ready card, which has no card here.
  return needsYouFrom((await listInbox(db, now, true)).docs);
}
