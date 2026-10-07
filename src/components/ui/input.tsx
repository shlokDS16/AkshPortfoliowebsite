import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

// 16 px text (no iOS zoom), 44 px tall, border --input (= --bench, 3.44:1), aria-invalid -> bad border.
function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-11 w-full rounded-sm border border-input bg-paper px-3 text-body text-ink placeholder:text-ink-muted disabled:opacity-45 aria-invalid:border-bad",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
