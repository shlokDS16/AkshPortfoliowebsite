import { describe, expect, it, vi } from "vitest";
import { createFixtureTranscriber, FIXTURE_SECONDS, FIXTURE_TRANSCRIPT } from "@/lib/providers/fixture-transcriber";
import type { TranscriberPort, TranscriberResult } from "@/lib/providers/transcriber";
import { VOICE_MAX_BYTES } from "@/modules/documents/client";
import { createMemoryDocumentsRepo, type MemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryProposalsRepo, createMemoryResearch } from "@/test/fakes/proposals-repo";
import { createMemoryUsageRepo, type MemoryUsageRepo } from "@/test/fakes/usage-repo";
import { SHORT_WAIT_MS, WHISPER_BUCKET, WHISPER_BYTES_PER_SECOND } from "../caps";
import { machineDocuments, type StepDeps } from "../deps";
import type { Step, StepContext } from "../types";
import { VOICE_NOT_STORED, VOICE_NOTHING_HEARD, VOICE_OFF, VOICE_TOO_BIG } from "../voice-copy";
import { transcribe } from "./transcribe";

const DOC = "44444444-4444-4444-8444-444444444444";
const T0 = Date.parse("2026-10-08T10:00:00Z");
const AUDIO = new Uint8Array(64).fill(9);

type Over = { path?: string | null; deleted?: boolean; kind?: "audio" | "pdf"; bytes?: Uint8Array };

function setup(over: Over = {}): MemoryDocumentsRepo {
  const repo = createMemoryDocumentsRepo();
  const path = over.path === undefined ? `${DOC}.m4a` : over.path;
  repo.docs.set(DOC, {
    id: DOC, companyId: null, title: "Dealer call", kind: over.kind ?? "audio", storagePath: path, sha256: "f".repeat(64), bytes: 64, pageCount: null,
    status: "active", llmPageBudget: 20, basis: "consolidated", sourceType: "Annual report", filedOn: null, sourceUrl: null,
    originalDeletedAt: over.deleted ? new Date(T0).toISOString() : null, transcriptStatus: "pending", createdAt: new Date(T0).toISOString(),
  });
  if (path) repo.files.set(path, over.bytes ?? AUDIO);
  return repo;
}

function fakeTranscriber(...answers: TranscriberResult[]) {
  const queue = [...answers];
  const transcribeFn = vi.fn<TranscriberPort["transcribe"]>(async () => queue.shift() ?? { kind: "ok", text: FIXTURE_TRANSCRIPT, seconds: FIXTURE_SECONDS });
  return { port: { name: "fixture", transcribe: transcribeFn } as TranscriberPort, transcribe: transcribeFn };
}

function ctx(repo: MemoryDocumentsRepo, transcriber: TranscriberPort | null, opts: { args?: Record<string, unknown>; usage?: MemoryUsageRepo; clock?: () => number } = {}): StepContext {
  const deps: StepDeps = {
    llm: null, ocr: null, transcriber,
    models: { text: "t", vision: "v", whisper: "w" },
    repos: { documents: machineDocuments(repo), usage: opts.usage ?? createMemoryUsageRepo(), proposals: createMemoryProposalsRepo(), research: createMemoryResearch() },
    now: () => new Date(T0),
    clock: opts.clock ?? (() => T0),
  };
  const step: Step = {
    id: "step-1", jobId: "job-1", kind: "transcribe", pageNo: 1, args: opts.args ?? {}, status: "running", schemaFailures: 0, providerFailures: 0,
    leaseExpiries: 0, notBefore: new Date(T0).toISOString(), leaseOwner: "owner", lastError: null,
  };
  return { step, documentId: DOC, deadline: T0 + 240_000, deps };
}

describe("transcribe: the happy path", () => {
  it("sends the recording, stores the text as page 1 (plain text, not OCR) and makes no capture", async () => {
    const repo = setup();
    const t = fakeTranscriber();
    const out = await transcribe(ctx(repo, t.port, { args: { seconds: 95 } }));
    expect(out).toEqual({ kind: "done", result: { chars: FIXTURE_TRANSCRIPT.length, seconds: FIXTURE_SECONDS } });
    expect(repo.pages.get(`${DOC}:1`)).toMatchObject({ pageNo: 1, text: FIXTURE_TRANSCRIPT, ocr: false, kind: null, selected: false });
    expect(repo.docs.get(DOC)).toMatchObject({ pageCount: 1, status: "active", transcriptStatus: "pending" });
    const [file, opts] = t.transcribe.mock.calls[0]!;
    expect(file.mime).toBe("audio/mp4");
    expect(file.name).toBe("voice.m4a");
    expect(file.bytes.byteLength).toBe(64);
    expect(opts?.timeoutMs).toBeGreaterThan(0);
  });

  it("names the type and file by the stored extension", async () => {
    for (const [ext, mime] of [["mp3", "audio/mpeg"], ["webm", "audio/webm"]] as const) {
      const t = fakeTranscriber();
      await transcribe(ctx(setup({ path: `${DOC}.${ext}` }), t.port));
      expect(t.transcribe.mock.calls[0]![0]).toMatchObject({ mime, name: `voice.${ext}` });
    }
  });

  it("never puts the transcript in the step result (the row is readable on the desk)", async () => {
    const out = await transcribe(ctx(setup(), fakeTranscriber().port));
    expect(JSON.stringify(out)).not.toContain("Dealers");
  });
});

describe("transcribe: the audio-seconds budget", () => {
  it("reserves the larger of the browser length and the size floor in the whisper bucket, then settles the length the provider reported", async () => {
    const usage = createMemoryUsageRepo();
    await transcribe(ctx(setup(), fakeTranscriber({ kind: "ok", text: "a", seconds: 42.2 }).port, { args: { seconds: 95 }, usage }));
    expect(usage.reservations).toEqual([{ id: "res-1", bucket: WHISPER_BUCKET, tokens: 95, settled: { used: 43, status: "used" } }]);
    expect(WHISPER_BUCKET.toLowerCase()).toContain("whisper");
  });

  it("with no browser length (Infinity from MediaRecorder, or none) it reserves the size floor, and at least 10 seconds", async () => {
    const big = new Uint8Array(600 * WHISPER_BYTES_PER_SECOND);
    for (const claimed of [Number.POSITIVE_INFINITY, undefined]) {
      const usage = createMemoryUsageRepo();
      await transcribe(ctx(setup({ bytes: big }), fakeTranscriber().port, { args: claimed === undefined ? {} : { seconds: claimed }, usage }));
      expect(usage.reservations[0]).toMatchObject({ tokens: 600 });
    }
    const small = createMemoryUsageRepo();
    await transcribe(ctx(setup(), fakeTranscriber().port, { usage: small }));
    expect(small.reservations[0]).toMatchObject({ tokens: 10 });
  });

  it("keeps the reservation when the answer carries no length", async () => {
    const usage = createMemoryUsageRepo();
    await transcribe(ctx(setup(), fakeTranscriber({ kind: "ok", text: "a", seconds: null }).port, { args: { seconds: 30 }, usage }));
    expect(usage.reservations[0]).toMatchObject({ tokens: 30, settled: { used: 30, status: "used" } });
  });

  it("asks the ledger with the hour, day, request-per-minute and per-day caps (75% of the free tier)", async () => {
    const usage = createMemoryUsageRepo();
    const spy = vi.spyOn(usage, "reserveUnits");
    await transcribe(ctx(setup(), fakeTranscriber().port, { usage }));
    expect(spy).toHaveBeenCalledWith(WHISPER_BUCKET, 10, { hour: 5_400, day: 21_600, rpm: 15, rpd: 1_500 });
  });

  it("a recording longer than the hour allowance reserves the whole hour and never raises", async () => {
    const usage = createMemoryUsageRepo();
    await transcribe(ctx(setup(), fakeTranscriber().port, { args: { seconds: 99_999 }, usage }));
    expect(usage.reservations[0]).toMatchObject({ tokens: 5_400 });
  });
});

describe("transcribe: waits and refusals are never failures", () => {
  it("defers when the ledger is full, with the ledger time and reason, and sends nothing", async () => {
    const until = new Date(T0 + 1_800_000);
    const usage = createMemoryUsageRepo();
    usage.reserveUnits = async () => ({ ok: false, notBefore: until, reason: "voice_hour" });
    const t = fakeTranscriber();
    expect(await transcribe(ctx(setup(), t.port, { usage }))).toEqual({ kind: "defer", notBefore: until, reason: "voice_hour" });
    expect(t.transcribe).not.toHaveBeenCalled();
  });

  it.each([
    [30, "groq_minute"],
    [900, "voice_hour"],
    [7_200, "voice_day"],
    [null, "groq_minute"],
  ] as const)("a provider 429 (retry after %s s) releases the seconds, blocks the bucket and defers on %s", async (retry, reason) => {
    const usage = createMemoryUsageRepo();
    const out = await transcribe(ctx(setup(), fakeTranscriber({ kind: "rate_limited", retryAfterSeconds: retry }).port, { usage }));
    const wait = (retry ?? 60) * 1000;
    expect(out).toEqual({ kind: "defer", notBefore: new Date(T0 + wait), reason });
    expect(usage.reservations[0]!.settled).toEqual({ used: 0, status: "released" });
    expect(usage.blocks).toEqual([{ bucket: WHISPER_BUCKET, kind: "rate_limited", until: new Date(T0 + wait), reason }]);
  });

  it("a provider error is a provider retry with the status only, and releases the seconds", async () => {
    const usage = createMemoryUsageRepo();
    const out = await transcribe(ctx(setup(), fakeTranscriber({ kind: "provider_error", message: "HTTP 503" }).port, { usage }));
    expect(out).toEqual({ kind: "retry", failure: "provider", error: "HTTP 503" });
    expect(usage.reservations[0]!.settled).toEqual({ used: 0, status: "released" });
  });

  it.each(["TimeoutError", "AbortError", "HTTP 413"])("%s may have been counted by Groq, so the seconds stay in the ledger (and it is still a provider retry)", async (message) => {
    const usage = createMemoryUsageRepo();
    const out = await transcribe(ctx(setup(), fakeTranscriber({ kind: "provider_error", message }).port, { args: { seconds: 40 }, usage }));
    expect(out).toEqual({ kind: "retry", failure: "provider", error: message });
    expect(usage.reservations[0]).toMatchObject({ tokens: 40, settled: { used: 40, status: "used" } });
  });

  it.each(["HTTP 500", "HTTP 401", "TypeError", "unreadable answer"])("%s did not reach the audio, so the seconds are released", async (message) => {
    const usage = createMemoryUsageRepo();
    await transcribe(ctx(setup(), fakeTranscriber({ kind: "provider_error", message }).port, { usage }));
    expect(usage.reservations[0]!.settled).toEqual({ used: 0, status: "released" });
  });

  it("a transcriber that throws releases the seconds and throws again, so the runner counts a retry", async () => {
    const usage = createMemoryUsageRepo();
    const port: TranscriberPort = { name: "fixture", transcribe: async () => { throw new Error("boom"); } };
    await expect(transcribe(ctx(setup(), port, { usage }))).rejects.toThrow("boom");
    expect(usage.reservations[0]!.settled).toEqual({ used: 0, status: "released" });
  });

  it("defers briefly, without a reservation, when too little time is left for a call", async () => {
    const usage = createMemoryUsageRepo();
    const t = fakeTranscriber();
    const out = await transcribe(ctx(setup(), t.port, { usage, clock: () => T0 + 230_000 }));
    expect(out).toEqual({ kind: "defer", notBefore: new Date(T0 + SHORT_WAIT_MS), reason: "groq_minute" });
    expect(usage.reservations).toEqual([]);
    expect(t.transcribe).not.toHaveBeenCalled();
  });
});

describe("transcribe: sentences for Aksh", () => {
  it("stops with a sentence when voice notes are off, before anything is downloaded or reserved", async () => {
    const usage = createMemoryUsageRepo();
    expect(await transcribe(ctx(setup(), null, { usage }))).toEqual({ kind: "attention", error: VOICE_OFF });
    expect(usage.reservations).toEqual([]);
  });

  it("says so when nothing could be heard, writes no page, and still counts the call the provider answered", async () => {
    const repo = setup();
    const usage = createMemoryUsageRepo();
    const out = await transcribe(ctx(repo, fakeTranscriber({ kind: "ok", text: "", seconds: 15 }).port, { usage }));
    expect(out).toEqual({ kind: "attention", error: VOICE_NOTHING_HEARD });
    expect(repo.pages.size).toBe(0);
    expect(usage.reservations[0]!.settled).toEqual({ used: 15, status: "used" });
  });

  it("refuses a file over the free 25 MB without reserving anything", async () => {
    const usage = createMemoryUsageRepo();
    const t = fakeTranscriber();
    const out = await transcribe(ctx(setup({ bytes: new Uint8Array(VOICE_MAX_BYTES + 1) }), t.port, { usage }));
    expect(out).toEqual({ kind: "attention", error: VOICE_TOO_BIG });
    expect(usage.reservations).toEqual([]);
    expect(t.transcribe).not.toHaveBeenCalled();
  });

  it.each([
    ["the original is gone", { deleted: true }],
    ["there is no stored path", { path: null }],
    ["the path is not a voice note", { path: `${DOC}.pdf` }],
    ["the document is not a voice note", { kind: "pdf" as const }],
  ])("says the voice note is no longer stored when %s", async (_why, over) => {
    const t = fakeTranscriber();
    expect(await transcribe(ctx(setup(over), t.port))).toEqual({ kind: "attention", error: VOICE_NOT_STORED });
    expect(t.transcribe).not.toHaveBeenCalled();
  });
});

describe("transcribe: idempotent", () => {
  it("a rerun after the text was written makes no second request and no second reservation", async () => {
    const repo = setup();
    await transcribe(ctx(repo, fakeTranscriber().port));
    const usage = createMemoryUsageRepo();
    const t = fakeTranscriber();
    const out = await transcribe(ctx(repo, t.port, { usage }));
    expect(out).toEqual({ kind: "done", result: { chars: FIXTURE_TRANSCRIPT.length, already: true } });
    expect(t.transcribe).not.toHaveBeenCalled();
    expect(usage.reservations).toEqual([]);
    expect(repo.pages.size).toBe(1);
  });

  it("works with the fixture transcriber the e2e suite uses", async () => {
    const repo = setup();
    await transcribe(ctx(repo, createFixtureTranscriber()));
    expect(repo.pages.get(`${DOC}:1`)?.text).toBe(FIXTURE_TRANSCRIPT);
  });
});
