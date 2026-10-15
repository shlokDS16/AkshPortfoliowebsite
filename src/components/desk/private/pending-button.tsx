"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

type Look = Pick<ComponentProps<typeof Button>, "variant" | "size" | "className"> & { disabled?: boolean };

/** Submit button that disables itself while its form action runs, so a double tap cannot fire twice. `disabled` keeps it off for another reason. */
export function PendingButton({ children, variant, size, className, disabled = false }: { children: ReactNode } & Look) {
  const { pending } = useFormStatus();
  const off = pending || disabled;
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={off} aria-disabled={off}>
      {children}
    </Button>
  );
}
