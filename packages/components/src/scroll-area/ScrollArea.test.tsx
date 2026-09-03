import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { ScrollArea } from "./ScrollArea";
import { axeViolations } from "../test/axe";

describe("ScrollArea", () => {
  it("renders its children and a viewport, and axe finds nothing", async () => {
    const { container, getByText } = render(
      <ScrollArea className="h-24">
        <div>9:00 AM</div>
        <div>9:30 AM</div>
      </ScrollArea>,
    );
    expect(getByText("9:00 AM")).toBeTruthy();
    expect(getByText("9:30 AM")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("the viewport takes focus so a keyboard can scroll it", () => {
    const { container } = render(
      <ScrollArea className="h-24"><div>x</div></ScrollArea>,
    );
    const vp = container.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement;
    expect(vp).toBeTruthy();
    expect(vp.className).toContain("focus-visible:ring-2");
  });

  it("horizontal orientation is opt-in", () => {
    const v = render(
      <ScrollArea type="always" className="h-24"><div>x</div></ScrollArea>,
    );
    expect(v.container.querySelector('[data-orientation="vertical"]')).toBeTruthy();
    expect(v.container.querySelector('[data-orientation="horizontal"]')).toBe(null);
    v.unmount();
    const h = render(
      <ScrollArea type="always" orientation="both" className="h-24"><div>x</div></ScrollArea>,
    );
    expect(h.container.querySelector('[data-orientation="horizontal"]')).toBeTruthy();
  });

  it("the channel is 8px wide, matching the drawn Scrollbar", () => {
    const { container } = render(
      <ScrollArea type="always" className="h-24"><div>x</div></ScrollArea>,
    );
    const bar = container.querySelector('[data-orientation="vertical"]');
    expect(bar?.className).toContain("w-2");
    expect(bar?.className).not.toContain("w-2.5");
  });
});
