import { describe, expect, it } from "vitest";

// Phase 5 spec s9.4: a unit test can never reach YouTube or Resend by accident. The setup file wraps the global fetch; adapters are
// tested with an injected fetch only, and a test that stubs the global fetch itself replaces the guard for that test.
describe("the global fetch refuses the Phase 5 outbound hosts", () => {
  it.each([
    ["https://www.googleapis.com/youtube/v3/videos?id=x"],
    ["https://www.googleapis.com/anything"],
    ["https://api.resend.com/broadcasts"],
    ["https://api.resend.com/contacts"],
    ["https://API.Resend.com/emails"],
    ["https://youtube.googleapis.com/youtube/v3/videos"],
    ["https://eu.api.resend.com/emails"],
    ["https://api.resend.com./emails"],
  ])("%s", async (url) => {
    await expect(fetch(url)).rejects.toThrow(/no outbound call in a test/);
    await expect(fetch(new Request(url))).rejects.toThrow(/no outbound call in a test/);
    await expect(fetch(new URL(url))).rejects.toThrow(/no outbound call in a test/);
  });
});

describe("the guard is by host, not by prefix", () => {
  it("does not block a host that only ends in the same letters", async () => {
    const real = globalThis.fetch;
    // A refused connection is fine here: the point is that the guard did not answer.
    await expect(real("http://127.0.0.1:9/notresend.com").catch((error: Error) => error.message)).resolves.not.toMatch(/no outbound call in a test/);
  });
});
