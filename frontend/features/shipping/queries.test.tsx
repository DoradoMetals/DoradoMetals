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
import { ShipmentPatch, ShippingCancelLabelBody, ShippingCancelPickupBody, ShippingCheckPickupBody, ShippingGetLocationsBody, ShippingGetTrackingBody, ShippingValidateAddressBody } from "@dorado/contracts";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-admin", role: "admin" } }),
}));
vi.mock("@/features/orders/invalidation", () => ({ invalidateOrderReads: vi.fn() }));

import { apiRequest } from "@/shared/queries/axios";
import {
  useShippingPickupTimes,
  useShippingLocations,
  useShippingValidateAddress,
  useTracking,
  useShippingCancelLabel,
  useShippingCancelPickup,
  usePatchShipment,
} from "@/features/shipping/queries";

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

// The client-side rate request is GONE (the rates ruling): a checkout step
// reads GET /checkout/rates?direction= now, already priced, and assembles no
// address/package/weight body at all - see useCheckoutRates in
// features/checkout/queries.ts. useGetRatesInput and useShippingRates died
// with the assembly they served.

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
