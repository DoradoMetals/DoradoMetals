// The sales-order checkout summary, rendered - the last thing a customer
// reads before paying.
//
// The totals arrive as POST /quotes/sales_order's wire shape (Jacob's
// no-previews ruling), fetched by the checkout and passed down as a prop.
// What is pinned survived the switch: the basket's items render by name (the
// catalogue read supplies the flair, by bullion_id), the order total renders
// from the prop, and removing an item WRITES THE SERVER'S BASKET - there is no
// browser store behind it any more (ruling 63), so `stubCheckoutServer` stands
// in for /checkout/items and the assertion is about the rows the API was told
// to hold. The fixture speaks the contract's field names and nothing else does.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
// The catalogue and the spot feed moved into @dorado/client, which talks to
// the platform's `fetch` rather than the axios wrapper this file stubs - so
// both hooks are mocked with the rows the stub used to answer with. The
// catalogue answers GROUPS now; the flair read flattens them.
vi.mock("@dorado/client", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useProducts: () => ({ data: [{ default: eagle(), variants: [] }], isSuccess: true }),
  useSpotPrices: () => ({
    data: [
      { id: "m-au", name: "Gold", ask: 3000, bid: 2900, dollar_change: 1, percent_change: 0.1, direction: "up" },
    ],
    isSuccess: true,
  }),
}));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "user", name: "Cust" } }),
}));
vi.mock("@/features/auth/authClient", () => ({
  useUser: () => ({ user: { id: "u-1" }, session: null, error: null, isPending: false }),
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src, alt: String(props.alt ?? "") }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@number-flow/react", () => ({
  __esModule: true,
  default: ({ value }: { value: number }) => React.createElement("span", null, String(value)),
  NumberFlowGroup: ({ children }: { children: React.ReactNode }) => React.createElement("span", null, children),
}));
vi.mock("@dorado/components", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Amount: ({ value, className }: { value: number; className?: string }) =>
    React.createElement("span", { className }, String(value)),
}));

import { apiRequest } from "@/shared/queries/axios";
import { stubCheckoutServer, type CheckoutServer } from "@/shared/tests/checkoutServer";
import OrderSummary from "@/features/checkout/sales-order-checkout/summary/orderSummary";
import type { SalesOrderQuote } from "@dorado/contracts";
import type { Product } from "@/features/products/types";

const eagle = (): Product =>
  ({
    id: "p-1",
    name: "Gold American Eagle",
    description: "One ounce",
    type: "Coin",
    content: 1,
    purity: 0.9167,
    gross: 1.0909,
    bid_premium: 0.5,
    ask_premium: 1.5,
    image_front: "https://img/front.png",
    image_back: "https://img/back.png",
    mint_name: "US Mint",
    metal_type: "Gold",
  metal_id: "00000000-0000-4000-8000-000000000010",
  mint_id: "00000000-0000-4000-8000-000000000011",
    variant_group: "",
    shadow_offset: 0,
    slug: "gold-american-eagle",
    is_generic: false,
    variant_label: "",
    legal_tender: true,
    domestic_tender: true,
    quantity: 1,
  } as Product);

// Distinct values so an assertion can only match the field it means. The
// quote's line id matches eagle()'s so the item row shows its line_total.
const prices = (): SalesOrderQuote => ({
  spots_at: "2026-08-27T00:00:00.000Z",
  item_total: 4500,
  base_total: 4577.25,
  shipping_charge: 25,
  beginning_funds: 0,
  ending_funds: 0,
  pre_charges_amount: 0,
  subject_to_charges_amount: 4577.25,
  post_charges_amount: 4714.57,
  charges_amount: 137.32,
  sales_tax: 52.25,
  order_total: 4714.57,
  payment_surface: "card",
  items: [{ id: "p-1", quantity: 1, unit_ask: 4500, line_total: 4500, sales_tax_rate: 0.0116 }],
});

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  // Branched by URL: the summary's totals arrive as a prop, but anything in
  // the tree that fetches the quote or the catalogue gets its own fixture -
  // the catalogue read is what supplies the name and picture by bullion_id.
  vi.mocked(apiRequest).mockImplementation(async (_method, url) => {
    const u = String(url);
    if (u.startsWith("/quotes/sales_order")) return prices() as never;
    return [
      { id: "m-au", name: "Gold", ask: 3000, bid: 2900, dollar_change: 1, percent_change: 0.1 },
    ] as never;
  });
  localStorage.clear();
  checkout = stubCheckoutServer();
  checkout.seed("sale", [{ bullion_id: "p-1", quantity: 1 }]);
});

let checkout: CheckoutServer;

describe("the sales-order summary", () => {
  test("the basket's items render by name with the order total", async () => {
    renderWithClient(<OrderSummary orderPrices={prices()} />);
    await waitFor(() => expect(screen.getByText("Gold American Eagle")).toBeDefined());
    expect(screen.getByText("Order Total")).toBeDefined();
    await waitFor(() => expect(screen.getAllByText("4714.57").length).toBeGreaterThan(0));
  });

  test("removing an item writes the server's basket", async () => {
    const { container } = renderWithClient(<OrderSummary orderPrices={prices()} />);
    await waitFor(() => expect(screen.getByText("Gold American Eagle")).toBeDefined());
    // lucide's class spelling for Trash2 varies by version; match loosely.
    const trash = [...container.querySelectorAll("button")].find((b) =>
      /trash/.test(b.querySelector("svg")?.getAttribute("class") ?? "")
    );
    expect(trash).toBeTruthy();
    await userEvent.click(trash as HTMLElement);
    await waitFor(() => expect(checkout.lines("sale")).toHaveLength(0));
  });
});
