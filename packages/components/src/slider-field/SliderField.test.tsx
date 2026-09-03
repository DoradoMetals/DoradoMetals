import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { SliderField } from "./SliderField";
import { axeViolations } from "../test/axe";

describe("SliderField", () => {
  it("slider and input both carry the label, and axe finds nothing", async () => {
    const { container } = render(
      <SliderField label="Purity" unit="%" value={92} onValueChange={() => {}} min={0} max={100} />,
    );
    const thumb = container.querySelector('[role="slider"]') as HTMLElement;
    expect(thumb.getAttribute("aria-valuenow")).toBe("92");
    expect(container.querySelector("input")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("typing in the box moves the value", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <SliderField label="Purity" value={50} onValueChange={onValueChange} min={0} max={100} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "75" } });
    fireEvent.blur(input);
    expect(onValueChange).toHaveBeenCalledWith(75);
  });
});
