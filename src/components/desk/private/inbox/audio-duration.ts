// How long a recording is, as the browser hears it (HTMLMediaElement.duration). The server only uses the answer to size the
// budget it holds back for the transcription and to refuse a recording that cannot fit the hour; it settles on the length
// Groq reports. A webm from MediaRecorder reports Infinity until it is played to the end, so the usual trick is used: ask for
// a time far beyond the end, and the browser then learns the real duration. Anything that does not settle in time is null.

const WAIT_MS = 4_000;
const FAR = 1e101;

type Media = Pick<HTMLAudioElement, "duration" | "currentTime" | "preload" | "src" | "addEventListener" | "removeEventListener" | "removeAttribute" | "load">;
export type AudioEnv = { create: () => Media; url: { create: (b: Blob) => string; revoke: (u: string) => void }; setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout };

const browser = (): AudioEnv => ({
  create: () => new Audio(),
  url: { create: (b) => URL.createObjectURL(b), revoke: (u) => URL.revokeObjectURL(u) },
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
});

const real = (n: number) => Number.isFinite(n) && n > 0;

export function measureAudioSeconds(file: Blob, env: AudioEnv = browser(), waitMs: number = WAIT_MS): Promise<number | null> {
  return new Promise((resolve) => {
    const media = env.create();
    const url = env.url.create(file);
    let finished = false;
    const timer = env.setTimeout(() => done(null), waitMs);
    function done(seconds: number | null) {
      if (finished) return;
      finished = true;
      env.clearTimeout(timer);
      media.removeEventListener("loadedmetadata", onMeta);
      media.removeEventListener("durationchange", onChange);
      media.removeEventListener("error", onError);
      media.removeAttribute("src");
      media.load();
      env.url.revoke(url);
      resolve(seconds === null ? null : Math.ceil(seconds));
    }
    function check() {
      if (real(media.duration)) return done(media.duration);
      // Infinity (or NaN): seeking far past the end makes the browser work out the real length and fire durationchange.
      if (media.duration === Number.POSITIVE_INFINITY && media.currentTime === 0) media.currentTime = FAR;
    }
    function onMeta() {
      check();
    }
    function onChange() {
      if (real(media.duration)) done(media.duration);
    }
    function onError() {
      done(null);
    }
    media.addEventListener("loadedmetadata", onMeta);
    media.addEventListener("durationchange", onChange);
    media.addEventListener("error", onError);
    media.preload = "metadata";
    media.src = url;
  });
}
