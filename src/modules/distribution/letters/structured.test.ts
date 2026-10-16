import { describe, expect, it } from "vitest";
import { entriesOf, letterStructured } from "./structured";
import { LETTER_SCHEMA, type LetterEntry } from "./types";

const RID = "11111111-2222-4333-8444-555555555555";
const entry = (patch: Partial<LetterEntry> = {}): LetterEntry => ({
  revisionId: RID, kind: "learning", path: "/notes/how-to-read", revNo: 1, detail: "Learning note · R1", title: "How to read",
  learningObjective: "Learn it.", changeReason: null, holdsPosition: null, companyName: null, ...patch,
});

describe("letterStructured and entriesOf", () => {
  it("round-trips the record the gate reads", () => {
    const record = letterStructured([entry(), entry({ revisionId: "22222222-2222-4333-8444-555555555555", kind: "file", path: "/companies/kav", holdsPosition: "no", companyName: "Kaveri" })]);
    expect(record.schema).toBe(LETTER_SCHEMA);
    expect(entriesOf(record)).toEqual(record.entries);
  });

  it("reads nothing from a record that is not letter/1, has no entries, or has more than 20", () => {
    expect(entriesOf({ schema: "video/1", entries: [entry()] })).toBeNull();
    expect(entriesOf({ schema: LETTER_SCHEMA, entries: [] })).toBeNull();
    expect(entriesOf({ schema: LETTER_SCHEMA })).toBeNull();
    expect(entriesOf(null)).toBeNull();
    expect(entriesOf({ schema: LETTER_SCHEMA, entries: Array.from({ length: 21 }, () => entry()) })).toBeNull();
  });

  it("reads nothing when any one entry is damaged (never part of a letter)", () => {
    const bad: unknown[] = [
      { ...entry(), revisionId: "not-a-uuid" }, { ...entry(), kind: "letter" }, { ...entry(), path: "https://elsewhere.example/x" }, { ...entry(), path: "/a b" },
      { ...entry(), revNo: 0 }, { ...entry(), revNo: 1.5 }, { ...entry(), title: 5 }, { ...entry(), learningObjective: 5 }, { ...entry(), changeReason: {} },
      { ...entry(), holdsPosition: "maybe" }, { ...entry(), companyName: 3 }, { ...entry(), detail: null }, "text", null,
    ];
    for (const one of bad) expect(entriesOf({ schema: LETTER_SCHEMA, entries: [entry(), one] }), JSON.stringify(one)).toBeNull();
  });

  it("keeps only the fields it knows, so an extra key never reaches an email", () => {
    const [read] = entriesOf({ schema: LETTER_SCHEMA, entries: [{ ...entry(), extra: "<script>" }] }) ?? [];
    expect(read).toEqual(entry());
    expect(read).not.toHaveProperty("extra");
  });
});
