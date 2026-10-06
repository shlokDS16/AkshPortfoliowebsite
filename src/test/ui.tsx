import { expect, vi } from "vitest";

type MediaOptions = { reducedMotion?: boolean; dark?: boolean; coarse?: boolean; desk?: boolean };

/** jsdom has no matchMedia; this answers the four queries the desk reads. */
export function mockMatchMedia(opts: MediaOptions = {}): void {
  const matches = (query: string) =>
    (query.includes("prefers-reduced-motion: reduce") && !!opts.reducedMotion) ||
    (query.includes("prefers-color-scheme: dark") && !!opts.dark) ||
    (query.includes("pointer: coarse") && !!opts.coarse) ||
    (query.includes("min-width: 60rem") && !!opts.desk);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

type Observer = { callback: IntersectionObserverCallback; targets: Element[] };

export function mockIntersectionObserver(): { trigger(target: Element, isIntersecting: boolean): void } {
  const observers: Observer[] = [];
  class FakeObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [];
    private readonly entry: Observer;
    constructor(callback: IntersectionObserverCallback) {
      this.entry = { callback, targets: [] };
      observers.push(this.entry);
    }
    observe(target: Element) {
      this.entry.targets.push(target);
    }
    unobserve() {}
    disconnect() {
      this.entry.targets = [];
    }
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return {
    trigger(target, isIntersecting) {
      for (const o of observers) {
        if (!o.targets.includes(target)) continue;
        const entry = { target, isIntersecting, intersectionRatio: isIntersecting ? 1 : 0, boundingClientRect: target.getBoundingClientRect() };
        o.callback([entry as unknown as IntersectionObserverEntry], o as unknown as IntersectionObserver);
      }
    },
  };
}

const PALETTE = /\b(?:bg|text|border|ring|fill|stroke|outline|decoration|shadow)-(?:gray|zinc|neutral|stone|red|orange|amber|yellow|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|pink|rose|white|black)(?:-\d{2,3})?\b/;
const RAW_COLOUR_STYLE = /(?:^|;)\s*(?:color|background(?:-color)?|border-color|fill|stroke)\s*:\s*(?!var\(|currentcolor|transparent|inherit)/i;

/** Dark mode by construction: only token classes, so the .dark / OS token swap recolours everything. */
export function expectTokenOnly(root: Element): void {
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const cls = el.getAttribute("class") ?? "";
    expect(cls, `palette class on <${el.tagName.toLowerCase()}>`).not.toMatch(PALETTE);
    expect(cls, "arbitrary hex class").not.toMatch(/\[#[0-9a-fA-F]{3,8}\]/);
    expect(el.getAttribute("style") ?? "", "inline colour").not.toMatch(RAW_COLOUR_STYLE);
    for (const attr of ["fill", "stroke"]) {
      const value = el.getAttribute(attr);
      if (value) expect(["currentColor", "none"].includes(value) || value.startsWith("url(")).toBe(true);
    }
  }
}

/** Reading content never moves (design-dna 10.3): no animation hooks in a static block. */
export function expectNoMotion(root: Element): void {
  for (const el of [root, ...root.querySelectorAll("*")]) {
    const cls = el.getAttribute("class") ?? "";
    expect(cls).not.toMatch(/\banimate-|\bstatus-tick\b|\btoast-in\b/);
    expect(el.hasAttribute("data-draw")).toBe(false);
  }
}
