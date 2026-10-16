import { describe, expect, it } from "vitest";
import { grievanceContact, lettersEmailReady } from "./letters-config";

const BASE = { ADMIN_EMAIL: "admin@example.com" };
const SET = {
  RESEND_LETTERS_KEY: "re_lettersKEY_1234567890secretsecret",
  LETTERS_FROM: "Aksh Agrawal <letters@akshagrawal.example>",
  LETTERS_SEGMENT_ID: "78261eea-8f8b-4381-83c6-79fa7120f1cf",
};

describe("grievanceContact", () => {
  it("is the trimmed address when it is one", () => {
    expect(grievanceContact(() => ({ LETTERS_GRIEVANCE_EMAIL: " help@desk.example " }))).toBe("help@desk.example");
  });

  it("is null when unset, blank, not an address, or when the environment cannot be read", () => {
    for (const value of [undefined, "", "   ", "not an address", "a@b", "x@y.example, z@y.example", "<a@b.example>"]) {
      expect(grievanceContact(() => ({ LETTERS_GRIEVANCE_EMAIL: value })), String(value)).toBeNull();
    }
    expect(grievanceContact(() => { throw new Error("env"); })).toBeNull();
  });
});

describe("lettersEmailReady", () => {
  it("is false while letters are off, and when the environment cannot be read", () => {
    expect(lettersEmailReady(() => BASE)).toBe(false);
    expect(lettersEmailReady(() => ({ ...BASE, ...SET }))).toBe(false); // not production
    expect(lettersEmailReady(() => { throw new Error("env"); })).toBe(false);
  });

  it("is true on production with the three settings, and for the local fixture", () => {
    expect(lettersEmailReady(() => ({ ...BASE, ...SET, VERCEL_ENV: "production" }))).toBe(true);
    expect(lettersEmailReady(() => ({ ...BASE, DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" }))).toBe(true);
  });

  it("is false for the fixture against a database that is not on this machine (review finding 9)", () => {
    expect(lettersEmailReady(() => ({ ...BASE, DISTRIBUTION_ADAPTER: "fixture", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }))).toBe(false);
  });
});
