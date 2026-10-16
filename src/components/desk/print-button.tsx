"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Spec s5 (D69): the PDF is the browser's own print, with the print stylesheet. No route, no server work. Hidden in print. */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer aria-hidden strokeWidth={1.5} />
      Save as PDF
    </Button>
  );
}
