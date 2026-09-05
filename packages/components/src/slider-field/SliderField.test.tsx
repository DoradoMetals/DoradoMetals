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

  it("disabled reads as a muted fill, not an opacity fade", () => {
    const { container } = render(
      <SliderField label="Purity" unit="%" value={50} onValueChange={() => {}} disabled />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const box = input.parentElement as HTMLElement;
    expect(box.className).toContain("bg-muted");
    expect(box.className).not.toContain("opacity-50");
    expect(input.className).toContain("disabled:text-muted-foreground");
  });

  it("focus steps the box border to 1.5px, matching border/strong (99:210)", () => {
    const { container } = render(
      <SliderField label="Purity" unit="%" value={50} onValueChange={() => {}} />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    const box = input.parentElement as HTMLElement;
    expect(box.className).toContain("focus-within:border-[1.5px]");
    expect(box.className).toContain("focus-within:border-border-strong");
  });
});
