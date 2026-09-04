import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Pagination, getPaginationItems } from "./Pagination";
import { axeViolations } from "../test/axe";

describe("getPaginationItems", () => {
  it("windows to first, current±1, last, with an ellipsis between", () => {
    expect(getPaginationItems(2, 8)).toEqual([1, 2, 3, "ellipsis", 8]);
  });

  it("shows every page with no ellipsis when the run is contiguous", () => {
    expect(getPaginationItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("never repeats a page at the boundary", () => {
    expect(getPaginationItems(1, 8)).toEqual([1, 2, "ellipsis", 8]);
    expect(getPaginationItems(8, 8)).toEqual([1, "ellipsis", 7, 8]);
  });

  it("degrades to a single page", () => {
    expect(getPaginationItems(1, 1)).toEqual([1]);
  });
});

describe("Pagination", () => {
  it("is a nav landmark labelled Pagination, current page carries aria-current, axe finds nothing", async () => {
    const { getByRole, container } = render(
      <Pagination page={2} pageCount={8} onPageChange={() => {}} />,
    );
    expect(getByRole("navigation", { name: "Pagination" })).toBeTruthy();
    expect(getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page");
    expect(getByRole("button", { name: "Page 1" }).getAttribute("aria-current")).toBe(null);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("clicking a page number reports that page", () => {
    const onPageChange = vi.fn();
    const { getByRole } = render(
      <Pagination page={2} pageCount={8} onPageChange={onPageChange} />,
    );
    fireEvent.click(getByRole("button", { name: "Page 3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("previous and next are real buttons that step by one", () => {
    const onPageChange = vi.fn();
    const { getByRole } = render(
      <Pagination page={2} pageCount={8} onPageChange={onPageChange} />,
    );
    fireEvent.click(getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("prev disables at the first page and next disables at the last, rather than vanishing", () => {
    const { getByRole, rerender } = render(
      <Pagination page={1} pageCount={8} onPageChange={() => {}} />,
    );
    expect((getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    expect((getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(false);

    rerender(<Pagination page={8} pageCount={8} onPageChange={() => {}} />);
    expect((getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
    expect((getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("the ellipsis is static text, never a button", () => {
    const { getByText } = render(
      <Pagination page={2} pageCount={8} onPageChange={() => {}} />,
    );
    const ellipsis = getByText("…");
    expect(ellipsis.tagName).toBe("SPAN");
    expect(ellipsis.getAttribute("aria-hidden")).toBe("true");
  });
});
