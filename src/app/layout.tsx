import type { Metadata, Viewport } from "next";
import { MotionRoot } from "@/components/ui/motion-root";
import { publicEnv } from "@/lib/env";
import { PAPER } from "@/lib/theme-colors";
import { SITE_DESCRIPTION } from "@/modules/showcase";
import { plexMono, plexSans } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv().NEXT_PUBLIC_SITE_URL),
  title: { default: "Case files · Aksh Agrawal", template: "%s · Aksh Agrawal" },
  description: SITE_DESCRIPTION,
  // A page that sets its own `alternates` replaces this one, so every page repeats the feed link (pageMetadata does).
  alternates: { types: { "application/rss+xml": "/feed.xml" } },
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
