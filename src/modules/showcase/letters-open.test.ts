import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/supabase/types";
import { readLettersOpen } from "./letters-open";

// Plan 5c (spec s8.9): the page asks the database one question, "are sign-ups open?", through the cookie-less client. Its answer is a yes or a no;
// a failed read is thrown (the cache never keeps a wrong "closed"), and nothing else about readers is asked.
const dbReturning = (result: { data: unknown; error: { message: string; code?: string } | null }) => {
  const rpc = vi.fn(async () => result);
  return { db: { rpc } as unknown as Db, rpc };
};

describe("readLettersOpen", () => {
  it("is true only when the database answers true", async () => {
    expect(await readLettersOpen(dbReturning({ data: true, error: null }).db)).toBe(true);
    expect(await readLettersOpen(dbReturning({ data: false, error: null }).db)).toBe(false);
    expect(await readLettersOpen(dbReturning({ data: null, error: null }).db)).toBe(false);
    expect(await readLettersOpen(dbReturning({ data: "true", error: null }).db)).toBe(false);
  });

  it("calls letters_open with no argument, and nothing else", async () => {
    const { db, rpc } = dbReturning({ data: true, error: null });
    await readLettersOpen(db);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("letters_open");
  });

  it("throws on a failed read, with the operation and code and none of the database's words", async () => {
    const failing = dbReturning({ data: null, error: { message: "row text with an address@example.com", code: "57014" } }).db;
    const error = await readLettersOpen(failing).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("showcase.lettersOpen (57014)");
  });
});
