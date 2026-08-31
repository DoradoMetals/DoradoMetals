// Pins the Link contract: navigation is an anchor, never a costume button,
// with the quiet-state hover language.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Link } from "./Link";
import { axeViolations } from "../test/axe";

describe("Link", () => {
  it("is a real anchor, and axe finds nothing", async () => {
    const { getByRole, container } = render(<Link href="/rates">Live rates</Link>);
    const a = getByRole("link", { name: "Live rates" }) as HTMLAnchorElement;
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("/rates");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("asChild lends the styling to a routing anchor", () => {
    const { getByRole } = render(
      <Link asChild>
        <a href="/account">Account</a>
      </Link>,
    );
    expect((getByRole("link") as HTMLAnchorElement).getAttribute("href")).toBe("/account");
  });
});
