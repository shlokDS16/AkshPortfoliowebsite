import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDocumentsRepo } from "@/test/fakes/documents-repo";
import { createMemoryInbox, type MemoryInbox } from "@/test/fakes/inbox-repo";
import { readSelected, setPageSelected, type InboxPorts } from "./inbox-ops";

// Ruling R6: the tick and "Read the ticked pages" route a commentary page to the digest through the one shared function.

const DOC = "0b9f3c1e-7a42-4c55-9e1d-2f6a8b3c4d5e";
let inbox: MemoryInbox;
let ports: InboxPorts;
let job: string;

beforeEach(async () => {
  const docs = createMemoryDocumentsRepo();
  inbox = createMemoryInbox();
  ports = { docs, inbox, queue: inbox.queue };
  await docs.insertUploading({ id: DOC, title: "AR", kind: "pdf", storagePath: `${DOC}.pdf`, sha256: "a".repeat(64), bytes: 10, companyId: null, filedOn: null, sourceUrl: null });
  await docs.update(DOC, { status: "active", llmPageBudget: 5 });
  job = await inbox.queue.createJob(DOC, "ingest_pdf", { kind: "pdf_text", pageNo: 1 });
});

const steps = () => inbox.steps.filter((s) => s.kind !== "pdf_text").map((s) => [s.kind, s.pageNo, s.status]);

describe("commentary pages and Aksh's ticks", () => {
  it("ticking a management-discussion page queues digest_page, unticking skips it and ticking again revives it", async () => {
    inbox.pages.set(`${DOC}:6`, { selected: false, selectedBy: null, kind: "mdna" });
    await setPageSelected(ports, DOC, 6, true, true);
    expect(steps()).toEqual([["digest_page", 6, "queued"]]);
    await setPageSelected(ports, DOC, 6, false, true);
    expect(steps()).toEqual([["digest_page", 6, "skipped"]]);
    await setPageSelected(ports, DOC, 6, true, true);
    expect(steps()).toEqual([["digest_page", 6, "queued"]]);
  });

  it("keep-reading queues a digest for a ticked commentary page that has none, and never a second extract_page", async () => {
    inbox.pages.set(`${DOC}:6`, { selected: true, selectedBy: "rule", kind: "mdna" });
    inbox.pages.set(`${DOC}:7`, { selected: true, selectedBy: "rule", kind: "pl" });
    await readSelected(ports, DOC, true);
    await readSelected(ports, DOC, true);
    expect(steps()).toEqual([["digest_page", 6, "queued"], ["extract_page", 7, "queued"]]);
    expect(job).toBeTruthy();
  });
});
