import { cn } from "@/lib/utils";

/** The loaded layout with ink removed: static surface-2 blocks, no pulse (design-dna 10.2). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded-xs bg-surface-2", className)} />;
}
