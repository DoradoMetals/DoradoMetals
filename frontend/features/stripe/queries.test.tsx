// What useUpdatePaymentIntent actually POSTs, checked against
// @dorado/contracts' payments.intents.UpdateBody in strict mode. The contracts
// lane replaced `shipping_service`/`payment_method` (a code/type string) with
// `carrier_service_id`/`payment_method_id`, and dropped `using_funds`,
// `spots` and the top-level `user` object entirely - this file fails if any
// of those reappear.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { payments } from "@dorado/contracts";
import type { Product } from "@/features/products/types";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-customer", role: "customer" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { useUpdatePaymentIntent } from "@/features/stripe/queries";
import { usePaymentMethods } from "@/features/payments/queries";
import { useSaleShippingServices } from "@/features/shipping/queries";

const METHOD_ID = "9f1c2b3a-0000-4000-8000-000000000021";
const SERVICE_ID = "9f1c2b3a-0000-4000-8000-000000000022";
const ADDRESS_ID = "9f1c2b3a-0000-4000-8000-000000000023";
const CUSTOMER_ID = "9f1c2b3a-0000-4000-8000-000000000024";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// useUpdatePaymentIntent resolves both ids by reading the same cached
// reference queries this harness renders alongside it (same QueryClient,
// same keys) - waiting on THEIR isSuccess is what proves the resolution has
// real rows to read rather than racing the mutation against the fetches.
function useHarness() {
  return {
    methods: usePaymentMethods("sale"),
    services: useSaleShippingServices(),
    update: useUpdatePaymentIntent(),
  };
}

const anItem = (): Product => ({ id: "9f1c2b3a-0000-4000-8000-000000000025", quantity: 1 } as unknown as Product);

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation(async (_method, url) => {
    if (typeof url === "string" && url.startsWith("/payments/methods")) {
      return [{ id: METHOD_ID, type: "CARD" }];
    }
    if (url === "/carrier_services/sale_options") {
      return [{ id: SERVICE_ID, code: "STANDARD" }];
    }
    return {};
  });
});

describe("useUpdatePaymentIntent sends exactly what /stripe/update_payment_intent accepts", () => {
  test("resolves carrier_service_id/payment_method_id and drops using_funds/spots/user", async () => {
    const { result } = renderHook(() => useHarness(), { wrapper });

    await waitFor(() => {
      expect(result.current.methods.isSuccess).toBe(true);
      expect(result.current.services.isSuccess).toBe(true);
    });

    await act(async () => {
      await result.current.update.mutateAsync({
        items: [anItem()],
        shipping_service: "STANDARD",
        payment_method: "CARD",
        type: "sales_order_checkout",
        address_id: ADDRESS_ID,
      });
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === "/stripe/update_payment_intent");
    expect(call).toBeTruthy();
    const body = call![2] as Record<string, unknown>;

    expect(payments.intents.UpdateBody.strict().safeParse(body).success).toBe(true);
    expect(body.carrier_service_id).toBe(SERVICE_ID);
    expect(body.payment_method_id).toBe(METHOD_ID);

    // A customer's own intent is keyed by session - no user_id at all.
    expect(body).not.toHaveProperty("user_id");
    for (const retired of ["using_funds", "spots", "user", "shipping_service", "payment_method"]) {
      expect(body).not.toHaveProperty(retired);
    }

    // Proven: any retired field returning would fail the same parse.
    expect(
      payments.intents.UpdateBody.strict().safeParse({ ...body, using_funds: false }).success
    ).toBe(false);
  });

  test("an admin caller names the customer as user_id", async () => {
    const { result } = renderHook(() => useHarness(), { wrapper });

    await waitFor(() => {
      expect(result.current.methods.isSuccess).toBe(true);
      expect(result.current.services.isSuccess).toBe(true);
    });

    await act(async () => {
      await result.current.update.mutateAsync({
        items: [anItem()],
        shipping_service: "STANDARD",
        payment_method: "CARD",
        type: "admin",
        address_id: ADDRESS_ID,
        user_id: CUSTOMER_ID,
      });
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === "/stripe/update_payment_intent");
    const body = call![2] as Record<string, unknown>;

    expect(payments.intents.UpdateBody.strict().safeParse(body).success).toBe(true);
    expect(body.user_id).toBe(CUSTOMER_ID);
  });
});
