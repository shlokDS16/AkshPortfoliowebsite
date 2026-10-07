"use client";

import * as m from "motion/react-m";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CountFlow } from "@/components/ui/count-flow";
import { EASE_SNAP, MOTION } from "@/components/ui/motion-tokens";
import { cn } from "@/lib/utils";

// D18: Capture, Inbox, Items, Names (design-dna 8.4). Inbox and Names carry a count while something waits on Aksh.
const TABS = [
  { href: "/desk", label: "Capture", match: (p: string) => p === "/desk" },
  { href: "/desk/inbox", label: "Inbox", match: (p: string) => p.startsWith("/desk/inbox") },
  { href: "/desk/items", label: "Items", match: (p: string) => p.startsWith("/desk/items") },
  { href: "/desk/names", label: "Names", match: (p: string) => p.startsWith("/desk/names") },
] as const;

export function DeskTabs({ names, inbox, variant }: { names: number; inbox: number; variant: "top" | "bottom" }) {
  const path = usePathname();
  const counts: Record<string, number> = { Inbox: inbox, Names: names };
  const bottom = variant === "bottom";
  return (
    <nav
      aria-label="Desk sections"
      className={cn(
        bottom
          ? "fixed inset-x-0 bottom-0 z-(--z-tab-bar) border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] desk:hidden"
          : "hidden desk:block",
      )}
    >
      <ul className={cn("flex", bottom ? "h-14" : "h-(--top-bar-h) gap-1")}>
        {TABS.map((tab) => {
          const on = tab.match(path);
          return (
            <li key={tab.href} className={cn("relative", bottom && "flex-1")}>
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex h-full items-center justify-center gap-1 px-3 text-small no-underline",
                  on ? "font-semibold text-ink" : "text-ink-muted",
                )}
              >
                {tab.label}
                {(counts[tab.label] ?? 0) > 0 ? (
                  <>
                    {" "}
                    <CountFlow value={counts[tab.label]} className="tabular-nums" />
                  </>
                ) : null}
              </Link>
              {on ? (
                <m.span
                  layoutId={`desk-tab-${variant}`}
                  aria-hidden
                  className={cn("absolute inset-x-2 h-0.5 bg-geru", bottom ? "top-0" : "bottom-0")}
                  transition={{ duration: MOTION.slow, ease: EASE_SNAP }}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
