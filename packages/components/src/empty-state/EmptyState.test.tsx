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

  it("gaps 24px between icon, text block and action, and titles SemiBold", () => {
    const { container, getByText } = render(<EmptyState title="No orders yet" />);
    expect(container.firstElementChild!.className).toContain("gap-6");
    expect(getByText("No orders yet").className).toContain("font-semibold");
  });
});
