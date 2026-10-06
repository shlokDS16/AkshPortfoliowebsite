"use client";

import { useEffect, useRef, useState } from "react";
import { Toast } from "@/components/ui/toast";
import { captureReceipt, receiptLabel } from "@/modules/capture/client";
import type { KnownTokenLists } from "@/modules/catalog";
import { CaptureField, useKnown, useTokenInsert } from "./capture-field";
import { CaptureReceipt } from "./capture-receipt";
import { CaptureStatus } from "./capture-status";
import { GrammarKeyRow } from "./grammar-key-row";
import { NeedsAttention } from "./needs-attention";
import { useCaptureSave } from "./use-capture-save";

/** The inline capture on /desk, autofocused at every width (spec s5, D30). The queue lifecycle lives in CaptureDock. */
export function CaptureBar({ known }: { known: KnownTokenLists }) {
  const sets = useKnown(known);
  const field = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const { toast, save } = useCaptureSave();
  const insert = useTokenInsert(field, value, setValue);
  const receipt = captureReceipt(value, sets);
  useEffect(() => field.current?.focus(), []);
  async function submit() {
    const raw = value;
    if (raw.trim() === "") return;
    setValue(""); // already safe: save() queues on the device before any network call
    try {
      await save(raw, receiptLabel(receipt));
    } finally {
      field.current?.focus();
    }
  }
  return (
    <section aria-label="Capture a thought" className="space-y-2 rounded-sm border border-rule bg-surface p-3">
      <CaptureField
        ref={field}
        id="capture-bar"
        value={value}
        onChange={setValue}
        onSubmit={submit}
        known={sets}
        placeholder="What did you just notice?   $company  #theme  t:  l:  p:"
      />
      <CaptureReceipt model={receipt} />
      <CaptureStatus dirty={value !== ""} />
      <div className="desk:hidden">
        <GrammarKeyRow onInsert={insert} />
      </div>
      <NeedsAttention />
      <Toast message={toast} />
    </section>
  );
}
