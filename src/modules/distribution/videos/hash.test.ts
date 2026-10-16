import { describe, expect, it } from "vitest";
import { fileSha256, textSha256 } from "./hash";

// The vectors Task 6 pinned against the database trigger (migration 0022): sha256 over the UTF-8 texts joined by a newline.
describe("the transcript hash equals the database's", () => {
  it("matches the trigger's vectors", () => {
    expect(textSha256([{ s: 0, t: "Hello world." }, { s: 31, t: "Second line here" }])).toMatch(/^54cf37a1[0-9a-f]{50}318db5$/);
    expect(textSha256([{ s: 0, t: "é" }, { s: 1, t: "b" }])).toMatch(/^7148cd8e[0-9a-f]{50}527d12$/);
  });

  it("hashes a file's bytes as they are", () => {
    expect(fileSha256(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("counts words by whitespace", async () => {
    const { wordCount } = await import("./hash");
    expect(wordCount([{ s: 0, t: "one two" }, { s: 1, t: " three  four five " }])).toBe(5);
  });
});
