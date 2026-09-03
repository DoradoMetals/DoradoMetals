import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Autocomplete } from "./Autocomplete";
import { axeViolations } from "../test/axe";

const items = [
  { id: "1", textValue: "123 Main St", label: "123 Main St" },
  { id: "2", textValue: "456 Oak Ave", label: "456 Oak Ave" },
];

function renderAC(extra: Partial<React.ComponentProps<typeof Autocomplete>> = {}) {
  return render(
    <Autocomplete
      label="Address"
      value="1"
      onValueChange={() => {}}
      items={items}
      onSelect={() => {}}
      {...extra}
    />,
  );
}

describe("Autocomplete", () => {
  it("is a combobox that opens on focus with options, and axe finds nothing", async () => {
    const { getByRole, container } = renderAC();
    const input = getByRole("combobox");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(getByRole("listbox")).toBeTruthy();
    expect(container.querySelectorAll('[role="option"]').length).toBe(2);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("arrows move aria-activedescendant, Enter selects", () => {
    const onSelect = vi.fn();
    const { getByRole } = renderAC({ onSelect });
    const input = getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toContain("opt-2");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it("caller's onFocus COMPOSES with the component's own", () => {
    const onFocus = vi.fn();
    const { getByRole } = renderAC({ inputProps: { onFocus } });
    const input = getByRole("combobox");
    fireEvent.focus(input);
    expect(onFocus).toHaveBeenCalled();
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });
});
