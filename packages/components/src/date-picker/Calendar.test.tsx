// Pins the Calendar contract (react-day-picker wearing the drawing): a real
// month grid with labelled navigation.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Calendar } from "./Calendar";
import { axeViolations } from "../test/axe";

describe("Calendar", () => {
  it("renders a grid with labelled prev/next, and axe finds nothing", async () => {
    const { container } = render(
      <Calendar mode="single" defaultMonth={new Date(2026, 7, 1)} />,
    );
    expect(container.querySelector('[role="grid"]')).toBeTruthy();
    const prev = container.querySelector('button[aria-label*="revious"]');
    const next = container.querySelector('button[aria-label*="ext"]');
    expect(prev).toBeTruthy();
    expect(next).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("a selected day carries aria-selected", () => {
    const { container } = render(
      <Calendar mode="single" selected={new Date(2026, 7, 15)} defaultMonth={new Date(2026, 7, 1)} />,
    );
    expect(container.querySelector('[aria-selected="true"]')).toBeTruthy();
  });
});
