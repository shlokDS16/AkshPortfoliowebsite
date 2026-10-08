import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryReviewRepo, machine, record, type MemoryReviewRepo } from "@/test/fakes/review-repo";
import { ReviewError } from "./errors";
import { setCompany, type ReviewPorts } from "./review-ops";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const KAVERI = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const OTHER = "8d2e3f40-5b6c-4d7e-9f80-0b1c2d3e4f50";
const ITEM = "11111111-2222-4333-8444-555555555555";
const P1 = "00000001-0000-4000-8000-000000000001";
const P2 = "00000002-0000-4000-8000-000000000002";
const P3 = "00000003-0000-4000-8000-000000000003";

let docs: MemoryDocumentsRepo;
let review: MemoryReviewRepo;
let ports: ReviewPorts;

beforeEach(async () => {
  docs = createMemoryDocumentsRepo();
  review = createMemoryReviewRepo();
  review.name = "Kaveri Fixtures";
  ports = { docs, review };
  await docs.insertUploading({ id: DOC, title: "AR", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "c".repeat(64), bytes: 10, companyId: null, filedOn: null, sourceUrl: null });
  await docs.update(DOC, { status: "active" });
});

describe("setCompany", () => {
  it("links a document that came in without a company to an existing one", async () => {
    await setCompany(ports, DOC, KAVERI);
    expect((await docs.get(DOC))?.companyId).toBe(KAVERI);
  });
  it("is harmless to repeat", async () => {
    await setCompany(ports, DOC, KAVERI);
    await setCompany(ports, DOC, KAVERI);
    expect((await docs.get(DOC))?.companyId).toBe(KAVERI);
  });
  it("moves a document to another company while none of its figures is filed or staged", async () => {
    await setCompany(ports, DOC, KAVERI);
    review.records.push(record(P1), record(P2, { status: "accepted", accepted: machine() }), record(P3, { status: "rejected" }));
    await setCompany(ports, DOC, OTHER);
    expect((await docs.get(DOC))?.companyId).toBe(OTHER);
  });
  it.each([
    ["staged under a file", { status: "accepted", accepted: machine(), itemId: ITEM }],
    ["filed", { status: "filed", accepted: machine() }],
  ])("refuses to move a document with a figure %s, in a plain sentence, and changes nothing", async (_name, over) => {
    await setCompany(ports, DOC, KAVERI);
    review.records.push(record(P1), record(P2, over));
    const error = await setCompany(ports, DOC, OTHER).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(ReviewError);
    expect((error as ReviewError).code).toBe("company-locked");
    expect((error as ReviewError).message).toBe("Some of this document's figures are already in its company's file, so the company cannot be changed.");
    expect((await docs.get(DOC))?.companyId).toBe(KAVERI);
    await setCompany(ports, DOC, KAVERI); // the same company stays harmless
  });
  it("refuses a company that is not there, a malformed id, and a document that is not there", async () => {
    review.name = null;
    await expect(setCompany(ports, DOC, KAVERI)).rejects.toBeInstanceOf(InvalidInputError);
    review.name = "Kaveri Fixtures";
    await expect(setCompany(ports, DOC, "nope")).rejects.toBeInstanceOf(InvalidInputError);
    await expect(setCompany(ports, DOC, undefined)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(setCompany(ports, "00000000-0000-4000-8000-0000000000aa", KAVERI)).rejects.toBeInstanceOf(InvalidInputError);
    expect((await docs.get(DOC))?.companyId).toBeNull();
  });
});
