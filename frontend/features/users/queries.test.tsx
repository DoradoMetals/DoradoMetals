// What useUpdateCredit actually POSTs, checked against @dorado/contracts'
// UpdateCreditBody in strict mode. The contracts lane dropped `mode` (an
// earlier field the service had already stopped reading) and made an
// unrecognized key a 400 rather than a silent no-op; a grep found no `mode`
// in this hook's body, but nothing had proven it. This pins that.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { UpdateCreditBody } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { useUpdateCredit } from "@/features/users/queries";

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

describe("useUpdateCredit sends exactly what /users/update_credit accepts", () => {
  test("{ user_id, op, amount } parses clean, and never carries mode", async () => {
    const { result } = renderHook(() => useUpdateCredit(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        user_id: "9f1c2b3a-0000-4000-8000-000000000012",
        op: "add",
        amount: 50,
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/users/update_credit");
    expect(UpdateCreditBody.safeParse(body).success).toBe(true);

    expect(body).not.toHaveProperty("mode");
    const withMode = { ...(body as object), mode: "add" };
    expect(UpdateCreditBody.safeParse(withMode).success).toBe(false);
  });
});
