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
  // Plan 2.7 Task 1: IronCalc's Node engine is a native addon (.node); it is required at run time, not bundled (src/modules/valuation/engine-node.ts).
  // Its formula tokenizer reads the wasm file from node_modules at run time (tokens.ts), which the file tracer cannot see, so every route that can run
  // the job drain (the cron, the job runner, the desk's after() drain) is told to carry it. Option names checked in node_modules/next/dist/docs
  // (serverExternalPackages.md, output.md); both are top-level keys in Next 16.3.
  serverExternalPackages: ["@ironcalc/nodejs"],
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@ironcalc/wasm/wasm_bg.wasm"],
    "/desk/**": ["./node_modules/@ironcalc/wasm/wasm_bg.wasm"],
  },
  pageExtensions: process.env.NODE_ENV === "production" ? ["tsx", "ts"] : ["dev.tsx", "tsx", "ts"],
};

export default nextConfig;
