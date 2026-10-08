import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { makePdf } from "@/test/fixtures/pdf";
import { DocumentError, type DocumentErrorCode } from "./errors";
import { MAX_UPLOAD_BYTES, STORAGE_BYTES } from "./limits";
import { storeDocument, type StoreInput } from "./store";
import { finishUpload } from "./upload";

const ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const enc = (text: string) => new TextEncoder().encode(text);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const PDF = makePdf([["Statement of Profit and Loss", "Revenue from operations 1,284.00 1,102.00"]]);

const input = (over: Partial<StoreInput> = {}): StoreInput => ({
  kind: "pdf", title: "BSE results", bytes: PDF, companyId: null, filedOn: "2026-10-01",
  sourceUrl: "https://www.bseindia.com/a.pdf", fetchedFrom: "https://www.bseindia.com/a.pdf", ...over,
});

async function refusal(promise: Promise<unknown>): Promise<DocumentError> {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(DocumentError);
  return error as DocumentError;
}

describe("storeDocument", () => {
  it("stores a fetched PDF as <id>.pdf, with the hash of its bytes, the link at insert and the object in place", async () => {
    const repo = createMemoryDocumentsRepo();
    const { documentId } = await storeDocument(repo, input(), () => ID);
    expect(documentId).toBe(ID);
    expect(repo.docs.get(ID)).toMatchObject({
      kind: "pdf", storagePath: `${ID}.pdf`, sha256: sha(PDF), bytes: PDF.byteLength, status: "uploading", title: "BSE results",
      sourceUrl: "https://www.bseindia.com/a.pdf", filedOn: "2026-10-01",
    });
    expect(repo.fetchedFrom.get(ID)).toBe("https://www.bseindia.com/a.pdf");
    expect(repo.objects.get(`${ID}.pdf`)).toEqual({ size: PDF.byteLength, mimetype: "application/pdf" });
    expect(repo.files.get(`${ID}.pdf`)).toEqual(PDF);
    // The existing finish check accepts it and activates it, exactly like a browser upload.
    expect((await finishUpload(repo, ID)).status).toBe("active");
  });

  it.each(["url", "text"] as const)("stores %s as <id>.txt with the bare text type, and finishUpload accepts it", async (kind) => {
    const repo = createMemoryDocumentsRepo();
    const bytes = enc("Quarterly results\nRevenue from operations 1,284.00 1,102.00");
    await storeDocument(repo, input({ kind, bytes, fetchedFrom: kind === "url" ? "https://example.com/r" : null, sourceUrl: null }), () => ID);
    expect(repo.docs.get(ID)).toMatchObject({ kind, storagePath: `${ID}.txt`, sha256: sha(bytes) });
    expect(repo.objects.get(`${ID}.txt`)).toEqual({ size: bytes.byteLength, mimetype: "text/plain" });
    expect(repo.fetchedFrom.get(ID)).toBe(kind === "url" ? "https://example.com/r" : null);
    expect((await finishUpload(repo, ID)).status).toBe("active");
  });

  it("refuses the same bytes again as a duplicate, naming the earlier copy", async () => {
    const repo = createMemoryDocumentsRepo();
    await storeDocument(repo, input(), () => ID);
    await finishUpload(repo, ID);
    const error = await refusal(storeDocument(repo, input(), () => "other"));
    expect(error.code satisfies DocumentErrorCode).toBe("upload-duplicate");
    expect(error.earlier?.id).toBe(ID);
    expect(repo.docs.size).toBe(1);
  });

  it("a duplicate found by the database (a race) is refused the same way", async () => {
    const repo = createMemoryDocumentsRepo();
    repo.simulateRace(sha(PDF), ID);
    const error = await refusal(storeDocument(repo, input(), () => "other"));
    expect(error.code).toBe("upload-duplicate");
    expect(error.earlier?.id).toBe(ID);
  });

  it("resumes an attempt that never finished: the partial object goes and the bytes are stored again", async () => {
    const repo = createMemoryDocumentsRepo();
    await storeDocument(repo, input(), () => ID);
    repo.objects.set(`${ID}.pdf`, { size: 3, mimetype: "application/pdf" }); // a partial object
    await storeDocument(repo, input({ filedOn: "2026-10-02" }), () => "other");
    expect(repo.removed).toContain(`${ID}.pdf`);
    expect(repo.docs.size).toBe(1);
    expect(repo.docs.get(ID)?.filedOn).toBe("2026-10-02");
    expect(repo.objects.get(`${ID}.pdf`)?.size).toBe(PDF.byteLength);
  });

  it("refuses when storage would pass 90%, storing nothing", async () => {
    const repo = createMemoryDocumentsRepo();
    repo.storageBytes = STORAGE_BYTES * 0.9;
    expect((await refusal(storeDocument(repo, input(), () => ID))).code).toBe("upload-storage-full");
    expect(repo.docs.size).toBe(0);
    expect(repo.objects.size).toBe(0);
  });

  it("refuses bytes that say PDF but are not (the check pdf_text relies on), and an empty or over-size body", async () => {
    const repo = createMemoryDocumentsRepo();
    expect((await refusal(storeDocument(repo, input({ bytes: enc("<html>Access denied</html>") }), () => ID))).code).toBe("link-unsupported");
    await expect(storeDocument(repo, input({ bytes: new Uint8Array(0) }), () => ID)).rejects.toThrow();
    expect((await refusal(storeDocument(repo, input({ bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1) }), () => ID))).code).toBe("upload-too-large");
    expect(repo.docs.size).toBe(0);
  });

  it("keeps a title to 160 characters and never empty", async () => {
    const repo = createMemoryDocumentsRepo();
    await storeDocument(repo, input({ title: `  ${"T".repeat(300)}  ` }), () => ID);
    expect(repo.docs.get(ID)?.title).toHaveLength(160);
    const other = createMemoryDocumentsRepo();
    await storeDocument(other, input({ title: "   " }), () => ID);
    expect(other.docs.get(ID)?.title).toBe("Untitled");
  });
});
