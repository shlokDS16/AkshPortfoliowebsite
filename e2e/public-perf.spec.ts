import { expect, test } from "@playwright/test";

type Entry = PerformanceEntry & { element?: Element | null; hadRecentInput?: boolean; value?: number };

for (const path of ["/", "/companies/kavpump"]) {
  test(`${path}: LCP under 2.0 s on throttled 4G, from static text that never animates; CLS about 0`, async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "public-375", "one throttled phone run is enough");
    await request.get(path); // warm the ISR entry so the measurement is a cached page, as readers get
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.goto(path, { waitUntil: "load" });
    const m = await page.evaluate(
      () =>
        new Promise<{ lcp: number; tag: string; animated: number; cls: number }>((resolve) => {
          let lcp = 0;
          let el: Element | null = null;
          let cls = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as Entry[]) {
              lcp = e.startTime;
              el = e.element ?? null;
            }
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as Entry[]) if (!e.hadRecentInput) cls += e.value ?? 0;
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => {
            const node = el as Element | null;
            resolve({ lcp, tag: node?.tagName ?? "", animated: node ? node.getAnimations().length : -1, cls });
          }, 3000);
        }),
    );
    testInfo.annotations.push({ type: "lcp", description: `${Math.round(m.lcp)} ms on <${m.tag}>, CLS ${m.cls.toFixed(4)}` });
    expect(m.lcp).toBeLessThan(2000);
    expect(["H1", "P"]).toContain(m.tag);
    expect(m.animated).toBe(0);
    expect(m.cls).toBeLessThan(0.01);
  });
}
