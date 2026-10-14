"use client";

import { useEffect, useState } from "react";
import { readPageAction, type ReadPageResult } from "@/modules/documents/actions";

/** One page of a document, read through readPageAction. `result` is null from the moment another page is asked for. */
export function usePage(documentId: string, pageNo: number): ReadPageResult | null {
  const key = `${documentId}:${pageNo}`;
  const [got, setGot] = useState<{ key: string; result: ReadPageResult } | null>(null);
  useEffect(() => {
    let current = true;
    readPageAction(documentId, pageNo)
      .then((result) => current && setGot({ key, result }))
      .catch(() => current && setGot({ key, result: { ok: false, message: "The page could not be read. Try again." } }));
    return () => {
      current = false;
    };
  }, [documentId, pageNo, key]);
  return got?.key === key ? got.result : null;
}
