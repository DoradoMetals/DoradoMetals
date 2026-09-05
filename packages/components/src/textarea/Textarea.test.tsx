import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Textarea } from "./Textarea";
import { axeViolations } from "../test/axe";

describe("Textarea", () => {
  it("label reaches the textarea, and axe finds nothing", async () => {
    const { getByLabelText, container } = render(<Textarea label="Notes" />);
    expect(getByLabelText("Notes").tagName).toBe("TEXTAREA");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("disabled reads as a muted fill, not an opacity fade", () => {
    const { getByLabelText } = render(<Textarea label="Notes" disabled />);
    const textarea = getByLabelText("Notes") as HTMLTextAreaElement;
    expect(textarea.className).toContain("disabled:bg-muted");
    expect(textarea.className).toContain("disabled:text-foreground-disabled");
    expect(textarea.className).not.toContain("opacity-50");
  });

  it("value text binds to size/h5, not size/body (37:63, 2026-09-04)", () => {
    const { getByLabelText } = render(<Textarea label="Notes" />);
    expect((getByLabelText("Notes") as HTMLTextAreaElement).className).toContain("text-h5");
  });

  it("message and counter stack as two lines, not one split row (37:63)", () => {
    const { getByText } = render(
      <Textarea label="Notes" message="Please add a short description." showCount maxLength={500} />,
    );
    const message = getByText("Please add a short description.");
    const counter = getByText("0 / 500");
    expect(message.tagName).toBe("P");
    expect(counter.tagName).toBe("SPAN");
    expect(message.className).toContain("w-full");
    expect(counter.className).toContain("w-full");
    expect(counter.className).toContain("text-right");
    expect(message.nextElementSibling).toBe(counter);
  });
});
