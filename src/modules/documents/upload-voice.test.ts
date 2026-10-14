import { describe, expect, it } from "vitest";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { DocumentError } from "./errors";
import { audioMimeOfPath, mimesOfStoragePath, storageExtension } from "./kinds";
import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } from "./limits";
import type { StartUploadInput } from "./types";
import { finishUpload, startUpload } from "./upload";

// Voice notes (Plan 2b Task 4): refused while VOICE_NOTES is off, bare types only, the Whisper file limit, one recording
// no longer than the hour allowance, and an .m4a that is stored under either of its two names.

const ID = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
const newId = () => ID;
const input = (over: Partial<StartUploadInput> = {}): StartUploadInput => ({
  kind: "audio", fileName: "Kaveri call.m4a", bytes: 2_000_000, mime: "audio/x-m4a", sha256: "b".repeat(64), companyId: null, filedOn: null, sourceUrl: null, seconds: 95, ...over,
});
const code = async (promise: Promise<unknown>) => ((await promise.then(() => null, (e: unknown) => e)) as DocumentError | null)?.code;

describe("startUpload for a voice note", () => {
  it("is refused with voice-off while the switch is off, and nothing is stored", async () => {
    const repo = createMemoryDocumentsRepo();
    expect(await code(startUpload(repo, input(), newId))).toBe("voice-off");
    expect(await code(startUpload(repo, input(), newId, { voiceOn: false }))).toBe("voice-off");
    expect(repo.docs.size).toBe(0);
  });

  it.each([
    ["audio/x-m4a", "Kaveri call.m4a", "m4a"],
    ["audio/mp4", "Kaveri call.m4a", "m4a"],
    ["audio/mpeg", "memo.MP3", "mp3"],
    ["audio/webm", "note.webm", "webm"],
  ])("takes %s as %s and records the transcript as waiting for Aksh", async (mime, fileName, ext) => {
    const repo = createMemoryDocumentsRepo();
    const result = await startUpload(repo, input({ mime, fileName }), newId, { voiceOn: true });
    expect(result.path).toBe(`${ID}.${ext}`);
    expect(repo.docs.get(ID)).toMatchObject({ kind: "audio", storagePath: `${ID}.${ext}`, transcriptStatus: "pending", status: "uploading" });
  });

  it("titles the note from its file name", async () => {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input(), newId, { voiceOn: true });
    expect(repo.docs.get(ID)?.title).toBe("Kaveri call");
  });

  it.each(["audio/x-m4a;codecs=mp4a.40.2", "Audio/MP4", "audio/wav", "audio/ogg", "application/pdf"])("refuses the type %j (bare, listed types only)", async (mime) => {
    expect(await code(startUpload(createMemoryDocumentsRepo(), input({ mime }), newId, { voiceOn: true }))).toBe("upload-unsupported");
  });

  it("refuses a file name that is not a voice note", async () => {
    expect(await code(startUpload(createMemoryDocumentsRepo(), input({ fileName: "notes.txt" }), newId, { voiceOn: true }))).toBe("upload-unsupported");
  });

  it("refuses a file over the Whisper free limit (25 MB) with its own sentence, and takes one at the limit", async () => {
    expect(await code(startUpload(createMemoryDocumentsRepo(), input({ bytes: VOICE_MAX_BYTES + 1 }), newId, { voiceOn: true }))).toBe("voice-too-large");
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, input({ bytes: VOICE_MAX_BYTES }), newId, { voiceOn: true });
    expect(repo.docs.size).toBe(1);
  });

  it("refuses a recording longer than the hour allowance, and takes one exactly at it or of unknown length", async () => {
    expect(await code(startUpload(createMemoryDocumentsRepo(), input({ seconds: VOICE_MAX_SECONDS + 1 }), newId, { voiceOn: true }))).toBe("voice-too-long");
    await startUpload(createMemoryDocumentsRepo(), input({ seconds: VOICE_MAX_SECONDS }), newId, { voiceOn: true });
    await startUpload(createMemoryDocumentsRepo(), input({ seconds: null }), newId, { voiceOn: true });
    await startUpload(createMemoryDocumentsRepo(), input({ seconds: undefined }), newId, { voiceOn: true });
  });

  it("does not let a PDF or a photo carry a transcript status", async () => {
    const repo = createMemoryDocumentsRepo();
    await startUpload(repo, { ...input(), kind: "pdf", fileName: "a.pdf", mime: "application/pdf", bytes: 1000 }, newId);
    expect(repo.docs.get(ID)?.transcriptStatus).toBeNull();
  });
});

describe("finishUpload for a voice note", () => {
  async function started(mime: string, fileName: string) {
    const repo = createMemoryDocumentsRepo();
    const { path } = await startUpload(repo, input({ mime, fileName }), newId, { voiceOn: true });
    return { repo, path };
  }

  it.each(["audio/x-m4a", "audio/mp4"])("accepts an .m4a stored as %s", async (stored) => {
    const { repo, path } = await started("audio/x-m4a", "a.m4a");
    repo.objects.set(path, { size: 2_000_000, mimetype: stored });
    expect((await finishUpload(repo, ID)).status).toBe("active");
  });

  it("refuses an .m4a whose stored type is another audio type, and clears it", async () => {
    const { repo, path } = await started("audio/x-m4a", "a.m4a");
    repo.objects.set(path, { size: 2_000_000, mimetype: "audio/mpeg" });
    await expect(finishUpload(repo, ID)).rejects.toMatchObject({ code: "upload-missing" });
    expect(repo.removed).toContain(path);
  });
});

describe("audio paths", () => {
  it("names the types by extension", () => {
    expect(mimesOfStoragePath(`${ID}.m4a`)).toEqual(["audio/mp4", "audio/x-m4a"]);
    expect(mimesOfStoragePath(`${ID}.mp3`)).toEqual(["audio/mpeg"]);
    expect(mimesOfStoragePath(`${ID}.webm`)).toEqual(["audio/webm"]);
    expect(mimesOfStoragePath(`${ID}.pdf`)).toEqual(["application/pdf"]);
    expect(mimesOfStoragePath(`${ID}.jpg`)).toEqual(["image/jpeg"]);
    expect(mimesOfStoragePath(`${ID}.txt`)).toEqual(["text/plain"]); // a pasted text or a fetched page (Task 5)
    expect(mimesOfStoragePath(`${ID}.exe`)).toEqual([]);
  });

  it("tells the transcriber an .m4a is audio/mp4 and refuses a path that is not a voice note's", () => {
    expect(audioMimeOfPath(`${ID}.m4a`)).toBe("audio/mp4");
    expect(audioMimeOfPath(`${ID}.mp3`)).toBe("audio/mpeg");
    expect(audioMimeOfPath(`${ID}.pdf`)).toBeNull();
    expect(storageExtension("audio", "audio/x-m4a")).toBe("m4a");
  });
});
