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

  it("the default border is border/border (132:1016), not the field input token", () => {
    const { getByRole } = render(<QuantityStepper value={2} onChange={() => {}} />);
    const group = getByRole("group");
    expect(group.className).toContain("border-border");
    expect(group.className).not.toContain("border-input");
  });

  it("the value text uses the theme's small size token, not Tailwind's default text-sm", () => {
    const { getByRole } = render(<QuantityStepper value={2} onChange={() => {}} />);
    const input = getByRole("textbox") as HTMLInputElement;
    expect(input.className).toContain("text-small");
  });

  it("disabled reads as a muted fill, not an opacity fade", () => {
    const { getByRole } = render(<QuantityStepper value={2} onChange={() => {}} disabled />);
    const group = getByRole("group");
    expect(group.className).toContain("bg-muted");
    expect(group.className).not.toContain("opacity-50");
    const input = getByRole("textbox") as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.className).toContain("disabled:text-foreground-disabled");
  });
});
