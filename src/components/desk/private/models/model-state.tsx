"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { retryStepAction } from "@/modules/ingestion/actions";
import { KeepReading } from "../inbox/keep-reading";
import { useInboxAction } from "../inbox/use-inbox-action";
import { READING_NOTE, UPLOAD_FIXED } from "./copy";

// The model page when there is no model to show yet (spec s8): being read (the tab keeps the reader going and refreshes), stuck (a read
// that stopped: its sentence and Try again, which queues a new pass of the read; never an endless spinner), or refused (the exact
// sentence with the Excel fix, and a fixed upload).

const LINK = "inline-flex min-h-11 items-center rounded-sm px-3 text-body font-medium no-underline";

function Attention({ message, children }: { message: string; children: ReactNode }) {
  return (
    <section aria-label="Needs attention" className="space-y-3 rounded-sm border border-l-4 border-rule border-l-bad bg-paper p-4">
      <p className="inline-flex items-center gap-1.5 font-mono text-mono-label uppercase text-bad">
        <TriangleAlert aria-hidden strokeWidth={1.5} className="size-4" />
        Needs attention
      </p>
      <p className="text-body text-ink-body">{message}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </section>
  );
}

const Upload = () => (
  <Link href="/desk/inbox#add-file" className={`${LINK} border border-rule-strong bg-paper text-ink`}>
    {UPLOAD_FIXED}
  </Link>
);

export function RefusedState({ message }: { message: string }) {
  return (
    <Attention message={message}>
      <Upload />
    </Attention>
  );
}

export function StuckState({ documentId, message }: { documentId: string; message: string }) {
  const router = useRouter();
  const { pending, error, run } = useInboxAction();
  return (
    <Attention message={message}>
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          void run(async () => {
            const result = await retryStepAction(documentId);
            if (result.ok) router.refresh();
            return result;
          })
        }
      >
        Try again
      </Button>
      <Upload />
      {error ? (
        <p role="alert" className="w-full text-small text-bad">
          {error}
        </p>
      ) : null}
    </Attention>
  );
}

export function ReadingState() {
  return (
    <section aria-label="Being read" className="space-y-2 rounded-sm border border-l-4 border-rule border-l-ink-muted bg-paper p-4">
      <p role="status" className="text-body text-ink-body">
        {READING_NOTE}
      </p>
      <KeepReading active />
    </section>
  );
}
