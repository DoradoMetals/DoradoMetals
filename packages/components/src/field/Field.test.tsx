import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { FieldLabel, fieldOption, fieldPanel, fieldTrigger } from "./Field";
import { axeViolations } from "../test/axe";

describe("Field chassis", () => {
  it("trigger wears the card border language and the invalid hook", () => {
    const c = fieldTrigger();
    expect(c).toContain("border-border");
    expect(c).toContain("focus-within:border-primary");
    expect(c).toContain("aria-[invalid=true]:border-destructive");
  });

  it("trigger and option text bind to size/h5, not size/body (2026-09-04)", () => {
    expect(fieldTrigger()).toContain("text-h5");
    expect(fieldOption()).toContain("text-h5");
  });

  it("disabled reads as a muted fill, not an opacity fade", () => {
    const c = fieldTrigger();
    expect(c).toContain("disabled:bg-muted");
    expect(c).toContain("disabled:text-foreground-disabled");
    expect(c).toContain("data-[disabled]:bg-muted");
    expect(c).toContain("data-[disabled]:text-foreground-disabled");
    expect(c).not.toContain("opacity-50");
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
