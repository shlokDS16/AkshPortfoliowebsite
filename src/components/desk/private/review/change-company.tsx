"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CompanyChooser } from "./company-chooser";

type Props = { documentId: string; companyId: string; companyName: string; companies: { id: string; symbol: string }[] };

/** A wrongly linked document can be moved while none of its figures is filed or staged; after that the server refuses, in words. */
export function ChangeCompany({ documentId, companyId, companyName, companies }: Props) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Change company
      </Button>
    );
  }
  return <CompanyChooser documentId={documentId} companies={companies.filter((c) => c.id !== companyId)} current={companyName} onDone={() => setOpen(false)} />;
}
