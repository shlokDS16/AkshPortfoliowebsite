import { describe, expect, it, vi } from "vitest";
import { uploadPdf, type UploadDeps } from "./upload-file";

describe("uploadPdf", () => {
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
    expect(await uploadPdf(pdf, extras, { ...d, start }, (s) => stages.push(s))).toEqual({ ok: true, documentId: "d1" });
    expect(d.calls).toEqual(["hash", "start", "put", "finish", "kick"]);
    expect(stages).toEqual(["checking", "uploading", "saving"]);
    expect(start).toHaveBeenCalledWith({ fileName: "AR.pdf", bytes: 1, mime: "application/pdf", sha256: "b".repeat(64), ...extras });
  });

  it("a failed send leaves the document to resume and never confirms it", async () => {
    const d = deps({ put: async () => ({ error: { message: "network" } }) });
    const outcome = await uploadPdf(pdf, extras, d, () => {});
    expect(outcome).toEqual({ ok: false, message: "Upload not finished. Choose the file again to resume." });
    expect(d.calls).not.toContain("finish");
  });

  it("a kick that fails does not undo the upload", async () => {
    const d = deps({ kick: async () => Promise.reject(new Error("x")) });
    expect(await uploadPdf(pdf, extras, d, () => {})).toEqual({ ok: true, documentId: "d1" });
  });
});
