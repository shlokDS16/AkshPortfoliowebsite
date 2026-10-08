// A grey-scale PNG of a table with a header and three data rows, for the photo e2e (Plan 2b Task 3).
// makeFixturePng(nonce) draws 32 black or white blocks along the top edge from the nonce, so every run (and each viewport)
// sends different pixels. The browser re-encodes the picture as a JPEG before it uploads it, and documents.sha256 is unique
// while the local database is not reset: a fixed picture would be refused as a duplicate on the second run. The table has
// no letters (the e2e uses the fixture scan reader and the fixture AI, which never look at the pixels).
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

const WIDTH = 640;
const HEIGHT = 360;
const BLOCK = WIDTH / 32;
const NONCE_ROWS = 16;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

/** @param {string} [nonce] @returns {Buffer} */
export function makeFixturePng(nonce = "") {
  const pixels = Buffer.alloc(WIDTH * HEIGHT, 255);
  const set = (x, y, v) => {
    pixels[y * WIDTH + x] = v;
  };
  const rect = (x0, y0, x1, y1, v) => {
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) set(x, y, v);
  };
  // The grid: four rows between five rules, three columns between four, 3 px wide.
  const rows = [40, 100, 160, 220, 280];
  const cols = [40, 300, 450, 600];
  for (const y of rows) rect(cols[0], y, cols[3] + 3, y + 3, 0);
  for (const x of cols) rect(x, rows[0], x + 3, rows[4] + 3, 0);
  // A grey bar in each cell stands for the words and the numbers.
  for (let r = 0; r < 4; r += 1) for (let c = 0; c < 3; c += 1) rect(cols[c] + 14, rows[r] + 22, cols[c + 1] - 14 - (c === 0 ? 40 : 0), rows[r] + 38, r === 0 ? 60 : 120);
  // The nonce: 32 blocks along the top, from the first four bytes of its hash.
  const bits = createHash("sha256").update(nonce).digest().subarray(0, 4);
  for (let i = 0; i < 32; i += 1) {
    const on = (bits[i >> 3] >> (7 - (i & 7))) & 1;
    rect(i * BLOCK, 0, (i + 1) * BLOCK, NONCE_ROWS, on ? 0 : 255);
  }
  const raw = Buffer.alloc((WIDTH + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) pixels.copy(raw, y * (WIDTH + 1) + 1, y * WIDTH, (y + 1) * WIDTH);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header.set([8, 0, 0, 0, 0], 8); // 8 bits, grey scale, deflate, adaptive filter, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
