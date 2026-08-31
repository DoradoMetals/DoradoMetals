// Pins the Field chassis: the shared trigger/panel/option class recipes and
// the label component every field-shaped control composes.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { FieldLabel, fieldOption, fieldPanel, fieldTrigger } from "./Field";
import { axeViolations } from "../test/axe";

describe("Field chassis", () => {
  it("trigger wears the card border language and the invalid hook", () => {
    const c = fieldTrigger();
    expect(c).toContain("border-input");
    expect(c).toContain("aria-[invalid=true]:border-destructive");
  });

  it("panel is the popover surface, option highlights with accent", () => {
    expect(fieldPanel()).toContain("bg-popover");
    expect(fieldOption()).toContain("data-[highlighted]:bg-accent");
  });

  it("FieldLabel labels, and axe finds nothing", async () => {
    const { container, getByText } = render(
      <label>
        <FieldLabel>Amount</FieldLabel>
        <input aria-label="Amount" />
      </label>,
    );
    expect(getByText("Amount")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});
