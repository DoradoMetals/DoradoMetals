import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Badge } from "./Badge";
import { axeViolations } from "../test/axe";

describe("Badge", () => {
  it("renders its text, and axe finds nothing", async () => {
    const { container, getByText } = render(<Badge intent="success">Paid</Badge>);
    expect(getByText("Paid")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("the leading icon slot renders before the text", () => {
    const { container } = render(
      <Badge icon={<svg data-testid="i" aria-hidden />}>Shipped</Badge>,
    );
    const span = container.firstElementChild as HTMLElement;
    expect(span.firstElementChild?.tagName.toLowerCase()).toBe("svg");
  });

  it("defaults to size=default, matching the drawn spec", () => {
    const { getByText } = render(<Badge>Paid</Badge>);
    const span = getByText("Paid");
    expect(span.className).toContain("px-2");
    expect(span.className).toContain("py-0.5");
    expect(span.className).toContain("text-micro");
    expect(span.className).toContain("rounded-md");
  });

  it("size=sm shrinks padding, gap and icon while staying on text-micro", () => {
    const { getByText } = render(<Badge size="sm">Paid</Badge>);
    const span = getByText("Paid");
    expect(span.className).toContain("px-1.5");
    expect(span.className).toContain("text-micro");
    expect(span.className).toContain("[&_svg]:size-2.5");
  });

  it("size=lg grows padding, gap and icon and steps up to text-small", () => {
    const { getByText } = render(<Badge size="lg">Paid</Badge>);
    const span = getByText("Paid");
    expect(span.className).toContain("px-2.5");
    expect(span.className).toContain("text-small");
    expect(span.className).toContain("[&_svg]:size-3.5");
  });

  it("never renders a pill: radius is fixed at rounded-md across every size", () => {
    for (const size of ["sm", "default", "lg"] as const) {
      const { getByText, unmount } = render(<Badge size={size}>Paid</Badge>);
      const span = getByText("Paid");
      expect(span.className).toContain("rounded-md");
      expect(span.className).not.toContain("rounded-full");
      unmount();
    }
  });
});
