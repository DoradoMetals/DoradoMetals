// What useCreateAddress and useUpdateAddress actually POST, checked against
// @dorado/contracts' places.addresses.CreateBody/places.addresses.UpdateBody in strict mode. The
// contracts lane dropped is_valid/is_residential from the address body (both
// are server-controlled); splitFormValues used to spread whatever the form
// carried, which also leaked created_at/updated_at into an UPDATE (the form's
// initial values come from the read row, which has both). This file fails if
// any of the four reappears.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { places } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({
    user: { id: "9f1c2b3a-0000-4000-8000-000000000099", role: "user" },
  }),
}));

import { apiRequest } from "@/shared/queries/axios";
import { useCreateAddress, useUpdateAddress } from "@/features/addresses/queries";
import type { AddressFormValues } from "@/features/addresses/types";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// Shaped like the form AFTER editing an EXISTING address: initialValues in
// AddressForm.tsx spreads the full read row, so created_at/updated_at ride
// along as real strings, not undefined - the exact leak this test guards.
const editedFormValues = (): AddressFormValues =>
  ({
    id: "9f1c2b3a-0000-4000-8000-000000000005",
    line_1: "1 Maple St",
    line_2: "",
    city: "Dallas",
    state: "TX",
    country: "United States",
    country_code: "US",
    zip: "75201",
    phone_number: "5551112222",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    label: "Home",
    default_shipping: true,
  } as AddressFormValues);

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ address: {}, user_address: {} });
});

describe("useCreateAddress sends exactly what /addresses/create accepts", () => {
  test("parses clean and never carries is_valid/is_residential", async () => {
    const { result } = renderHook(() => useCreateAddress(), { wrapper });
    const values = editedFormValues();
    // A create has no id yet, matching the form's own empty state.
    delete (values as { id?: string }).id;

    await act(async () => {
      await result.current.mutateAsync(values);
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/addresses/create");

    expect(places.addresses.CreateBody.safeParse(body).success).toBe(true);

    const b = body as { address: Record<string, unknown> };
    expect(b.address).not.toHaveProperty("is_valid");
    expect(b.address).not.toHaveProperty("is_residential");
    expect(b.address).not.toHaveProperty("created_at");
    expect(b.address).not.toHaveProperty("updated_at");

    // Proven: naming either retired field would fail the same parse.
    const withRetired = { ...b, address: { ...b.address, is_valid: true, is_residential: false } };
    expect(places.addresses.CreateBody.safeParse(withRetired).success).toBe(false);
  });
});

describe("useUpdateAddress sends exactly what /addresses/update accepts", () => {
  test("editing an EXISTING address never leaks created_at/updated_at/is_valid/is_residential", async () => {
    const { result } = renderHook(() => useUpdateAddress(), { wrapper });
    const values = { ...editedFormValues(), id: "9f1c2b3a-0000-4000-8000-000000000005" };

    await act(async () => {
      await result.current.mutateAsync(values);
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/addresses/update");

    const parsed = places.addresses.UpdateBody.safeParse(body);
    expect(parsed.success).toBe(true);

    const b = body as { address: Record<string, unknown> };
    for (const retired of ["is_valid", "is_residential", "created_at", "updated_at"]) {
      expect(b.address).not.toHaveProperty(retired);
    }
    expect(b.address.id).toBe("9f1c2b3a-0000-4000-8000-000000000005");
  });
});
