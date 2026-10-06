"use client";

import { cn } from "@/lib/utils";
import { BookOpen, FolderOpen, Info, LayoutList } from "lucide-react";
import { useMotionValueEvent, useScroll } from "motion/react";
import * as m from "motion/react-m";
import Link from "next/link";
import { useState } from "react";
import { CountFlow } from "@/components/ui/count-flow";
import { EASE_SNAP, MOTION } from "@/components/ui/motion-tokens";
import type { TabCurrent } from "@/lib/view-types";

type Props = { current: TabCurrent | null; counts: { files: number; notes: number }; hideOnScroll?: boolean };

const TABS = [
  { id: "desk", label: "Desk", href: "/", Icon: LayoutList },
  { id: "files", label: "Files", href: "/companies", Icon: FolderOpen, count: "files" },
  { id: "notes", label: "Notes", href: "/notes", Icon: BookOpen, count: "notes" },
  { id: "about", label: "About", href: "/about", Icon: Info },
] as const;

/** Phone bottom bar; hides while scrolling down a file so at most three bars show (segment 2). */
export function TabBar({ current, counts, hideOnScroll = false }: Props) {
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (y) => {
    if (!hideOnScroll) return;
    const previous = scrollY.getPrevious() ?? 0;
    if (Math.abs(y - previous) < 4) return;
    setHidden(y > previous && y > 80);
  });
  return (
    <m.nav
      aria-label="Main"
      animate={{ y: hidden ? "100%" : "0%" }}
      transition={{ duration: MOTION.base, ease: EASE_SNAP }}
      className="fixed inset-x-0 bottom-0 z-(--z-tab-bar) border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] desk:hidden"
    >
      <ul className="grid h-14 grid-cols-4">
        {TABS.map((tab) => {
          const on = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-caption no-underline", on ? "font-semibold text-ink" : "text-ink-muted")}
              >
                <tab.Icon aria-hidden strokeWidth={1.5} className={cn("size-5", on ? "text-geru" : "text-ink-muted")} />
                <span>
                  {tab.label}
                  {"count" in tab ? (
                    <>
                      {" "}
                      <CountFlow value={counts[tab.count]} />
                    </>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </m.nav>
  );
}
