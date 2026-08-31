// Pins the DatePicker contract (104:438 renamed): one card, the time addon
// OPTIONAL, both halves inside a single border.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { DatePicker } from "./DatePicker";
import { axeViolations } from "../test/axe";

const groups = [
  { label: "Morning", slots: [{ value: "09:00", label: "9:00 AM" }] },
];

describe("DatePicker", () => {
  it("date-only renders the calendar alone, and axe finds nothing", async () => {
    const { container } = render(
      <DatePicker mode="single" defaultMonth={new Date(2026, 7, 1)} />,
    );
    expect(container.querySelector('[role="grid"]')).toBeTruthy();
    expect(container.querySelector('[role="radiogroup"]')).toBe(null);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("the time addon joins INSIDE the same card and picking fires", () => {
    const onTimeChange = vi.fn();
    const { container, getByRole } = render(
      <DatePicker
        mode="single"
        defaultMonth={new Date(2026, 7, 1)}
        timeGroups={groups}
        timeValue={null}
        onTimeChange={onTimeChange}
        timeHeading="Thursday, 18 June"
      />,
    );
    // one bordered card wraps BOTH halves
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toContain("border");
    expect(card.querySelector('[role="grid"]')).toBeTruthy();
    expect(card.querySelector('[role="radiogroup"]')).toBeTruthy();
    fireEvent.click(getByRole("radio", { name: /9:00 AM/ }));
    expect(onTimeChange).toHaveBeenCalledWith("09:00");
  });
});
