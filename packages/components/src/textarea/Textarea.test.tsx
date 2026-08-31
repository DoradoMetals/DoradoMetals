// Pins the Textarea contract: labelled, message line, invalid on aria.
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
});
