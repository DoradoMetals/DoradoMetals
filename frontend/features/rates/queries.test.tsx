// What useUpdateRate actually POSTs, checked against the contract's own
// strict schema. /rates/update parses { rate_id, patch } in strict mode:
// user_name has never been a field of it, and RatesCard.tsx used to send
// 'Dorado Admin' there regardless. This test fails if it reappears.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { z } from "zod/v4";
import { RatePatch } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { useUpdateRate } from "@/features/rates/queries";

// Mirrors api/transport/rates/controller.ts's own UpdateBody exactly.
const UpdateRateBody = z.object({
  rate_id: z.string().uuid(),
  patch: RatePatch.strict().optional(),
}).strict();

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

describe("useUpdateRate sends exactly what /rates/update accepts", () => {
  test("a real edit parses clean against the strict contract", async () => {
    const { result } = renderHook(() => useUpdateRate(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        rate_id: "9f1c2b3a-0000-4000-8000-000000000011",
        patch: { min_qty: 1, max_qty: 10, scrap_pct: 0.9, bullion_pct: 0.95 },
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/rates/update");
    expect(UpdateRateBody.safeParse(body).success).toBe(true);
  });

  test("never carries user_name - the strict schema would 400 on it", async () => {
    const { result } = renderHook(() => useUpdateRate(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        rate_id: "9f1c2b3a-0000-4000-8000-000000000011",
        patch: { min_qty: 1 },
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, , body] = vi.mocked(apiRequest).mock.calls[0];
    expect(body).not.toHaveProperty("user_name");

    const withUserName = { ...(body as object), user_name: "Dorado Admin" };
    expect(UpdateRateBody.safeParse(withUserName).success).toBe(false);
  });
});
