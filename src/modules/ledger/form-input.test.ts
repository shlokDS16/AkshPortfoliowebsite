import { describe, expect, it } from "vitest";
import { eventFromForm, openIdeaFromForm } from "./form-input";
import { eventInput, openIdeaInput } from "./schema";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  return data;
};

describe("openIdeaFromForm: form text becomes the number horizonDays and the boolean held", () => {
  const base = { companyId: COMPANY, expects: "outperform", horizon: "365", held: "no", bodyMd: "Why." };

  it("turns the radios into a number and a boolean the schema accepts", () => {
    const input = openIdeaFromForm(form(base));
    expect(input).toEqual({ companyId: COMPANY, expects: "outperform", horizonDays: 365, held: false, bodyMd: "Why.", itemId: null });
    expect(openIdeaInput.safeParse(input).success).toBe(true);
    expect(openIdeaFromForm(form({ ...base, held: "yes" }))).toMatchObject({ held: true });
  });

  it("reads 'other' horizons from the days box, and only whole numbers", () => {
    expect(openIdeaFromForm(form({ ...base, horizon: "other", horizonOther: "540" }))).toMatchObject({ horizonDays: 540 });
    for (const bad of ["", "abc", "12.5", "-30", "1e3", "99999999"]) {
      const input = openIdeaFromForm(form({ ...base, horizon: "other", horizonOther: bad }));
      const parsed = openIdeaInput.safeParse(input);
      expect(parsed.success, `"${bad}"`).toBe(false);
    }
  });

  it("a horizon outside 30 to 3650 days is refused by the schema, with the horizon message", () => {
    const parsed = openIdeaInput.safeParse(openIdeaFromForm(form({ ...base, horizon: "other", horizonOther: "10" })));
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues[0]!.message).toBe("Choose a horizon from 30 days to 10 years.");
  });

  it("no choice made stays undefined, so the schema refuses it rather than a default being sealed", () => {
    const input = openIdeaFromForm(form({ companyId: COMPANY, bodyMd: "Why." })) as Record<string, unknown>;
    expect(input.expects).toBeUndefined();
    expect(input.horizonDays).toBeUndefined();
    expect(input.held).toBeUndefined();
    expect(openIdeaInput.safeParse(input).success).toBe(false);
  });

  it("keeps his words exactly: no trimming, and the line breaks the browser doubled are put back", () => {
    const typed = "  First line  \n\n  Second line\n  ";
    const sent = typed.replaceAll("\n", "\r\n"); // what a multipart submission carries
    expect((openIdeaFromForm(form({ ...base, bodyMd: sent })) as { bodyMd: string }).bodyMd).toBe(typed);
  });

  it("passes the company file link only when there is one", () => {
    const item = "22222222-2222-4222-8222-222222222222";
    expect(openIdeaFromForm(form({ ...base, itemId: item }))).toMatchObject({ itemId: item });
    expect(openIdeaFromForm(form({ ...base, itemId: "" }))).toMatchObject({ itemId: null });
  });

  it("a field that is a file, not text, is not read", () => {
    const data = form(base);
    data.set("bodyMd", new File(["x"], "x.txt"));
    expect((openIdeaFromForm(data) as { bodyMd?: string }).bodyMd).toBeUndefined();
  });
});

describe("eventFromForm: one shape per kind, nothing extra", () => {
  const ok = (values: Record<string, string | string[]>) => eventInput.safeParse(eventFromForm(form(values)));

  it("note, bought more and withdraw carry only his words", () => {
    for (const kind of ["note", "upsize", "void"]) expect(eventFromForm(form({ kind, bodyMd: "W" }))).toEqual({ kind, bodyMd: "W" });
  });

  it("revise keeps the horizon only when he chose one", () => {
    expect(eventFromForm(form({ kind: "revise", bodyMd: "W", horizon: "keep" }))).toEqual({ kind: "revise", bodyMd: "W" });
    expect(eventFromForm(form({ kind: "revise", bodyMd: "W", horizon: "1095" }))).toEqual({ kind: "revise", bodyMd: "W", horizonDays: 1095 });
    expect(ok({ kind: "revise", bodyMd: "W", horizon: "other", horizonOther: "x" }).success).toBe(false);
  });

  it("sold some turns the radio into a boolean", () => {
    expect(eventFromForm(form({ kind: "downsize", bodyMd: "W", held: "yes" }))).toEqual({ kind: "downsize", bodyMd: "W", held: true });
    expect(ok({ kind: "downsize", bodyMd: "W" }).success).toBe(false);
  });

  it("close takes a reason and a lesson takes a process call and tags", () => {
    expect(ok({ kind: "close", bodyMd: "W", reason: "played_out" }).success).toBe(true);
    expect(ok({ kind: "close", bodyMd: "W", reason: "made_up" }).success).toBe(false);
    expect(ok({ kind: "review", bodyMd: "W", process: "sound", tags: ["timing", "luck"] }).success).toBe(true);
    expect(ok({ kind: "review", bodyMd: "W", process: "sound" }).success).toBe(false);
    expect(ok({ kind: "review", bodyMd: "W", process: "sound", tags: ["timing", "timing"] }).success).toBe(false);
  });

  it("a kind the form does not offer is refused, including open", () => {
    expect(ok({ kind: "open", bodyMd: "W" }).success).toBe(false);
    expect(ok({ bodyMd: "W" }).success).toBe(false);
  });

  it("an empty note is refused with the words-required message", () => {
    const parsed = ok({ kind: "note", bodyMd: "   \n " });
    expect(!parsed.success && parsed.error.issues[0]!.message).toBe("Write your own words first. An entry cannot be empty.");
  });

  it("keeps his words exactly", () => {
    const typed = " a \n b ";
    expect((eventFromForm(form({ kind: "note", bodyMd: typed.replaceAll("\n", "\r\n") })) as { bodyMd: string }).bodyMd).toBe(typed);
  });
});
