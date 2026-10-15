import { describe, expect, it } from "vitest";

// Phase 5 spec s9.4: a unit test can never reach YouTube or Resend by accident. The setup file wraps the global fetch; adapters are
// tested with an injected fetch only, and a test that stubs the global fetch itself replaces the guard for that test.
describe("the global fetch refuses the Phase 5 outbound hosts", () => {
  it.each([
    ["https://www.googleapis.com/youtube/v3/videos?id=x"],
    ["https://www.googleapis.com/anything"],
    ["https://api.resend.com/broadcasts"],
    ["https://api.resend.com/contacts"],
  ])("%s", async (url) => {
    await expect(fetch(url)).rejects.toThrow(/no outbound call in a test/);
    await expect(fetch(new Request(url))).rejects.toThrow(/no outbound call in a test/);
    await expect(fetch(new URL(url))).rejects.toThrow(/no outbound call in a test/);
  });
});
