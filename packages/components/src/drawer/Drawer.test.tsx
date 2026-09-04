import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Drawer } from "./Drawer";
import { axeViolations } from "../test/axe";

function openDrawer(props: Partial<React.ComponentProps<typeof Drawer>> = {}) {
  const setOpen = props.setOpen ?? vi.fn();
  const utils = render(
    <Drawer open label="Order PO-2189" setOpen={setOpen} {...props}>
      <p>Drawer body</p>
    </Drawer>,
  );
  return { ...utils, setOpen };
}

describe("Drawer", () => {
  it("is a labelled modal dialog, and axe finds nothing", async () => {
    openDrawer();
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Order PO-2189 details");
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it("falls back to a generic accessible name when no label is given", () => {
    openDrawer({ label: undefined });
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute("aria-label")).toBe("Details");
  });

  it("Escape closes it", () => {
    const { setOpen } = openDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("clicking the scrim closes it", () => {
    const { setOpen } = openDrawer();
    const overlay = document.body.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(overlay);
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("renders nothing when closed", () => {
    openDrawer({ open: false });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("carries the scrim over the page ground", () => {
    openDrawer();
    const overlay = document.body.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(overlay.className).toContain("bg-background/50");
  });

  it("the highest surface draws a single hairline on the attached edge, not a box border", () => {
    openDrawer({ anchor: "right" });
    let panel = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain("border-l");
    expect(panel.className).not.toContain("border-r");
    expect(panel.className).not.toContain("border border-border");

    openDrawer({ anchor: "left" });
    const panels = document.body.querySelectorAll('[role="dialog"]');
    panel = panels[panels.length - 1] as HTMLElement;
    expect(panel.className).toContain("border-r");
  });

  it("surface card fills without a border, and none paints nothing", () => {
    openDrawer({ surface: "card" });
    let panel = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain("bg-card");
    expect(panel.className).not.toContain("border-border");

    openDrawer({ surface: "none" });
    const panels = document.body.querySelectorAll('[role="dialog"]');
    panel = panels[panels.length - 1] as HTMLElement;
    expect(panel.className).not.toContain("bg-highest");
    expect(panel.className).not.toContain("bg-card");
    expect(panel.className).not.toContain("border-border");
  });

  it("className merges onto the surface rather than replacing it", () => {
    openDrawer({ className: "max-w-full" });
    const panel = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel.className).toContain("bg-highest");
    expect(panel.className).toContain("max-w-full");
  });
});
