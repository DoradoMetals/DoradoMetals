// What usePatchPayout actually PATCHes, checked against @dorado/contracts'
// exchange.payouts.Patch in strict mode. The body shape did not change in streamline-a -
// {cost?, method?, waive_payout_fee?} was already the contract's own - but
// the contract itself moved to `.strict()` at transport, so this pins that
// an unrecognized field (a bank number, an id, anything the drawer never
// meant to send) fails the same parse rather than being silently dropped.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { exchange } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { usePatchPayout } from "@/features/payouts/queries";

const PAYOUT_ID = "9f1c2b3a-0000-4000-8000-000000000041";
const ORDER_ID = "9f1c2b3a-0000-4000-8000-000000000042";

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

describe("usePatchPayout sends exactly what PATCH /payouts/:id accepts", () => {
  test("{cost, waive_payout_fee} parses clean, and a bank number fails the same parse", async () => {
    const { result } = renderHook(() => usePatchPayout(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        payout_id: PAYOUT_ID,
        order_id: ORDER_ID,
        patch: { cost: 25, waive_payout_fee: true },
      });
    });

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([, url]) => url === `/payouts/${PAYOUT_ID}`);
    expect(call).toBeTruthy();
    const body = call![2];

    expect(exchange.payouts.Patch.strict().safeParse(body).success).toBe(true);

    // Proven: the bank details never had a write surface here, and naming
    // one fails the same parse rather than being silently dropped.
    const poisoned = { ...(body as object), account_number: "12345" };
    expect(exchange.payouts.Patch.strict().safeParse(poisoned).success).toBe(false);
  });
});
