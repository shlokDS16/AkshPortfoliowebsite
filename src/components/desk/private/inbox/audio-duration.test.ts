import { describe, expect, it, vi } from "vitest";
import { measureAudioSeconds, type AudioEnv } from "./audio-duration";

// A stand-in for an <audio> element: tests fire its events by hand.
function fakeMedia() {
  const handlers = new Map<string, Set<() => void>>();
  const media = {
    duration: Number.NaN,
    currentTime: 0,
    preload: "",
    src: "",
    addEventListener: (name: string, fn: () => void) => void (handlers.get(name) ?? handlers.set(name, new Set()).get(name)!).add(fn),
    removeEventListener: (name: string, fn: () => void) => void handlers.get(name)?.delete(fn),
    removeAttribute: vi.fn(),
    load: vi.fn(),
  };
  const fire = (name: string) => [...(handlers.get(name) ?? [])].forEach((fn) => fn());
  return { media, fire, listeners: () => [...handlers.values()].reduce((n, s) => n + s.size, 0) };
}

function env(media: ReturnType<typeof fakeMedia>["media"]) {
  const timers: { fn: () => void; ms: number }[] = [];
  const revoked: string[] = [];
  const e: AudioEnv = {
    create: () => media as unknown as ReturnType<AudioEnv["create"]>,
    url: { create: () => "blob:fake", revoke: (u) => void revoked.push(u) },
    setTimeout: ((fn: () => void, ms: number) => (timers.push({ fn, ms }), timers.length)) as unknown as typeof setTimeout,
    clearTimeout: (() => {}) as unknown as typeof clearTimeout,
  };
  return { e, timers, revoked };
}

describe("measureAudioSeconds", () => {
  it("returns the duration the browser reports once the metadata is loaded, rounded up", async () => {
    const f = fakeMedia();
    const { e, revoked } = env(f.media);
    const pending = measureAudioSeconds(new Blob(["x"]), e);
    expect(f.media.preload).toBe("metadata");
    expect(f.media.src).toBe("blob:fake");
    f.media.duration = 95.2;
    f.fire("loadedmetadata");
    expect(await pending).toBe(96);
    expect(revoked).toEqual(["blob:fake"]);
    expect(f.listeners()).toBe(0);
  });

  it("when the browser says Infinity (a webm from MediaRecorder) it seeks far past the end and reads the length that follows", async () => {
    const f = fakeMedia();
    const { e } = env(f.media);
    const pending = measureAudioSeconds(new Blob(["x"]), e);
    f.media.duration = Number.POSITIVE_INFINITY;
    f.fire("loadedmetadata");
    expect(f.media.currentTime).toBeGreaterThan(1e10);
    f.media.duration = 12;
    f.fire("durationchange");
    expect(await pending).toBe(12);
  });

  it("is null when the recording cannot be opened", async () => {
    const f = fakeMedia();
    const { e, revoked } = env(f.media);
    const pending = measureAudioSeconds(new Blob(["x"]), e);
    f.fire("error");
    expect(await pending).toBeNull();
    expect(revoked).toEqual(["blob:fake"]);
  });

  it("is null when the length never settles in time, and a late event changes nothing", async () => {
    const f = fakeMedia();
    const { e, timers } = env(f.media);
    const pending = measureAudioSeconds(new Blob(["x"]), e, 1_500);
    expect(timers[0]?.ms).toBe(1_500);
    f.media.duration = Number.POSITIVE_INFINITY;
    f.fire("loadedmetadata");
    timers[0]!.fn();
    expect(await pending).toBeNull();
    f.media.duration = 40;
    f.fire("durationchange");
  });

  it("a zero length is not a length", async () => {
    const f = fakeMedia();
    const { e, timers } = env(f.media);
    const pending = measureAudioSeconds(new Blob(["x"]), e);
    f.media.duration = 0;
    f.fire("loadedmetadata");
    timers[0]!.fn();
    expect(await pending).toBeNull();
  });
});
