import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Skeleton } from "./Skeleton";
import { axeViolations } from "../test/axe";

describe("Skeleton", () => {
  it("is aria-hidden decoration, and axe finds nothing", async () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(await axeViolations(container)).toEqual([]);
  });
});
