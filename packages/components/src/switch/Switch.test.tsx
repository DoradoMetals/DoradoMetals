import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Switch } from "./Switch";
import { axeViolations } from "../test/axe";

describe("Switch", () => {
  it("is a real switch that toggles, and axe finds nothing", async () => {
    const onCheckedChange = vi.fn();
    const { getByRole, container } = render(
      <Switch aria-label="Email notifications" onCheckedChange={onCheckedChange} />,
    );
    const sw = getByRole("switch", { name: "Email notifications" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(await axeViolations(container)).toEqual([]);
  });
});
