// The image uploader, rendered.
//
// FIRST COMPONENT RENDER TEST IN THIS REPO. The eleven Playwright specs drive a
// real browser against a live API; this lane is the one below it - jsdom, the
// real component tree, the real react-query hook, with ONLY the network
// boundary replaced. Mocking any deeper (the upload hook, the mutation) would
// render a test that passes while the wiring between them is broken, which is
// the vacuous-test class the API side spent a night rooting out.
//
// What is pinned: choosing a file sends the upload request with the fields the
// API's presign flow needs, the mutation states show, and the second PUT - the
// browser-to-storage upload - goes to the presigned url the API returned, not
// to the API.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import userEvent from "@testing-library/user-event";
import React from "react";

// The network boundary, and nothing else.
vi.mock("@/shared/queries/axios", () => ({
  apiRequest: vi.fn(),
}));
// The session hook reads better-auth's client; a component test supplies the
// user the same way shared/testing/session.js does on the API side.
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "admin" } }),
}));
// next/image demands the Next runtime; a plain img is the same contract here.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement("img", { ...props, alt: String(props.alt ?? "") }),
}));
// jsdom has no fetch-to-storage; the direct PUT is asserted, not performed.
const putSpy = vi.fn(async () => ({ ok: true }));
vi.stubGlobal("fetch", putSpy);

import { apiRequest } from "@/shared/queries/axios";
import { ImageUpload } from "@/features/media/ui/ImageUpload";

const aFile = () =>
  new File(["png-bytes"], "front.png", { type: "image/png" });

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  putSpy.mockClear();
});

describe("uploading an image", () => {
  test("choosing a file asks the API for a presigned slot with the file's real facts", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id: "img-1", uploadUrl: "https://storage/put-here" });
    const { container } = renderWithClient(<ImageUpload path="products/gold-eagle/" />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await userEvent.upload(input, aFile());

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [method, url, body] = vi.mocked(apiRequest).mock.calls[0] as [
      string, string, Record<string, unknown>
    ];
    expect(method).toBe("POST");
    expect(url).toBe("/images/upload");
    // The presign flow needs these to build the object key and the row; a
    // misspelled field here is a null column and a broken storage path.
    expect(body).toMatchObject({
      path: "products/gold-eagle/",
      filename: "front.png",
      mimeType: "image/png",
      user_id: "u-1",
    });
    expect(typeof body.size).toBe("number");
  });

  test("the bytes go to the presigned url, not to the API", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id: "img-2", uploadUrl: "https://storage/put-here" });
    const { container } = renderWithClient(<ImageUpload path="p/" />);

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      aFile()
    );

    await waitFor(() => expect(putSpy).toHaveBeenCalled());
    const [putUrl, init] = putSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(putUrl).toBe("https://storage/put-here");
    expect(init.method).toBe("PUT");
  });

  test("a failed presign shows the failure instead of pretending", async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error("no bucket"));
    const { container } = renderWithClient(<ImageUpload path="p/" />);

    await userEvent.upload(
      container.querySelector('input[type="file"]') as HTMLInputElement,
      aFile()
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    // The component must not report success: no success icon, and no PUT to
    // storage for an upload that never got a slot.
    expect(putSpy).not.toHaveBeenCalled();
  });
});
