import { describe, expect, it } from "vitest";
import { REGISTER } from "@/test/fixtures/desk-ui";
import { filterFiles, sortFiles } from "./register-sort";

describe("register search and sort", () => {
  it("searches company names, symbols and sectors, case-insensitively", () => {
    expect(filterFiles(REGISTER, "kav").map((f) => f.fileNo)).toEqual(["01"]);
    expect(filterFiles(REGISTER, "SAHCOLD").map((f) => f.fileNo)).toEqual(["02"]);
    expect(filterFiles(REGISTER, "logistics").map((f) => f.fileNo)).toEqual(["02"]);
    expect(filterFiles(REGISTER, "  ")).toHaveLength(2);
  });

  it("sorts by last revision by default, never by any performance measure (rule 2)", () => {
    expect(sortFiles(REGISTER, "revised").map((f) => f.fileNo)).toEqual(["01", "02"]);
    expect(sortFiles(REGISTER, "company").map((f) => f.company)).toEqual(["Kaveri Pumps (fictional)", "Sahyadri Cold Chain (fictional)"]);
    expect(sortFiles([...REGISTER].reverse(), "fileNo").map((f) => f.fileNo)).toEqual(["01", "02"]);
  });
});
