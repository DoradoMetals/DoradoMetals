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
    const svgs = trigger.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    expect(trigger.lastElementChild?.contains(svgs[0])).toBe(false);
  });

  it("disabled fades the whole row, not just the trigger text", () => {
    const { container } = render(
      <Accordion label="Shipping" disabled>
        <p>Details</p>
      </Accordion>,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/opacity-50/);
  });

  it("the header uses Body/Medium type, not Button's default Small", () => {
    const { getByRole } = render(
      <Accordion label="Shipping">
        <p>Details</p>
      </Accordion>,
    );
    expect(getByRole("button").className).toMatch(/text-body/);
  });

  it("hover fills the row with accent - the row language, not Button's opacity law", () => {
    const { getByRole } = render(
      <Accordion label="Shipping">
        <p>Details</p>
      </Accordion>,
    );
    const trigger = getByRole("button");
    expect(trigger.className).toMatch(/hover:bg-accent/);
    expect(trigger.className).toMatch(/hover:opacity-100/);
  });
});
