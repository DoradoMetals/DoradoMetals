// Pins the Dialog contract: modal semantics, the title as accessible name,
// Escape dismisses.
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
});
