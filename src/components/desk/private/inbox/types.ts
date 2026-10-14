import type { ActionResult } from "@/modules/ingestion/client";

/**
 * The inbox actions that live under src/app/desk/inbox (they import @/modules/ops/jobs, which components may not
 * reach). The page hands them down; tests hand in fakes.
 */
export type InboxActions = {
  setPageSelected: (documentId: string, pageNo: number, selected: boolean) => Promise<ActionResult>;
  readSelected: (documentId: string) => Promise<ActionResult>;
  /** After an upload: the server drains in the background and answers at once. */
  kick: () => Promise<void>;
};
