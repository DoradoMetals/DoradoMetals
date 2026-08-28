// The user purchase-order drawer footer, rendered - the customer's own view
// of what their metal is worth.
//
// Every dollar comes from POST /quotes/order (Jacob's no-previews ruling), so
// the network is mocked by URL and the quote fixture is the price source.
// Shape-agnostic like the other converted features' pins: what is held is
// that the line names render and the quote's totals reach the screen -
// wherever the order wire puts its fields.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "user", name: "Cust" } }),
}));
vi.mock("@/shared/ui/PriceNumberFlow", () => ({
  default: ({ value }: { value: number }) => React.createElement("span", null, String(value)),
}));

import { apiRequest } from "@/shared/queries/axios";
import PurchaseOrderDrawerFooter from "@/features/orders/purchaseOrders/users/purchaseOrderDrawer/purchaseOrderDrawerFooter";
import type { PurchaseOrder } from "@/features/orders/purchaseOrders/types";
import type { OrderQuoteWire } from "@dorado/contracts";

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

// The converted wire: `status` for the state, the embedded product speaking
// `name`.
const order = () =>
  ({
    id: "po-1",
    status: "Received",
    order_items: [
      {
        id: "i-scrap",
        item_type: "scrap",
        scrap: { id: "s-1", metal: "Gold", content: 2, bid_premium: 0.75, gross_unit: "t oz" },
      },
      {
        id: "i-bullion",
        item_type: "product",
        quantity: 2,
        product: { id: "p-1", name: "Gold American Eagle" },
      },
    ],
    shipment: { id: "sh-1", shipping_charge: 25, shipping_service: "Ground", insured: true },
    return_shipment: { id: null },
    payout: { method: "ACH" },
  } as unknown as PurchaseOrder);

// Distinct values so an assertion can only match the field it means; line ids
// pair to the order's items BY ID, the way the drawer joins them.
const quote = (): OrderQuoteWire => ({
  order_id: "po-1",
  spots_at: "2026-08-28T00:00:00.000Z",
  items: [
    { id: "i-scrap", kind: "scrap", source: "estimate", premium: 0.75, unit_price: 4477.5, line_total: 4477.5 },
    { id: "i-bullion", kind: "product", source: "estimate", premium: 0.98, unit_price: 2921.7, line_total: 5843.4 },
  ],
  scrap_total: 4477.5,
  bullion_total: 5843.4,
  total: 10295.9,
});

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (_m, url) =>
    String(url) === "/quotes/order" ? (quote() as never) : ([] as never)
  );
});

describe("the purchase-order drawer footer", () => {
  test("line names render and the quote's totals reach the screen", async () => {
    renderWithClient(<PurchaseOrderDrawerFooter order={order()} />);

    // The quote is the only price source: the accordion headers carry its
    // section totals and grand total even while collapsed.
    await waitFor(() => {
      expect(screen.getAllByText("4477.5").length).toBeGreaterThan(0);
      expect(screen.getAllByText("5843.4").length).toBeGreaterThan(0);
      expect(screen.getAllByText("10295.9").length).toBeGreaterThan(0);
    });

    // The line rows are behind the toggles; assignScrapItemNames numbers the
    // scrap lines per metal.
    await userEvent.click(screen.getByRole("button", { name: /Scrap Estimate/ }));
    expect(await screen.findByText("Gold Item 1")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: /Bullion Estimate/ }));
    expect(await screen.findByText("Gold American Eagle")).toBeDefined();
  });
});
