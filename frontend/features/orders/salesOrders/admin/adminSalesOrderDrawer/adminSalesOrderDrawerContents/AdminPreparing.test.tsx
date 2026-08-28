// The admin "send to supplier" step, rendered.
//
// This is the screen where metal leaves the building: an admin picks the
// refiner and the click emails them the order. Same rules as the other
// converted features - jsdom, real component tree, network mocked by URL.
// Shape-agnostic like the carriers tests: what is pinned is that supplier
// names appear, and that the send carries the picked supplier's id -
// wherever the wire shape puts the name.
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
    if (url === "/sales_orders/get_order_metals") return [];
    return {};
  });
});

describe("sending a sales order to a supplier", () => {
  test("the refiners are offered by name", async () => {
    renderWithClient(<AdminPreparingSalesOrder order={order()} />);
    await waitFor(() => expect(screen.getAllByText("Elemetal").length).toBeGreaterThan(0));
  });

  test("the send carries the picked supplier's id", async () => {
    renderWithClient(<AdminPreparingSalesOrder order={order()} />);
    await waitFor(() => expect(screen.getAllByText("Elemetal").length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole("radio"));
    await userEvent.click(
      await screen.findByRole("button", { name: /send order to elemetal/i })
    );

    await waitFor(() => {
      const call = vi
        .mocked(apiRequest)
        .mock.calls.find(([, url]) => url === "/sales_orders/send_order_to_supplier");
      expect(call).toBeTruthy();
      expect(JSON.stringify(call![2])).toContain("s-1");
    });
  });
});
