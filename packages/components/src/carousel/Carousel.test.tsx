import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import * as React from "react";

import { Carousel } from "./Carousel";
import { axeViolations } from "../test/axe";

function slides(n: number, onClick?: (i: number) => void) {
  return Array.from({ length: n }, (_, i) => (
    <button key={i} onClick={() => onClick?.(i)}>
      Slide {i + 1}
    </button>
  ));
}

describe("Carousel", () => {
  it("is a labelled scroll region with dots and arrows, current page carries aria-current, axe finds nothing", async () => {
    const { container, getByRole } = render(
      <Carousel label="Product images">{slides(3)}</Carousel>,
    );
    expect(getByRole("region", { name: "Product images" })).toBeTruthy();
    expect(getByRole("button", { name: "Go to slide 1 of 3" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(getByRole("button", { name: "Go to slide 2 of 3" }).getAttribute("aria-current")).toBe(
      null,
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it("honours prefers-reduced-motion through CSS on the scroll container", () => {
    const { getByRole } = render(<Carousel label="Product images">{slides(2)}</Carousel>);
    const region = getByRole("region", { name: "Product images" });
    expect(region.className).toMatch(/scroll-smooth/);
    expect(region.className).toMatch(/motion-reduce:scroll-auto/);
  });

  it("clicking a dot moves the current page", () => {
    const { getByRole } = render(<Carousel label="Product images">{slides(3)}</Carousel>);
    fireEvent.click(getByRole("button", { name: "Go to slide 3 of 3" }));
    expect(getByRole("button", { name: "Go to slide 3 of 3" }).getAttribute("aria-current")).toBe(
      "true",
    );
    expect(getByRole("button", { name: "Go to slide 1 of 3" }).getAttribute("aria-current")).toBe(
      null,
    );
  });

  it("next and previous step by one page", () => {
    const { getByRole } = render(<Carousel label="Product images">{slides(3)}</Carousel>);
    fireEvent.click(getByRole("button", { name: "Next slide" }));
    expect(getByRole("button", { name: "Go to slide 2 of 3" }).getAttribute("aria-current")).toBe(
      "true",
    );
    fireEvent.click(getByRole("button", { name: "Previous slide" }));
    expect(getByRole("button", { name: "Go to slide 1 of 3" }).getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("previous disables at the first page and next disables at the last, rather than vanishing", () => {
    const { getByRole } = render(<Carousel label="Product images">{slides(3)}</Carousel>);
    expect((getByRole("button", { name: "Previous slide" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByRole("button", { name: "Next slide" }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    fireEvent.click(getByRole("button", { name: "Go to slide 3 of 3" }));
    expect((getByRole("button", { name: "Next slide" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((getByRole("button", { name: "Previous slide" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("renders no arrows or dots for a single slide", () => {
    const { queryByRole } = render(<Carousel label="Product images">{slides(1)}</Carousel>);
    expect(queryByRole("button", { name: "Next slide" })).toBeNull();
    expect(queryByRole("button", { name: /Go to slide/ })).toBeNull();
  });

  it("a mouse drag past the threshold scrolls the strip and does not fire a click on the slide underneath", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Carousel label="Product images">{slides(2, onClick)}</Carousel>,
    );
    const region = getByRole("region", { name: "Product images" });

    fireEvent.pointerDown(region, { pointerId: 1, clientX: 100, pointerType: "mouse", button: 0 });
    fireEvent.pointerMove(region, { pointerId: 1, clientX: 60, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(region, { pointerId: 1, clientX: 60, pointerType: "mouse", button: 0 });
    fireEvent.click(getByRole("button", { name: "Slide 1" }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("a plain click with no drag still reaches the slide", () => {
    const onClick = vi.fn();
    const { getByRole } = render(
      <Carousel label="Product images">{slides(2, onClick)}</Carousel>,
    );
    const region = getByRole("region", { name: "Product images" });

    fireEvent.pointerDown(region, { pointerId: 1, clientX: 100, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(region, { pointerId: 1, clientX: 100, pointerType: "mouse", button: 0 });
    fireEvent.click(getByRole("button", { name: "Slide 1" }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("a dot or arrow click does not bubble to an ancestor click handler", () => {
    const onCardClick = vi.fn();
    const { getByRole } = render(
      <div onClick={onCardClick}>
        <Carousel label="Product images">{slides(2)}</Carousel>
      </div>,
    );
    fireEvent.click(getByRole("button", { name: "Next slide" }));
    fireEvent.click(getByRole("button", { name: "Go to slide 1 of 2" }));
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
