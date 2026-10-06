import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";

const base = {
  NEXT_PUBLIC_SITE_URL: "https://desk.example.com/",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcd.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_testkey123",
};

describe("parsePublicEnv", () => {
  it("does not require server-only variables", () => {
    const env = parsePublicEnv(base);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abcd.supabase.co");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://desk.example.com");
  });

  it("accepts http for local development", () => {
    const env = parsePublicEnv({ ...base, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
  });

  it.each(["javascript:alert(1)", "ftp://example.com", "data:text/html,x"])(
    "rejects non-http(s) URL %s",
    (url) => {
      expect(() => parsePublicEnv({ ...base, NEXT_PUBLIC_SITE_URL: url })).toThrow(/NEXT_PUBLIC_SITE_URL/);
      expect(() => parsePublicEnv({ ...base, NEXT_PUBLIC_SUPABASE_URL: url })).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    },
  );
});
