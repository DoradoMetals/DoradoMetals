import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { OTPInput } from "./OTPInput";
import { axeViolations } from "../test/axe";

describe("OTPInput", () => {
  it("one real input with one-time-code, and axe finds nothing", async () => {
    const { container } = render(
      <OTPInput value="" onValueChange={() => {}} label="Verification code" />,
    );
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBe(1);
    expect(inputs[0].getAttribute("autocomplete")).toBe("one-time-code");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("typing fills and onComplete fires exactly at full length", () => {
    const onValueChange = vi.fn();
    const onComplete = vi.fn();
    const { container } = render(
      <OTPInput value="12345" length={6} onValueChange={onValueChange} onComplete={onComplete} label="Code" />,
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "123456" } });
    expect(onValueChange).toHaveBeenCalledWith("123456");
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("non-digits never reach the value", () => {
    const onValueChange = vi.fn();
    const { container } = render(
      <OTPInput value="" onValueChange={onValueChange} label="Code" />,
    );
    fireEvent.change(container.querySelector("input")!, { target: { value: "12a" } });
    expect(onValueChange).toHaveBeenCalledWith("12");
  });

  it("disabled reads as a muted fill, not an opacity fade", () => {
    const { container } = render(
      <OTPInput value="" onValueChange={() => {}} label="Code" disabled />,
    );
    const cells = container.querySelectorAll('[aria-hidden] > span');
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((cell) => {
      expect(cell.className).toContain("bg-muted");
      expect(cell.className).toContain("text-foreground-disabled");
      expect(cell.className).not.toContain("opacity-50");
    });
  });
});
