import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuShortcut, MenuTrigger } from "./Menu";
import { axeViolations } from "../test/axe";

function openMenu() {
  return render(
    <Menu open modal={false}>
      <MenuTrigger asChild>
        <button>Actions</button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Order PO-2189</MenuLabel>
        <MenuItem>
          Edit details
          <MenuShortcut>⌘E</MenuShortcut>
        </MenuItem>
        <MenuSeparator />
        <MenuItem intent="danger">Delete address</MenuItem>
      </MenuContent>
    </Menu>,
  );
}

describe("Menu", () => {
  it("is a real menu of menuitems, and axe finds nothing", async () => {
    openMenu();
    const menu = document.body.querySelector('[role="menu"]') as HTMLElement;
    expect(menu).toBeTruthy();
    const items = document.body.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(2);
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it("danger intent carries destructive on the item", () => {
    openMenu();
    const items = [...document.body.querySelectorAll('[role="menuitem"]')];
    const danger = items.find((i) => i.textContent === "Delete address") as HTMLElement;
    expect(danger.className).toContain("text-destructive");
  });

  it("the trigger declares the popup relationship", () => {
    const { container } = openMenu();
    const trigger = container.querySelector("button") as HTMLElement;
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("separators are separators, not styling", () => {
    openMenu();
    expect(document.body.querySelector('[role="separator"]')).toBeTruthy();
  });

  it("rows carry the drawn 3xs gap and text-small label size", () => {
    openMenu();
    const content = document.body.querySelector('[role="menu"]') as HTMLElement;
    expect(content.className).toContain("flex-col");
    expect(content.className).toContain("gap-3xs");
    const item = document.body.querySelector('[role="menuitem"]') as HTMLElement;
    expect(item.className).toContain("text-small");
    expect(item.className).not.toContain("text-sm ");
  });

  it("group label is eyebrow-styled (packages/theme/typography.css .eyebrow), not raw utilities", () => {
    const { getByText } = openMenu();
    const label = getByText("Order PO-2189");
    expect(label.className).toContain("eyebrow");
    expect(label.className).toContain("text-placeholder");
    expect(label.className).not.toContain("font-mono");
    expect(label.className).not.toContain("tracking-widest");
    const shortcut = getByText("⌘E");
    expect(shortcut.className).toContain("text-micro");
    expect(shortcut.className).not.toContain("tracking-widest");
  });
});
