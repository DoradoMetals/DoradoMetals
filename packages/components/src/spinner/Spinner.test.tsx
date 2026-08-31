// Pins the Spinner contract: a status with a real name, the wheel hidden.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Spinner } from "./Spinner";
import { axeViolations } from "../test/axe";

describe("Spinner", () => {
  it("is a named status, wheel is decoration, and axe finds nothing", async () => {
    const { container } = render(<Spinner label="Loading rates" />);
    const status = container.querySelector('[role="status"]') as HTMLElement;
    expect(status).toBeTruthy();
    expect(status.textContent).toContain("Loading rates");
    expect(container.querySelector('[aria-hidden]')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});
