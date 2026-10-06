import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full rounded-sm border border-input bg-paper px-3 py-2.5 text-body text-ink field-sizing-content placeholder:text-ink-muted disabled:opacity-45 aria-invalid:border-bad",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
