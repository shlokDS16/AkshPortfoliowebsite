import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { makeFixturePng } from "../../../scripts/make-fixture-png.mjs";

// The photo e2e sends per-run pixels (ruling R18): two runs must never produce the same picture.

const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

describe("makeFixturePng", () => {
  it("is a valid grey-scale PNG: signature, IHDR 640x360, and a data stream that inflates to every row", () => {
    const png = makeFixturePng("run-a");
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString("latin1")).toBe("IHDR");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([640, 360]);
    const idat = png.indexOf("IDAT");
    const length = png.readUInt32BE(idat - 4);
    expect(inflateSync(png.subarray(idat + 4, idat + 4 + length)).length).toBe(641 * 360);
    expect(png.subarray(-8, -4).toString("latin1")).toBe("IEND");
  });

  it("differs by nonce and repeats for the same nonce", () => {
    expect(sha(makeFixturePng("run-a"))).toBe(sha(makeFixturePng("run-a")));
    const hashes = new Set(["RUN1D", "RUN1M", "RUN2D", "RUN2M", "RUN3DI", "RUN3MI"].map((n) => sha(makeFixturePng(n))));
    expect(hashes.size).toBe(6);
  });
});
