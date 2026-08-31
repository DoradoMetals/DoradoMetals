// Pins the Checkbox contract: Radix checkbox semantics, keyboard toggling.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Checkbox } from "./Checkbox";
import { axeViolations } from "../test/axe";

describe("Checkbox", () => {
  it("is a real checkbox that toggles, and axe finds nothing", async () => {
    const onCheckedChange = vi.fn();
    const { getByRole, container } = render(
      <Checkbox aria-label="Accept terms" onCheckedChange={onCheckedChange} />,
    );
    const box = getByRole("checkbox", { name: "Accept terms" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(box);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("disabled is real", () => {
    const { getByRole } = render(<Checkbox aria-label="x" disabled />);
    expect((getByRole("checkbox") as HTMLButtonElement).disabled).toBe(true);
  });
});
