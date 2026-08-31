// Pins the Hero contract (163:35): an h1, the optional slots, no decoration.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Hero } from "./Hero";
import { axeViolations } from "../test/axe";

describe("Hero", () => {
  it("the title is a real h1, and axe finds nothing", async () => {
    const { container, getByRole } = render(
      <Hero
        eyebrow="Live spot pricing"
        title="Sell without the guesswork"
        subtitle="Insured shipping, transparent assay."
        actions={<button>Get a Quote</button>}
        footnote="A+ BBB"
      />,
    );
    expect(getByRole("heading", { level: 1 }).textContent).toBe("Sell without the guesswork");
    expect(await axeViolations(container)).toEqual([]);
  });
});
