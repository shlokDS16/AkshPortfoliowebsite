import { describe, expect, it } from "vitest";
import { isOutsideHost } from "./outbound-hosts";

// Pure: no fetch, no network. Review finding 4 (the lookalike names are real HOST names, not paths).
describe("isOutsideHost", () => {
  it.each([
    "api.resend.com",
    "API.RESEND.COM",
    "api.resend.com.",
    "resend.com",
    "eu.api.resend.com",
    "googleapis.com",
    "youtube.googleapis.com",
    "notresend.com",
    "resend.com.evil.test",
    "api-resend.com",
    "xn--rsend-bva.com",
    "127.0.0.1.nip.io",
    "localhost.evil.test",
    "example.com",
    "api.groq.com",
    "8.8.8.8",
  ])("%s is outside", (host) => {
    expect(isOutsideHost(host)).toBe(true);
  });

  it.each(["localhost", "LOCALHOST", "localhost.", "app.localhost", "127.0.0.1", "127.0.0.2", "127.255.0.9", "[::1]", "::1", ""])(
    "%j is this machine",
    (host) => {
      expect(isOutsideHost(host)).toBe(false);
    },
  );
});
