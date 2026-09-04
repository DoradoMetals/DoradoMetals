// The carrier admin drawer, rendered.
//
// Same rules as the other converted features: jsdom, real component tree,
// real drawer store, network boundary mocked. What is pinned survives the
// carriers lift: the drawer shows the carrier's name and active state, and an
// edit-on-blur sends the update mutation with the edited value in the body
// the API reads. The body assertion is the seam the CARRIERS_WIRE flip
// changes shape on, so the test asserts the VALUE arrives, wherever the
// shape puts it.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));

import { useDrawerStore } from "@/shared/store/drawerStore";
import CarriersDrawer from "@/features/carriers/ui/CarriersDrawer";
import type { Carrier } from "@/features/carriers/types";

const fedex = (): Carrier => ({
  id: "c-1",
  logo: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
  organization: {
    name: "FedEx",
    email: "support@fedex.com",
    phone: "5555555555",
    enabled: true,
  },
});

// The hooks live in @dorado/client now, which talks to the platform's `fetch`
// rather than the axios wrapper this file used to stub.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => "[]" }) as unknown as Response)
  );
  useDrawerStore.setState({ activeDrawer: "carriers" } as never);
});

describe("the carrier drawer", () => {
  test("shows the carrier and its active state", async () => {
    renderWithClient(<CarriersDrawer carriers={[fedex()]} carrier_id="c-1" />);
    expect(screen.getByText("FedEx")).toBeDefined();
    // "Active" is both the status chip and a section label.
    expect(screen.getAllByText("Active").length).toBeGreaterThan(0);
  });

  test("editing the name sends the update with the new value", async () => {
    renderWithClient(<CarriersDrawer carriers={[fedex()]} carrier_id="c-1" />);
    const input = screen.getByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.type(input, "FedEx Freight");
    await userEvent.tab(); // blur commits

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([u]) => String(u).endsWith("/carriers/update"));
      expect(call).toBeTruthy();
      // The value must arrive wherever the wire shape puts it.
      const [, init] = call! as [string, RequestInit];
      expect(String(init.body)).toContain("FedEx Freight");
    });
  });

  test("toggling active sends the deactivation", async () => {
    renderWithClient(<CarriersDrawer carriers={[fedex()]} carrier_id="c-1" />);
    // DisplayToggle renders radio segments labelled Yes/No.
    await userEvent.click(screen.getByRole("radio", { name: /no/i }));

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([u]) => String(u).endsWith("/carriers/update"));
      expect(call).toBeTruthy();
      const [, init] = call! as [string, RequestInit];
      expect(String(init.body)).toMatch(/false/);
    });
  });
});
