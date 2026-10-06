import type { Metadata, Viewport } from "next";
import { MotionRoot } from "@/components/ui/motion-root";
import { PAPER } from "@/lib/theme-colors";
import { plexMono, plexSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Case files · Aksh Agrawal", template: "%s · Aksh Agrawal" },
  description:
    "Each file says what Aksh expected, what would prove him wrong, and every revision since. For learning, not advice.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PAPER.light },
    { media: "(prefers-color-scheme: dark)", color: PAPER.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-(--z-skip) rounded-sm bg-ink px-3 py-2 text-paper focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
