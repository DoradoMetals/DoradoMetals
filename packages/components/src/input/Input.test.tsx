// Pins the Input contract: label wiring, the message line, invalid state on
// the aria attribute.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Input } from "./Input";
import { axeViolations } from "../test/axe";

describe("Input", () => {
  it("label reaches the input, and axe finds nothing", async () => {
    const { getByLabelText, container } = render(<Input label="Order note" />);
    expect(getByLabelText("Order note")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("invalid rides aria-invalid and the message renders", () => {
    const { container, getByText } = render(
      <Input label="Weight" invalid message="Must be a number" />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(getByText("Must be a number")).toBeTruthy();
  });

  it("trailing slot renders - the unit label", () => {
    const { getByText } = render(<Input label="Weight" trailing={<span>t oz</span>} />);
    expect(getByText("t oz")).toBeTruthy();
  });
});
