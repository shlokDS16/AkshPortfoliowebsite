import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

type Cell = { numeric?: boolean };

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full border-collapse text-data desk:text-data-desk", className)} {...props} />;
}

export function THead(props: ComponentProps<"thead">) {
  return <thead {...props} />;
}

export function TH({ numeric, className, scope = "col", ...props }: ComponentProps<"th"> & Cell) {
  return (
    <th
      scope={scope}
      className={cn("border-b border-rule-strong px-(--cell-x) py-2 align-bottom text-label uppercase text-ink-muted", numeric ? "text-right" : "text-left", className)}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-rule", className)} {...props} />;
}

export function TD({ numeric, className, ...props }: ComponentProps<"td"> & Cell) {
  return <td className={cn("px-(--cell-x) py-(--row-y) align-baseline", numeric ? "text-right tabular-nums" : "text-left", className)} {...props} />;
}
