import { describe, expect, it, vi } from "vitest";
import { acceptFor, claimedMime, kindOfFile } from "./file-kinds";
import { checkFile, uploadFile, type UploadDeps } from "./upload-file";

// Voice notes in the browser's half of an upload (Plan 2b Task 4).

const note = (name = "call.m4a", type = "audio/x-m4a", size = 3_000_000) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const extras = { companyId: null, filedOn: null, sourceUrl: null };

function deps(over: Partial<UploadDeps> = {}) {
  const calls: string[] = [];
  const start = vi.fn(async () => (calls.push("start"), { ok: true, documentId: "d1", path: "d1.m4a", token: "t" } as const));
  const finish = vi.fn<UploadDeps["finish"]>(async () => (calls.push("finish"), { ok: true } as const));
  const put = vi.fn(async () => (calls.push("put"), { error: null }));
  const measure = vi.fn(async () => 95);
  const d: UploadDeps = { hash: async () => "a".repeat(64), start, put, finish, kick: async () => {}, voiceOn: true, measure, ...over };
  return { d, calls, start, finish, put, measure };
}

describe("kindOfFile for voice notes", () => {
  it.each([
    ["call.m4a", "audio/x-m4a"], ["call.m4a", "audio/mp4"], ["call.m4a", "audio/m4a"], ["memo.MP3", "audio/mpeg"], ["note.webm", "audio/webm"],
    ["note.webm", "video/webm"], ["call.m4a", ""], ["note.webm", "audio/webm;codecs=opus"],
  ])("takes %s of type %j as audio", (name, type) => {
    expect(kindOfFile({ name, type })).toBe("audio");
  });

  it.each([["call.wav", "audio/wav"], ["call.ogg", "audio/ogg"], ["clip.mp4", "video/mp4"], ["call.m4a", "application/zip"], ["notes.txt", "text/plain"]])("does not take %s of type %j", (name, type) => {
    expect(kindOfFile({ name, type })).toBeNull();
  });

  it("still takes a PDF and a photo as before", () => {
    expect(kindOfFile({ name: "a.pdf", type: "application/pdf" })).toBe("pdf");
    expect(kindOfFile({ name: "a.png", type: "image/png" })).toBe("image");
  });
});

describe("claimedMime for voice notes (always bare, always one the desk lists)", () => {
  it.each([
    ["call.m4a", "audio/x-m4a", "audio/x-m4a"],
    ["call.m4a", "audio/mp4", "audio/mp4"],
    ["call.m4a", "audio/m4a", "audio/mp4"],
    ["call.m4a", "", "audio/mp4"],
    ["memo.mp3", "audio/mpeg", "audio/mpeg"],
    ["memo.mp3", "audio/x-mpeg", "audio/mpeg"],
    ["note.webm", "video/webm", "audio/webm"],
    ["note.webm", "audio/webm;codecs=opus", "audio/webm"],
  ])("%s of type %j is claimed as %s", (name, type, claimed) => {
    expect(claimedMime("audio", { name, type })).toBe(claimed);
  });
});

describe("the file picker", () => {
  it("offers audio only while voice notes are on", () => {
    expect(acceptFor(false)).not.toMatch(/audio|m4a|mp3|webm/);
    expect(acceptFor(true)).toMatch(/audio\/mpeg/);
    expect(acceptFor(true)).toMatch(/audio\/x-m4a/);
    expect(acceptFor(true)).toContain("application/pdf");
  });
});

describe("checkFile for voice notes", () => {
  it("refuses a voice note while the switch is off, whatever its size", () => {
    expect(checkFile({ name: "a.m4a", size: 10, type: "audio/x-m4a" })).toEqual({ ok: false, message: "Voice notes are not switched on yet." });
    expect(checkFile({ name: "a.m4a", size: 10, type: "audio/x-m4a" }, false)).toMatchObject({ ok: false });
  });

  it("takes one up to 25 MB and refuses one over it, with the voice sentence", () => {
    expect(checkFile({ name: "a.m4a", size: 25_000_000, type: "audio/x-m4a" }, true)).toBeNull();
    expect(checkFile({ name: "a.m4a", size: 25_000_001, type: "audio/x-m4a" }, true)).toEqual({ ok: false, message: "This voice note is over 25 MB. Record a shorter one." });
  });
});

describe("uploadFile for a voice note", () => {
  it("measures it, claims kind audio with a bare type and the length, sends it, and passes the length to finish", async () => {
    const t = deps();
    const f = note();
    expect(await uploadFile(f, extras, t.d, () => {})).toEqual({ ok: true, documentId: "d1" });
    expect(t.measure).toHaveBeenCalledWith(f);
    expect(t.start).toHaveBeenCalledWith({ kind: "audio", fileName: "call.m4a", bytes: 3_000_000, mime: "audio/x-m4a", sha256: "a".repeat(64), ...extras, seconds: 95 });
    expect(t.put).toHaveBeenCalledWith("d1.m4a", "t", f, "audio/x-m4a");
    expect(t.finish).toHaveBeenCalledWith("d1", 95);
  });

  it("when the browser cannot tell the length it still uploads, with seconds null", async () => {
    const t = deps({ measure: async () => null });
    await uploadFile(note(), extras, t.d, () => {});
    expect(t.start).toHaveBeenCalledWith(expect.objectContaining({ seconds: null }));
    expect(t.finish).toHaveBeenCalledWith("d1", null);
    const thrown = deps({ measure: async () => Promise.reject(new Error("no audio")) });
    expect((await uploadFile(note(), extras, thrown.d, () => {})).ok).toBe(true);
  });

  it("stops a recording longer than the hour allowance before it is hashed or sent", async () => {
    const t = deps({ measure: async () => 5_401 });
    const out = await uploadFile(note(), extras, t.d, () => {});
    expect(out).toEqual({ ok: false, message: "This voice note is longer than 90 minutes. Record a shorter one." });
    expect(t.calls).toEqual([]);
  });

  it("is refused with the switch off and measures nothing", async () => {
    const t = deps({ voiceOn: false });
    const out = await uploadFile(note(), extras, t.d, () => {});
    expect(out).toEqual({ ok: false, message: "Voice notes are not switched on yet." });
    expect(t.measure).not.toHaveBeenCalled();
    expect(t.calls).toEqual([]);
  });

  it("a PDF is not measured and finish gets no length", async () => {
    const t = deps();
    const pdf = new File(["x"], "AR.pdf", { type: "application/pdf" });
    await uploadFile(pdf, extras, t.d, () => {});
    expect(t.measure).not.toHaveBeenCalled();
    expect(t.start).toHaveBeenCalledWith(expect.not.objectContaining({ seconds: expect.anything() }));
    expect(t.finish).toHaveBeenCalledWith("d1");
  });
});
