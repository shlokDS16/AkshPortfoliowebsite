import { describe, expect, it } from "vitest";
import { EnvError, parsePublicEnv, parseServerEnv } from "./env";

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
    const env = parseServerEnv({ ...valid, SUPABASE_ACCESS_TOKEN: "sbp_devonly", OCRSPACE_API_KEY: "x" });
    expect(env).not.toHaveProperty("SUPABASE_ACCESS_TOKEN");
    expect(env).not.toHaveProperty("OCRSPACE_API_KEY");
  });
});

describe("parsePublicEnv", () => {
  it("does not require server-only variables", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_SITE_URL: valid.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_SUPABASE_URL: valid.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcd.supabase.co");
  });
});
