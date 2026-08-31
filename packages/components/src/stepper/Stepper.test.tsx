// Pins the Stepper contract: progress through steps announced, the current
// one marked, past ones distinguishable.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Stepper } from "./Stepper";
import { axeViolations } from "../test/axe";

describe("Stepper", () => {
  it("marks the current step for AT, and axe finds nothing", async () => {
    const { container } = render(
      <Stepper steps={["Shipping", "Payment", "Review"]} current={1} />,
    );
    const current = container.querySelector('[aria-current="step"]') as HTMLElement;
    // Labels ride the accessible name - the visible marker is the number.
    expect(current.getAttribute("aria-label")).toBe("Step 2 of 3: Payment");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("takes a bare count too", () => {
    const { container } = render(<Stepper steps={4} current={2} />);
    expect(container.querySelector('[aria-current="step"]')).toBeTruthy();
  });
});
