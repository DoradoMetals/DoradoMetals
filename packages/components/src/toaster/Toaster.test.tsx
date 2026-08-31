// Pins the house toast contract (Figma 132:1041): mounting the region, and
// the wrapper's one behavioural promise over sonner - danger persists.
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
    // sonner mounts its list on a tick - findByText retries.
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
