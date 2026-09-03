// What useUpdateLead actually PUTS on the wire, checked against the
// contract's own strict schema - not against what the hook is typed to
// accept, which would only prove the hook agrees with itself. The contracts
// lane (docs/waves/contracts-shape-changes.md) made /leads/update parse
// { lead_id, patch } in strict mode: user_name is no longer a field, and a
// caller naming it now gets a 400 instead of a silently-ignored key. This
// test fails if that field ever creeps back in.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { z } from "zod/v4";
import { LeadPatch } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { useUpdateLead } from "@/features/leads/queries";

// Mirrors api/transport/leads/controller.ts's own UpdateBody exactly - the
// wrapper isn't exported, so it is restated here from the same source the
// controller reads (@dorado/contracts' LeadPatch) rather than guessed.
const UpdateLeadBody = z.object({
  lead_id: z.string().uuid(),
  patch: LeadPatch.strict().optional(),
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

describe("useUpdateLead sends exactly what /leads/update accepts", () => {
  test("a real edit parses clean against the strict contract", async () => {
    const { result } = renderHook(() => useUpdateLead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lead_id: "9f1c2b3a-0000-4000-8000-000000000001",
        patch: { name: "New Name" },
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/leads/update");

    const parsed = UpdateLeadBody.safeParse(body);
    expect(parsed.success).toBe(true);
  });

  // The regression this test exists for: the hook used to also send
  // user_name, which the strict contract has never declared.
  test("never carries user_name - the strict schema would 400 on it", async () => {
    const { result } = renderHook(() => useUpdateLead(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        lead_id: "9f1c2b3a-0000-4000-8000-000000000001",
        patch: { name: "New Name" },
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, , body] = vi.mocked(apiRequest).mock.calls[0];
    expect(body).not.toHaveProperty("user_name");

    // Proven, not just asserted: naming it would fail the same parse.
    const withUserName = { ...(body as object), user_name: "Dorado Admin" };
    expect(UpdateLeadBody.safeParse(withUserName).success).toBe(false);
  });
});
