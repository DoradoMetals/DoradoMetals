// What useUploadImage and useDeleteImage actually send on the wire, checked
// against @dorado/contracts' MediaUploadBody in strict mode.
//
// D214 item 4 made this REST: POST /images (was /images/upload) mints the
// row, and DELETE /images/:id (was /images/delete with an { id } body) takes
// no body at all - the id is in the path now, so MediaDeleteBody has nothing
// left to check here.
//
// The hooks live in @dorado/client now and build their request with that
// package's own `apiRequest` (a thin wrapper over the global `fetch`, not
// axios), and the upload flow's SECOND call - the presigned PUT - is a raw
// `fetch` by design (a direct write to cloud storage, not our API). Both
// calls go through the global `fetch`, so this test stubs that directly
// rather than mocking `@/shared/queries/axios`, which the new hooks never
// call.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MediaUploadBody } from "@dorado/contracts";

import { useUploadImage, useDeleteImage } from "@/features/media/queries";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function stubFetchForUpload() {
  const fetchMock = vi
    .fn()
    // Call 1: POST /images, through @dorado/client's apiRequest - mints the row.
    .mockResolvedValueOnce({
      ok: true,
      text: async () => JSON.stringify({ id: "img-1", uploadUrl: "https://bucket/put" }),
    })
    // Call 2: the raw PUT straight to the presigned URL.
    .mockResolvedValueOnce({ ok: true, text: async () => "" });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  stubFetchForUpload();
});

describe("useUploadImage sends exactly what POST /images accepts", () => {
  test("mints against a body that parses clean against the strict contract", async () => {
    const { result } = renderHook(() => useUploadImage(), { wrapper });
    const file = new File(["x"], "chain.jpg", { type: "image/jpeg" });

    await act(async () => {
      await result.current.mutateAsync({ path: "/test/", file });
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [mintUrl, mintInit] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(mintUrl).toMatch(/\/images$/);
    expect(mintInit.method).toBe("POST");

    const body: unknown = JSON.parse(mintInit.body as string);
    expect(MediaUploadBody.strict().safeParse(body).success).toBe(true);
  });

  test("never carries path, user_id or the old camelCase names", async () => {
    const { result } = renderHook(() => useUploadImage(), { wrapper });
    const file = new File(["x"], "chain.jpg", { type: "image/jpeg" });

    await act(async () => {
      await result.current.mutateAsync({ path: "/test/", file });
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [, mintInit] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const b = JSON.parse(mintInit.body as string) as Record<string, unknown>;
    expect(b).not.toHaveProperty("path");
    expect(b).not.toHaveProperty("user_id");
    expect(b).not.toHaveProperty("mimeType");
    expect(b).not.toHaveProperty("size");

    const withRetired = { ...b, path: "/test/", user_id: "u-1" };
    expect(MediaUploadBody.strict().safeParse(withRetired).success).toBe(false);
  });

  test("the second call PUTs the file straight to the presigned URL, not through the API", async () => {
    const { result } = renderHook(() => useUploadImage(), { wrapper });
    const file = new File(["x"], "chain.jpg", { type: "image/jpeg" });

    await act(async () => {
      await result.current.mutateAsync({ path: "/test/", file });
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [putUrl, putInit] = vi.mocked(fetch).mock.calls[1] as [string, RequestInit];
    expect(putUrl).toBe("https://bucket/put");
    expect(putInit.method).toBe("PUT");
    expect(putInit.body).toBe(file);
  });
});

describe("useDeleteImage sends exactly what DELETE /images/:id accepts", () => {
  test("deletes by path segment, with no body at all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "" })
    );
    const { result } = renderHook(() => useDeleteImage(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("9f1c2b3a-0000-4000-8000-000000000010");
    });

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/images\/9f1c2b3a-0000-4000-8000-000000000010$/);
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
  });
});
