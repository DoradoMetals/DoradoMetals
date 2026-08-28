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
import type { OrderQuote } from "@dorado/contracts";

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

// THE SLIM WIRE (wave 3): the orders.orders row plus totals, and nothing
// else. The footer is a CONTAINER - it reads its own lines, parcels and
// payout - so the fixtures below are what those reads answer.
const order = () =>
  ({ id: "po-1", status: "Received" } as unknown as PurchaseOrder);

// orders.items rows, VERBATIM: bullion_id is the discriminator (null means
// scrap), the weights live on the line, and metal_id resolves to a name
// against the spots reference list.
const items = () => [
  { id: "i-scrap", bullion_id: null, metal_id: "m-gold", content: 2, premium: 0.75, unit: "t oz" },
  { id: "i-bullion", bullion_id: "p-1", metal_id: "m-gold", quantity: 2, premium: 0.98 },
];
const spots = () => [{ id: "m-gold", name: "Gold" }];
const catalogue = () => [{ id: "p-1", name: "Gold American Eagle" }];
// One parcel, both directions in one array - `direction` is the column the
// component filters on, and `cost` is the row's own name for what the
// composed wire called shipping_charge.
const shipments = () => [
  { id: "sh-1", direction: "Inbound", cost: 25, insured: true, carrier_service_id: "cs-1" },
];
const payouts = () => [{ id: "pay-1", method: "ACH", cost: 0 }];

// Distinct values so an assertion can only match the field it means; line ids
// pair to the order's items BY ID, the way the drawer joins them.
const quote = (): OrderQuote => ({
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
  // Routed by URL, because the container issues one read per resource now -
  // which is the shape of the whole wave: a drawer section asks for the table
  // it renders, and nothing arrives nested.
  vi.mocked(apiRequest).mockImplementation(async (_m, url) => {
    const u = String(url);
    if (u === "/quotes/order") return quote() as never;
    if (u === "/orders/po-1/items") return items() as never;
    if (u === "/orders/po-1/shipments") return shipments() as never;
    if (u === "/orders/po-1/payouts") return payouts() as never;
    if (u.startsWith("/spots")) return spots() as never;
    if (u.startsWith("/products")) return catalogue() as never;
    if (u.startsWith("/carrier_services")) return [{ id: "cs-1", name: "Ground", carrier_id: "c-1" }] as never;
    return [] as never;
  });
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
