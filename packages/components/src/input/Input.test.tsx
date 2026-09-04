import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import * as React from "react";

import { Input } from "./Input";
import { axeViolations } from "../test/axe";

describe("Input", () => {
  it("label reaches the input, and axe finds nothing", async () => {
    const { getByLabelText, container } = render(<Input label="Order note" />);
    expect(getByLabelText("Order note")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("invalid rides aria-invalid and the message renders", () => {
    const { container, getByText } = render(
      <Input label="Weight" invalid message="Must be a number" />,
    );
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(getByText("Must be a number")).toBeTruthy();
  });

  it("trailing slot renders - the unit label", () => {
    const { getByText } = render(<Input label="Weight" trailing={<span>t oz</span>} />);
    expect(getByText("t oz")).toBeTruthy();
  });

  it("disabled reads as a muted fill, not an opacity fade", () => {
    const { container } = render(<Input label="Weight" disabled />);
    const wrapper = container.querySelector("[data-disabled]") as HTMLElement;
    expect(wrapper.className).toContain("disabled:bg-muted");
    expect(wrapper.className).not.toContain("opacity-50");
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.className).toContain("disabled:text-foreground-disabled");
  });

  it("a number field hides its spinners and asks for the decimal keypad", () => {
    const { getByLabelText } = render(<Input label="Weight" type="number" />)
    const el = getByLabelText("Weight") as HTMLInputElement
    expect(el.getAttribute("inputmode")).toBe("decimal")
    expect(el.className).toContain("[&::-webkit-inner-spin-button]:appearance-none")
    expect(el.className).toContain("[-moz-appearance:textfield]")
  })

  it("a text field gets neither", () => {
    const { getByLabelText } = render(<Input label="Name" />)
    const el = getByLabelText("Name") as HTMLInputElement
    expect(el.getAttribute("inputmode")).toBeNull()
    expect(el.className).not.toContain("appearance-none")
  })

  it("an explicit inputMode still wins", () => {
    const { getByLabelText } = render(<Input label="Pin" type="number" inputMode="numeric" />)
    expect((getByLabelText("Pin") as HTMLInputElement).getAttribute("inputmode")).toBe("numeric")
  })

  it("inputClassName reaches the control, className stays on the wrapper", () => {
    const { getByLabelText, container } = render(
      <Input label="Qty" inputClassName="h-6 text-right" className="w-16" />,
    )
    expect((getByLabelText("Qty") as HTMLInputElement).className).toContain("h-6")
    expect((container.firstElementChild as HTMLElement).className).toContain("w-16")
  })
})
