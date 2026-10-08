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
});
