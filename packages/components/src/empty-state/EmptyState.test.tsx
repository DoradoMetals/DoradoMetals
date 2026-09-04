import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";
import { Package } from "@dorado/icons";

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
    expect(container.firstElementChild!.className).toContain("gap-lg");
    expect(getByText("No orders yet").className).toContain("font-semibold");
  });

  it("defaults the icon to a 64px glyph with no size prop", () => {
    const { container } = render(<EmptyState icon={<Package />} title="x" />);
    const iconWrapper = container.querySelector('[aria-hidden="true"]');
    expect(iconWrapper?.className).toContain("[&_svg]:size-16");
  });

  it("renders description as muted body copy alongside title", () => {
    const { getByText } = render(
      <EmptyState title="No addresses found" description="Add an address to save it." />,
    );
    const description = getByText("Add an address to save it.");
    expect(description).toBeTruthy();
    expect(description.className).toContain("text-small");
    expect(description.className).toContain("text-muted-foreground");
  });

  it("pins a badge to the icon's corner only when an icon is present, and axe finds nothing", async () => {
    const { container, getByText, queryByText, rerender } = render(
      <EmptyState icon={<Package />} title="You have nothing to sell yet!" badge={0} />,
    );
    expect(getByText("0")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);

    rerender(<EmptyState title="You have nothing to sell yet!" badge={0} />);
    expect(queryByText("0")).toBe(null);
  });
});
