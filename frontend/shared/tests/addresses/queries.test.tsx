// WHAT THE ADDRESS WRITES PUT ON THE WIRE, checked against @dorado/contracts'
// AddressWriteBody in strict mode.
//
// The subject moved with the code. `splitFormValues` used to spread whatever
// the form happened to carry, which leaked `created_at`/`updated_at` into an
// UPDATE (the form's initial values came from the read row, which has both) -
// and the address's id rode INSIDE the patch, where it read as a column being
// written. The form names its columns now and the id is the path's, so what is
// left to pin is the request itself: the method, the URL and a body that still
// refuses every server-controlled field.
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AddressWriteBody } from "@dorado/contracts";

import { useCreateAddress, useUpdateAddress } from "@/shared/hooks/addresses/queries";

const ID = "9f1c2b3a-0000-4000-8000-000000000005";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// Exactly what AddressForm builds: two patches, named field by field.
const body = () => ({
  address: {
    line_1: "1 Maple St",
    line_2: "",
    city: "Dallas",
    state: "TX",
    country: "United States",
    country_code: "US",
    zip: "75201",
    phone_number: "5551112222",
  },
  user_address: { recipient_name: "Ada Lovelace", label: "Home", default_shipping: true },
});

const calls = () =>
  vi.mocked(globalThis.fetch as unknown as (...a: unknown[]) => unknown).mock.calls;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, text: async () => "{}" }))
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("the address writes", () => {
  test("a create POSTs /addresses with a body the contract accepts", async () => {
    const { result } = renderHook(() => useCreateAddress(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(body());
    });
    await waitFor(() => expect(calls().length).toBeGreaterThan(0));

    const [url, init] = calls()[0] as [string, RequestInit];
    expect(url).toContain("/addresses");
    expect(init.method).toBe("POST");

    const sent = JSON.parse(String(init.body));
    expect(AddressWriteBody.safeParse(sent).success).toBe(true);
    for (const retired of ["is_valid", "is_residential", "created_at", "updated_at", "id"]) {
      expect(sent.address).not.toHaveProperty(retired);
    }
  });

  test("an update PATCHes /addresses/:id and never carries the id in the body", async () => {
    const { result } = renderHook(() => useUpdateAddress(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ address_id: ID, body: body() });
    });
    await waitFor(() => expect(calls().length).toBeGreaterThan(0));

    const [url, init] = calls()[0] as [string, RequestInit];
    expect(url).toContain(`/addresses/${ID}`);
    expect(init.method).toBe("PATCH");

    const sent = JSON.parse(String(init.body));
    expect(AddressWriteBody.safeParse(sent).success).toBe(true);
    for (const retired of ["is_valid", "is_residential", "created_at", "updated_at", "id"]) {
      expect(sent.address).not.toHaveProperty(retired);
    }
  });

  // Proven: naming a retired field would fail the same parse, so the two loops
  // above are checking something a strict schema really refuses.
  test("the contract refuses the fields the form no longer sends", () => {
    const withRetired = {
      address: { ...body().address, is_valid: true },
      user_address: body().user_address,
    };
    expect(AddressWriteBody.safeParse(withRetired).success).toBe(false);
    const withId = { address: { ...body().address, id: ID }, user_address: body().user_address };
    expect(AddressWriteBody.safeParse(withId).success).toBe(false);
  });
});
