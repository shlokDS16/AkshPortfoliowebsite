import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { InvalidInputError } from "@/lib/errors";
import { errorCode, errorText } from "@/lib/messages";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { hashFile } from "./client";
import { DOCUMENT_ERROR_TEXT, DocumentError, type DocumentErrorCode } from "./errors";
import { MAX_UPLOAD_BYTES, STORAGE_BYTES } from "./limits";
import type { StartUploadInput } from "./types";
import { finishUpload, startUpload } from "./upload";

const ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const OTHER = "6f1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";
const SHA = "a".repeat(64);
const MB = 1_048_576;
const newId = () => ID;

const input = (over: Partial<StartUploadInput> = {}): StartUploadInput => ({
  fileName: "Infosys Annual Report 2025.pdf",
  bytes: 3 * MB,
  mime: "application/pdf",
  sha256: SHA,
  companyId: null,
  filedOn: "2026-06-30",
  sourceUrl: "https://www.infosys.com/investors/ar-2025.pdf",
  ...over,
});

async function refusal(promise: Promise<unknown>): Promise<DocumentError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DocumentError);
  return error as DocumentError;
}

describe("startUpload", () => {
  it("accepts a 3 MB PDF: inserts an uploading row with its path and returns a signed token for that path", async () => {
    const repo = createMemoryDocumentsRepo();
    const result = await startUpload(repo, input(), newId);
    expect(result).toEqual({ documentId: ID, path: `${ID}.pdf`, token: `token-for-${ID}.pdf` });
    expect(repo.docs.get(ID)).toMatchObject({
      status: "uploading", storagePath: `${ID}.pdf`, sha256: SHA, bytes: 3 * MB, title: "Infosys Annual Report 2025",
      filedOn: "2026-06-30", sourceUrl: "https://www.infosys.com/investors/ar-2025.pdf",
    });
  });

  it("refuses a duplicate hash and names the earlier upload (id and date as data, fixed message)", async () => {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input(), newId);
    await repo.update(ID, { status: "active" });
    const error = await refusal(startUpload(repo, input({ fileName: "copy.pdf" }), () => OTHER));
    expect(error.code).toBe("upload-duplicate");
    expect(error.earlier).toEqual({ id: ID, createdAt: repo.docs.get(ID)!.createdAt });
    expect(error.message).toBe(DOCUMENT_ERROR_TEXT["upload-duplicate"]);
    expect(repo.docs.size).toBe(1);
  });

  it("reports a duplicate when a concurrent upload of the same file wins the insert", async () => {
    const repo = createMemoryDocumentsRepo();
    repo.simulateRace(SHA, OTHER);
    const error = await refusal(startUpload(repo, input(), newId));
    expect(error.code).toBe("upload-duplicate");
    expect(error.earlier?.id).toBe(OTHER);
  });

  it("resumes an upload that never finished instead of locking the file out for ever", async () => {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input(), newId);
    repo.objects.set(`${ID}.pdf`, { size: 12, mimetype: "application/pdf" }); // a partial object
    const result = await startUpload(repo, input(), () => OTHER);
    expect(result).toEqual({ documentId: ID, path: `${ID}.pdf`, token: `token-for-${ID}.pdf` });
    expect(repo.removed).toEqual([`${ID}.pdf`]);
    expect(repo.docs.size).toBe(1);
  });

  it("refuses 52,428,801 bytes and accepts exactly 50 MB", async () => {
    const repo = createMemoryDocumentsRepo();
    expect((await refusal(startUpload(repo, input({ bytes: MAX_UPLOAD_BYTES + 1 }), newId))).code).toBe("upload-too-large");
    expect(repo.docs.size).toBe(0);
    await expect(startUpload(repo, input({ bytes: MAX_UPLOAD_BYTES }), newId)).resolves.toMatchObject({ documentId: ID });
  });

  it("refuses image/png, and a PDF type on a file whose name does not end .pdf", async () => {
    const repo = createMemoryDocumentsRepo();
    expect((await refusal(startUpload(repo, input({ mime: "image/png" }), newId))).code).toBe("upload-not-pdf");
    expect((await refusal(startUpload(repo, input({ fileName: "report.pdf.exe" }), newId))).code).toBe("upload-not-pdf");
    expect(repo.docs.size).toBe(0);
  });

  it("accepts an upper-case .PDF extension", async () => {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input({ fileName: "AR2025.PDF" }), newId);
    expect(repo.docs.get(ID)!.title).toBe("AR2025");
  });

  it("refuses when storage is at 89.9% and the file would cross 90%", async () => {
    const repo = createMemoryDocumentsRepo();
    repo.storageBytes = Math.floor(0.899 * STORAGE_BYTES);
    const error = await refusal(startUpload(repo, input({ bytes: 2 * MB }), newId));
    expect(error.code).toBe("upload-storage-full");
    expect(repo.docs.size).toBe(0);
    await expect(startUpload(repo, input({ bytes: 1000 }), newId)).resolves.toMatchObject({ documentId: ID });
  });

  it("titles drop .pdf and trim to 160 characters", async () => {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input({ fileName: `  ${"x".repeat(200)}.pdf` }), newId);
    expect(repo.docs.get(ID)!.title).toBe("x".repeat(160));
  });

  it("validates the claim at the boundary: hex hash, uuid company, ISO date, http(s) URL, integer bytes, no extra keys", async () => {
    const repo = createMemoryDocumentsRepo();
    const bad: Partial<StartUploadInput>[] = [
      { sha256: "A".repeat(64) }, { sha256: "z".repeat(64) }, { sha256: "a".repeat(63) },
      { companyId: "not-a-uuid" }, { filedOn: "30/06/2026" }, { sourceUrl: "javascript:alert(1)" },
      { bytes: 1.5 }, { bytes: 0 }, { fileName: "" },
    ];
    for (const over of bad) await expect(startUpload(repo, input(over), newId)).rejects.toBeInstanceOf(ZodError);
    const withPath = { ...input(), path: "../other.pdf" } as StartUploadInput;
    await expect(startUpload(repo, withPath, newId)).rejects.toBeInstanceOf(ZodError);
    expect(repo.docs.size).toBe(0);
  });
});

describe("finishUpload", () => {
  async function started() {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input(), newId);
    return repo;
  }

  it("refuses when the object is missing", async () => {
    const repo = await started();
    expect((await refusal(finishUpload(repo, ID))).code).toBe("upload-missing");
    expect(repo.docs.get(ID)!.status).toBe("uploading");
  });

  it("refuses when the stored size differs from the claimed size, or the stored type is not PDF", async () => {
    const repo = await started();
    repo.objects.set(`${ID}.pdf`, { size: 3 * MB - 1, mimetype: "application/pdf" });
    expect((await refusal(finishUpload(repo, ID))).code).toBe("upload-missing");
    repo.objects.set(`${ID}.pdf`, { size: 3 * MB, mimetype: "text/html" });
    expect((await refusal(finishUpload(repo, ID))).code).toBe("upload-missing");
    expect(repo.docs.get(ID)!.status).toBe("uploading");
  });

  it("sets active when the object matches", async () => {
    const repo = await started();
    repo.objects.set(`${ID}.pdf`, { size: 3 * MB, mimetype: "application/pdf" });
    const row = await finishUpload(repo, ID);
    expect(row.status).toBe("active");
    expect(repo.docs.get(ID)!.status).toBe("active");
  });

  it("is idempotent: a second finish never moves a document back from done", async () => {
    const repo = await started();
    repo.objects.set(`${ID}.pdf`, { size: 3 * MB, mimetype: "application/pdf" });
    await finishUpload(repo, ID);
    await repo.update(ID, { status: "done" });
    expect((await finishUpload(repo, ID)).status).toBe("done");
  });

  it("refuses an unknown or malformed id", async () => {
    const repo = await started();
    await expect(finishUpload(repo, OTHER)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(finishUpload(repo, "../x")).rejects.toBeInstanceOf(InvalidInputError);
  });
});

describe("upload messages", () => {
  it("every DocumentError code is a desk message code whose text equals the error's message", () => {
    for (const code of Object.keys(DOCUMENT_ERROR_TEXT) as DocumentErrorCode[]) {
      const error = new DocumentError(code);
      expect(errorCode(error)).toBe(code);
      expect(errorText(code)).toBe(error.message);
    }
  });
});

describe("hashFile", () => {
  it("returns the lower-case hex SHA-256 of the file's bytes", async () => {
    expect(await hashFile(new Blob(["abc"]))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
