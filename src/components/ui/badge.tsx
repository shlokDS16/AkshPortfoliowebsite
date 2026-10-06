import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

const label = "border border-rule-strong px-1.5 py-0.5 text-mono-label uppercase text-ink-muted";
const badgeVariants = cva("inline-flex items-center gap-1 rounded-sm font-mono", {
  variants: {
    variant: {
      count: "px-1 text-mono-id tabular-nums text-ink-muted",
      label,
      inverse: "bg-ink px-1.5 py-0.5 text-mono-label uppercase text-paper",
      // Aliases keep Plan 1A call sites compiling; there are no colour variants.
      default: label,
      secondary: label,
      outline: label,
      destructive: label,
    },
  },
  defaultVariants: { variant: "label" },
});

function Badge({ className, variant, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
