import { describe, expect, it } from "vitest";
import { GONE_TEXT, PROBLEM_CODES, PROBLEM_TEXT, type ProblemCode } from "@/modules/sources/client";
import { sourceStatus } from "./status";

const base = { gone: false, fetchProblem: null as ProblemCode | null, fetchedAt: "2026-10-14T05:00:00Z" as string | null, archivedAt: null as string | null };

describe("sourceStatus (plain words)", () => {
  it("a link not yet read says it is being read", () => {
    expect(sourceStatus({ ...base, fetchedAt: null }, false)).toEqual({ visibility: "Private", detail: { text: "Reading the link", tone: "plain" } });
  });

  it("a link read and not on a file is private, with nothing more to say", () => {
    expect(sourceStatus(base, false)).toEqual({ visibility: "Private", detail: null });
  });

  it("a link on a public file says so", () => {
    expect(sourceStatus(base, true)).toEqual({ visibility: "On the public file", detail: null });
  });

  it.each(PROBLEM_CODES)("a failed read (%s) says why in the fixed sentence", (code) => {
    expect(sourceStatus({ ...base, fetchProblem: code }, false).detail).toEqual({ text: PROBLEM_TEXT[code], tone: "warn" });
    expect(sourceStatus({ ...base, fetchedAt: null, fetchProblem: code }, false).detail).toEqual({ text: PROBLEM_TEXT[code], tone: "warn" });
  });

  it("a video no longer on YouTube says so first, and the public file status stays beside it", () => {
    expect(sourceStatus({ ...base, gone: true, fetchProblem: "not_found" }, true)).toEqual({ visibility: "On the public file", detail: { text: GONE_TEXT, tone: "warn" } });
  });

  it("an archived link is called archived and is never 'reading'", () => {
    expect(sourceStatus({ ...base, archivedAt: "2026-10-15T05:00:00Z", fetchedAt: null }, false)).toEqual({ visibility: "Archived", detail: null });
  });
});
