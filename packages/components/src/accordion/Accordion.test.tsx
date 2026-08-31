// Pins the Accordion contract (Figma 32:36): a Button-borne trigger with
// measured Radix motion, chevron placement rules, and collapsed-means-gone.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Accordion } from "./Accordion";
import { axeViolations } from "../test/axe";

describe("Accordion", () => {
  it("expands on click with the aria wiring, and axe finds nothing", async () => {
    const { getByRole, container } = render(
      <Accordion label="Shipping">
        <p>Details</p>
      </Accordion>,
    );
    const trigger = getByRole("button", { name: /Shipping/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("UNMOUNTED - collapsed means gone, not hidden", () => {
    const { queryByText } = render(
      <Accordion label="Shipping">
        <p>Details</p>
      </Accordion>,
    );
    expect(queryByText("Details")).toBe(null);
  });

  it("controlled: onToggle fires and open is obeyed", () => {
    const onToggle = vi.fn();
    const { getByRole, getByText } = render(
      <Accordion label="Costs" open onToggle={onToggle}>
        <p>Line items</p>
      </Accordion>,
    );
    expect(getByText("Line items")).toBeTruthy();
    fireEvent.click(getByRole("button"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("trailing content forces the chevron leading so they never collide", () => {
    const { getByRole } = render(
      <Accordion label="Total" chevron="trailing" trailing={<span>$120.00</span>}>
        <p>x</p>
      </Accordion>,
    );
    const trigger = getByRole("button");
    // Chevron is the first svg; with trailing content it must not be last.
    const svgs = trigger.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    expect(trigger.lastElementChild?.contains(svgs[0])).toBe(false);
  });
});
