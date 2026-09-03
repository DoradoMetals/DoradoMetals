import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { AddressCard } from "./AddressCard";
import { axeViolations } from "../test/axe";

const base = { name: "Jacob Johnson", lines: ["2114 Forest Ln", "Dallas, TX 75234"] };

describe("AddressCard", () => {
  it("pickable renders as a radio with aria-checked, and axe finds nothing", async () => {
    const { getByRole, container } = render(
      <div role="radiogroup" aria-label="Ship from">
        <AddressCard {...base} selected onSelect={() => {}} />
      </div>,
    );
    expect(getByRole("radio").getAttribute("aria-checked")).toBe("true");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("standalone is not a button and only actions are interactive", () => {
    const { container, queryByRole } = render(<AddressCard {...base} onEdit={() => {}} />);
    expect(queryByRole("radio")).toBe(null);
    expect(container.firstElementChild!.tagName).toBe("DIV");
    expect(queryByRole("button", { name: /edit/i })).toBeTruthy();
  });

  it("delete does not trigger select", () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const { getByRole } = render(
      <AddressCard {...base} onSelect={onSelect} onDelete={onDelete} />,
    );
    fireEvent.click(getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("phone renders at muted-foreground, matching the address lines", () => {
    const { getByText } = render(<AddressCard {...base} phone="(214) 555-0182" />);
    expect(getByText("(214) 555-0182").className).toContain("text-muted-foreground");
    expect(getByText("(214) 555-0182").className).not.toContain("text-placeholder");
  });

  it("Edit/Delete render at the drawn 32px (sm) height", () => {
    const { getByRole } = render(
      <AddressCard {...base} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(getByRole("button", { name: /edit/i }).className).toContain("h-8");
    expect(getByRole("button", { name: /delete/i }).className).toContain("h-8");
  });
});
