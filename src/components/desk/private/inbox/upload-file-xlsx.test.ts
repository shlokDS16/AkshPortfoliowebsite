import { describe, expect, it, vi } from "vitest";
import { XLSX_MAX_BYTES, XLSX_MIME } from "@/modules/documents/client";
import { acceptFor, claimedMime, kindOfFile } from "./file-kinds";
import { checkFile, uploadFile, type UploadDeps } from "./upload-file";

// A valuation workbook in the browser's half of an upload (Plan 2.7 Task 2, spec s4.1): .xlsx only, the official type claimed from the
// extension (browsers report "" or application/octet-stream), 10 MB, and a company.

const book = (name = "Kaveri DCF.xlsx", type = XLSX_MIME, size = 2_000_000) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const COMPANY = "6f1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";

function deps(over: Partial<UploadDeps> = {}) {
  const start = vi.fn<UploadDeps["start"]>(async () => ({ ok: true, documentId: "d1", path: "d1.xlsx", token: "t" }));
  const finish = vi.fn<UploadDeps["finish"]>(async () => ({ ok: true }));
  const put = vi.fn<UploadDeps["put"]>(async () => ({ error: null }));
  const d: UploadDeps = { hash: async () => "a".repeat(64), start, put, finish, kick: async () => {}, ...over };
  return { d, start, finish, put };
}

describe("kindOfFile for a workbook", () => {
  it.each([
    ["Model.xlsx", XLSX_MIME], ["Model.XLSX", XLSX_MIME], ["Model.xlsx", ""], ["Model.xlsx", "application/octet-stream"], ["Model.xlsx", `${XLSX_MIME};charset=x`],
  ])("takes %s of type %j", (name, type) => {
    expect(kindOfFile({ name, type })).toBe("xlsx");
  });

  it.each([["Model.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"], ["Model.xls", "application/vnd.ms-excel"], ["Model.csv", "text/csv"], ["Model.xlsb", ""], ["Model.xlsx", "application/pdf"]])(
    "does not take %s of type %j",
    (name, type) => {
      expect(kindOfFile({ name, type })).toBeNull();
    },
  );
});

describe("the picker and the claimed type", () => {
  it("offers .xlsx and its type, always", () => {
    for (const voiceOn of [false, true]) expect(acceptFor(voiceOn)).toContain(`${XLSX_MIME},.xlsx`);
  });

  it("claims the official type whatever the browser said", () => {
    for (const type of ["", "application/octet-stream", XLSX_MIME]) expect(claimedMime("xlsx", { name: "Model.xlsx", type })).toBe(XLSX_MIME);
  });
});

describe("checkFile for a workbook", () => {
  it("refuses over 10 MB, takes exactly 10 MB, and refuses a macro workbook as not supported", () => {
    expect(checkFile(book("m.xlsx", XLSX_MIME, XLSX_MAX_BYTES + 1))).toMatchObject({ ok: false, message: expect.stringContaining("10 MB") });
    expect(checkFile(book("m.xlsx", XLSX_MIME, XLSX_MAX_BYTES))).toBeNull();
    expect(checkFile(book("m.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"))).toMatchObject({ ok: false, message: expect.stringContaining(".xlsx") });
  });
});

describe("uploadFile for a workbook", () => {
  it("asks for a company before anything starts", async () => {
    const { d, start } = deps();
    const outcome = await uploadFile(book(), { companyId: null, filedOn: null, sourceUrl: null }, d, () => {});
    expect(outcome).toEqual({ ok: false, message: "Choose the company this workbook is for, then upload it again." });
    expect(start).not.toHaveBeenCalled();
  });

  it("sends the official type for a workbook the browser called octet-stream, then finishes", async () => {
    const { d, start, put, finish } = deps();
    const outcome = await uploadFile(book("Kaveri DCF.xlsx", "application/octet-stream"), { companyId: COMPANY, filedOn: null, sourceUrl: null }, d, () => {});
    expect(outcome).toEqual({ ok: true, documentId: "d1" });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ kind: "xlsx", mime: XLSX_MIME, fileName: "Kaveri DCF.xlsx", companyId: COMPANY }));
    expect(put).toHaveBeenCalledWith("d1.xlsx", "t", expect.any(File), XLSX_MIME);
    expect(finish).toHaveBeenCalledWith("d1");
  });
});
