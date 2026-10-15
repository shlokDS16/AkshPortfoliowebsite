import { describe, expect, it } from "vitest";
import { errorCode, errorText, userWasTold } from "@/lib/messages";
import type { Db } from "@/lib/supabase/types";
import {
  CONCEPT_DESCRIPTION_MAX,
  getConceptBySlug,
  getConceptsByIds,
  listConcepts,
  setThemePublic,
  updateConceptDescription,
} from "./concepts";
import { ConceptDescriptionTooLongError, NameNotScreenedError } from "./errors";

/** A query-builder stub that records the calls and resolves with `result`. */
function stubDb(result: { data: unknown; error: null }) {
  const calls: string[] = [];
  const payloads: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "update", "eq", "is", "order", "ilike", "in"]) {
    chain[name] = (...args: unknown[]) => {
      if (name === "update") payloads.push(args[0]);
      calls.push(`${name}:${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(",")}`);
      return chain;
    };
  }
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return { db: { from: () => chain } as unknown as Db, calls, payloads };
}

const ROW = {
  id: "t1",
  slug: "exit-multiples",
  name: "Exit Multiples",
  visibility: "private",
  needs_review: false,
  description_md: "what I mean",
  created_at: "2026-10-01T00:00:00Z",
};

describe("setThemePublic", () => {
  it("updates only a screened, unarchived row", async () => {
    const { db, calls } = stubDb({ data: [{ id: "t1" }], error: null });
    await setThemePublic(db, "t1");
    expect(calls).toEqual(expect.arrayContaining(['update:{"visibility":"public"}', "eq:id,t1", "eq:needs_review,false", "is:archived_at,null"]));
  });

  it("refuses a stub or an archived row in words", async () => {
    const { db } = stubDb({ data: [], error: null });
    await expect(setThemePublic(db, "t1")).rejects.toBeInstanceOf(NameNotScreenedError);
  });
});

describe("updateConceptDescription", () => {
  it("trims the text and stores it", async () => {
    const { db, payloads } = stubDb({ data: [{ id: "t1" }], error: null });
    await updateConceptDescription(db, "t1", "  What I mean by it.  ");
    expect(payloads).toEqual([{ description_md: "What I mean by it." }]);
  });

  it("stores blank text, and null, as null", async () => {
    const { db, payloads } = stubDb({ data: [{ id: "t1" }], error: null });
    await updateConceptDescription(db, "t1", "   \n ");
    await updateConceptDescription(db, "t1", null);
    expect(payloads).toEqual([{ description_md: null }, { description_md: null }]);
  });

  it("allows exactly 2000 UTF-16 units and refuses 2001, counting after the trim", async () => {
    const { db, payloads } = stubDb({ data: [{ id: "t1" }], error: null });
    await updateConceptDescription(db, "t1", ` ${"x".repeat(CONCEPT_DESCRIPTION_MAX)} `);
    expect(payloads).toHaveLength(1);
    await expect(updateConceptDescription(db, "t1", "x".repeat(CONCEPT_DESCRIPTION_MAX + 1))).rejects.toBeInstanceOf(ConceptDescriptionTooLongError);
    expect(payloads).toHaveLength(1);
  });

  it("counts UTF-16 units, so 1001 emoji are over the limit", async () => {
    const { db } = stubDb({ data: [{ id: "t1" }], error: null });
    const emoji = String.fromCodePoint(0x1f600);
    await expect(updateConceptDescription(db, "t1", emoji.repeat(1001))).rejects.toBeInstanceOf(ConceptDescriptionTooLongError);
  });

  it("only writes a live (unarchived) row, and says so when none matched", async () => {
    const { db, calls } = stubDb({ data: [], error: null });
    await expect(updateConceptDescription(db, "t1", "x")).rejects.toThrow();
    expect(calls).toEqual(expect.arrayContaining(["eq:id,t1", "is:archived_at,null"]));
  });

  it("reaches the screen as a fixed code", () => {
    const error = new ConceptDescriptionTooLongError();
    expect(errorCode(error)).toBe("concept-description-too-long");
    expect(errorText("concept-description-too-long")).toBe(error.message);
    expect(userWasTold(error)).toBe(true);
  });
});

describe("listConcepts and getConceptBySlug", () => {
  it("lists the screened live rows, by name", async () => {
    const { db, calls } = stubDb({ data: [ROW], error: null });
    const concepts = await listConcepts(db);
    expect(concepts).toEqual([
      { id: "t1", slug: "exit-multiples", name: "Exit Multiples", visibility: "private", needsReview: false, descriptionMd: "what I mean", createdAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(calls).toEqual(expect.arrayContaining(["eq:needs_review,false", "is:archived_at,null", 'order:name,{"ascending":true}']));
  });

  it("finds one live row by slug, a stub included so its page can say it is not checked yet", async () => {
    const { db, calls } = stubDb({ data: { ...ROW, needs_review: true }, error: null });
    expect(await getConceptBySlug(db, "exit-multiples")).toMatchObject({ slug: "exit-multiples", needsReview: true });
    expect(calls).toEqual(expect.arrayContaining(["eq:slug,exit-multiples", "is:archived_at,null"]));
    expect(calls.filter((c) => c.startsWith("eq:needs_review"))).toEqual([]);
  });

  it("returns null for no row, and never queries a malformed slug", async () => {
    const { db, calls } = stubDb({ data: null, error: null });
    expect(await getConceptBySlug(db, "exit-multiples")).toBeNull();
    const before = calls.length;
    expect(await getConceptBySlug(db, "Not A Slug!")).toBeNull();
    expect(calls).toHaveLength(before);
  });
});

describe("getConceptsByIds", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("reads live rows by id, a stub included, and never an archived one", async () => {
    const { db, calls } = stubDb({ data: [{ ...ROW, id: id(1), needs_review: true }], error: null });
    const found = await getConceptsByIds(db, [id(1), id(1), id(2)]);
    expect(found.map((c) => c.id)).toEqual([id(1)]);
    expect(calls).toEqual(expect.arrayContaining([`in:id,${JSON.stringify([id(1), id(2)])}`, "is:archived_at,null"]));
    expect(calls.filter((c) => c.startsWith("eq:needs_review"))).toEqual([]);
  });

  it("asks for nothing when there is no valid id", async () => {
    const { db, calls } = stubDb({ data: [], error: null });
    expect(await getConceptsByIds(db, [])).toEqual([]);
    expect(await getConceptsByIds(db, ["x) or (1=1"])).toEqual([]);
    expect(calls).toEqual([]);
  });
});
