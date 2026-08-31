// Pins the Figma Menu contract (132:19): a menu of ACTIONS - menu roles,
// danger intent, group labels - rendered through the Radix portal.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "./Menu";
import { axeViolations } from "../test/axe";

function openMenu() {
  // modal={false} keeps the trigger visible to the accessibility tree while
  // open - the modal default aria-hides everything outside the portal, which
  // is correct at runtime but makes both the trigger assertions and the axe
  // scan blind to it.
  return render(
    <Menu open modal={false}>
      <MenuTrigger asChild>
        <button>Actions</button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Order PO-2189</MenuLabel>
        <MenuItem>Edit details</MenuItem>
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
});
