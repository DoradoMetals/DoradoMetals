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

// The catalogue and the spot feed moved into @dorado/client (see
// OrderSummary.test.tsx) - mocked with the same rows the URL branch answered.
vi.mock("@dorado/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useProducts: () => ({
    data: catalogue().map((p) => ({ default: p, variants: [] })),
    isSuccess: true,
  }),
  useSpotPrices: () => ({ data: spots(), isSuccess: true }),
}));
vi.mock("@/shared/hooks/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "user", name: "Cust" } }),
}));
vi.mock("@dorado/components", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Amount: ({ value }: { value: number }) => React.createElement("span", null, String(value)),
}));

import PurchaseOrderDrawerFooter from "../../orders/purchaseOrders/purchaseOrderDrawer/purchaseOrderDrawerFooter";
import type { OrderView } from "@dorado/contracts";
import type { OrderPricing } from "@dorado/contracts";

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

// ONE OrderView, which is the whole prop now. The footer used to be a
// CONTAINER issuing three more reads for its lines, parcels and payout; all
// three ride on the view, and each line carries its own `payable`.
const order = () =>
  ({
    order: { id: "po-1", status: "Received", direction: "purchase" },
    totals: null,
    items: items(),
    address: null,
    shipments: shipments(),
    pickup: null,
    payout: { id: "pay-1", method: "ACH", cost: 0 },
    user: null,
    actions: { cancel: true, finalize_pricing: false, add_funds: false,
      send_to_refiner: false, buy_label: false, update_tracking: true,
      edit_lines: true, statuses: [] },
  } as unknown as OrderView);

// OrderView items, VERBATIM: bullion_id is the discriminator (null means
// scrap), the weights live on the line, and BOTH NAMES ARE THE VIEW'S -
// `item_name` numbers a scrap lot per metal in `db/orders/sql/view.sql`, and
// `product_name` is one scalar subselect (ruling 78).
const items = () => [
  { id: "i-scrap", bullion_id: null, metal_id: "Gold", content: 2, premium: 0.75,
    unit: "t oz", payable: 1.5, line_total: null,
    item_name: "Gold Item 1", product_name: null },
  { id: "i-bullion", bullion_id: "p-1", metal_id: "Gold", quantity: 2, premium: 0.98,
    payable: null, line_total: null,
    item_name: null, product_name: "Gold American Eagle" },
];
const spots = () => [{ id: "Gold" }];
const catalogue = () => [{ id: "p-1", name: "Gold American Eagle" }];
// One parcel, both directions in one array - `direction` is the column the
// component filters on, and `cost` is the row's own name for what the
// composed wire called shipping_charge.
const shipments = () => [
  { id: "sh-1", direction: "Inbound", cost: 25, insured: true, carrier_service_id: "cs-1" },
];

// Distinct values so an assertion can only match the field it means; line ids
// pair to the order's items BY ID, the way the drawer joins them.
const quote = (): OrderPricing => ({
  order_id: "po-1",
  spots_at: "2026-08-28T00:00:00.000Z",
  items: [
    { id: "i-scrap", kind: "scrap", source: "quoted", metal_id: "Gold", content: 6, quantity: 1, premium: 0.75, retier_premium: null, unit_price: 4477.5, line_total: 4477.5 },
    { id: "i-bullion", kind: "product", source: "quoted", metal_id: "Gold", content: 1, quantity: 2, premium: 0.98, retier_premium: null, unit_price: 2921.7, line_total: 5843.4 },
  ],
  direction: "purchase",
  spots_locked: false,
  spots: [],
  unpriceable: [],
  items_total: 10320.9,
  shipping_charge: 0,
  payout_fee: 0,
  declared_value: 10320.9,
  scrap_total: 4477.5,
  bullion_total: 5843.4,
  total: 10295.9,
});

// THE CLIENT PACKAGE TALKS TO `fetch`, NOT TO THIS APP'S AXIOS WRAPPER (the
// quote and shipments reads both moved into @dorado/client). Routed by URL,
// because the container issues one read per resource now - which is the
// shape of the whole wave: a drawer section asks for the table it renders,
// and nothing arrives nested.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(String(input), "http://test.local");
    const json = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (url.pathname.endsWith("/quotes/order")) return json(quote()) as unknown as Response;
    if (url.pathname.startsWith("/carrier_services")) {
      return json([{ id: "cs-1", name: "Ground", carrier_id: "c-1" }]) as unknown as Response;
    }
    return json([]) as unknown as Response;
  }));
});

describe("the purchase-order drawer footer", () => {
  test("line names render and the quote's totals reach the screen", async () => {
    renderWithClient(<PurchaseOrderDrawerFooter view={order()} />);

    // The quote is the only price source: the accordion headers carry its
    // section totals and grand total even while collapsed.
    await waitFor(() => {
      expect(screen.getAllByText("4477.5").length).toBeGreaterThan(0);
      expect(screen.getAllByText("5843.4").length).toBeGreaterThan(0);
      expect(screen.getAllByText("10295.9").length).toBeGreaterThan(0);
    });

    // The line rows are behind the toggles; the view numbers the scrap lines
    // per metal, so the browser reads `item_name` rather than composing one.
    await userEvent.click(screen.getByRole("button", { name: /Scrap Estimate/ }));
    expect(await screen.findByText("Gold Item 1")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: /Bullion Estimate/ }));
    expect(await screen.findByText("Gold American Eagle")).toBeDefined();
  });
});
