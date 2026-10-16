import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  { key: "list", href: "/desk/letters", label: "All letters" },
  { key: "new", href: "/desk/letters/new", label: "What changed" },
  { key: "readers", href: "/desk/letters/readers", label: "Readers" },
] as const;

/** The three places in the letters section. No sixth tab (the Items tab stays current here, as for videos): these links lead between them. */
export function LettersNav({ current }: { current: "list" | "new" | "readers" | "letter" }) {
  return (
    <nav aria-label="Letters" className="flex flex-wrap gap-x-5 text-small">
      {LINKS.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          aria-current={current === l.key ? "page" : undefined}
          className={cn("inline-flex min-h-11 items-center underline decoration-1 underline-offset-3", current === l.key && "font-semibold")}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
