import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Rating, RatingButton } from "./Rating";
import { axeViolations } from "../test/axe";

function renderRating(props: Partial<React.ComponentProps<typeof Rating>> = {}) {
  return render(
    <Rating {...props}>
      {Array.from({ length: 5 }).map((_, i) => (
        <RatingButton key={i} />
      ))}
    </Rating>,
  );
}

describe("Rating", () => {
  it("is a radiogroup of five stars, and axe finds nothing", async () => {
    const { container } = renderRating();
    const group = container.querySelector('[role="radiogroup"]');
    expect(group).toBeTruthy();
    expect(container.querySelectorAll("button")).toHaveLength(5);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("clicking a star reports its 1-based value", () => {
    const onValueChange = vi.fn();
    const { container } = renderRating({ onValueChange });
    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[2]);
    expect(onValueChange).toHaveBeenCalledWith(3);
  });

  it("filled stars track the value", () => {
    const { container } = renderRating({ value: 3 });
    const svgs = container.querySelectorAll("button svg");
    expect(svgs[0].getAttribute("class")).toContain("fill-current");
    expect(svgs[2].getAttribute("class")).toContain("fill-current");
    expect(svgs[3].getAttribute("class")).not.toContain("fill-current");
  });

  it("ArrowRight/ArrowLeft move the rating and clamp at the ends", () => {
    const onValueChange = vi.fn();
    const { container } = renderRating({ value: 3, onValueChange });
    const buttons = container.querySelectorAll("button");
    fireEvent.keyDown(buttons[2], { key: "ArrowRight" });
    expect(onValueChange).toHaveBeenCalledWith(4);

    fireEvent.keyDown(buttons[2], { key: "ArrowLeft", shiftKey: true });
    expect(onValueChange).toHaveBeenCalledWith(1);
  });

  it("readOnly disables every star and drops interaction", () => {
    const onValueChange = vi.fn();
    const { container } = renderRating({ value: 2, readOnly: true, onValueChange });
    const buttons = container.querySelectorAll("button");
    buttons.forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(buttons[4]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("defaults the radiogroup's accessible name to Rating", () => {
    const { container } = renderRating();
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe(
      "Rating",
    );
  });

  it("onChange fires with the triggering event alongside onValueChange", () => {
    const onChange = vi.fn();
    const { container } = renderRating({ onChange });
    const buttons = container.querySelectorAll("button");
    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 2);
  });
});
