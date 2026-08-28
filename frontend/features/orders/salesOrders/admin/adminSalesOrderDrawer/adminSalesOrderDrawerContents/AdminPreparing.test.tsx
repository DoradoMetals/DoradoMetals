// The admin "send to supplier" step, rendered.
//
// This is the screen where metal leaves the building: an admin picks the
// refiner and the click emails them the order. Same rules as the other
// converted features - jsdom, real component tree, network mocked by URL.
// The send is the unified PATCH now (D87): /orders/:id for both directions,
// the supplier op as a partial document - and the order's spots resolved
// SERVER-side, so the body carries no pricing arrays. The URL and the exact
// document are the pin.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin", name: "Admin" } }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src, alt: String(props.alt ?? "") }),
}));

import { apiRequest } from "@/shared/queries/axios";
import AdminPreparingSalesOrder from "@/features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerContents/AdminPreparing";
import type { SalesOrder } from "@/features/orders/salesOrders/types";

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const order = () =>
  ({
    id: "so-1",
    status: "Preparing",
    order_sent: false,
    supplier_id: "",
    shipment: { carrier_id: "" },
  } as unknown as SalesOrder);

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (_m, url) => {
    if (url === "/suppliers/get_all")
      return [
        {
          id: "s-1",
          logo: "/logos/elemetal.png",
          created_at: null,
          updated_at: null,
          organization: { name: "Elemetal", email: null, phone: null, enabled: true },
        },
      ];
    if (url === "/carriers/get") return [];
    return {};
  });
});

describe("sending a sales order to a supplier", () => {
  test("the refiners are offered by name", async () => {
    renderWithClient(<AdminPreparingSalesOrder order={order()} />);
    await waitFor(() => expect(screen.getAllByText("Elemetal").length).toBeGreaterThan(0));
  });

  test("the send PATCHes the order with the supplier document", async () => {
    renderWithClient(<AdminPreparingSalesOrder order={order()} />);
    await waitFor(() => expect(screen.getAllByText("Elemetal").length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole("radio"));
    await userEvent.click(
      await screen.findByRole("button", { name: /send order to elemetal/i })
    );

    await waitFor(() => {
      const call = vi
        .mocked(apiRequest)
        .mock.calls.find(([method, url]) => method === "PATCH" && url === "/orders/so-1");
      expect(call).toBeTruthy();
      // The WHOLE document: the supplier op and nothing else - no spots, no
      // order copy. toEqual is exact in both directions, so a stray field
      // fails here before the API refuses it by name.
      expect(call![2]).toEqual({ supplier: { supplier_id: "s-1", send: true } });
    });
  });
});
