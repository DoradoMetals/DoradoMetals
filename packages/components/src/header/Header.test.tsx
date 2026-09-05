import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, within } from "@testing-library/react";
import * as React from "react";

import { Header } from "./Header";
import { Link } from "../link/Link";
import { axeViolations } from "../test/axe";

function renderHeader(props: Partial<React.ComponentProps<typeof Header>> = {}) {
  return render(
    <Header
      brand={<a href="/">Dorado</a>}
      nav={
        <>
          <Link href="/how-it-works" variant="nav">How it works</Link>
          <Link href="/pricing" variant="nav">Pricing</Link>
        </>
      }
      trailing={<button type="button">Sign in</button>}
      {...props}
    />,
  );
}

describe("Header", () => {
  it("renders the brand and nav, has no menu affordance without a toggle, and axe finds nothing", async () => {
    const { container, getByText, getByRole, queryByLabelText } = renderHeader();
    expect(getByText("Dorado")).toBeTruthy();
    expect(getByRole("navigation", { name: "Primary" })).toBeTruthy();
    expect(getByText("How it works")).toBeTruthy();
    expect(queryByLabelText("Open menu")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("the mobile menu affordance toggles aria-expanded and calls back", () => {
    const onDrawerToggle = vi.fn();
    const { getByRole } = renderHeader({ drawerOpen: false, onDrawerToggle });
    const toggle = getByRole("button", { name: "Open menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(onDrawerToggle).toHaveBeenCalledTimes(1);
  });

  it("relabels the mobile affordance to Close menu once open", () => {
    const { container } = renderHeader({ drawerOpen: true, onDrawerToggle: vi.fn() });
    const mobileGroup = container.querySelector(".lg\\:hidden") as HTMLElement;
    const toggle = within(mobileGroup).getByRole("button", { name: "Close menu" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("drawerOpen replaces the desktop nav and trailing group with a single close button", async () => {
    const { container, getByRole, queryByRole } = renderHeader({ drawerOpen: true });
    expect(queryByRole("navigation", { name: "Primary" })).toBeNull();
    const close = getByRole("button", { name: "Close menu" });
    expect(close.getAttribute("aria-expanded")).toBe("true");
    expect(await axeViolations(container)).toEqual([]);
  });
});
