/** Phase 5d (spec s8): the rows of the Items list that have a page to open. A video or a letter has none while its feature is off. */
export function visibleItems<T extends { kind: string }>(items: readonly T[], on: { ownVideos: boolean; letters: boolean }): readonly T[] {
  if (on.ownVideos && on.letters) return items;
  return items.filter((i) => (i.kind !== "video" || on.ownVideos) && (i.kind !== "letter" || on.letters));
}
