// What useUpdateReview actually PUTS on the wire, checked against the
// contract's own strict schema. The contracts lane made /reviews/update
// parse { review_id, patch } in strict mode: user_name is no longer a field.
// This test fails if that field ever creeps back in.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { z } from "zod/v4";
import { ReviewPatch } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { useUpdateReview } from "@/features/reviews/queries";

// Mirrors api/transport/reviews/controller.ts's own UpdateBody exactly.
const UpdateReviewBody = z.object({
  review_id: z.string().uuid(),
  patch: ReviewPatch.strict().optional(),
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

describe("useUpdateReview sends exactly what /reviews/update accepts", () => {
  test("a real edit parses clean against the strict contract", async () => {
    const { result } = renderHook(() => useUpdateReview(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        review_id: "9f1c2b3a-0000-4000-8000-000000000002",
        patch: { hidden: true },
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/reviews/update");

    expect(UpdateReviewBody.safeParse(body).success).toBe(true);
  });

  // The regression this test exists for: the hook used to also send
  // user_name, which the strict contract has never declared.
  test("never carries user_name - the strict schema would 400 on it", async () => {
    const { result } = renderHook(() => useUpdateReview(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        review_id: "9f1c2b3a-0000-4000-8000-000000000002",
        patch: { name: "Edited Name" },
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, , body] = vi.mocked(apiRequest).mock.calls[0];
    expect(body).not.toHaveProperty("user_name");

    const withUserName = { ...(body as object), user_name: "Dorado Admin" };
    expect(UpdateReviewBody.safeParse(withUserName).success).toBe(false);
  });
});
