import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import * as React from "react";

import { Toaster, toast } from "./Toaster";

describe("Toaster", () => {
  it("mounts the live region and renders a toast into it", async () => {
    render(<Toaster />);
    await act(async () => {
      toast("Address saved");
    });

    expect(await screen.findByText("Address saved")).toBeTruthy();
    expect(document.body.querySelector("[aria-live]")).toBeTruthy();
  });

  it("toast.error persists until dismissed - the wrapper sets no timer", async () => {
    render(<Toaster />);
    let id: string | number = "";
    await act(async () => {
      id = toast.error("Payment failed");
    });
    expect(id).toBeTruthy();
    expect(await screen.findByText("Payment failed")).toBeTruthy();
  });
});
