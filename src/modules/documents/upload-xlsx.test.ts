import { describe, expect, it } from "vitest";
import { errorCode, errorText } from "@/lib/messages";
import { XLSX_MAX_BYTES as VALUATION_XLSX_MAX_BYTES } from "@/modules/valuation/client";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { DOCUMENT_ERROR_TEXT, DocumentError } from "./errors";
import { mimesOfStoragePath, storageExtension, UPLOAD_KINDS, XLSX_MIME } from "./kinds";
import { XLSX_MAX_BYTES } from "./limits";
import type { StartUploadInput } from "./types";
import { finishUpload, startUpload, titleFromFileName } from "./upload";

// Plan 2.7 Task 2: a workbook is an upload of its own kind. It needs a company, is capped at 10 MB, is taken only as .xlsx with the official
// type, and finishing it records the valuation version (migration 0017) before the document goes active.

const ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const COMPANY = "6f1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";
const newId = () => ID;
const input = (over: Partial<StartUploadInput> = {}): StartUploadInput => ({
  kind: "xlsx", fileName: "Kaveri DCF.xlsx", bytes: 2_000_000, mime: XLSX_MIME, sha256: "c".repeat(64), companyId: COMPANY, filedOn: null, sourceUrl: null, ...over,
});
const code = async (promise: Promise<unknown>) => ((await promise.then(() => null, (e: unknown) => e)) as DocumentError | null)?.code;

describe("the xlsx upload kind", () => {
  it("is the official type, a .xlsx name and the 10 MB cap, the same cap as the valuation module", () => {
    expect(XLSX_MIME).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(UPLOAD_KINDS.xlsx.mimes).toEqual([XLSX_MIME]);
    expect(UPLOAD_KINDS.xlsx.name.test("Model.XLSX")).toBe(true);
    expect(UPLOAD_KINDS.xlsx.name.test("Model.xlsm")).toBe(false);
    expect(XLSX_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(UPLOAD_KINDS.xlsx.maxBytes).toBe(XLSX_MAX_BYTES);
    expect(VALUATION_XLSX_MAX_BYTES).toBe(XLSX_MAX_BYTES);
  });

  it("is stored as <id>.xlsx and checked against the official type", () => {
    expect(storageExtension("xlsx", XLSX_MIME)).toBe("xlsx");
    expect(mimesOfStoragePath(`${ID}.xlsx`)).toEqual([XLSX_MIME]);
  });

  it("titles a workbook from its file name", () => {
    expect(titleFromFileName("Kaveri DCF.xlsx", "xlsx")).toBe("Kaveri DCF");
    expect(titleFromFileName(".xlsx", "xlsx")).toBe("Untitled workbook");
  });

  it("has two refusal sentences that are desk messages with the same words", () => {
    for (const c of ["upload-xlsx-too-large", "upload-xlsx-needs-company"] as const) {
      expect(errorCode(new DocumentError(c))).toBe(c);
      expect(errorText(c)).toBe(DOCUMENT_ERROR_TEXT[c]);
    }
    expect(DOCUMENT_ERROR_TEXT["upload-xlsx-too-large"]).toContain("10 MB");
  });
});

describe("startUpload for a workbook", () => {
  it("accepts a workbook of a company: an uploading row with a .xlsx path", async () => {
    const repo = createMemoryDocumentsRepo();
    const result = await startUpload(repo, input(), newId);
    expect(result.path).toBe(`${ID}.xlsx`);
    expect(repo.docs.get(ID)).toMatchObject({ kind: "xlsx", storagePath: `${ID}.xlsx`, companyId: COMPANY, title: "Kaveri DCF", status: "uploading" });
  });

  it("refuses a workbook with no company, and stores nothing", async () => {
    const repo = createMemoryDocumentsRepo();
    expect(await code(startUpload(repo, input({ companyId: null }), newId))).toBe("upload-xlsx-needs-company");
    expect(repo.docs.size).toBe(0);
  });

  it("refuses a workbook over 10 MB, and accepts one of exactly 10 MB", async () => {
    const repo = createMemoryDocumentsRepo();
    expect(await code(startUpload(repo, input({ bytes: XLSX_MAX_BYTES + 1 }), newId))).toBe("upload-xlsx-too-large");
    expect(repo.docs.size).toBe(0);
    await startUpload(repo, input({ bytes: XLSX_MAX_BYTES }), newId);
    expect(repo.docs.size).toBe(1);
  });

  it.each([
    ["Model.xlsm", XLSX_MIME],
    ["Model.xlsb", XLSX_MIME],
    ["Model.xls", XLSX_MIME],
    ["Model.csv", XLSX_MIME],
    ["Model.xlsx", "application/vnd.ms-excel.sheet.macroEnabled.12"],
    ["Model.xlsx", "application/octet-stream"],
    ["Model.xlsx", ""],
    ["Model.xlsx", `${XLSX_MIME};charset=x`],
  ])("refuses %j with the type %j", async (fileName, mime) => {
    const repo = createMemoryDocumentsRepo();
    expect(await code(startUpload(repo, input({ fileName, mime }), newId))).toBe("upload-unsupported");
    expect(repo.docs.size).toBe(0);
  });
});

describe("finishUpload for a workbook", () => {
  async function uploaded() {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input(), newId);
    repo.objects.set(`${ID}.xlsx`, { size: 2_000_000, mimetype: XLSX_MIME });
    return repo;
  }

  it("records the valuation version, then makes the document active", async () => {
    const repo = await uploaded();
    const doc = await finishUpload(repo, ID);
    expect(doc.status).toBe("active");
    expect(repo.valuationStarts).toEqual([ID]);
    expect(repo.docs.get(ID)?.status).toBe("active");
  });

  it("leaves the document uploading when the version cannot be recorded, so the same finish can be tried again", async () => {
    const repo = await uploaded();
    repo.failValuationStart = true;
    await expect(finishUpload(repo, ID)).rejects.toThrow();
    expect(repo.docs.get(ID)?.status).toBe("uploading");
    repo.failValuationStart = false;
    expect((await finishUpload(repo, ID)).status).toBe("active");
    expect(repo.valuationStarts).toEqual([ID]);
  });

  it("refuses a stored object of the wrong type and clears it", async () => {
    const repo = await uploaded();
    repo.objects.set(`${ID}.xlsx`, { size: 2_000_000, mimetype: "application/octet-stream" });
    expect(await code(finishUpload(repo, ID))).toBe("upload-missing");
    expect(repo.removed).toEqual([`${ID}.xlsx`]);
    expect(repo.valuationStarts).toEqual([]);
  });

  it("a resumed workbook upload keeps the company it was started with (its version may already be numbered under it, deferral D2)", async () => {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input(), newId);
    const OTHER = "7a2e3d4c-5b60-4f9e-a8d7-b2c3d4e5f607";
    await startUpload(repo, input({ companyId: OTHER, filedOn: "2026-10-01" }), newId);
    expect(repo.docs.get(ID)?.companyId).toBe(COMPANY);
    expect(repo.docs.get(ID)?.filedOn).toBe("2026-10-01");
  });

  it("does not record a version for a PDF", async () => {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input({ kind: "pdf", fileName: "AR.pdf", mime: "application/pdf", companyId: null, sha256: "d".repeat(64) }), newId);
    repo.objects.set(`${ID}.pdf`, { size: 2_000_000, mimetype: "application/pdf" });
    await finishUpload(repo, ID);
    expect(repo.valuationStarts).toEqual([]);
  });
});
