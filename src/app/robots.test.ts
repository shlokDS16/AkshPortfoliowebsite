import { afterEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ vercelEnv: undefined as string | undefined }));
vi.mock("@/lib/env", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/env")>()), publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://desk.example" }) }));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => ({ VERCEL_ENV: env.vercelEnv }) }));

import robots, { dynamic } from "./robots";

afterEach(() => {
  env.vercelEnv = undefined;
});

describe("robots.txt", () => {
  it("on production allows the site, keeps the private areas out and names the sitemap", () => {
    env.vercelEnv = "production";
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/", disallow: ["/desk", "/login", "/auth", "/api", "/dev"] }, sitemap: "https://desk.example/sitemap.xml" });
  });

  it("on a preview, or with no VERCEL_ENV, disallows everything", () => {
    for (const v of ["preview", undefined]) {
      env.vercelEnv = v;
      expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    }
  });

  // A build made on a preview and promoted to production must not keep the preview answer: the route is rendered per request.
  it("is rendered at request time, so it follows the running environment and not the build's", () => {
    expect(dynamic).toBe("force-dynamic");
    env.vercelEnv = "preview";
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
    env.vercelEnv = "production";
    expect(robots()).toMatchObject({ rules: { allow: "/" } });
  });
});
