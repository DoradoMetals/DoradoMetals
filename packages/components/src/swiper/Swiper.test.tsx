import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as React from "react";

import { Swiper } from "./Swiper";
import { axeViolations } from "../test/axe";

describe("Swiper", () => {
  it("is a labelled, keyboard-focusable scroll region with no pagination, and axe finds nothing", async () => {
    const { container, getByRole, queryAllByRole } = render(
      <Swiper label="Order statuses">
        <div>One</div>
        <div>Two</div>
        <div>Three</div>
      </Swiper>,
    );
    const region = getByRole("region", { name: "Order statuses" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(queryAllByRole("button")).toHaveLength(0);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("honours prefers-reduced-motion through CSS on the scroll container", () => {
    const { getByRole } = render(
      <Swiper label="Order statuses">
        <div>One</div>
      </Swiper>,
    );
    const region = getByRole("region", { name: "Order statuses" });
    expect(region.className).toMatch(/scroll-smooth/);
    expect(region.className).toMatch(/motion-reduce:scroll-auto/);
  });

  it("slides are auto-width, and slideClassName reaches every slide", () => {
    const { getByText } = render(
      <Swiper label="Order statuses" slideClassName="py-2">
        <div>One</div>
        <div>Two</div>
      </Swiper>,
    );
    const first = getByText("One").parentElement as HTMLElement;
    const second = getByText("Two").parentElement as HTMLElement;
    expect(first.className).toMatch(/w-auto/);
    expect(first.className).toMatch(/py-2/);
    expect(second.className).toMatch(/py-2/);
  });

  it("a mouse drag past the threshold scrolls the strip and does not fire a click on the slide underneath", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Swiper label="Order statuses">
        <button onClick={onClick}>Pending</button>
      </Swiper>,
    );
    const region = getByRole("region", { name: "Order statuses" });

    fireEvent.pointerDown(region, { pointerId: 1, clientX: 100, pointerType: "mouse", button: 0 });
    fireEvent.pointerMove(region, { pointerId: 1, clientX: 60, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(region, { pointerId: 1, clientX: 60, pointerType: "mouse", button: 0 });
    fireEvent.click(getByRole("button", { name: "Pending" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("a plain click with no drag still reaches the slide", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Swiper label="Order statuses">
        <button onClick={onClick}>Pending</button>
      </Swiper>,
    );
    const region = getByRole("region", { name: "Order statuses" });

    fireEvent.pointerDown(region, { pointerId: 1, clientX: 100, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(region, { pointerId: 1, clientX: 100, pointerType: "mouse", button: 0 });
    fireEvent.click(getByRole("button", { name: "Pending" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
