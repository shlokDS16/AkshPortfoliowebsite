// Reads a response body up to a byte limit. The count is of bytes actually received from the stream, never taken from
// Content-Length, and the stream is cancelled the moment the limit is passed. The same logic as the NSE adapter's reader
// (nse-bhavcopy.ts, which was left untouched in Task 8); the GitHub adapter uses this copy.

export async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | "too_big"> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return "too_big";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.byteLength;
  }
  return out;
}
