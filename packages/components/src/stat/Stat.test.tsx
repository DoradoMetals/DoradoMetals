// Pins the Stat contract: label and value as one readable unit.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Stat } from "./Stat";
import { axeViolations } from "../test/axe";

describe("Stat", () => {
  it("renders label and value, and axe finds nothing", async () => {
    const { container, getByText } = render(<Stat label="Gold spot" value="$2,411.20" />);
    expect(getByText("Gold spot")).toBeTruthy();
    expect(getByText("$2,411.20")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});
