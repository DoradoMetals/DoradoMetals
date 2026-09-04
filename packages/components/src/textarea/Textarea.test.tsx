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
});
