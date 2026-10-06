import { vi } from "vitest";

/**
 * jsdom has no layout: place headings by document offset and move a virtual scroll position.
 * `tops` maps element id to its top in the document; getBoundingClientRect().top = offset - scroll.
 */
export function layoutHeadings(tops: Record<string, number>): { scrollTo(y: number): void } {
  let scroll = 0;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = (tops[this.id] ?? 0) - scroll;
    return { top, bottom: top + 24, left: 0, right: 0, width: 0, height: 24, x: 0, y: top, toJSON: () => ({}) };
  });
  return {
    scrollTo(y) {
      scroll = y;
    },
  };
}
