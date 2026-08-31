// Pins the TimePicker contract: a radiogroup of real buttons, the chosen slot
// checked, unavailable ones disabled-not-hidden.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { TimePicker } from "./TimePicker";
import { axeViolations } from "../test/axe";

const groups = [
  {
    label: "Morning",
    slots: [
      { value: "09:00", label: "9:00 AM" },
      { value: "10:00", label: "10:00 AM", available: false },
    ],
  },
];

describe("TimePicker", () => {
  it("is a radiogroup with the pick checked, and axe finds nothing", async () => {
    const { container } = render(
      <TimePicker groups={groups} value="09:00" onValueChange={() => {}} />,
    );
    expect(container.querySelector('[role="radiogroup"]')).toBeTruthy();
    const chosen = container.querySelector('[aria-checked="true"]') as HTMLElement;
    expect(chosen.textContent).toContain("9:00 AM");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("unavailable stays visible but disabled - sold out is information", () => {
    const { getByRole } = render(
      <TimePicker groups={groups} value={null} onValueChange={() => {}} />,
    );
    const slot = getByRole("radio", { name: /10:00 AM/ }) as HTMLButtonElement;
    expect(slot.disabled).toBe(true);
  });

  it("choosing fires with the value", () => {
    const onValueChange = vi.fn();
    const { getByRole } = render(
      <TimePicker groups={groups} value={null} onValueChange={onValueChange} />,
    );
    fireEvent.click(getByRole("radio", { name: /9:00 AM/ }));
    expect(onValueChange).toHaveBeenCalledWith("09:00");
  });
});
