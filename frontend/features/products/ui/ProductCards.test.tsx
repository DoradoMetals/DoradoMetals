// The two catalogue cards, rendered - the buy side and the sell side.
//
// Same rules as media and spots: jsdom, real component tree, real query cache,
// real quote hook, with the network boundary and the heavy presentation
// libraries (next/image, NumberFlow) shimmed. What is pinned survives
// the quotes conversion: the card shows the product's name, its price is the
// SERVER'S QUOTED unit_price for the side it is for (ask to buy, bid to sell)
// and never a client computation, and add-to-cart puts the product in the right
// BASKET keyed so a second add increments rather than duplicates.
//
// THE BASKET IS THE SERVER'S NOW (ruling 63). There is no zustand store to read
// after a click: `stubCheckoutServer` stands in for /checkout/items, so the
// hooks, the cache and the line arithmetic under the button are all the real
// ones and the assertion is about the rows the API was told to hold.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({ useGetSession: () => ({ user: null }) }));
// A visitor has a session too - an anonymous one (ruling 63) - so the basket
// reads are enabled exactly as they are for a customer.
vi.mock("@/features/auth/authClient", () => ({
  useUser: () => ({ user: { id: "visitor-1" }, session: null, error: null, isPending: false }),
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
import { stubCheckoutServer, type CheckoutServer } from "@/shared/tests/checkoutServer";
import { useCatalogQuote } from "@/features/quotes/queries";
import { catalogQuoteItems, unitPricesById } from "@/features/quotes/catalogPrices";
import ProductCard from "@/features/products/ui/ProductCard";
import BullionCard from "@/features/products/ui/BullionCard";
import type { Product } from "@/features/products/types";

// One gold eagle, in the CURRENT wire shape. The card's price comes from the
// quote, so the product's own bid/ask premium columns exist only to feed the
// accidental client math this file guards against.
const eagle = (): Product =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Gold American Eagle",
    description: "One ounce of gold",
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
    is_generic: false,
    variant_label: "",
    legal_tender: true,
    domestic_tender: true,
  } as Product);

const liveSpots = () => [
  { id: "m-au", name: "Gold", ask: 3000, bid: 2900, dollar_change: 1, percent_change: 0.1 },
];

// The quoted unit prices are DELIBERATELY not what the client math would
// compute from the fixture spots (content * 3000 * 1.5 = 4500 ask,
// content * 2900 * 0.5 = 1450 bid): a card showing 4501.25 or 1449.75 can
// only have read the quote, never multiplied a bid/ask premium itself.
const quotedLine = (id: string, side: "ask" | "bid") => {
  const unit_price = side === "ask" ? 4501.25 : 1449.75;
  return { id, quantity: 1, unit_price, line_total: unit_price };
};

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  // URL-discriminated: the spot ticker and the quote surface are different
  // endpoints answering different questions, and the quote answers by side.
  vi.mocked(apiRequest).mockImplementation(async (_m, url, body) => {
    if (url === "/spots/spot_prices") return liveSpots();
    if (url === "/quotes/catalog") {
      const { items, side } = body as { items: { id: string }[]; side: "ask" | "bid" };
      const lines = items.map((i) => quotedLine(i.id, side));
      return {
        side,
        spots_at: "2026-08-27T00:00:00.000Z",
        items: lines,
        total: lines.reduce((acc, l) => acc + l.line_total, 0),
      };
    }
    return {};
  });
  localStorage.clear();
  checkout = stubCheckoutServer();
});

let checkout: CheckoutServer;

// The cards take their prices as a map the PAGE quotes once for the whole
// grid (app/buy/page.tsx, BullionTab). These harnesses are that page logic at
// its smallest: the same hook, the same helpers, one group.
function QuotedProductCard({ product, variants }: { product: Product; variants: Product[] }) {
  const { data } = useCatalogQuote(catalogQuoteItems([{ default: product, variants }]), "ask");
  return <ProductCard product={product} variants={variants} unitPrices={unitPricesById(data)} />;
}

function QuotedBullionCard({ product, variants }: { product: Product; variants: Product[] }) {
  const { data } = useCatalogQuote(catalogQuoteItems([{ default: product, variants }]), "bid");
  return <BullionCard product={product} variants={variants} unitPrices={unitPricesById(data)} />;
}

describe("the buy card", () => {
  test("shows the product and prices it at the quoted ask unit_price", async () => {
    renderWithClient(<QuotedProductCard product={eagle()} variants={[]} />);
    expect(screen.getAllByText("Gold American Eagle").length).toBeGreaterThan(0);
    // The server's number, not content * ask * premium (which would be 4500).
    await waitFor(() => expect(screen.getAllByText("4501.25").length).toBeGreaterThan(0));
  });

  test("add to checkout puts the product in the sale basket, and a second add increments", async () => {
    const { container } = renderWithClient(
      <ProductCard product={eagle()} variants={[]} unitPrices={{}} />
    );
    // The whole card is role="button" and its accessible name contains every
    // word on it - anchor the match so it can only be the real control.
    await userEvent.click(screen.getByRole("button", { name: /^add to checkout$/i }));
    await waitFor(() => expect(checkout.lines("sale")).toHaveLength(1));
    expect(checkout.lines("sale")[0].quantity).toBe(1);

    // With one in the basket the labelled button becomes -/+ steppers; the
    // plus is icon-only, so it is found by its lucide class.
    const plus = [...container.querySelectorAll("button")].find((b) =>
      b.querySelector("svg.lucide-plus")
    );
    expect(plus).toBeTruthy();
    await userEvent.click(plus as HTMLElement);
    await waitFor(() => expect(checkout.lines("sale")[0].quantity).toBe(2));
    expect(checkout.lines("sale")).toHaveLength(1);
  });
});

describe("the sell card", () => {
  test("shows the product and prices it at the quoted bid unit_price", async () => {
    renderWithClient(<QuotedBullionCard product={eagle()} variants={[]} />);
    expect(screen.getAllByText("Gold American Eagle").length).toBeGreaterThan(0);
    // The server's number, not content * bid * premium (which would be 1450).
    await waitFor(() => expect(screen.getAllByText("1449.75").length).toBeGreaterThan(0));
  });

  test("add to the purchase basket stores a line naming the product", async () => {
    renderWithClient(<BullionCard product={eagle()} variants={[]} unitPrices={{}} />);
    await userEvent.click(screen.getByRole("button", { name: /^sell to us$/i }));
    await waitFor(() => expect(checkout.lines("purchase")).toHaveLength(1));
    const items = checkout.lines("purchase");
    expect(items[0].bullion_id).toBe(eagle().id);
    // A bullion line names an id and a quantity and nothing else: the API
    // refuses one that spells its own weights (ruling 43), so toNewCheckoutItem
    // strips the snapshot the card carries for its own rendering.
    expect(items[0].pre_melt).toBeUndefined();
    expect(items[0].purity).toBeUndefined();
  });
});
