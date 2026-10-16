import { notFound } from "next/navigation";
import { featureOn } from "@/lib/features";

// Phase 5d (spec s8): while the own-channel videos are off, every page under /desk/videos is a 404. Nothing under it is deleted.
export default function VideosLayout({ children }: LayoutProps<"/desk/videos">) {
  if (!featureOn("ownVideos")) notFound();
  return children;
}
