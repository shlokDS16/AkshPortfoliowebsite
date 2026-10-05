import type { NextConfig } from "next";

// ADR-001 s4: cacheComponents stays off until public pages need it (pitfalls s5: with
// Supabase cookie auth it turns uncached reads outside Suspense into build errors).
// Never add a `webpack` key here: Turbopack builds fail if any webpack config exists.
const nextConfig: NextConfig = {
  cacheComponents: false,
};

export default nextConfig;
