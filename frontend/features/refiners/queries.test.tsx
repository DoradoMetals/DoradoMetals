// What usePatchRefinerOrder and usePatchRefinerItem actually PATCH, checked
// against @dorado/contracts' RefinerOrderPatch/RefinerItemPatch in strict
// mode. The contracts lane replaced a spot write's `name` with `metal_id`
// (RefinerSpotWrite) - editRefinerValues.tsx sent `{name, bid}` and this
// file fails if that spelling comes back.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RefinerOrderPatch, RefinerItemPatch } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { usePatchRefinerOrder, usePatchRefinerItem } from "@/features/refiners/queries";

const REFINER_ORDER_ID = "9f1c2b3a-0000-4000-8000-000000000051";
const ORDER_ID = "9f1c2b3a-0000-4000-8000-000000000052";
const ORDER_ITEM_ID = "9f1c2b3a-0000-4000-8000-000000000053";
const METAL_ID = "9f1c2b3a-0000-4000-8000-000000000054";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({});
});

describe("usePatchRefinerOrder sends exactly what PATCH /refiners/orders/:id accepts", () => {
  test("a spot write names metal_id, never name", async () => {
    const { result } = renderHook(() => usePatchRefinerOrder(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        refiner_order_id: REFINER_ORDER_ID,
        order_id: ORDER_ID,
        patch: { spots: [{ metal_id: METAL_ID, bid: 1990 }] },
      });
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === `/refiners/orders/${REFINER_ORDER_ID}`);
    expect(call).toBeTruthy();
    const body = call![2] as { spots: Record<string, unknown>[] };

    expect(RefinerOrderPatch.strict().safeParse(body).success).toBe(true);
    expect(body.spots[0]).toEqual({ metal_id: METAL_ID, bid: 1990 });
    expect(body.spots[0]).not.toHaveProperty("name");

    // Proven: the retired `name` spelling fails the same parse.
    const poisoned = { spots: [{ name: "Gold", bid: 1990 }] };
    expect(RefinerOrderPatch.strict().safeParse(poisoned).success).toBe(false);
  });
});

describe("usePatchRefinerItem sends exactly what PATCH /refiners/items/by-order-item/:id accepts", () => {
  test("assay figures parse clean, and content is refused by the contract", async () => {
    const { result } = renderHook(() => usePatchRefinerItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        order_item_id: ORDER_ITEM_ID,
        order_id: ORDER_ID,
        patch: { purity: 0.585, post_melt: 4.2 },
      });
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === `/refiners/items/by-order-item/${ORDER_ITEM_ID}`);
    expect(call).toBeTruthy();
    const body = call![2];

    expect(RefinerItemPatch.strict().safeParse(body).success).toBe(true);

    const poisoned = { ...(body as object), content: 2.4 };
    expect(RefinerItemPatch.strict().safeParse(poisoned).success).toBe(false);
  });
});
