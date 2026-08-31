// Pins the Select contract: a labelled combobox on the Field chassis, options
// through the Radix portal, check carries selection.
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Select } from "./Select";
import { axeViolations } from "../test/axe";

const items = [
  { value: "ach", label: "ACH transfer" },
  { value: "wire", label: "Wire" },
];

describe("Select", () => {
  it("is a labelled combobox, and axe finds nothing", async () => {
    const { getByRole, container } = render(
      <Select label="Payout method" items={items} />,
    );
    expect(getByRole("combobox", { name: /Payout method/ })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("invalid rides the aria attribute the chassis styles", () => {
    const { getByRole } = render(<Select label="Method" items={items} invalid />);
    expect(getByRole("combobox").getAttribute("aria-invalid")).toBe("true");
  });

  it("the chosen value shows in the trigger", () => {
    const { getByRole } = render(
      <Select label="Method" items={items} value="wire" />,
    );
    expect(getByRole("combobox").textContent).toContain("Wire");
  });
});
