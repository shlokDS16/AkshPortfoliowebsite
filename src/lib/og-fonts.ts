import { readFile } from "node:fs/promises";
import { join } from "node:path";

// next/og reads ttf/otf/woff only; these .woff subsets come from scripts/fonts/build-fonts.sh (Task 1).
const dir = join(process.cwd(), "assets", "og");

export async function loadOgFonts() {
  const [regular, semibold, mono] = await Promise.all(
    ["plex-sans-400.woff", "plex-sans-600.woff", "plex-mono-500.woff"].map((f) => readFile(join(dir, f))),
  );
  return [
    { name: "Plex Sans", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Plex Sans", data: semibold, weight: 600 as const, style: "normal" as const },
    { name: "Plex Mono", data: mono, weight: 500 as const, style: "normal" as const },
  ];
}
