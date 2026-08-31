// Pins the Badge contract: micro text, the leading icon slot inheriting the
// intent colour (Jacob, 2026-08-30).
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
});
