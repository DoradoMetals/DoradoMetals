// Pins the ScrollArea contract: the content is really in the DOM (a styled
// bar must not cost you the content), the viewport is focusable for keyboard
// scrolling, and the bar is the border token rather than a hue.
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

  /* type="always" because Radix only mounts a bar once it measures real
     overflow, and jsdom lays nothing out - under the "hover" default no bar
     renders at all and the assertion would pass for the wrong reason. */
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
});
