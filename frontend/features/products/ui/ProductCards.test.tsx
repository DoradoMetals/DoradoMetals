// The two catalogue cards, rendered - the buy side and the sell side.
//
// Same rules as media and spots: jsdom, real component tree, real zustand
// stores, real quote hook, with the network boundary and the heavy
// presentation libraries (swiper, next/image, NumberFlow) shimmed. What is
// pinned survives the quotes conversion: the card shows the product's name,
// its price is the SERVER'S QUOTED unit_price for the side it is for (ask to
// buy, bid to sell) and never a client computation, and add-to-cart puts the
// product in the right store keyed so a second add increments rather than
// duplicates.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({ useGetSession: () => ({ user: null }) }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { src: props.src, alt: String(props.alt ?? "") }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Swiper is a browser carousel; in jsdom it renders nothing measurable. The
// slides become plain divs so their contents stay in the tree.
vi.mock("swiper/react", () => ({
  Swiper: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
  SwiperSlide: ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children),
}));
vi.mock("swiper/modules", () => ({ Navigation: {}, Pagination: {} }));
vi.mock("swiper/css", () => ({}));
vi.mock("swiper/css/navigation", () => ({}));
vi.mock("swiper/css/pagination", () => ({}));
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
import { sellCartStore } from "@/shared/store/sellCartStore";
import { useCatalogQuote } from "@/features/quotes/queries";
import { catalogQuoteItems, unitPricesById } from "@/features/quotes/catalogPrices";
import ProductCard from "@/features/products/ui/ProductCard";
import BullionCard from "@/features/products/ui/BullionCard";
import type { Product } from "@/features/products/types";

// One gold eagle, in the CURRENT wire shape. The card's price comes from the
// quote, so the product's own premiums exist only to feed the accidental
// client math this file guards against.
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
    sell_display: true,
    is_generic: false,
    variant_label: null,
    legal_tender: true,
    domestic_tender: true,
  } as Product);

const liveSpots = () => [
  { id: "m-au", name: "Gold", ask: 3000, bid: 2900, dollar_change: 1, percent_change: 0.1 },
];

// The quoted unit prices are DELIBERATELY not what the client math would
// compute from the fixture spots (content * 3000 * 1.5 = 4500 ask,
// content * 2900 * 0.5 = 1450 bid): a card showing 4501.25 or 1449.75 can
// only have read the quote, never multiplied premiums itself.
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
  cartStore.setState({ items: [] });
  sellCartStore.setState({ items: [] });
});

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

  test("add to cart puts the product in the cart store, and a second add increments", async () => {
    const { container } = renderWithClient(
      <ProductCard product={eagle()} variants={[]} unitPrices={{}} />
    );
    // The whole card is role="button" and its accessible name contains every
    // word on it - anchor the match so it can only be the real control.
    await userEvent.click(screen.getByRole("button", { name: /^add to cart$/i }));
    expect(cartStore.getState().items).toHaveLength(1);
    expect(cartStore.getState().items[0].quantity).toBe(1);

    // With one in the cart the labelled button becomes -/+ steppers; the
    // plus is icon-only, so it is found by its lucide class.
    const plus = [...container.querySelectorAll("button")].find((b) =>
      b.querySelector("svg.lucide-plus")
    );
    expect(plus).toBeTruthy();
    await userEvent.click(plus as HTMLElement);
    expect(cartStore.getState().items).toHaveLength(1);
    expect(cartStore.getState().items[0].quantity).toBe(2);
  });
});

describe("the sell card", () => {
  test("shows the product and prices it at the quoted bid unit_price", async () => {
    renderWithClient(<QuotedBullionCard product={eagle()} variants={[]} />);
    expect(screen.getAllByText("Gold American Eagle").length).toBeGreaterThan(0);
    // The server's number, not content * bid * premium (which would be 1450).
    await waitFor(() => expect(screen.getAllByText("1449.75").length).toBeGreaterThan(0));
  });

  test("add to sell cart stores a product-kind line", async () => {
    renderWithClient(<BullionCard product={eagle()} variants={[]} unitPrices={{}} />);
    await userEvent.click(screen.getByRole("button", { name: /^add to sell cart$/i }));
    const items = sellCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("product");
  });
});
