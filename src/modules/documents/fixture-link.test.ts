import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentError } from "./errors";
import { createLinkFetchDeps } from "./fixture-link";
import { closePdf, openPdf, pageText } from "./pages";
import { classifyPages } from "./selector";
import { safeFetch } from "./safe-fetch";

const FIXTURE = createLinkFetchDeps({ LLM_ADAPTER: "fixture" });
afterEach(() => vi.restoreAllMocks());

describe("createLinkFetchDeps", () => {
  it("uses the real DNS and HTTPS unless the fixture is asked for", () => {
    expect(createLinkFetchDeps({})).toEqual({});
    expect(createLinkFetchDeps({ LLM_ADAPTER: "groq" })).toEqual({});
  });

  it("is refused on a Vercel preview or production deployment: links are then fetched for real", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const VERCEL_ENV of ["preview", "production"]) expect(createLinkFetchDeps({ LLM_ADAPTER: "fixture", VERCEL_ENV })).toEqual({});
    expect(error).toHaveBeenCalledTimes(2);
    expect(createLinkFetchDeps({ LLM_ADAPTER: "fixture", VERCEL_ENV: "development" })).toHaveProperty("transport");
    expect(FIXTURE).toHaveProperty("resolve");
  });
});

describe("the fixture sites, through the real guard", () => {
  it("serves a results PDF that pdf.js opens, with a statement heading and numbers", async () => {
    const page = await safeFetch("https://bse.test/RUN9-results.pdf", FIXTURE);
    expect(page.contentType).toBe("application/pdf");
    const pdf = await openPdf(page.bytes);
    try {
      const text = await pageText(pdf, 1);
      expect(text).toContain("Revenue from operations 1,284.00 1,102.00");
      expect(text).toContain("Fixture link RUN9-results.pdf");
      expect(classifyPages([{ pageNo: 1, text, isScan: false }])[0]).toMatchObject({ kind: "pl" });
    } finally {
      await closePdf(pdf);
    }
  });

  it("gives every name its own bytes, so a run can be told apart from the last", async () => {
    const [a, b] = await Promise.all([safeFetch("https://bse.test/A.pdf", FIXTURE), safeFetch("https://bse.test/B.pdf", FIXTURE)]);
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(false);
  });

  it("serves a results page, and a redirect on to it", async () => {
    const direct = await safeFetch("https://results.test/q/X1", FIXTURE);
    expect(direct.contentType).toBe("text/html");
    expect(new TextDecoder().decode(direct.bytes)).toContain("Quarterly results table X1");
    const via = await safeFetch("https://redirect.test/go/X1", FIXTURE);
    expect(via.finalUrl).toBe("https://results.test/q/X1");
  });

  it("still refuses a fixture host that resolves to a private address, an address written into the link, and http", async () => {
    const code = async (link: string) => (await safeFetch(link, FIXTURE).catch((e: unknown) => e)) as DocumentError;
    expect((await code("https://internal.test/x")).code).toBe("link-blocked");
    expect((await code("https://127.0.0.1/x")).code).toBe("link-blocked");
    expect((await code("http://results.test/q/x")).code).toBe("link-invalid");
    expect((await code("https://unknown.example/x")).code).toBe("link-failed");
  });
});
