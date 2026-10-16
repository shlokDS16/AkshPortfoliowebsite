import { buildStudiedCards, type StudiedCard } from "@/modules/sources/public";
import type { PublicSnapshot } from "./types";

/**
 * Phase 5d (spec s7): the outside sources one company file shows, as cards. Pure over the snapshot: it reads no database, no cookie client and no desk
 * module. A snapshot cached before the feature has no `studied` and gives none. The view has already masked a title, a name or a picture whose entry
 * was not ticked or whose data changed; the card builder never invents one, and no id of a link reaches a card.
 */
export function buildStudiedBlock(s: PublicSnapshot, itemId: string): StudiedCard[] {
  return buildStudiedCards((s.studied ?? []).filter((row) => row.itemId === itemId));
}
