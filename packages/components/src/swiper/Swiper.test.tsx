import { describe, expect, it, afterEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as React from "react";

import { Swiper } from "./Swiper";
import { axeViolations } from "../test/axe";

describe("Swiper", () => {
  it("dots are labelled buttons with aria-current, and axe finds nothing", async () => {
    const { container, getByRole } = render(
      <Swiper label="Featured products">
        <div>One</div>
        <div>Two</div>
        <div>Three</div>
      </Swiper>,
    );
    const dot = getByRole("button", { name: "Go to slide 1 of 3" });
    expect(dot.getAttribute("aria-current")).toBe("true");
    expect(container.querySelector(".motion-reduce\\:scroll-auto, [class*='motion-reduce']")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  describe("a dot click's programmatic scroll", () => {
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    const originalMatchMedia = window.matchMedia;
    afterEach(() => {
      HTMLElement.prototype.scrollTo = originalScrollTo;
      window.matchMedia = originalMatchMedia;
    });

    it("uses 'auto' under prefers-reduced-motion", () => {
      const calls: (ScrollToOptions | undefined)[] = [];
      HTMLElement.prototype.scrollTo = vi.fn((opts?: ScrollToOptions) => { calls.push(opts); }) as typeof HTMLElement.prototype.scrollTo;
      window.matchMedia = ((query: string) => ({
        matches: query.includes("reduce"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;

      const { getByRole } = render(
        <Swiper label="Featured products">
          <div>One</div>
          <div>Two</div>
        </Swiper>,
      );
      fireEvent.click(getByRole("button", { name: "Go to slide 2 of 2" }));
      expect(calls[0]?.behavior).toBe("auto");
    });

    it("uses 'smooth' with no motion preference", () => {
      const calls: (ScrollToOptions | undefined)[] = [];
      HTMLElement.prototype.scrollTo = vi.fn((opts?: ScrollToOptions) => { calls.push(opts); }) as typeof HTMLElement.prototype.scrollTo;
      window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;

      const { getByRole } = render(
        <Swiper label="Featured products">
          <div>One</div>
          <div>Two</div>
        </Swiper>,
      );
      fireEvent.click(getByRole("button", { name: "Go to slide 2 of 2" }));
      expect(calls[0]?.behavior).toBe("smooth");
    });
  });
});
