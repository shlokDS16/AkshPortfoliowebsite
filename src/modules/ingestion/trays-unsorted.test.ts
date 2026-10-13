import { describe, expect, it } from "vitest";
import { pagesNotSortedText } from "@/lib/messages";
import { trayFor, type DocState } from "./trays";

// Pages the classifier let go (live smoke S3): the tray says so once, in the ready state, and changes nothing else.

const NOW = new Date("2026-10-08T05:30:00Z");
const doc = (over: Partial<DocState> = {}): DocState => ({
  status: "active", pageCount: 80, pagesRead: 80, scanPages: 0, aiOn: true, pending: 0, flagged: 0, decided: 0,
  steps: [{ kind: "classify_pages", status: "done", notBefore: "2026-10-08T05:00:00.000Z", waitReason: null, pageNo: 12, lastError: null, everClaimed: true }],
  ...over,
});

describe("pages the classifier could not sort", () => {
  it("is one fixed line saying how many, and that Aksh can choose the pages himself", () => {
    expect(pagesNotSortedText(1)).toBe("1 page could not be sorted by the desk. You can choose the pages to read yourself.");
    expect(pagesNotSortedText(13)).toBe("13 pages could not be sorted by the desk. You can choose the pages to read yourself.");
  });

  it("is added to a ready card whatever else it says, and does not change its tray", () => {
    const none = trayFor(doc({ unsortedPages: 4 }), NOW, null);
    expect(none).toMatchObject({ tray: "ready", message: `Read. No figures matched; open it beside your file. ${pagesNotSortedText(4)}` });
    const some = trayFor(doc({ unsortedPages: 1, pending: 3, flagged: 1 }), NOW, null);
    expect(some).toMatchObject({ tray: "ready", message: `3 figures ready to check. 1 needs a look. ${pagesNotSortedText(1)}` });
    const checked = trayFor(doc({ unsortedPages: 2, decided: 5 }), NOW, null);
    expect(checked.message).toBe(`All figures checked. ${pagesNotSortedText(2)}`);
  });

  it("is absent when nothing was let go", () => {
    expect(trayFor(doc(), NOW, null).message).toBe("Read. No figures matched; open it beside your file.");
    expect(trayFor(doc({ unsortedPages: 0 }), NOW, null).message).toBe("Read. No figures matched; open it beside your file.");
  });

  it("is not shown while the desk is still reading", () => {
    const reading = doc({ unsortedPages: 4, steps: [{ ...doc().steps[0]!, kind: "extract_page", pageNo: 4, status: "running" }] });
    expect(trayFor(reading, NOW, null).message).not.toContain("could not be sorted");
  });
});
