import { describe, expect, it } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import * as React from "react";
import { useForm, type UseFormReturn } from "react-hook-form";

import { ValidatedField } from "./ValidatedField";
import { axeViolations } from "../test/axe";

type Values = { email: string };

function EmailHarness({
  formRef,
}: {
  formRef: React.MutableRefObject<UseFormReturn<Values> | null>;
}) {
  const form = useForm<Values>({ defaultValues: { email: "" } });
  formRef.current = form;
  return <ValidatedField control={form.control} name="email" label="Email" type="email" />;
}

function PasswordHarness() {
  const form = useForm<{ password: string }>({ defaultValues: { password: "" } });
  return (
    <ValidatedField
      control={form.control}
      name="password"
      label="Password"
      type="password"
      showPasswordButton
    />
  );
}

describe("ValidatedField", () => {
  it("label reaches the input, and axe finds nothing", async () => {
    const formRef: React.MutableRefObject<UseFormReturn<Values> | null> = { current: null };
    const { getByLabelText, container } = render(<EmailHarness formRef={formRef} />);
    expect(getByLabelText("Email")).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("an error paints the field only once it has been touched", () => {
    const formRef: React.MutableRefObject<UseFormReturn<Values> | null> = { current: null };
    const { getByLabelText, queryByText } = render(<EmailHarness formRef={formRef} />);
    const input = getByLabelText("Email") as HTMLInputElement;

    act(() => {
      formRef.current!.setError("email", { type: "manual", message: "Required" });
    });
    expect(input.getAttribute("aria-invalid")).not.toBe("true");
    expect(queryByText("Required")).toBeNull();

    fireEvent.blur(input);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(queryByText("Required")).toBeTruthy();
  });

  it("the password toggle reveals the value and relabels itself", async () => {
    const { getByRole, getByLabelText, container } = render(<PasswordHarness />);
    const input = getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    const toggle = getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(input.type).toBe("text");
    expect(getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");
    expect(await axeViolations(container)).toEqual([]);
  });
});
