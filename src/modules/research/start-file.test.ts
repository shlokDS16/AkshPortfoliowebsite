import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { InvalidInputError } from "@/lib/errors";
import { createMemoryResearchRepo, type MemoryResearchRepo } from "@/test/fakes/research-repo";
import { startFile, type FileLookup } from "./start-file";

let repo: MemoryResearchRepo;
let lookup: FileLookup & { file: { itemId: string; title: string } | null; name: string | null };
const COMPANY = randomUUID();

beforeEach(() => {
  repo = createMemoryResearchRepo();
  lookup = { file: null, name: "Kaveri Fixtures", fileOf: async () => lookup.file, companyName: async () => lookup.name };
});

describe("startFile", () => {
  it("makes a private thesis titled with the company name, empty body and facts, linked to the company", async () => {
    const { itemId } = await startFile(repo, lookup, COMPANY);
    expect(repo.items.get(itemId)).toMatchObject({ kind: "thesis", title: "Kaveri Fixtures", companyId: COMPANY, visibility: "private", status: "draft" });
    expect(repo.revisions).toHaveLength(1);
    expect(repo.revisions[0]).toMatchObject({ itemId, bodyMd: "", structured: {}, author: "aksh" });
  });
  it("reuses the file the company already has", async () => {
    lookup.file = { itemId: randomUUID(), title: "Kaveri file" };
    expect(await startFile(repo, lookup, COMPANY)).toEqual({ itemId: lookup.file.itemId });
    expect(repo.items.size).toBe(0);
  });
  it("refuses a malformed id and a company that is not there", async () => {
    await expect(startFile(repo, lookup, "nope")).rejects.toBeInstanceOf(InvalidInputError);
    lookup.name = null;
    await expect(startFile(repo, lookup, COMPANY)).rejects.toBeInstanceOf(InvalidInputError);
    expect(repo.items.size).toBe(0);
  });
});
