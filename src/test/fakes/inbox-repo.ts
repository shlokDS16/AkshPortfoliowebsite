import type { PageKind } from "@/modules/documents/client";
import type { InboxRepo } from "@/modules/ingestion/inbox-repo";
import { PAGE_STEP_KINDS } from "@/modules/ingestion/page-steps";
import type { QueueRepo } from "@/modules/ingestion/queue-repo";
import type { StepKind, StepStatus } from "@/modules/ingestion/types";

export type FakeStep = { jobId: string; kind: StepKind; pageNo: number | null; status: StepStatus; failures: number; lastError: string | null };

export type MemoryInbox = InboxRepo & {
  /** document_pages: key `${documentId}:${pageNo}`. */
  pages: Map<string, { selected: boolean; selectedBy: "rule" | "aksh" | null; isScan?: boolean; kind?: PageKind | null }>;
  jobs: Map<string, { documentId: string; cancelled: boolean }>;
  steps: FakeStep[];
  queue: QueueRepo;
};

/** The inbox's repo and the queue over one in-memory job table, so a test sees what the actions did to both. */
export function createMemoryInbox(): MemoryInbox {
  const pages: MemoryInbox["pages"] = new Map();
  const jobs: MemoryInbox["jobs"] = new Map();
  const steps: FakeStep[] = [];
  const key = (documentId: string, pageNo: number) => `${documentId}:${pageNo}`;
  const find = (jobId: string, kind: StepKind, pageNo: number | null) => steps.find((s) => s.jobId === jobId && s.kind === kind && s.pageNo === pageNo);
  const live = (documentId: string) => [...jobs].find(([, j]) => j.documentId === documentId && !j.cancelled)?.[0] ?? null;

  const queue: QueueRepo = {
    async claim() {
      return null;
    },
    async finish() {
      return true;
    },
    async enqueue(jobId, news) {
      for (const n of news) if (!find(jobId, n.kind, n.pageNo)) steps.push({ jobId, kind: n.kind, pageNo: n.pageNo, status: "queued", failures: 0, lastError: null });
    },
    async createJob(documentId, first) {
      const id = live(documentId) ?? `job-${jobs.size + 1}`;
      jobs.set(id, { documentId, cancelled: false });
      await queue.enqueue(id, [first]);
      return id;
    },
  };

  return {
    pages,
    jobs,
    steps,
    queue,
    async page(documentId, pageNo) {
      const p = pages.get(key(documentId, pageNo));
      return p ? { selected: p.selected, isScan: p.isScan ?? false, kind: p.kind ?? null } : null;
    },
    async selectedPageInfo(documentId) {
      return [...pages]
        .flatMap(([k, p]) => (k.startsWith(`${documentId}:`) && p.selected ? [{ pageNo: Number(k.split(":")[1]), isScan: p.isScan ?? false, kind: p.kind ?? null }] : []))
        .sort((a, b) => a.pageNo - b.pageNo);
    },
    async selectedPages(documentId) {
      return [...pages]
        .flatMap(([k, p]) => (k.startsWith(`${documentId}:`) && p.selected ? [Number(k.split(":")[1])] : []))
        .sort((a, b) => a - b);
    },
    async setPageSelected(documentId, pageNo, selected) {
      pages.set(key(documentId, pageNo), { ...pages.get(key(documentId, pageNo)), selected, selectedBy: "aksh" });
    },
    liveJob: async (documentId) => live(documentId),
    async cancelJob(documentId) {
      for (const j of jobs.values()) if (j.documentId === documentId) j.cancelled = true;
    },
    async pageSteps(jobId) {
      return steps.flatMap((s) => (s.jobId === jobId && PAGE_STEP_KINDS.includes(s.kind) && s.pageNo !== null ? [{ pageNo: s.pageNo, kind: s.kind }] : []));
    },
    async reviveStep(jobId, pageNo, kind) {
      const s = find(jobId, kind, pageNo);
      if (s?.status === "skipped") s.status = "queued";
    },
    async skipQueuedStep(jobId, pageNo) {
      for (const s of steps) if (s.jobId === jobId && s.pageNo === pageNo && PAGE_STEP_KINDS.includes(s.kind) && s.status === "queued") s.status = "skipped";
    },
    async retryAttention(jobId) {
      for (const s of steps) if (s.jobId === jobId && s.status === "needs_attention") Object.assign(s, { status: "queued", failures: 0, lastError: null });
    },
    async skipAttention(jobId) {
      for (const s of steps) if (s.jobId === jobId && s.status === "needs_attention") s.status = "skipped";
    },
  };
}
