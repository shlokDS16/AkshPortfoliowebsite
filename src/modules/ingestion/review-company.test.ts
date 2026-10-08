import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryReviewRepo, type MemoryReviewRepo } from "@/test/fakes/review-repo";
import { setCompany, type ReviewPorts } from "./review-ops";

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const KAVERI = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const OTHER = "8d2e3f40-5b6c-4d7e-9f80-0b1c2d3e4f50";

let docs: MemoryDocumentsRepo;
let review: MemoryReviewRepo;
let ports: ReviewPorts;

beforeEach(async () => {
  docs = createMemoryDocumentsRepo();
  review = createMemoryReviewRepo();
  review.name = "Kaveri Fixtures";
  ports = { docs, review };
  await docs.insertUploading({ id: DOC, title: "AR", storagePath: `${DOC}.pdf`, sha256: "c".repeat(64), bytes: 10, companyId: null, filedOn: null, sourceUrl: null });
  await docs.update(DOC, { status: "active" });
});

describe("setCompany", () => {
  it("links a document that came in without a company to an existing one", async () => {
    await setCompany(ports, DOC, KAVERI);
    expect((await docs.get(DOC))?.companyId).toBe(KAVERI);
  });
  it("is harmless to repeat, and will not move a document that already has another company", async () => {
    await setCompany(ports, DOC, KAVERI);
    await setCompany(ports, DOC, KAVERI);
    await expect(setCompany(ports, DOC, OTHER)).rejects.toBeInstanceOf(InvalidInputError);
    expect((await docs.get(DOC))?.companyId).toBe(KAVERI);
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
