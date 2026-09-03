// What every shipping/operations hook actually POSTs, checked against
// @dorado/contracts' strict bodies (streamline B, D214 item 11). The seven
// operations took a raw address/package object before; every one now takes
// ids for what the server holds (address_id through places.addresses,
// package_id through shipping.packages) plus the one genuine measurement
// nothing else stores (weight). Three of these tests exist because the old
// bodies would 400 under strict parsing and did not before:
//   - useTracking sent tracking_number/carrier_id that ShippingGetTrackingBody
//     never declared (the server reads both off the shipment row by id).
//   - useShippingCancelLabel sent a tracking_number ShippingCancelLabelBody
//     never declared.
//   - useShippingCancelPickup nested its whole body under an `input` key
//     ({ input: {...} }) instead of sending the fields at the top level, and
//     also sent a confirmation_code ShippingCancelPickupBody never declared -
//     a real bug an unvalidated req.body destructure had been silently
//     absorbing.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  ShippingGetRatesBody,
  ShippingCheckPickupBody,
  ShippingGetLocationsBody,
  ShippingValidateAddressBody,
  ShippingGetTrackingBody,
  ShippingCancelLabelBody,
  ShippingCancelPickupBody,
  ShipmentPatch,
} from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));
vi.mock("@/features/orders/invalidation", () => ({ invalidateOrderReads: vi.fn() }));

import { apiRequest } from "@/shared/queries/axios";
import {
  useShippingRates,
  useShippingPickupTimes,
  useShippingLocations,
  useShippingValidateAddress,
  useTracking,
  useShippingCancelLabel,
  useShippingCancelPickup,
  usePatchShipment,
} from "@/features/shipping/queries";
import { useGetRatesInput } from "@/features/shipping/utils/getRatesInput";
import type { ShippingRatesInput } from "@/features/shipping/types";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const anAddress = () => ({
  id: "9f1c2b3a-0000-4000-8000-000000000001",
  line_1: "1 Main St",
  line_2: null,
  city: "Dallas",
  state: "TX",
  country: "United States",
  country_code: "US",
  zip: "75201",
  phone_number: "5555555555",
  is_valid: true,
  is_residential: false,
  created_at: null,
  updated_at: null,
})

beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({});
});

describe("useGetRatesInput composes exactly what /shipping/get_rates accepts", () => {
  test("address/package become address_id/package_id, declaredValue becomes a number", () => {
    const { result } = renderHook(() =>
      useGetRatesInput({
        address: anAddress() as any,
        package: { id: "9f1c2b3a-0000-4000-8000-000000000002", weight: { value: 4.5 } },
        shippingType: "Inbound",
        pickupLabel: "DROPOFF_AT_FEDEX_LOCATION",
        insurance: { insured: true, declaredValue: { amount: 500, currency: "USD" } },
      })
    );

    expect(result.current).not.toBeNull();
    const parsed = ShippingGetRatesBody.strict().safeParse(result.current);
    expect(parsed.success).toBe(true);
    expect(result.current).toMatchObject({
      address_id: "9f1c2b3a-0000-4000-8000-000000000001",
      package_id: "9f1c2b3a-0000-4000-8000-000000000002",
      weight: 4.5,
      declaredValue: 500,
    });
    expect(result.current).not.toHaveProperty("address");
    expect(result.current).not.toHaveProperty("pkg");

    // Proven: the old composed shape would fail the same parse.
    const oldShape = {
      shippingType: "Inbound",
      address: anAddress(),
      pkg: { weight: { units: "LB", value: 4.5 }, dimensions: { length: 1, width: 1, height: 1, units: "IN" } },
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
    };
    expect(ShippingGetRatesBody.strict().safeParse(oldShape).success).toBe(false);
  });

  test("returns null until a package id and a weight are both known", () => {
    const { result } = renderHook(() =>
      useGetRatesInput({
        address: anAddress() as any,
        package: { weight: { value: 4.5 } }, // no id yet
        pickupLabel: "DROPOFF_AT_FEDEX_LOCATION",
      })
    );
    expect(result.current).toBeNull();
  });
});

describe("useShippingRates sends exactly what /shipping/get_rates accepts", () => {
  test("forwards an already-resolved input clean", async () => {
    const input: ShippingRatesInput = {
      shippingType: "Inbound",
      address_id: "9f1c2b3a-0000-4000-8000-000000000001",
      package_id: "9f1c2b3a-0000-4000-8000-000000000002",
      weight: 4.5,
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
    };
    renderHook(() => useShippingRates(input), { wrapper });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/shipping/get_rates");
    expect(ShippingGetRatesBody.strict().safeParse(body).success).toBe(true);
  });
});

describe("useShippingPickupTimes sends exactly what /shipping/check_pickup accepts", () => {
  test("pickupAddress became address_id", async () => {
    renderHook(
      () =>
        useShippingPickupTimes({
          address_id: "9f1c2b3a-0000-4000-8000-000000000001",
          code: "FDXG",
          readyDate: "2026-09-10",
        }),
      { wrapper }
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/shipping/check_pickup");
    expect(ShippingCheckPickupBody.strict().safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("pickupAddress");
  });
});

describe("useShippingLocations sends exactly what /shipping/get_locations accepts", () => {
  test("address became address_id", async () => {
    renderHook(
      () =>
        useShippingLocations({
          address_id: "9f1c2b3a-0000-4000-8000-000000000001",
          radius_miles: 50,
          max_results: 50,
        }),
      { wrapper }
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/shipping/get_locations");
    expect(ShippingGetLocationsBody.strict().safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("address");
  });
});

describe("useShippingValidateAddress sends exactly what /shipping/validate_address accepts", () => {
  test("address became address_id", async () => {
    renderHook(
      () => useShippingValidateAddress({ address_id: "9f1c2b3a-0000-4000-8000-000000000001" }),
      { wrapper }
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/shipping/validate_address");
    expect(ShippingValidateAddressBody.strict().safeParse(body).success).toBe(true);
  });
});

describe("useTracking sends exactly what /shipping/get_tracking accepts", () => {
  test("drops tracking_number/carrier_id - the server reads both off the shipment row", async () => {
    renderHook(
      () =>
        useTracking({
          shipment_id: "9f1c2b3a-0000-4000-8000-000000000003",
          tracking_number: "1Z999",
          carrier_id: "9f1c2b3a-0000-4000-8000-000000000004",
        }),
      { wrapper }
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/shipping/get_tracking");
    expect(ShippingGetTrackingBody.strict().safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("tracking_number");
    expect(body).not.toHaveProperty("carrier_id");

    // Proven: the old body would fail the same parse.
    expect(
      ShippingGetTrackingBody.strict().safeParse({
        shipment_id: "9f1c2b3a-0000-4000-8000-000000000003",
        tracking_number: "1Z999",
        carrier_id: "9f1c2b3a-0000-4000-8000-000000000004",
      }).success
    ).toBe(false);
  });
});

describe("useShippingCancelLabel sends exactly what /shipping/cancel_label accepts", () => {
  test("drops tracking_number", async () => {
    const { result } = renderHook(() => useShippingCancelLabel(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        shipment_id: "9f1c2b3a-0000-4000-8000-000000000003",
        carrier_id: "9f1c2b3a-0000-4000-8000-000000000004",
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/shipping/cancel_label");
    expect(ShippingCancelLabelBody.strict().safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("tracking_number");
  });
});

describe("useShippingCancelPickup sends exactly what /shipping/cancel_pickup accepts", () => {
  test("sends the fields at the top level, not nested under `input`, and drops confirmation_code", async () => {
    const { result } = renderHook(() => useShippingCancelPickup(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        pickup_id: "9f1c2b3a-0000-4000-8000-000000000005",
        carrier_id: "9f1c2b3a-0000-4000-8000-000000000004",
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(url).toBe("/shipping/cancel_pickup");
    expect(ShippingCancelPickupBody.strict().safeParse(body).success).toBe(true);
    expect(body).not.toHaveProperty("input");
    expect(body).not.toHaveProperty("confirmation_code");
    expect(body).toHaveProperty("pickup_id", "9f1c2b3a-0000-4000-8000-000000000005");
  });
});

describe("usePatchShipment sends exactly what PATCH /shipments/:id accepts", () => {
  test("the patch parses clean against the strict contract", async () => {
    const { result } = renderHook(() => usePatchShipment(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        shipment_id: "9f1c2b3a-0000-4000-8000-000000000003",
        order_id: "9f1c2b3a-0000-4000-8000-000000000006",
        patch: { tracking_number: "1Z999", carrier_id: "9f1c2b3a-0000-4000-8000-000000000004" },
      });
    });

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    const [method, url, body] = vi.mocked(apiRequest).mock.calls[0];
    expect(method).toBe("PATCH");
    expect(url).toBe("/shipments/9f1c2b3a-0000-4000-8000-000000000003");
    expect(ShipmentPatch.strict().safeParse(body).success).toBe(true);
  });
});
