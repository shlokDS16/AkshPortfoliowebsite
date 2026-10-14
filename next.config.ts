import type { NextConfig } from "next";

// ADR-001 s4: cacheComponents stays off until public pages need it (pitfalls s5: with
// Supabase cookie auth it turns uncached reads outside Suspense into build errors).
// Never add a `webpack` key here: Turbopack builds fail if any webpack config exists.
const nextConfig: NextConfig = {
  cacheComponents: false,
  // Plan 1B D23: `page.dev.tsx` routes (the /dev/preview gallery) exist only outside production builds.
  // Upload review M-2: the proxy matcher covers /desk, so Next clones and buffers every /desk request body in memory (default 10 MB) before
  // the route handler's own owner check runs. Documented option (node_modules/next/dist/docs/.../proxyClientMaxBodySize.md, experimental):
  // buffer at most 3 MB. The largest legitimate /desk body is the official-file upload, capped at 2.5 MB by the route itself; server actions
  // are capped at 1 MB by Next, and documents go straight to Storage. A longer body is cut at 3 MB, which the route's own cap refuses anyway.
  experimental: { proxyClientMaxBodySize: "3mb" },
  pageExtensions: process.env.NODE_ENV === "production" ? ["tsx", "ts"] : ["dev.tsx", "tsx", "ts"],
};

export default nextConfig;
