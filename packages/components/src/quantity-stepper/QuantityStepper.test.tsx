// Pins the Figma Quantity Stepper contract (132:1016): a real input that
// clamps on blur, arrows that step, and a decrement that DISABLES at the
// floor rather than removes - reaching zero is the Remove action's job.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { QuantityStepper } from "./QuantityStepper";
import { axeViolations } from "../test/axe";

describe("QuantityStepper", () => {
  it("steps and clamps through the buttons, and axe finds nothing", async () => {
    const onChange = vi.fn();
    const { getByLabelText, container } = render(
      <QuantityStepper value={2} onChange={onChange} min={1} max={3} />,
    );
    fireEvent.click(getByLabelText("Increase quantity"));
    expect(onChange).toHaveBeenCalledWith(3);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("at the floor the decrement DISABLES, never removes", () => {
    const { getByLabelText } = render(
      <QuantityStepper value={1} onChange={() => {}} min={1} />,
    );
    const dec = getByLabelText("Decrease quantity") as HTMLButtonElement;
    expect(dec.disabled).toBe(true);
    expect(dec.isConnected).toBe(true);
  });

  it("typing commits on blur, clamped to max", () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <QuantityStepper value={2} onChange={onChange} min={1} max={9} />,
    );
    const input = getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "40" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(9);
  });

  it("garbage reverts to the last real value rather than committing", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<QuantityStepper value={2} onChange={onChange} />);
    const input = getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("2");
  });

  it("arrow keys step from the input", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<QuantityStepper value={2} onChange={onChange} max={9} />);
    fireEvent.keyDown(getByRole("textbox"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
