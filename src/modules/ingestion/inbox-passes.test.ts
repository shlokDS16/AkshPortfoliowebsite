import { describe, expect, it } from "vitest";
import { readPageNumbers, toSteps } from "./inbox";
import { trayFor, type DocState } from "./trays";

// A page read again has two rows (pass 1 and pass 2). The card counts the page once, by its newest pass (Plan 2b Task 8 carry b).
const row = (over: Partial<Parameters<typeof toSteps>[0][number]> = {}) => ({
  kind: "extract_page", status: "done", not_before: "2026-10-08T04:30:00.000Z", wait_reason: null, page_no: 4, pass: 1, last_error: null, lease_owner: "o", ...over,
});
const NOW = new Date("2026-10-08T05:00:00.000Z");
const state = (steps: DocState["steps"]): DocState => ({ status: "active", pageCount: 10, pagesRead: 10, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0, steps });

describe("toSteps", () => {
  it("keeps the newest pass of a page's step and drops the older one", () => {
    const steps = toSteps([row({ pass: 1 }), row({ pass: 2, status: "queued" }), row({ page_no: 5, pass: 1 })]);
    expect(steps.map((s) => [s.pageNo, s.status])).toEqual([[4, "queued"], [5, "done"]]);
  });

  it("does not mistake a finished first pass for a finished page while the re-read waits", () => {
    const view = trayFor(state(toSteps([row({ pass: 1 }), row({ pass: 2, status: "queued", lease_owner: null })])), NOW, null);
    expect(view).toMatchObject({ extractDone: 0, extractTotal: 1 });
  });

  it("counts a page whose newest pass is stuck as stuck, not read", () => {
    const view = trayFor(state(toSteps([row({ pass: 1 }), row({ pass: 2, status: "needs_attention" })])), NOW, null);
    expect(view).toMatchObject({ tray: "attention", attentionPages: [4] });
  });

  it("lists a page as read only while its newest extract pass is done, so Re-read is not offered during a re-read", () => {
    expect([...readPageNumbers([row({ pass: 1 }), row({ page_no: 5, pass: 1, status: "running" })])]).toEqual([4]);
    expect([...readPageNumbers([row({ pass: 1 }), row({ pass: 2, status: "queued" })])]).toEqual([]);
    expect([...readPageNumbers([row({ pass: 1 }), row({ pass: 2, status: "done" })])]).toEqual([4]);
    expect([...readPageNumbers([row({ kind: "ocr_page", pass: 1 })])]).toEqual([]);
  });

  it("keeps steps of different kinds on the same page apart", () => {
    const steps = toSteps([row({ kind: "ocr_page", pass: 1 }), row({ kind: "extract_page", pass: 1 })]);
    expect(steps).toHaveLength(2);
  });
});
