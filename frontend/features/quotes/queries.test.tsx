// What useSalesOrderQuote and usePurchaseOrderQuote actually POST, checked
// against @dorado/contracts' SalesOrderQuoteBody/PurchaseOrderQuoteBody in
// strict mode. The contracts lane replaced `shipping_service`/
// `payment_method` (codes/types) with `carrier_service_id`/
// `payment_method_id`, replaced a scrap line's metal NAME with `metal_id`,
// dropped a scrap line's `content` (server-derived), and dropped
// `using_funds` from the sales body entirely - this file fails if any of
// those reappear.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { PurchaseOrderQuoteBody, SalesOrderQuoteBody } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-customer", role: "customer" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { useSalesOrderQuote, usePurchaseOrderQuote } from "@/features/quotes/queries";
import type { CheckoutLine } from "@/features/checkout/items/types";

const SALE_SERVICE_ID = "9f1c2b3a-0000-4000-8000-000000000031";
const SALE_METHOD_ID = "9f1c2b3a-0000-4000-8000-000000000032";
const PRODUCT_ID = "9f1c2b3a-0000-4000-8000-000000000033";
const ADDRESS_ID = "9f1c2b3a-0000-4000-8000-000000000034";
const GOLD_ID = "9f1c2b3a-0000-4000-8000-000000000035";
const PURCHASE_METHOD_ID = "9f1c2b3a-0000-4000-8000-000000000036";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const aLine = (over: Partial<CheckoutLine>): CheckoutLine => ({
  id: "line",
  quantity: 1,
  ...over,
});

const aProductItem = (): CheckoutLine =>
  aLine({ id: PRODUCT_ID, bullion_id: PRODUCT_ID, quantity: 2 });

const aScrapItem = (): CheckoutLine =>
  aLine({ id: "lot", metal_id: GOLD_ID, pre_melt: 10, purity: 0.585, unit: "g" });

// THE METHOD ROWS COME THROUGH @dorado/client NOW, which owns its own `fetch`
// and never touches the legacy axios wrapper - so the reference read is
// stubbed at `fetch` and the quote POSTs stay on the mocked apiRequest. Both
// halves have to be answered or the hook that resolves a code to an id has
// nothing to resolve against.
const json = (body: unknown): Response =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(String(input), "http://test.local");
    if (url.pathname.endsWith("/payments/methods")) {
      return json(
        url.searchParams.get("direction") === "purchase"
          ? [{ id: PURCHASE_METHOD_ID, type: "ACH" }]
          : [{ id: SALE_METHOD_ID, type: "CARD" }]
      );
    }
    return json({});
  }));

  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (_method, url) => {
    if (url === "/carrier_services/sale_options") {
      return [{ id: SALE_SERVICE_ID, code: "STANDARD" }];
    }
    if (url === "/spots/spot_prices") {
      return [{ id: GOLD_ID, name: "Gold", ask: 2000, bid: 1990 }];
    }
    return {};
  });
});

describe("useSalesOrderQuote sends exactly what /quotes/sales_order accepts", () => {
  test("resolves carrier_service_id/payment_method_id and never carries using_funds", async () => {
    renderHook(
      () =>
        useSalesOrderQuote({
          items: [{ id: PRODUCT_ID, quantity: 1 }],
          shipping_service: "STANDARD",
          payment_method: "CARD",
          address_id: ADDRESS_ID,
        }),
      { wrapper }
    );

    await waitFor(() => {
      const call = vi.mocked(apiRequest).mock.calls.find(([, url]) => url === "/quotes/sales_order");
      expect(call).toBeTruthy();
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === "/quotes/sales_order")!;
    const body = call[2] as Record<string, unknown>;

    expect(SalesOrderQuoteBody.strict().safeParse(body).success).toBe(true);
    expect(body.carrier_service_id).toBe(SALE_SERVICE_ID);
    expect(body.payment_method_id).toBe(SALE_METHOD_ID);

    for (const retired of ["using_funds", "shipping_service", "payment_method"]) {
      expect(body).not.toHaveProperty(retired);
    }

    // Proven: using_funds returning would fail the same parse.
    expect(
      SalesOrderQuoteBody.strict().safeParse({ ...body, using_funds: true }).success
    ).toBe(false);
  });
});

describe("usePurchaseOrderQuote sends exactly what /quotes/purchase_order accepts", () => {
  test("resolves bullion_id, metal_id and payout_method_id, and drops content", async () => {
    renderHook(
      () =>
        usePurchaseOrderQuote([aProductItem(), aScrapItem()], {
          payout_method: "ACH",
          shipping_charge: 12,
        }),
      { wrapper }
    );

    await waitFor(() => {
      const call = vi
        .mocked(apiRequest)
        .mock.calls.find(([, url]) => url === "/quotes/purchase_order");
      expect(call).toBeTruthy();
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === "/quotes/purchase_order")!;
    const body = call[2] as {
      items: Record<string, unknown>[];
      payout_method_id?: string;
      shipping_charge?: number;
    };

    expect(PurchaseOrderQuoteBody.strict().safeParse(body).success).toBe(true);
    expect(body.items[0]).toMatchObject({ type: "product", bullion_id: PRODUCT_ID, quantity: 2 });
    expect(body.items[1]).toMatchObject({
      type: "scrap",
      metal_id: GOLD_ID,
      pre_melt: 10,
      purity: 0.585,
      unit: "g",
    });
    for (const retired of ["content", "gross_unit", "metal", "id"]) {
      expect(body.items[1]).not.toHaveProperty(retired);
    }
    expect(body.payout_method_id).toBe(PURCHASE_METHOD_ID);
    expect(body).not.toHaveProperty("payout_method");

    // Proven: a scrap line naming content would fail the same parse.
    const poisoned = { ...body, items: [body.items[0], { ...body.items[1], content: 5.85 }] };
    expect(PurchaseOrderQuoteBody.strict().safeParse(poisoned).success).toBe(false);
  });
});
