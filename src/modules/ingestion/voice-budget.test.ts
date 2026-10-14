import { describe, expect, it } from "vitest";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "@/modules/documents/client";
import { WHISPER_BYTES_PER_SECOND, WHISPER_CAPS } from "./caps";
import { reservationSeconds, settledSeconds } from "./voice-budget";

describe("the Whisper caps (spec s9: 20 RPM, 2K RPD, 7.2K s/h, 28.8K s/day at 75%)", () => {
  it("are 75% of the free tier", () => {
    expect(WHISPER_CAPS).toEqual({ rpm: 15, rpd: 1_500, secondsHour: 5_400, secondsDay: 21_600 });
    expect(WHISPER_CAPS.secondsHour).toBe(0.75 * 7_200);
    expect(WHISPER_CAPS.secondsDay).toBe(0.75 * 28_800);
  });

  it("the longest recording the upload takes is the hour allowance, and the biggest file is Groq's 25 MB", () => {
    expect(VOICE_MAX_SECONDS).toBe(WHISPER_CAPS.secondsHour);
    expect(VOICE_MAX_BYTES).toBe(25_000_000);
  });
});

describe("reservationSeconds", () => {
  it("reserves the browser's length when it is the larger", () => {
    expect(reservationSeconds(100_000, 95.2)).toBe(96);
  });

  it("reserves the size floor when the browser's length is missing, Infinity or NaN (webm from MediaRecorder)", () => {
    const bytes = 8 * WHISPER_BYTES_PER_SECOND;
    for (const claimed of [null, undefined, Number.POSITIVE_INFINITY, Number.NaN, -3, "12"]) expect(reservationSeconds(bytes, claimed)).toBe(10);
    expect(reservationSeconds(600 * WHISPER_BYTES_PER_SECOND, Number.POSITIVE_INFINITY)).toBe(600);
  });

  it("reserves at least the 10 seconds Groq bills a request", () => {
    expect(reservationSeconds(1, 0.4)).toBe(10);
    expect(reservationSeconds(0, null)).toBe(10);
  });

  it("is the larger of the claim and the floor: a claim that undercounts a big file does not lower the reservation", () => {
    expect(reservationSeconds(300 * WHISPER_BYTES_PER_SECOND, 20)).toBe(300);
  });

  it("is clamped to the hour allowance, so reserve_units never raises for a long recording", () => {
    expect(reservationSeconds(25_000_000, 100_000)).toBe(WHISPER_CAPS.secondsHour);
    expect(reservationSeconds(25_000_000, Number.MAX_SAFE_INTEGER)).toBe(WHISPER_CAPS.secondsHour);
  });
});

describe("settledSeconds", () => {
  it("settles the length the provider reported, at least 10 seconds", () => {
    expect(settledSeconds(42.2, 100)).toBe(43);
    expect(settledSeconds(3, 100)).toBe(10);
  });

  it("keeps the reservation when the answer carried no length", () => {
    expect(settledSeconds(null, 77)).toBe(77);
    expect(settledSeconds(0, 77)).toBe(77);
    expect(settledSeconds(Number.NaN, 77)).toBe(77);
  });
});
