import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Attachment } from "./Attachment";
import { axeViolations } from "../test/axe";

describe("Attachment", () => {
  it("renders filename and meta, and axe finds nothing", async () => {
    const { container, getByText } = render(
      <Attachment filename="receipt.pdf" meta="120 KB" state="complete" onRemove={() => {}} />,
    );
    expect(getByText("receipt.pdf")).toBeTruthy();
    expect(getByText("120 KB")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("remove is a real button, NAMED with the filename, and fires", () => {
    const onRemove = vi.fn();
    const { getByRole } = render(
      <Attachment filename="a.png" state="complete" onRemove={onRemove} />,
    );
    fireEvent.click(getByRole("button", { name: "Remove a.png" }));
    expect(onRemove).toHaveBeenCalled();
  });

  it("error state carries the reason through meta - the drawing's rule", () => {
    const { container, getByText } = render(
      <Attachment filename="b.png" state="error" meta="Upload failed" />,
    );
    expect(getByText("Upload failed")).toBeTruthy();
    expect(container.querySelector('[data-state="error"]')).toBeTruthy();
  });

  it("bare drops the card's own border and radius for nesting inside Upload", () => {
    const { container } = render(
      <Attachment filename="c.png" state="complete" bare />,
    );
    const row = container.firstElementChild as HTMLElement;
    expect(row.className).not.toContain("border");
    expect(row.className).not.toContain("rounded-lg");
  });
});
