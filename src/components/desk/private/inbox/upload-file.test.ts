import { describe, expect, it, vi } from "vitest";
import { checkFile, uploadFile, type UploadDeps } from "./upload-file";

describe("uploadFile", () => {
  const pdf = new File(["x"], "AR.pdf", { type: "application/pdf" });
  const extras = { companyId: "c1", filedOn: "2026-06-30", sourceUrl: null };
  const deps = (over: Partial<UploadDeps> = {}): UploadDeps & { calls: string[] } => {
    const calls: string[] = [];
    const rec = <T,>(name: string, value: T) => async () => (calls.push(name), value);
    return {
      calls,
      hash: rec("hash", "b".repeat(64)),
      start: rec("start", { ok: true, documentId: "d1", path: "d1.pdf", token: "t" } as const),
      put: rec("put", { error: null }),
      finish: rec("finish", { ok: true } as const),
      kick: rec("kick", undefined),
      ...over,
    };
  };

  it("checks, signs, sends, confirms and kicks the reader, in that order, with the claim the server checks", async () => {
    const d = deps();
    const stages: string[] = [];
    const start = vi.fn(d.start);
    const put = vi.fn(d.put);
    expect(await uploadFile(pdf, extras, { ...d, start, put }, (s) => stages.push(s))).toEqual({ ok: true, documentId: "d1" });
    expect(d.calls).toEqual(["hash", "start", "put", "finish", "kick"]);
    expect(stages).toEqual(["checking", "uploading", "saving"]);
    expect(start).toHaveBeenCalledWith({ kind: "pdf", fileName: "AR.pdf", bytes: 1, mime: "application/pdf", sha256: "b".repeat(64), ...extras });
    expect(put).toHaveBeenCalledWith("d1.pdf", "t", pdf, "application/pdf");
  });

  it("a PDF with no type at all is still sent as application/pdf", async () => {
    const d = deps();
    const start = vi.fn(d.start);
    await uploadFile(new File(["x"], "AR.pdf", { type: "" }), extras, { ...d, start }, () => {});
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ kind: "pdf", mime: "application/pdf" }));
  });

  it("a photo is shrunk first, then hashed, claimed and sent as the shrunk file with its bare type", async () => {
    const photo = new File(["raw"], "table.png", { type: "image/png" });
    const shrunk = new File(["small"], "table.jpg", { type: "image/jpeg" });
    const shrink = vi.fn(async () => ({ ok: true as const, file: shrunk }));
    const hash = vi.fn(async () => "c".repeat(64));
    const start = vi.fn(async () => ({ ok: true, documentId: "d2", path: "d2.jpg", token: "t2" }) as const);
    const put = vi.fn(async () => ({ error: null }));
    const d = deps({ shrink, hash, start, put });
    expect(await uploadFile(photo, extras, d, () => {})).toEqual({ ok: true, documentId: "d2" });
    expect(shrink).toHaveBeenCalledWith(photo);
    expect(hash).toHaveBeenCalledWith(shrunk); // the hash is of the bytes that are sent
    expect(start).toHaveBeenCalledWith({ kind: "image", fileName: "table.jpg", bytes: 5, mime: "image/jpeg", sha256: "c".repeat(64), ...extras });
    expect(put).toHaveBeenCalledWith("d2.jpg", "t2", shrunk, "image/jpeg");
  });

  it("a photo that cannot be shrunk under 1 MB stops there: nothing is hashed, signed or sent", async () => {
    const d = deps({ shrink: async () => ({ ok: false, message: "This photo is still over 1 MB after shrinking; crop it to the table." }) });
    const outcome = await uploadFile(new File(["x"], "big.jpg", { type: "image/jpeg" }), extras, d, () => {});
    expect(outcome).toEqual({ ok: false, message: "This photo is still over 1 MB after shrinking; crop it to the table." });
    expect(d.calls).toEqual([]);
  });

  it("a failed send leaves the document to resume and never confirms it", async () => {
    const d = deps({ put: async () => ({ error: { message: "network" } }) });
    const outcome = await uploadFile(pdf, extras, d, () => {});
    expect(outcome).toEqual({ ok: false, message: "Upload not finished. Choose the file again to resume." });
    expect(d.calls).not.toContain("finish");
  });

  it("a kick that fails does not undo the upload", async () => {
    const d = deps({ kick: async () => Promise.reject(new Error("x")) });
    expect(await uploadFile(pdf, extras, d, () => {})).toEqual({ ok: true, documentId: "d1" });
  });
});

describe("checkFile", () => {
  it("takes a PDF and the photo types, and refuses anything else with the one sentence", () => {
    expect(checkFile({ name: "a.pdf", size: 10, type: "application/pdf" })).toBeNull();
    expect(checkFile({ name: "a.JPG", size: 10, type: "image/jpeg" })).toBeNull();
    expect(checkFile({ name: "shot.png", size: 10, type: "image/png" })).toBeNull();
    expect(checkFile({ name: "shot.webp", size: 10, type: "image/webp; codecs=x" })).toBeNull(); // parameters are stripped
    for (const f of [{ name: "a.gif", type: "image/gif" }, { name: "a.pdf", type: "image/png" }, { name: "a.txt", type: "text/plain" }, { name: "a.heic", type: "image/heic" }]) {
      expect(checkFile({ ...f, size: 10 })).toEqual({ ok: false, message: "Drop a PDF, a photo or a voice note." });
    }
  });

  it("holds a PDF to 50 MB but leaves a photo's size to the shrink", () => {
    expect(checkFile({ name: "a.pdf", size: 52_428_801, type: "application/pdf" })).toMatchObject({ ok: false });
    expect(checkFile({ name: "a.jpg", size: 30_000_000, type: "image/jpeg" })).toBeNull();
  });
});
