import { describe, expect, it } from "vitest";
import { EnvError } from "./env";
import { parseServerEnv } from "./env.server";

const valid = {
  NEXT_PUBLIC_SITE_URL: "https://desk.example.com/",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_testkey123",
  SUPABASE_SECRET_KEY: "sb_secret_testkey456",
  ADMIN_EMAIL: " Aksh@Example.com ",
  CRON_SECRET: "c".repeat(32),
};

describe("parseServerEnv", () => {
  it("accepts a complete environment and normalises it", () => {
    const env = parseServerEnv(valid);
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://desk.example.com");
    expect(env.ADMIN_EMAIL).toBe("aksh@example.com");
  });

  it("names every missing variable", () => {
    expect(() => parseServerEnv({ ...valid, CRON_SECRET: undefined, ADMIN_EMAIL: undefined }))
      .toThrow(/CRON_SECRET[\s\S]*ADMIN_EMAIL|ADMIN_EMAIL[\s\S]*CRON_SECRET/);
  });

  it("rejects legacy JWT keys in favour of sb_secret_ / sb_publishable_ keys", () => {
    expect(() => parseServerEnv({ ...valid, SUPABASE_SECRET_KEY: "eyJhbGciOiJIUzI1NiJ9.payload.sig" }))
      .toThrow(/SUPABASE_SECRET_KEY/);
    expect(() => parseServerEnv({ ...valid, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "eyJhbGciOi.x.y" }))
      .toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("rejects a short CRON_SECRET", () => {
    expect(() => parseServerEnv({ ...valid, CRON_SECRET: "short" })).toThrow(/CRON_SECRET/);
  });

  it("never echoes secret values in the error", () => {
    try {
      parseServerEnv({ ...valid, SUPABASE_SECRET_KEY: "eyJsupersecretvalue" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvError);
      expect((error as EnvError).message).not.toContain("supersecretvalue");
    }
  });

  it("ignores unrelated variables such as dev-only tokens", () => {
    const env = parseServerEnv({ ...valid, SUPABASE_ACCESS_TOKEN: "sbp_devonly", GOOGLE_VISION_API_KEY: "x" });
    expect(env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
    expect(env).not.toHaveProperty("GOOGLE_VISION_API_KEY");
  });
});

describe("parseServerEnv: the LLM settings (optional; unset means AI reading is off)", () => {
  it("treats an empty GROQ_API_KEY from the template as unset", () => {
    expect(parseServerEnv({ ...valid, GROQ_API_KEY: "" }).GROQ_API_KEY).toBeUndefined();
    expect(parseServerEnv(valid).GROQ_API_KEY).toBeUndefined();
  });

  it("refuses a key too short to be a Groq key, without echoing it", () => {
    expect(() => parseServerEnv({ ...valid, GROQ_API_KEY: "gsk_123456" })).toThrow(/GROQ_API_KEY/);
    expect(() => parseServerEnv({ ...valid, GROQ_API_KEY: "gsk_123456" })).not.toThrow(/gsk_123456/);
    expect(parseServerEnv({ ...valid, GROQ_API_KEY: `gsk_${"k".repeat(40)}` }).GROQ_API_KEY).toBe(`gsk_${"k".repeat(40)}`);
  });

  it("defaults GROQ_MODEL_VISION to the vision model, also when the template leaves it empty", () => {
    expect(parseServerEnv(valid).GROQ_MODEL_VISION).toBe("qwen/qwen3.8-27b");
    expect(parseServerEnv({ ...valid, GROQ_MODEL_VISION: "" }).GROQ_MODEL_VISION).toBe("qwen/qwen3.8-27b");
  });

  it("defaults GROQ_MODEL_TEXT to openai/gpt-oss-120b, also when the template leaves it empty", () => {
    expect(parseServerEnv(valid).GROQ_MODEL_TEXT).toBe("openai/gpt-oss-120b");
    expect(parseServerEnv({ ...valid, GROQ_MODEL_TEXT: "" }).GROQ_MODEL_TEXT).toBe("openai/gpt-oss-120b");
    expect(parseServerEnv({ ...valid, GROQ_MODEL_TEXT: "openai/gpt-oss-20b" }).GROQ_MODEL_TEXT).toBe("openai/gpt-oss-20b");
  });

  it("defaults GROQ_MODEL_CLASSIFY to openai/gpt-oss-20b, also when the template leaves it empty", () => {
    expect(parseServerEnv(valid).GROQ_MODEL_CLASSIFY).toBe("openai/gpt-oss-20b");
    expect(parseServerEnv({ ...valid, GROQ_MODEL_CLASSIFY: "" }).GROQ_MODEL_CLASSIFY).toBe("openai/gpt-oss-20b");
    expect(parseServerEnv({ ...valid, GROQ_MODEL_CLASSIFY: "other/model" }).GROQ_MODEL_CLASSIFY).toBe("other/model");
  });

  it("defaults GROQ_MODEL_WHISPER to Whisper large v3 turbo, also when the template leaves it empty", () => {
    expect(parseServerEnv(valid).GROQ_MODEL_WHISPER).toBe("whisper-large-v3-turbo");
    expect(parseServerEnv({ ...valid, GROQ_MODEL_WHISPER: "" }).GROQ_MODEL_WHISPER).toBe("whisper-large-v3-turbo");
  });

  it("keeps voice notes off unless VOICE_NOTES is exactly on (blank and unset are off; anything else is an error)", () => {
    expect(parseServerEnv(valid).VOICE_NOTES).toBeUndefined();
    expect(parseServerEnv({ ...valid, VOICE_NOTES: "" }).VOICE_NOTES).toBeUndefined();
    expect(parseServerEnv({ ...valid, VOICE_NOTES: "on" }).VOICE_NOTES).toBe("on");
    for (const bad of ["off", "true", "1", "ON"]) expect(() => parseServerEnv({ ...valid, VOICE_NOTES: bad })).toThrow(/VOICE_NOTES/);
  });

  it("treats OCRSPACE_API_KEY as optional (unset means scan reading is off), blank included, and never echoes a bad key", () => {
    expect(parseServerEnv(valid).OCRSPACE_API_KEY).toBeUndefined();
    expect(parseServerEnv({ ...valid, OCRSPACE_API_KEY: "" }).OCRSPACE_API_KEY).toBeUndefined();
    expect(parseServerEnv({ ...valid, OCRSPACE_API_KEY: "K81234567888957" }).OCRSPACE_API_KEY).toBe("K81234567888957");
    expect(() => parseServerEnv({ ...valid, OCRSPACE_API_KEY: "short" })).toThrow(/OCRSPACE_API_KEY/);
    expect(() => parseServerEnv({ ...valid, OCRSPACE_API_KEY: "short" })).not.toThrow(/short"/);
  });

  it("accepts LLM_ADAPTER groq or fixture and refuses anything else", () => {
    expect(parseServerEnv({ ...valid, LLM_ADAPTER: "fixture" }).LLM_ADAPTER).toBe("fixture");
    expect(parseServerEnv({ ...valid, LLM_ADAPTER: "" }).LLM_ADAPTER).toBeUndefined();
    expect(() => parseServerEnv({ ...valid, LLM_ADAPTER: "other" })).toThrow(/LLM_ADAPTER/);
  });

  it("reads VERCEL_ENV (set by Vercel) so the fixture adapter can be refused there", () => {
    expect(parseServerEnv({ ...valid, VERCEL_ENV: "preview" }).VERCEL_ENV).toBe("preview");
    expect(parseServerEnv(valid).VERCEL_ENV).toBeUndefined();
  });
  it("defaults the two NSE templates to the verified archive patterns, also when the template leaves them empty", () => {
    const env = parseServerEnv(valid);
    expect(env.NSE_BHAVCOPY_URL_TEMPLATE).toBe("https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{YYYYMMDD}_F_0000.csv.zip");
    expect(env.NSE_INDEX_URL_TEMPLATE).toBe("https://nsearchives.nseindia.com/content/indices/ind_close_all_{DDMMYYYY}.csv");
    expect(parseServerEnv({ ...valid, NSE_BHAVCOPY_URL_TEMPLATE: "", NSE_INDEX_URL_TEMPLATE: "" }).NSE_INDEX_URL_TEMPLATE).toBe(env.NSE_INDEX_URL_TEMPLATE);
  });

  it("accepts a changed path on the NSE archive host", () => {
    const template = "https://nsearchives.nseindia.com/content/cm/new_{YYYYMMDD}.zip";
    expect(parseServerEnv({ ...valid, NSE_BHAVCOPY_URL_TEMPLATE: template }).NSE_BHAVCOPY_URL_TEMPLATE).toBe(template);
  });

  it("refuses, at parse time, a template for another host, http, a missing or swapped placeholder", () => {
    for (const NSE_BHAVCOPY_URL_TEMPLATE of [
      "https://evil.example/{YYYYMMDD}.zip",
      "http://nsearchives.nseindia.com/{YYYYMMDD}.zip",
      "https://nsearchives.nseindia.com@evil.example/{YYYYMMDD}.zip",
      "https://nsearchives.nseindia.com/no-date.zip",
      "https://nsearchives.nseindia.com/{DDMMYYYY}.zip",
    ]) {
      expect(() => parseServerEnv({ ...valid, NSE_BHAVCOPY_URL_TEMPLATE })).toThrow(/NSE_BHAVCOPY_URL_TEMPLATE/);
    }
    expect(() => parseServerEnv({ ...valid, NSE_INDEX_URL_TEMPLATE: "https://evil.example/{DDMMYYYY}.csv" })).toThrow(/NSE_INDEX_URL_TEMPLATE/);
    expect(() => parseServerEnv({ ...valid, NSE_INDEX_URL_TEMPLATE: "https://evil.example/{DDMMYYYY}.csv" })).not.toThrow(/evil\.example/);
  });

  it("leaves the public anchor off when the token and the gist id are unset or empty", () => {
    const env = parseServerEnv(valid);
    expect(env.GITHUB_GIST_TOKEN).toBeUndefined();
    expect(env.LEDGER_ANCHOR_GIST_ID).toBeUndefined();
    const blank = parseServerEnv({ ...valid, GITHUB_GIST_TOKEN: "", LEDGER_ANCHOR_GIST_ID: "" });
    expect(blank.GITHUB_GIST_TOKEN).toBeUndefined();
    expect(blank.LEDGER_ANCHOR_GIST_ID).toBeUndefined();
  });

  it("accepts a gist id and a token of the right shape", () => {
    const env = parseServerEnv({ ...valid, GITHUB_GIST_TOKEN: " github_pat_11ABCDEFG0123456789_abcdef ", LEDGER_ANCHOR_GIST_ID: " aa11bb22cc33dd44ee55ff6677889900 " });
    expect(env.LEDGER_ANCHOR_GIST_ID).toBe("aa11bb22cc33dd44ee55ff6677889900");
    expect(env.GITHUB_GIST_TOKEN).toBe("github_pat_11ABCDEFG0123456789_abcdef");
  });

  it("refuses at parse time a gist id that could alter the address path, naming the variable and never the value", () => {
    for (const LEDGER_ANCHOR_GIST_ID of ["../../users/x", "aa11bb22cc33dd44ee55/../x", "aa11bb22cc33dd44ee55ff6677889900?x=1", "AA11BB22CC33DD44EE55FF6677889900", "short", "aa11bb22cc33dd44ee55ff6677889900aa11bb22cc33", "%2e%2e%2f%2e%2e%2fusers%2fxxxx", "aa11bb22cc33dd44ee55 ff66778899"]) {
      let message = "";
      try {
        parseServerEnv({ ...valid, LEDGER_ANCHOR_GIST_ID });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, LEDGER_ANCHOR_GIST_ID).toMatch(/LEDGER_ANCHOR_GIST_ID/);
      expect(message).not.toContain(LEDGER_ANCHOR_GIST_ID);
    }
  });

  it("refuses a token with a space or a line break, and never echoes it", () => {
    for (const GITHUB_GIST_TOKEN of ["short", "github_pat_11ABCDEFG0123456789 abc", "github_pat_11ABCDEFG0123456789\r\nX-Evil: 1"]) {
      let message = "";
      try {
        parseServerEnv({ ...valid, GITHUB_GIST_TOKEN });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/GITHUB_GIST_TOKEN/);
      expect(message).not.toContain("Evil");
      expect(message).not.toContain("github_pat_");
    }
  });
});

describe("parseServerEnv: the alert email settings (2.9; all optional, off unless RESEND_API_KEY and ALERT_EMAIL are set)", () => {
  it("leaves them unset, blank included", () => {
    const env = parseServerEnv({ ...valid, RESEND_API_KEY: "", ALERT_EMAIL: "", RESEND_FROM: "" });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.ALERT_EMAIL).toBeUndefined();
    expect(parseServerEnv(valid).RESEND_API_KEY).toBeUndefined();
    expect(parseServerEnv(valid).ALERT_EMAIL).toBeUndefined();
  });

  it("defaults RESEND_FROM to the Resend test sender, also when the template leaves it empty", () => {
    expect(parseServerEnv(valid).RESEND_FROM).toBe("Aksh Research Desk <onboarding@resend.dev>");
    expect(parseServerEnv({ ...valid, RESEND_FROM: "" }).RESEND_FROM).toBe("Aksh Research Desk <onboarding@resend.dev>");
    expect(parseServerEnv({ ...valid, RESEND_FROM: " Aksh <desk@akshagrawal.in> " }).RESEND_FROM).toBe("Aksh <desk@akshagrawal.in>");
  });

  it("reads ALERT_EMAIL as one address or a comma-separated list, trimmed, lower-cased, without empty entries or repeats", () => {
    expect(parseServerEnv({ ...valid, ALERT_EMAIL: " Shlok@Example.com " }).ALERT_EMAIL).toEqual(["shlok@example.com"]);
    expect(parseServerEnv({ ...valid, ALERT_EMAIL: "a@example.com, B@example.org,,a@example.com ," }).ALERT_EMAIL).toEqual(["a@example.com", "b@example.org"]);
    expect(parseServerEnv({ ...valid, ALERT_EMAIL: " , " }).ALERT_EMAIL).toBeUndefined();
  });

  it("does not stop the whole app for a mistyped alert setting: the shape is checked where the mail is built (so it fails only that step)", () => {
    const env = parseServerEnv({ ...valid, RESEND_API_KEY: "not a key", ALERT_EMAIL: "not-an-address" });
    expect(env.RESEND_API_KEY).toBe("not a key");
    expect(env.ALERT_EMAIL).toEqual(["not-an-address"]);
  });
});

describe("parseServerEnv: video listing (Phase 5b; off while the YouTube settings are unset)", () => {
  const KEY = "AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345";
  const CHANNEL = "UC0123456789abcdefghijkl";

  it("leaves video listing off when the settings are unset or empty", () => {
    const env = parseServerEnv({ ...valid, YOUTUBE_API_KEY: "", YOUTUBE_CHANNEL_ID: "", DISTRIBUTION_ADAPTER: "" });
    expect(env.YOUTUBE_API_KEY).toBeUndefined();
    expect(env.YOUTUBE_CHANNEL_ID).toBeUndefined();
    expect(env.DISTRIBUTION_ADAPTER).toBeUndefined();
    expect(parseServerEnv(valid).YOUTUBE_API_KEY).toBeUndefined();
  });

  it("accepts a key and a channel id of the right shape (trimmed) and the fixture adapter", () => {
    const env = parseServerEnv({ ...valid, YOUTUBE_API_KEY: ` ${KEY} `, YOUTUBE_CHANNEL_ID: ` ${CHANNEL} `, DISTRIBUTION_ADAPTER: "fixture" });
    expect(env.YOUTUBE_API_KEY).toBe(KEY);
    expect(env.YOUTUBE_CHANNEL_ID).toBe(CHANNEL);
    expect(env.DISTRIBUTION_ADAPTER).toBe("fixture");
  });

  it("refuses a malformed key, channel id or adapter, naming the variable and never the value", () => {
    const cases: Array<[string, string]> = [
      ["YOUTUBE_API_KEY", "short"],
      ["YOUTUBE_API_KEY", `${KEY}\r\nX-Evil: 1`],
      ["YOUTUBE_API_KEY", "key with spaces in it xxxxxxxxxx"],
      ["YOUTUBE_CHANNEL_ID", "UCshort"],
      ["YOUTUBE_CHANNEL_ID", "XX0123456789abcdefghijkl"],
      ["YOUTUBE_CHANNEL_ID", `${CHANNEL}/../x`],
      ["DISTRIBUTION_ADAPTER", "real"],
    ];
    for (const [name, value] of cases) {
      let message = "";
      try {
        parseServerEnv({ ...valid, [name]: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message, `${name}=${value}`).toMatch(new RegExp(name));
      expect(message).not.toContain(value);
    }
  });
});

describe("parseServerEnv: letters (Phase 5c; off while the three settings are unset)", () => {
  const SET = { RESEND_LETTERS_KEY: "re_lettersKEY_1234567890secretsecret", LETTERS_FROM: "Aksh Agrawal <letters@akshagrawal.example>", LETTERS_SEGMENT_ID: "78261eea-8f8b-4381-83c6-79fa7120f1cf" };

  it("leaves letters off when the settings are unset or empty", () => {
    const env = parseServerEnv({ ...valid, RESEND_LETTERS_KEY: "", LETTERS_FROM: "", LETTERS_SEGMENT_ID: "" });
    expect([env.RESEND_LETTERS_KEY, env.LETTERS_FROM, env.LETTERS_SEGMENT_ID]).toEqual([undefined, undefined, undefined]);
  });

  it("reads the three settings trimmed; their shape is checked where letters are built, so a typo turns letters off, not the app", () => {
    const env = parseServerEnv({ ...valid, RESEND_LETTERS_KEY: ` ${SET.RESEND_LETTERS_KEY} `, LETTERS_FROM: ` ${SET.LETTERS_FROM} `, LETTERS_SEGMENT_ID: ` ${SET.LETTERS_SEGMENT_ID} ` });
    expect([env.RESEND_LETTERS_KEY, env.LETTERS_FROM, env.LETTERS_SEGMENT_ID]).toEqual([SET.RESEND_LETTERS_KEY, SET.LETTERS_FROM, SET.LETTERS_SEGMENT_ID]);
    expect(parseServerEnv({ ...valid, RESEND_LETTERS_KEY: "not a key" }).RESEND_LETTERS_KEY).toBe("not a key");
  });

  it("reads CI, NODE_ENV and VITEST, so letters can refuse a test or CI run", () => {
    const env = parseServerEnv({ ...valid, CI: "1", NODE_ENV: "test", VITEST: "true" });
    expect([env.CI, env.NODE_ENV, env.VITEST]).toEqual(["1", "test", "true"]);
    expect(parseServerEnv({ ...valid, CI: "" }).CI).toBeUndefined();
  });
});
