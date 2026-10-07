import { cn } from "@/lib/utils";
import { ChevronLeft, Search } from "lucide-react";
import Link from "next/link";
import { Wordmark } from "./wordmark";

type Props = { variant: "home" | "file"; backHref?: string; backLabel?: string };

export function TopBar({ variant, backHref = "/companies", backLabel = "Files" }: Props) {
  return (
    <header className="sticky top-0 z-(--z-top-bar) h-(--top-bar-h) border-b border-rule bg-paper">
      <div className="mx-auto flex h-full max-w-page items-center gap-3 px-(--gutter)">
        {variant === "file" ? (
          <Link href={backHref} aria-label={`Back to ${backLabel}`} className="inline-flex min-h-11 items-center gap-1 text-ink no-underline desk:hidden">
            <ChevronLeft aria-hidden className="size-5" strokeWidth={1.5} />
            {backLabel}
          </Link>
        ) : null}
        <Link href="/" className={cn("no-underline", variant === "file" && "max-desk:hidden")}>
          <Wordmark />
        </Link>
        <div className="flex-1" />
        <Link href="/companies#find" aria-label="Find a file" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 text-ink no-underline">
          <Search aria-hidden className="size-5" strokeWidth={1.5} />
          <span className="max-desk:sr-only">Find a file</span>
        </Link>
      </div>
    </header>
  );
}
