"use client";

import { useEffect, useState } from "react";
import { readDigestAction, type ReadDigestResult } from "@/modules/ingestion/actions";
import { DIGEST_COULD_NOT_LOAD } from "@/modules/ingestion/client";

/** One page's machine-read digest, read through readDigestAction. `null` from the moment another page is asked for. */
export function useDigest(documentId: string, pageNo: number): ReadDigestResult | null {
  const key = `${documentId}:${pageNo}`;
  const [got, setGot] = useState<{ key: string; result: ReadDigestResult } | null>(null);
  useEffect(() => {
    let current = true;
    readDigestAction(documentId, pageNo)
      .then((result) => current && setGot({ key, result }))
      .catch(() => current && setGot({ key, result: { ok: false, message: DIGEST_COULD_NOT_LOAD } }));
    return () => {
      current = false;
    };
  }, [documentId, pageNo, key]);
  return got?.key === key ? got.result : null;
}
