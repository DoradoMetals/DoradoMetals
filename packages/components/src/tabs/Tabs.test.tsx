// Pins the Tabs contract: Radix tablist semantics, selection switches panels.
import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";
import { axeViolations } from "../test/axe";

function renderTabs() {
  return render(
    <Tabs defaultValue="buy">
      <TabsList>
        <TabsTrigger value="buy">Buy</TabsTrigger>
        <TabsTrigger value="sell">Sell</TabsTrigger>
      </TabsList>
      <TabsContent value="buy">Buy panel</TabsContent>
      <TabsContent value="sell">Sell panel</TabsContent>
    </Tabs>,
  );
}

describe("Tabs", () => {
  it("is a tablist wired to panels, and axe finds nothing", async () => {
    const { getByRole, container } = renderTabs();
    expect(getByRole("tablist")).toBeTruthy();
    const active = getByRole("tab", { name: "Buy" });
    expect(active.getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tabpanel").textContent).toBe("Buy panel");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("clicking switches the panel", () => {
    const { getByRole } = renderTabs();
    // Radix activates tabs on mousedown, not click.
    fireEvent.mouseDown(getByRole("tab", { name: "Sell" }), { button: 0 });
    expect(getByRole("tabpanel").textContent).toBe("Sell panel");
  });
});
