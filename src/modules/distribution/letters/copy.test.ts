import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LETTERS_OFF_LINE } from "@/lib/providers";
import { errorCode, errorText, noticeText } from "@/lib/messages";
import { LETTER_ERROR_TEXT, LETTER_NOTICE_TEXT } from "@/lib/messages-letters";
import { LETTERS_COPY, LETTERS_NOTICE, LETTERS_NOTICE_VERSION } from "../public";
import { LetterError } from "./errors";
import * as copy from "./copy";

const SRC = resolve(__dirname, "../../..");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the notice version is the one the database pins (spec s8.5)", () => {
  it("equals private.letters_notice_version() in migration 0024", () => {
    const sql = readFileSync(resolve(SRC, "../supabase/migrations/20261018000024_letters.sql"), "utf8");
    const pinned = /letters_notice_version\(\)[\s\S]*?select '([^']+)'/.exec(sql)?.[1];
    expect(pinned).toBe(LETTERS_NOTICE_VERSION);
    expect(copy.LETTERS_NOTICE_VERSION).toBe(LETTERS_NOTICE_VERSION);
  });

  it("names the notice a reader accepts, in full, once", () => {
    expect(LETTERS_NOTICE).toContain("It is sent through Resend, an email service in the United States.");
    expect(LETTERS_NOTICE).toContain("You must be 18 or older.");
  });
});

describe("the words a reader and Aksh see (spec s15)", () => {
  const collect = (value: unknown): string[] => (typeof value === "string" ? [value] : typeof value === "function" ? [String((value as (...a: string[]) => string)("x.example", "https://x.example/c", "d"))] : value && typeof value === "object" ? Object.values(value).flatMap(collect) : []);
  const strings = [...collect(LETTERS_COPY), LETTERS_NOTICE, ...collect(copy), ...Object.values(LETTER_ERROR_TEXT), ...Object.values(LETTER_NOTICE_TEXT)];

  it("holds the strings it is supposed to (so the scan below is not reading nothing)", () => {
    expect(strings.length).toBeGreaterThan(40);
    expect(strings).toContain("Ask to subscribe");
    expect(strings).toContain("Stop my letters");
  });

  it("uses none of the banned words, and no emoji and no dash used as a pause", () => {
    for (const text of strings) {
      expect(text, text).not.toMatch(/\b(?:proof|verified|buy|sell|weekly)\b/i);
      expect(text, text).not.toMatch(/\p{Extended_Pictographic}|—|–/u);
    }
  });

  it("no source file of the letters says any of them in code either", () => {
    const files = [
      ...readdirSync(__dirname).filter((n) => /\.ts$/.test(n) && !/\.test\.ts$/.test(n)).map((n) => join(__dirname, n)),
      resolve(SRC, "lib/messages-letters.ts"), resolve(SRC, "modules/ops/letter-steps.ts"), resolve(SRC, "modules/distribution/public.ts"),
    ];
    for (const file of files) expect(strip(readFileSync(file, "utf8")), file).not.toMatch(/\b(?:proof|verified|weekly)\b/i);
  });
});

describe("the fixed codes", () => {
  it("every letter error shows as itself with the same text in messages.ts", () => {
    for (const code of Object.keys(LETTER_ERROR_TEXT) as (keyof typeof LETTER_ERROR_TEXT)[]) {
      expect(errorCode(new LetterError(code)), code).toBe(code);
      expect(errorText(code), code).toBe(LETTER_ERROR_TEXT[code]);
    }
  });

  it("every letter notice has its text in messages.ts", () => {
    for (const code of Object.keys(LETTER_NOTICE_TEXT) as (keyof typeof LETTER_NOTICE_TEXT)[]) expect(noticeText(code), code).toBe(LETTER_NOTICE_TEXT[code]);
  });

  it("the 'not set up' line is the one the ports carry", () => {
    expect(LETTER_ERROR_TEXT["letters-off"]).toBe(LETTERS_OFF_LINE);
  });

  it("the database's refusal sentences are the ones the codes show", () => {
    const sql = readFileSync(resolve(SRC, "../supabase/migrations/20261018000025_letters_gate.sql"), "utf8");
    for (const code of ["letter-not-a-letter", "letter-not-current", "letter-not-public", "letter-gate-stale", "letter-already-sent", "letter-broadcast-made", "letter-another-sending", "letter-test-limit", "letter-cannot-cancel", "letter-send-not-found"] as const) {
      expect(sql.replaceAll("''", "'"), code).toContain(LETTER_ERROR_TEXT[code]);
    }
  });
});
