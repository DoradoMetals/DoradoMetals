// Pins the Tooltip contract: focus opens it (not hover-only), content reaches
// the tree.
import { describe, expect, it } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Tooltip, TooltipProvider } from "./Tooltip";

describe("Tooltip", () => {
  it("opens on focus - keyboard users get the hint too", async () => {
    const { getByRole } = render(
      <TooltipProvider>
        <Tooltip content="Live spot, refreshed each minute">
          <button>Spot price</button>
        </Tooltip>
      </TooltipProvider>,
    );
    await act(async () => {
      fireEvent.focus(getByRole("button"));
    });
    const tip = document.body.querySelector('[role="tooltip"]');
    expect(tip?.textContent).toContain("Live spot");
  });
});
