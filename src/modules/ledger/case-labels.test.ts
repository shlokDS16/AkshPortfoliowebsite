import { describe, expect, it } from "vitest";
import { CASE_CLOSE_REASON_LABEL, CASE_MISTAKE_TAG_LABEL, CASE_PROCESS_LABEL } from "@/modules/casefile/client";
import { CLOSE_REASONS, MISTAKE_TAGS, PROCESS_CALLS } from "./client";

// The public labels of a case study (casefile/case-record.ts) must say every value the ledger can seal; a value added here
// without a public word would render as nothing on the page.
describe("the case study labels cover what the ledger can seal", () => {
  it("close reasons", () => {
    expect(Object.keys(CASE_CLOSE_REASON_LABEL).sort()).toEqual([...CLOSE_REASONS].sort());
  });
  it("process calls", () => {
    expect(Object.keys(CASE_PROCESS_LABEL).sort()).toEqual([...PROCESS_CALLS].sort());
  });
  it("mistake tags", () => {
    expect(Object.keys(CASE_MISTAKE_TAG_LABEL).sort()).toEqual([...MISTAKE_TAGS].sort());
  });
});
