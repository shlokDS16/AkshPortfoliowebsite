import { describe, expect, it, vi } from "vitest";
import { errorText } from "@/lib/messages";
import type { Db } from "@/lib/supabase/types";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { DOCUMENT_ERROR_TEXT } from "./errors";
import { VOICE_MAX_BYTES, VOICE_MAX_MB, VOICE_MAX_MINUTES, VOICE_MAX_SECONDS } from "./limits";
import { pageTexts, readPage, searchPageText } from "./read";
import { createSupabaseDocumentsRepo } from "./repo";

// A voice note's words are Aksh's own: shown on its inbox card, never in a company's document pane (Task 4 review, Important 2).

const COMPANY = "c0a8d3f4-1b2c-4d5e-8f60-7a8b9c0d1e2f";
const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";

/** A PostgREST stand-in that answers every chain with the table's rows and records the filters asked for. */
function stub(answers: Record<string, unknown>) {
  const calls: { table: string; ops: unknown[][] }[] = [];
  const from = (table: string) => {
    const ops: unknown[][] = [];
    calls.push({ table, ops });
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "neq", "in", "order", "textSearch", "limit"]) builder[op] = (...a: unknown[]) => (ops.push([op, ...a]), builder);
    const result = () => ({ data: answers[table], error: null });
    builder.maybeSingle = () => Promise.resolve(result());
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return builder;
  };
  return { db: { from: vi.fn(from) } as unknown as Db, calls };
}

describe("listForCompany", () => {
  it("the real repo asks for everything but voice notes (and unfinished uploads)", async () => {
    const { db, calls } = stub({ documents: [] });
    await createSupabaseDocumentsRepo(db).listForCompany(COMPANY);
    const ops = calls[0]!.ops;
    expect(ops).toContainEqual(["neq", "kind", "audio"]);
    expect(ops).toContainEqual(["neq", "status", "uploading"]);
  });

  it("the in-memory repo leaves a voice note out, filed under the company or not", async () => {
    const repo = createMemoryDocumentsRepo();
    await repo.insertUploading({ id: DOC, title: "Dealer call", kind: "audio", storagePath: `${DOC}.m4a`, sha256: "a".repeat(64), bytes: 10, companyId: COMPANY, filedOn: null, sourceUrl: null, transcriptStatus: "pending" });
    await repo.update(DOC, { status: "active" });
    const pdf = "7a1d2c3b-4a59-4e8d-b7c6-a1b2c3d4e5f6";
    await repo.insertUploading({ id: pdf, title: "AR", kind: "pdf", storagePath: `${pdf}.pdf`, sha256: "b".repeat(64), bytes: 10, companyId: COMPANY, filedOn: null, sourceUrl: null });
    await repo.update(pdf, { status: "active" });
    expect((await repo.listForCompany(COMPANY)).map((d) => d.title)).toEqual(["AR"]);
  });
});

describe("the pane reads of a voice note", () => {
  const page = { text: "Dealers say orders are up.", kind: null };

  it("readPage finds no page, even when asked for the note by id", async () => {
    const { db } = stub({ document_pages: page, documents: { page_count: 1, kind: "audio" } });
    expect(await readPage(db, DOC, 1)).toBeNull();
  });

  it("readPage still serves a PDF page", async () => {
    const { db } = stub({ document_pages: page, documents: { page_count: 12, kind: "pdf" } });
    expect(await readPage(db, DOC, 4)).toEqual({ text: page.text, pageCount: 12, kind: null });
  });

  it("search returns nothing for a voice note, without reading its pages", async () => {
    const { db, calls } = stub({ document_pages: [{ page_no: 1, text: page.text }], documents: { kind: "audio" } });
    expect(await searchPageText(db, DOC, "orders")).toEqual([]);
    expect(calls.some((c) => c.table === "document_pages")).toBe(false);
  });

  it("search and page texts serve a PDF as before", async () => {
    const { db } = stub({ document_pages: [{ page_no: 4, text: "Revenue" }], documents: { kind: "pdf" } });
    expect(await searchPageText(db, DOC, "revenue")).toEqual([{ pageNo: 4, text: "Revenue" }]);
    expect((await pageTexts(db, DOC, [4])).get(4)).toBe("Revenue");
  });
});

describe("the refusal sentences are derived from the limits", () => {
  it("say the file limit in MB and the length limit in minutes that the code enforces", () => {
    expect(VOICE_MAX_MB).toBe(25);
    expect(VOICE_MAX_MINUTES).toBe(90);
    expect(VOICE_MAX_BYTES / 1_000_000).toBe(VOICE_MAX_MB);
    expect(VOICE_MAX_SECONDS / 60).toBe(VOICE_MAX_MINUTES);
    expect(DOCUMENT_ERROR_TEXT["voice-too-large"]).toBe(`This voice note is over ${VOICE_MAX_MB} MB. Record a shorter one.`);
    expect(DOCUMENT_ERROR_TEXT["voice-too-long"]).toBe(`This voice note is longer than ${VOICE_MAX_MINUTES} minutes. Record a shorter one.`);
    expect(errorText("voice-too-large")).toBe(DOCUMENT_ERROR_TEXT["voice-too-large"]);
    expect(errorText("voice-too-long")).toBe(DOCUMENT_ERROR_TEXT["voice-too-long"]);
  });
});
