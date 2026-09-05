import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./Dialog";
import { axeViolations } from "../test/axe";

function openDialog(onOpenChange = () => {}) {
  return render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Confirm cancellation</DialogTitle>
        <DialogDescription>This cannot be undone.</DialogDescription>
      </DialogContent>
    </Dialog>,
  );
}

describe("Dialog", () => {
  it("is a labelled modal dialog, and axe finds nothing", async () => {
    openDialog();
    const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it("Escape asks to close", () => {
    const onOpenChange = vi.fn();
    openDialog(onOpenChange);
    fireEvent.keyDown(document.body.querySelector('[role="dialog"]')!, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Dialog Overlay 64:517: the scrim is 70% background behind an 8px blur", () => {
    openDialog();
    const overlayEl = document.body.querySelector(".backdrop-blur-sm") as HTMLElement | null;
    expect(overlayEl).toBeTruthy();
    expect(overlayEl?.className).toMatch(/bg-background\/70/);
  });

  it("the close button is a bare tertiary icon at 16px (Icon Button 457:75 Tertiary/SM geometry)", () => {
    openDialog();
    const close = document.body.querySelector('[aria-label="Close"]') as HTMLElement;
    expect(close).toBeTruthy();
    expect(close.className).toMatch(/h-8 w-8/);
    expect(close.className).toMatch(/\[&_svg\]:size-4/);
  });
});
