// Pins the Empty State contract (127:49 revised): bare optional icon, one
// action at most.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import { Package } from "lucide-react";

import { EmptyState } from "./EmptyState";
import { axeViolations } from "../test/axe";

describe("EmptyState", () => {
  it("renders title, body and action, and axe finds nothing", async () => {
    const { container, getByText } = render(
      <EmptyState icon={<Package />} title="No orders yet" action={<button>Browse</button>}>
        When you sell to us or buy from us, it shows up here.
      </EmptyState>,
    );
    expect(getByText("No orders yet")).toBeTruthy();
    expect(getByText("Browse")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("the icon is decoration and optional", () => {
    const withIcon = render(<EmptyState icon={<Package />} title="x" />);
    expect(withIcon.container.querySelector('[aria-hidden="true"] svg')).toBeTruthy();
    withIcon.unmount();
    const bare = render(<EmptyState title="x" />);
    expect(bare.container.querySelector("svg")).toBe(null);
  });
});
