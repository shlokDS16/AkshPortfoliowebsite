import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isPlaceholderSubject, LABEL, placeholderSubject } from "./subject";

describe("the label a new letter starts with", () => {
  it("is 'Untitled letter, {date}' with the date as the desk writes dates", () => {
    expect(placeholderSubject("2026-10-16")).toBe("Untitled letter, 16 Oct 2026");
  });

  it("is recognised on any date, and a real subject is not mistaken for it", () => {
    expect(isPlaceholderSubject(placeholderSubject("2026-10-16"))).toBe(true);
    expect(isPlaceholderSubject("  Untitled letter, 3 Jan 2027 ")).toBe(true);
    expect(isPlaceholderSubject("Untitled letter")).toBe(true);
    expect(isPlaceholderSubject("What changed in October")).toBe(false);
    expect(isPlaceholderSubject("An untitled letter about Kaveri")).toBe(false);
    expect(isPlaceholderSubject("")).toBe(false);
  });

  it("is the same pattern the database gate refuses (rule 13.1 in migration 0025)", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261018000025_letters_gate.sql"), "utf8");
    const found = /i\.title ~ '([^']+)'/.exec(sql);
    expect(found?.[1]).toBe(LABEL.source);
  });
});
