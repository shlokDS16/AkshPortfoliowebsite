import type { ItemKind, PublicSnapshot } from "./types";

/**
 * Phase 5d (spec s8): the snapshot without the items of the kinds whose feature is off, with every revision, video row and concept link
 * of those items. Pure; the caller says which kinds (src/lib/features.ts), so this file reads no environment. Every public page, the feed,
 * the sitemap, the cards and the rail's counts are built from the snapshot, so none of them can show a hidden kind.
 */
export function withoutKinds(s: PublicSnapshot, kinds: readonly ItemKind[]): PublicSnapshot {
  if (kinds.length === 0) return s;
  const hidden = new Set(s.items.filter((i) => kinds.includes(i.kind)).map((i) => i.id));
  // Revisions are keyed by item id; a revision of an item that is not in `items` is dropped with it.
  return {
    ...s,
    items: s.items.filter((i) => !hidden.has(i.id)),
    revisions: s.revisions.filter((r) => !hidden.has(r.itemId)),
    conceptLinks: s.conceptLinks.filter((l) => !hidden.has(l.itemId)),
    videos: kinds.includes("video") ? [] : s.videos,
  };
}
