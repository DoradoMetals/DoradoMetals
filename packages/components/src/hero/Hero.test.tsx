// Pins the Hero contract (163:35): an h1 carrying the drawn words, both CTAs
// pointing where the drawing sends them, and the count coming from the caller
// rather than the component. No slots - the hero is opinionated on purpose.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Hero } from "./Hero";
import { axeViolations } from "../test/axe";

describe("Hero", () => {
  it("the title is a real h1, and axe finds nothing", async () => {
    const { container, getByRole } = render(<Hero sellerCount={2400} />);
    expect(getByRole("heading", { level: 1 }).textContent).toBe(
      "Sell your precious metals without the guesswork",
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it("both CTAs navigate to the drawn destinations", () => {
    const { getByRole } = render(<Hero sellerCount={2400} />);
    expect(getByRole("link", { name: "Get a Quote" }).getAttribute("href")).toBe("/sell");
    expect(getByRole("link", { name: "Browse bullion" }).getAttribute("href")).toBe("/buy");
  });

  // The drawing's own rule: "never hardcode a count that drifts."
  it("renders the caller's count, grouped", () => {
    const { container } = render(<Hero sellerCount={2400} />);
    expect(container.textContent).toContain("Trusted by 2,400+ sellers");
    const { container: other } = render(<Hero sellerCount={11750} />);
    expect(other.textContent).toContain("Trusted by 11,750+ sellers");
  });
});
