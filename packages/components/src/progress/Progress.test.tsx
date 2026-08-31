// Pins the Figma Progress contract (132:995): progressbar aria, the sweep
// pausing under motion-reduce, transform-moved indicator, clamping.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Progress } from "./Progress";
import { axeViolations } from "../test/axe";

describe("Progress", () => {
  it("reports its value to assistive tech, and axe finds nothing", async () => {
    const { container } = render(<Progress value={66} aria-label="Upload progress" />);
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("66");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("indeterminate drops aria-valuenow and the sweep pauses under motion-reduce", () => {
    const { container } = render(<Progress aria-label="Working" />);
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe(null);
    const sweep = container.querySelector(".animate-progress-sweep") as HTMLElement;
    expect(sweep.className).toContain("motion-reduce:animate-none");
  });

  it("the rail is the sanctioned pill and the indicator moves by transform", () => {
    const { container } = render(<Progress value={25} aria-label="p" />);
    const bar = container.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.className).toContain("rounded-full");
    const indicator = bar.firstElementChild as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-75%)");
  });

  it("clamps out-of-range values instead of overflowing the rail", () => {
    const { container } = render(<Progress value={140} aria-label="p" />);
    const indicator = container.querySelector('[role="progressbar"]')!
      .firstElementChild as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-0%)");
  });
});
