// The sales-order checkout summary, rendered - the last thing a customer
// reads before paying.
//
// Written BEFORE the quote switch (Jacob's no-previews ruling): today the
// totals arrive as a client-computed prop; after the switch they arrive from
// POST /quotes/sales_order. What is pinned survives that: the items in the
// cart render by name, the order total renders from the prop, and removing
// an item goes through the cart store. The fixture is the only thing that
// speaks the totals' field names, so it converts WITH the switch.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "user", name: "Cust" } }),
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
vi.mock("@/shared/ui/PriceNumberFlow", () => ({
  default: ({ value, className }: { value: number; className?: string }) =>
    React.createElement("span", { className }, String(value)),
}));

import { apiRequest } from "@/shared/queries/axios";
import { cartStore } from "@/shared/store/cartStore";
import OrderSummary from "@/features/checkout/sales-order-checkout/summary/orderSummary";
import type { SalesOrderTotals } from "@/features/orders/salesOrders/types";
import type { Product } from "@/features/products/types";

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

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
    variant_group: "",
    shadow_offset: 0,
    slug: "gold-american-eagle",
    sell_display: true,
    is_generic: false,
    variant_label: null,
    legal_tender: true,
    domestic_tender: true,
    quantity: 1,
  } as Product);

// Distinct values so an assertion can only match the field it means.
const prices = (): SalesOrderTotals =>
  ({
    itemTotal: 4500,
    baseTotal: 4577.25,
    shippingCharge: 25,
    beginningFunds: 0,
    appliedFunds: 0,
    endingFunds: 0,
    subjectToChargesAmount: 4577.25,
    postChargesAmount: 4714.57,
    surchargeAmount: 137.32,
    salesTax: 52.25,
    orderTotal: 4714.57,
  } as unknown as SalesOrderTotals);

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue([
    { id: "m-au", name: "Gold", ask: 3000, bid: 2900, dollar_change: 1, percent_change: 0.1 },
  ]);
  localStorage.clear();
  cartStore.setState({ items: [eagle()] });
});

describe("the sales-order summary", () => {
  test("the cart's items render by name with the order total", async () => {
    renderWithClient(<OrderSummary orderPrices={prices()} />);
    expect(screen.getByText("Gold American Eagle")).toBeDefined();
    expect(screen.getByText("Order Total")).toBeDefined();
    await waitFor(() => expect(screen.getAllByText("4714.57").length).toBeGreaterThan(0));
  });

  test("removing an item goes through the cart store", async () => {
    const { container } = renderWithClient(<OrderSummary orderPrices={prices()} />);
    // lucide's class spelling for Trash2 varies by version; match loosely.
    const trash = [...container.querySelectorAll("button")].find((b) =>
      /trash/.test(b.querySelector("svg")?.getAttribute("class") ?? "")
    );
    expect(trash).toBeTruthy();
    await userEvent.click(trash as HTMLElement);
    expect(cartStore.getState().items).toHaveLength(0);
  });
});
