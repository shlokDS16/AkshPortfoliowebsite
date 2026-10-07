// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoMotion, expectTokenOnly, mockIntersectionObserver, mockMatchMedia } from "./ui";

function el(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as Element;
}

describe("component-test harness", () => {
  it("renders with Testing Library in jsdom and cleans up between tests", () => {
    render(<p>Case file 03</p>);
    expect(screen.getByText("Case file 03")).toBeInTheDocument();
  });

  it("starts each test with an empty document (afterEach cleanup ran)", () => {
    expect(screen.queryByText("Case file 03")).not.toBeInTheDocument();
  });

  it("answers the four media queries the desk reads", () => {
    mockMatchMedia({ reducedMotion: true, coarse: true });
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    expect(window.matchMedia("(pointer: coarse)").matches).toBe(true);
    expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(false);
    expect(window.matchMedia("(min-width: 60rem)").matches).toBe(false);

    mockMatchMedia({ dark: true, desk: true });
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
    expect(window.matchMedia("(prefers-color-scheme: dark)").matches).toBe(true);
    expect(window.matchMedia("(min-width: 60rem)").matches).toBe(true);
  });

  it("reports no preferences when called without options", () => {
    mockMatchMedia();
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(false);
  });

  it("delivers a triggered intersection to the observer of that element only", () => {
    const io = mockIntersectionObserver();
    const watched = document.createElement("section");
    const other = document.createElement("section");
    const callback = vi.fn();
    const observer = new IntersectionObserver(callback);
    observer.observe(watched);

    io.trigger(other, true);
    expect(callback).not.toHaveBeenCalled();

    io.trigger(watched, true);
    expect(callback).toHaveBeenCalledTimes(1);
    const [entries, source] = callback.mock.calls[0];
    expect(entries[0]).toMatchObject({ target: watched, isIntersecting: true, intersectionRatio: 1 });
    expect(source).toBeDefined();

    io.trigger(watched, false);
    expect(callback.mock.calls[1][0][0]).toMatchObject({ isIntersecting: false, intersectionRatio: 0 });
  });

  it("stops delivering after unobserve and after disconnect", () => {
    const io = mockIntersectionObserver();
    const a = document.createElement("div");
    const b = document.createElement("div");
    const callback = vi.fn();
    const observer = new IntersectionObserver(callback);
    observer.observe(a);
    observer.observe(b);

    observer.unobserve(a);
    io.trigger(a, true);
    expect(callback).not.toHaveBeenCalled();
    io.trigger(b, true);
    expect(callback).toHaveBeenCalledTimes(1);

    observer.disconnect();
    io.trigger(b, true);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("expectTokenOnly passes token classes and throws on palette classes, hex classes and inline colours", () => {
    expect(() => expectTokenOnly(el('<p class="bg-paper text-ink border-rule"><svg fill="currentColor"></svg></p>'))).not.toThrow();
    expect(() => expectTokenOnly(el('<p style="color: var(--ink)">x</p>'))).not.toThrow();
    expect(() => expectTokenOnly(el('<p class="bg-white">x</p>'))).toThrow();
    expect(() => expectTokenOnly(el('<p><span class="text-slate-500">x</span></p>'))).toThrow();
    expect(() => expectTokenOnly(el('<p class="bg-[#fff]">x</p>'))).toThrow();
    expect(() => expectTokenOnly(el('<p style="color: #fff">x</p>'))).toThrow();
    expect(() => expectTokenOnly(el('<svg><path fill="#000"></path></svg>'))).toThrow();
  });

  it("expectNoMotion passes static content and throws on animation hooks", () => {
    expect(() => expectNoMotion(el('<article class="text-read"><p>still</p></article>'))).not.toThrow();
    expect(() => expectNoMotion(el('<p class="animate-fade">x</p>'))).toThrow();
    expect(() => expectNoMotion(el('<p><i class="status-tick"></i></p>'))).toThrow();
    expect(() => expectNoMotion(el('<p class="toast-in">x</p>'))).toThrow();
    expect(() => expectNoMotion(el('<svg data-draw="armed"></svg>'))).toThrow();
  });
});
