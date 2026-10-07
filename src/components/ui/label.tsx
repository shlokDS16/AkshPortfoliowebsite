import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

function Label({ className, ...props }: ComponentProps<"label">) {
  return <label data-slot="label" className={cn("text-small text-ink-muted desk:text-small-desk", className)} {...props} />;
}

export { Label };
