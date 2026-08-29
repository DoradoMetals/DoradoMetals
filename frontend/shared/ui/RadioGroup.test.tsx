// The ONE radio group (ruling 30), rendered.
//
// Two of these assertions pin things that are INVISIBLE to a screenshot and to
// every other test in the suite, and both were carried over from RadioCard
// rather than re-derived:
//
//   - the whole option is the click target. `radio-group-buttons` carried
//     `relative` and the hidden input carried `after:absolute after:inset-0`;
//     together they stretch the input's hit area over the card. Drop either and
//     you get a control that only responds within the 16px radio - no error, no
//     type failure, no visual difference.
//   - every option has an `htmlFor` tying the label to its input. Four call
//     sites never had one.
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { RadioGroup } from "@/shared/ui/RadioGroup";

const options = [
  { value: "ground", label: "Ground" },
  { value: "express", label: "Express" },
];

const renderGroup = (props: Partial<React.ComponentProps<typeof RadioGroup>> = {}) => {
  const onValueChange = vi.fn();
  render(
    <RadioGroup
      value="ground"
      onValueChange={onValueChange}
      options={options}
      {...(props as object)}
    >
      {(o: (typeof options)[number]) => <strong>{o.label}</strong>}
    </RadioGroup>
  );
  return { onValueChange };
};

describe("RadioGroup", () => {
  test("renders one radio per option and marks the selected one", () => {
    renderGroup();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0].getAttribute("data-state")).toBe("checked");
    expect(radios[1].getAttribute("data-state")).toBe("unchecked");
  });

  test("clicking anywhere in an option selects it, not just the radio", async () => {
    const { onValueChange } = renderGroup();
    // The LABEL TEXT, which sits nowhere near the 16px input.
    await userEvent.click(screen.getByText("Express"));
    expect(onValueChange).toHaveBeenCalledWith("express");
  });

  test("the hit area covers the whole option and the option is positioned", () => {
    renderGroup();
    const radio = screen.getAllByRole("radio")[1];
    // Both halves of the pair, which is why they live in the component.
    expect(radio.className).toContain("after:absolute");
    expect(radio.className).toContain("after:inset-0");
    expect(radio.closest("label")!.className).toContain("relative");
  });

  test("every option ties its label to its input", () => {
    renderGroup();
    for (const value of ["ground", "express"]) {
      const label = document.querySelector(`label[for="${value}"]`);
      expect(label, `no <label for="${value}">`).not.toBeNull();
    }
  });

  test("a per-option disable reaches the input, not just the opacity", () => {
    renderGroup({ isOptionDisabled: (o) => (o as (typeof options)[number]).value === "express" });
    expect((screen.getAllByRole("radio")[1] as HTMLButtonElement).disabled).toBe(true);
  });

  test("options may be a record keyed by value", () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup
        value="a"
        onValueChange={onValueChange}
        options={{ a: { label: "A" }, b: { label: "B" } }}
      >
        {(o: { label: string }) => <strong>{o.label}</strong>}
      </RadioGroup>
    );
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(document.querySelector('label[for="b"]')).not.toBeNull();
  });

  test("card and tile carry a selected affordance; segment relies on the fill", () => {
    const { unmount } = render(
      <RadioGroup value="ground" onValueChange={() => {}} options={options} variant="card">
        {(o: (typeof options)[number]) => <strong>{o.label}</strong>}
      </RadioGroup>
    );
    expect(document.querySelectorAll("svg[aria-hidden]").length).toBe(2);
    unmount();

    render(
      <RadioGroup value="ground" onValueChange={() => {}} options={options} variant="segment">
        {(o: (typeof options)[number]) => <strong>{o.label}</strong>}
      </RadioGroup>
    );
    expect(document.querySelectorAll("svg[aria-hidden]").length).toBe(0);
  });
});
