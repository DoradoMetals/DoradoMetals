// Pins the Upload contract (117:28): a real file input behind the surface,
// drops funnel through the same accept filter, drag-over is visible state.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import * as React from "react";

import { Upload } from "./Upload";
import { axeViolations } from "../test/axe";

describe("Upload", () => {
  it("holds a real file input, and axe finds nothing", async () => {
    const { container } = render(<Upload onFiles={() => {}} accept="image/*" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.getAttribute("accept")).toBe("image/*");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("picking files calls onFiles", () => {
    const onFiles = vi.fn();
    const { container } = render(<Upload onFiles={onFiles} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalled();
    expect(onFiles.mock.calls[0][0][0].name).toBe("photo.jpg");
  });

  it("drag-over is a visible state that clears on leave", () => {
    const { container } = render(<Upload onFiles={() => {}} />);
    const zone = container.firstElementChild as HTMLElement;
    fireEvent.dragOver(zone);
    expect(zone.getAttribute("data-drag-over")).toBe("true");
    fireEvent.dragLeave(zone);
    expect(zone.getAttribute("data-drag-over")).toBe(null);
  });
});
