import { notFound } from "next/navigation";
import { featureOn } from "@/lib/features";

// Phase 5d (spec s8): while the letters are off, every page under /desk/letters is a 404. Nothing under it is deleted.
export default function LettersLayout({ children }: LayoutProps<"/desk/letters">) {
  if (!featureOn("letters")) notFound();
  return children;
}
