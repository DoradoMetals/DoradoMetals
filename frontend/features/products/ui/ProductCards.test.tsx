// The two catalogue cards, rendered - the buy side and the sell side.
//
// Same rules as media and spots: jsdom, real component tree, real zustand
// stores, real pricing utils, with the network boundary and the heavy
// presentation libraries (swiper, next/image, NumberFlow) shimmed. What is
// pinned survives the products wire rename: the card shows the product's
// name, prices it off the LIVE spot side it is for (ask to buy, bid to
// sell), and add-to-cart puts the product in the right store keyed so a
// second add increments rather than duplicates.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import ProductCard from "@/features/products/ui/ProductCard";
import BullionCard from "@/features/products/ui/BullionCard";
import type { Product } from "@/features/products/types";

const renderWithClient = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

// One gold eagle, in the CURRENT wire shape. The premiums are exact binary
// fractions so the price strings render without floating-point tails:
// ask 3000 * 1.5 = 4500 to buy, bid 2900 * 0.5 = 1450 to sell - distinct
// enough that a price can only have come from the side it means.
const eagle = (): Product =>
  ({
    id: "p-1",
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

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue(liveSpots());
  localStorage.clear();
  cartStore.setState({ items: [] });
  sellCartStore.setState({ items: [] });
});

describe("the buy card", () => {
  test("shows the product and prices it at ask * premium", async () => {
    renderWithClient(<ProductCard product={eagle()} variants={[]} />);
    expect(screen.getAllByText("Gold American Eagle").length).toBeGreaterThan(0);
    // content 1 * (ask 3000 * ask_premium 1.5)
    await waitFor(() => expect(screen.getAllByText("4500").length).toBeGreaterThan(0));
  });

  test("add to cart puts the product in the cart store, and a second add increments", async () => {
    const { container } = renderWithClient(<ProductCard product={eagle()} variants={[]} />);
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
  test("shows the product and prices it at bid * premium", async () => {
    renderWithClient(<BullionCard product={eagle()} variants={[]} />);
    expect(screen.getAllByText("Gold American Eagle").length).toBeGreaterThan(0);
    // content 1 * (bid 2900 * bid_premium 0.5)
    await waitFor(() => expect(screen.getAllByText("1450").length).toBeGreaterThan(0));
  });

  test("add to sell cart stores a product-kind line", async () => {
    renderWithClient(<BullionCard product={eagle()} variants={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /^add to sell cart$/i }));
    const items = sellCartStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe("product");
  });
});
