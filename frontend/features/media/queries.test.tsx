// What useUploadImage and useDeleteImage actually PUT/DELETE on the wire,
// checked against @dorado/contracts' media.images.UploadBody/media.images.DeleteBody in
// strict mode. The contracts lane dropped `path` and `user_id` from the
// upload body (both were already ignored server-side, now refused) and
// renamed mimeType/size to mime_type/size_bytes; delete lost `user_id`
// (the owner comes from the session). These tests fail if any of the four
// retired fields reappears.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { media } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "user" } }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { useUploadImage, useDeleteImage } from "@/features/media/queries";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ id: "img-1", uploadUrl: "https://bucket/put" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

describe("useUploadImage sends exactly what /images/upload accepts", () => {
  test("a real upload parses clean against the strict contract", async () => {
    const { result } = renderHook(() => useUploadImage(), { wrapper });
    const file = new File(["x"], "chain.jpg", { type: "image/jpeg" });

    await act(async () => {
      await result.current.mutateAsync({ path: "/test/", file });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/images/upload");
    expect(media.images.UploadBody.strict().safeParse(body).success).toBe(true);
  });

  test("never carries path, user_id or the old camelCase names", async () => {
    const { result } = renderHook(() => useUploadImage(), { wrapper });
    const file = new File(["x"], "chain.jpg", { type: "image/jpeg" });

    await act(async () => {
      await result.current.mutateAsync({ path: "/test/", file });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, , body] = vi.mocked(apiRequest).mock.calls[0];
    const b = body as Record<string, unknown>;
    expect(b).not.toHaveProperty("path");
    expect(b).not.toHaveProperty("user_id");
    expect(b).not.toHaveProperty("mimeType");
    expect(b).not.toHaveProperty("size");

    const withRetired = { ...b, path: "/test/", user_id: "u-1" };
    expect(media.images.UploadBody.strict().safeParse(withRetired).success).toBe(false);
  });
});

describe("useDeleteImage sends exactly what /images/delete accepts", () => {
  test("a real delete parses clean, and never carries user_id", async () => {
    const { result } = renderHook(() => useDeleteImage(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("9f1c2b3a-0000-4000-8000-000000000010");
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/images/delete");
    expect(media.images.DeleteBody.strict().safeParse(body).success).toBe(true);

    const b = body as Record<string, unknown>;
    expect(b).not.toHaveProperty("user_id");
    const withUserId = { ...b, user_id: "u-1" };
    expect(media.images.DeleteBody.strict().safeParse(withUserId).success).toBe(false);
  });
});
