import type { OcrPort } from "./ocr";

// The fixture OCR adapter (Plan 2b Task 2): local e2e and CI only, never on Vercel (createOcrPort refuses it there,
// ruling R27). It never calls OCR.space. Every page reads as the fixture report's statement of profit and loss, so the
// fixture LLM (src/lib/providers/fixtures) finds the same figures it finds on the digital fixture page.

export const FIXTURE_OCR_TEXT = [
  "Consolidated Statement of Profit and Loss for the year ended March 31, 2026",
  "(Rs. in crore)",
  "Particulars Year ended March 31, 2026 Year ended March 31, 2025",
  "Revenue from operations 1,284.00 1,102.00",
  "Finance costs 41.20 38.90",
  "Profit for the year 152.60 118.30",
].join("\n");

export function createFixtureOcr(text: string = FIXTURE_OCR_TEXT): OcrPort {
  return {
    name: "fixture",
    async read() {
      return { kind: "ok", text };
    },
  };
}
