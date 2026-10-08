import { vi } from "vitest";
import type { InboxActions } from "@/components/desk/private/inbox/types";
import type { InboxDoc, TrayView } from "@/modules/ingestion/client";

export const OK = { ok: true } as const;
export const MB = 1_048_576;

export function actionsMock(): InboxActions {
  return {
    setPageSelected: vi.fn(async () => OK),
    readSelected: vi.fn(async () => OK),
    kick: vi.fn(async () => {}),
  };
}

export const view = (tray: TrayView["tray"], message: string, over: Partial<TrayView> = {}): TrayView => ({
  tray, message, attentionPages: [], extractDone: 0, extractTotal: 0, ...over,
});
export const page = (pageNo: number, over: Partial<InboxDoc["pages"][number]> = {}): InboxDoc["pages"][number] => ({
  pageNo, kind: null, basis: null, firstLine: "", selected: false, by: null, ...over,
});
let n = 0;
export function doc(over: Partial<InboxDoc> & { view: TrayView }): InboxDoc {
  n += 1;
  return {
    id: `0000000${n}-0000-4000-8000-000000000000`, title: `Report ${n}`, company: null, createdAt: "2026-10-03T06:00:00Z", status: "active",
    pageCount: 312, budget: 20, pending: 0, flagged: 0, decided: 0, pages: [], ...over,
  };
}
