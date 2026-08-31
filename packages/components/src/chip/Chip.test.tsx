// Pins the Chip contract: a pressable filter pill with pressed state, and a
// dismiss affordance that is its own labelled button.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Chip } from "./Chip";
import { axeViolations } from "../test/axe";

describe("Chip", () => {
  it("selection is aria-pressed, and axe finds nothing", async () => {
    const { getByRole, container } = render(<Chip label="Gold" selected />);
    expect(getByRole("button", { name: /Gold/ }).getAttribute("aria-pressed")).toBe("true");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("dismiss is separate from the chip's own press", () => {
    const onDismiss = vi.fn();
    const onClick = vi.fn();
    const { getByRole } = render(<Chip label="Silver" onDismiss={onDismiss} onClick={onClick} />);
    fireEvent.click(getByRole("button", { name: /remove|dismiss/i }));
    expect(onDismiss).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
