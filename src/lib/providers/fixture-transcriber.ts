import type { TranscriberPort } from "./transcriber";

// The fixture transcriber (Plan 2b Task 4): local e2e and CI only, never on Vercel (createTranscriberPort refuses it there,
// ruling R27). It never calls Groq and never listens to the bytes: every recording is typed out as the same sentence.

export const FIXTURE_TRANSCRIPT = "Dealers told me orders are up this quarter and the new line is ramping faster than management said.";
export const FIXTURE_SECONDS = 12;

export function createFixtureTranscriber(text: string = FIXTURE_TRANSCRIPT, seconds: number = FIXTURE_SECONDS): TranscriberPort {
  return {
    name: "fixture",
    async transcribe() {
      return { kind: "ok", text, seconds };
    },
  };
}
