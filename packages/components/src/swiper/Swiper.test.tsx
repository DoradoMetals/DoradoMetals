// Pins the Swiper contract (59:63): dots are real buttons naming their slide,
// the active one marked, motion-reduce collapses smooth scrolling.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
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
});
