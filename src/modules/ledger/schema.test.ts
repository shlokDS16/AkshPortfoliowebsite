import { describe, expect, it } from "vitest";
import { errorCode } from "@/lib/messages";
import { BODY_MAX, eventInput, openIdeaInput, toStance } from "./schema";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const open = (over: Record<string, unknown> = {}) => ({
  companyId: COMPANY, expects: "outperform", horizonDays: 365, held: false, bodyMd: "Margins recover; wrong if gross margin stays under 30%.", ...over,
});

function codeOf(parse: () => unknown): string {
  try {
    parse();
  } catch (error) {
    return errorCode(error);
  }
  return "no-error";
}

describe("openIdeaInput", () => {
  it("accepts a complete idea and keeps his words exactly as typed", () => {
    const words = "  Why:\n margins.  \n";
    expect(openIdeaInput.parse(open({ bodyMd: words })).bodyMd).toBe(words);
  });

  it("takes an optional link to the company file, null by default", () => {
    expect(openIdeaInput.parse(open()).itemId).toBeNull();
    expect(openIdeaInput.parse(open({ itemId: ITEM })).itemId).toBe(ITEM);
  });

  it("refuses a 10,001-character body, with the too-long message and not 'write something'", () => {
    expect(codeOf(() => openIdeaInput.parse(open({ bodyMd: "a".repeat(BODY_MAX + 1) })))).toBe("ledger-body-too-long");
    expect(openIdeaInput.safeParse(open({ bodyMd: "a".repeat(BODY_MAX) })).success).toBe(true);
  });

  it("counts characters, not UTF-16 units: 10,000 emoji pass and 10,001 do not", () => {
    expect(openIdeaInput.safeParse(open({ bodyMd: "\u{1F600}".repeat(BODY_MAX) })).success).toBe(true);
    expect(openIdeaInput.safeParse(open({ bodyMd: "\u{1F600}".repeat(BODY_MAX + 1) })).success).toBe(false);
  });

  it("counts padding in the 10,000, as the database does", () => {
    expect(openIdeaInput.safeParse(open({ bodyMd: `x${" ".repeat(BODY_MAX)}` })).success).toBe(false);
  });

  it.each(["", "   ", "\n\t \n", " ", "​", "﻿"])("refuses words that are empty or only whitespace: %j", (bodyMd) => {
    expect(codeOf(() => openIdeaInput.parse(open({ bodyMd })))).toBe("ledger-words-required");
  });

  it.each([29, 0, -1, 3651, 365.5, Number.NaN])("refuses a horizon of %s days", (horizonDays) => {
    expect(codeOf(() => openIdeaInput.parse(open({ horizonDays })))).toBe("ledger-bad-horizon");
  });

  it.each([30, 182, 365, 1095, 3650])("accepts a horizon of %s days", (horizonDays) => {
    expect(openIdeaInput.safeParse(open({ horizonDays })).success).toBe(true);
  });

  it("refuses a horizon that arrives as text (a form value must be turned into a number by the action)", () => {
    expect(openIdeaInput.safeParse(open({ horizonDays: "365" })).success).toBe(false);
  });

  it.each([{ expects: "buy" }, { expects: "" }, { held: "yes" }, { held: undefined }, { companyId: "not-a-uuid" }, { itemId: "nope" }])(
    "refuses %j as bad input",
    (over) => {
      expect(codeOf(() => openIdeaInput.parse(open(over)))).toBe("ledger-bad-input");
    },
  );

  it("refuses a key it does not know (no price, no date can ride along)", () => {
    expect(codeOf(() => openIdeaInput.parse(open({ entryPrice: 120 })))).toBe("ledger-bad-input");
    expect(openIdeaInput.safeParse(open({ recordedAt: "2020-01-01T00:00:00Z" })).success).toBe(false);
  });
});

const note = { kind: "note", bodyMd: "Results out: in line." };

describe("eventInput: one shape per kind, mirroring the SQL stance keys", () => {
  it("accepts each kind with its own fields", () => {
    for (const input of [
      note,
      { kind: "revise", bodyMd: "Moving the horizon.", horizonDays: 730 },
      { kind: "revise", bodyMd: "Only the thesis text changes." },
      { kind: "upsize", bodyMd: "Bought more." },
      { kind: "downsize", bodyMd: "Sold some.", held: true },
      { kind: "downsize", bodyMd: "Sold all.", held: false },
      { kind: "close", bodyMd: "Played out.", reason: "played_out" },
      { kind: "review", bodyMd: "I sized it too big.", process: "flawed", tags: ["sizing", "behaviour"] },
      { kind: "void", bodyMd: "Opened on the wrong company." },
    ]) {
      expect(eventInput.safeParse(input).success, JSON.stringify(input)).toBe(true);
    }
  });

  it("refuses 'open' (an idea is opened by openIdea) and any unknown kind", () => {
    expect(codeOf(() => eventInput.parse({ kind: "open", bodyMd: "x" }))).toBe("ledger-bad-input");
    expect(codeOf(() => eventInput.parse({ kind: "delete", bodyMd: "x" }))).toBe("ledger-bad-input");
  });

  it("refuses a close without a known reason", () => {
    expect(eventInput.safeParse({ kind: "close", bodyMd: "x" }).success).toBe(false);
    expect(eventInput.safeParse({ kind: "close", bodyMd: "x", reason: "stopped_out" }).success).toBe(false);
  });

  it("refuses an unknown tag, no tags, a repeated tag, nine tags, and an unknown process call", () => {
    const review = (over: Record<string, unknown>) => ({ kind: "review", bodyMd: "x", process: "sound", tags: ["timing"], ...over });
    expect(codeOf(() => eventInput.parse(review({ tags: ["luckk"] })))).toBe("ledger-bad-input");
    expect(eventInput.safeParse(review({ tags: [] })).success).toBe(false);
    expect(eventInput.safeParse(review({ tags: ["timing", "timing"] })).success).toBe(false);
    expect(eventInput.safeParse(review({ tags: ["thesis", "valuation", "timing", "sizing", "process", "behaviour", "luck", "none", "thesis"] })).success).toBe(false);
    expect(eventInput.safeParse(review({ process: "fine" })).success).toBe(false);
  });

  it("refuses a field that belongs to another kind (a held flag on a note, a reason on a revise)", () => {
    expect(eventInput.safeParse({ ...note, held: true }).success).toBe(false);
    expect(eventInput.safeParse({ kind: "revise", bodyMd: "x", reason: "other" }).success).toBe(false);
    expect(eventInput.safeParse({ kind: "downsize", bodyMd: "x" }).success).toBe(false);
  });

  it("refuses a revised horizon of 29 days and a body over the limit, on every kind", () => {
    expect(codeOf(() => eventInput.parse({ kind: "revise", bodyMd: "x", horizonDays: 29 }))).toBe("ledger-bad-horizon");
    expect(codeOf(() => eventInput.parse({ ...note, bodyMd: "a".repeat(BODY_MAX + 1) }))).toBe("ledger-body-too-long");
    expect(codeOf(() => eventInput.parse({ kind: "void", bodyMd: " " }))).toBe("ledger-words-required");
  });

  it("refuses a date, a hash or a price on any kind", () => {
    for (const extra of [{ recordedAt: "2020-01-01" }, { hash: "00" }, { price: 10 }, { seq: 1 }, { stance: {} }]) {
      expect(eventInput.safeParse({ ...note, ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
  });
});

describe("toStance: the exact keys the database accepts", () => {
  const parsed = (input: unknown) => eventInput.parse(input);
  it("note, upsize and void carry no choices", () => {
    expect(toStance(parsed(note))).toEqual({});
    expect(toStance(parsed({ kind: "upsize", bodyMd: "x" }))).toEqual({});
    expect(toStance(parsed({ kind: "void", bodyMd: "x" }))).toEqual({});
  });
  it("revise carries the horizon only when one was given", () => {
    expect(toStance(parsed({ kind: "revise", bodyMd: "x", horizonDays: 730 }))).toEqual({ horizon_days: 730 });
    expect(toStance(parsed({ kind: "revise", bodyMd: "x" }))).toEqual({});
  });
  it("downsize, close and review", () => {
    expect(toStance(parsed({ kind: "downsize", bodyMd: "x", held: false }))).toEqual({ held: false });
    expect(toStance(parsed({ kind: "close", bodyMd: "x", reason: "better_use" }))).toEqual({ reason: "better_use" });
    expect(toStance(parsed({ kind: "review", bodyMd: "x", process: "sound", tags: ["luck", "none"] }))).toEqual({ process: "sound", tags: ["luck", "none"] });
  });
});
