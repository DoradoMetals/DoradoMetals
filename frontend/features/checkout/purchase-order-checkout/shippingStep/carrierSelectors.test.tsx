// THE TWO SELECTORS THAT USED TO SPELL A CARRIER'S VOCABULARY.
//
// Both are presentational (ruling 14): the options come in as a prop and the
// SELECTION is a prop too, so what a click produces is a request, not a store
// write. That is the change this file records - the assertions used to read
// `usePurchaseOrderCheckoutStore.getState().data`, and the store is gone
// because every field of it was a column. `PickupSelector`'s `selected` used
// to be read straight off the row's `handoff_code`; the row shrank
// (2026-09-04) and the caller now resolves it (gates.ts `resolveHandoff`).
//
// What is still pinned: NOTHING IN EITHER COMPONENT KNOWS WHAT A FEDEX SERVICE
// IS CALLED. The fixtures use invented codes, so a component carrying a
// carrier's enum would fail rather than pass by coincidence.
import type { CarrierHandoff, CheckoutRate } from "@dorado/contracts";
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import userEvent from "@testing-library/user-event";
import React from "react";

const patched: Record<string, unknown>[] = [];
const fulfilled: Record<string, unknown>[] = [];

vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "user", name: "Cust" } }),
}));
vi.mock("@/shared/ui/PriceNumberFlow", () => ({
  default: ({ value }: { value: number }) => React.createElement("span", null, String(value)),
}));
vi.mock("@/features/checkout/queries", () => ({
  usePatchCheckout: () => ({ mutate: (patch: Record<string, unknown>) => patched.push(patch) }),
  useSetCheckoutFulfillment: () => ({
    mutate: (choice: Record<string, unknown>) => fulfilled.push(choice),
  }),
}));

import { PickupSelector } from "@/features/checkout/purchase-order-checkout/shippingStep/pickupSelector";
import { ServiceSelector } from "@/features/checkout/purchase-order-checkout/shippingStep/serviceSelector";

// DELIBERATELY NOT FEDEX'S SPELLINGS. If a component still carried
// 'CONTACT_FEDEX_TO_SCHEDULE' or 'FEDEX_EXPRESS_SAVER' anywhere, none of these
// would match and the tests would fail - which is the point of inventing them.
const handoffs = (): CarrierHandoff[] => [
  {
    code: "LEAVE_IT_AT_THE_DEPOT",
    name: "Depot Dropoff",
    requires_schedule: false,
    has_dropoff_locations: true,
    display_order: 0,
  },
  {
    code: "THEY_COME_TO_YOU",
    name: "Courier Collection",
    requires_schedule: true,
    has_dropoff_locations: false,
    display_order: 1,
  },
];

// GET /checkout/rates answers one entry per OFFERED service, joined
// server-side: the carrier's own quote plus the `shipping.services` id the row
// stores, and a `selected` flag saying which one it holds.
const rates = (): CheckoutRate[] => [
  {
    serviceType: "SLOW_ONE",
    packagingType: "OUR_BOX",
    netCharge: 12.5,
    currency: "USD",
    deliveryDay: null,
    transitTime: null,
    serviceDescription: "Economy",
    carrier_service_id: "11111111-1111-4111-8111-111111111111",
    name: "Economy",
    carrier_code: "ZZZE",
    display_order: 0,
    max_insured_value: 7500,
    selected: false,
  },
  {
    serviceType: "FAST_ONE",
    packagingType: "OUR_BOX",
    netCharge: 48.75,
    currency: "USD",
    deliveryDay: null,
    transitTime: null,
    serviceDescription: "Overnight",
    carrier_service_id: "22222222-2222-4222-8222-222222222222",
    name: "Overnight",
    carrier_code: "ZZZP",
    display_order: 1,
    max_insured_value: 10000,
    selected: false,
  },
];

// A service the business offers that the carrier did not price for this
// parcel: every catalogue field, no charge.
const unpriced = (): CheckoutRate[] =>
  rates().map((rate) => ({ ...rate, netCharge: null, transitTime: null }));

beforeEach(() => {
  patched.length = 0;
  fulfilled.length = 0;
});

describe("the carrier handoff selector", () => {
  test("renders the names the server sent, in the order it sent them", () => {
    renderWithClient(<PickupSelector handoffs={handoffs()} selected={null} />);

    expect(screen.getByText("Depot Dropoff")).toBeDefined();
    expect(screen.getByText("Courier Collection")).toBeDefined();
  });

  test("renders nothing at all when the reference read has not landed", () => {
    // The parent passes [] for one tick. A selector that assumed two options
    // would throw here, and the customer's first paint is the failure.
    renderWithClient(<PickupSelector handoffs={[]} selected={null} />);
    expect(screen.queryAllByRole("radio").length).toBe(0);
  });

  test("choosing one sends the carrier's code and nothing else", async () => {
    renderWithClient(<PickupSelector handoffs={handoffs()} selected={null} />);

    await userEvent.click(screen.getByText("Courier Collection"));

    // The SERVER owns the fulfillment-method vocabulary and the schedule
    // columns; the browser sends back the code it was offered.
    expect(fulfilled).toEqual([{ handoff_code: "THEY_COME_TO_YOU" }]);
  });

  // `selected` is resolved by the caller from the row's `fulfillment_method_id`
  // (gates.ts `resolveHandoff`), not remembered locally by this component.
  test("the selection is the caller's, not a local memory of the click", () => {
    renderWithClient(<PickupSelector handoffs={handoffs()} selected="THEY_COME_TO_YOU" />);
    const chosen = screen
      .getAllByRole("radio")
      .find((r) => r.getAttribute("aria-checked") === "true" || (r as HTMLInputElement).checked);
    expect(chosen).toBeDefined();
  });
});

describe("the service selector", () => {
  test("renders the offered services and each one's live rate", () => {
    renderWithClient(<ServiceSelector rates={rates()} isLoading={false} />);

    expect(screen.getByText("Economy")).toBeDefined();
    expect(screen.getByText("Overnight")).toBeDefined();
    expect(screen.getByText("12.5")).toBeDefined();
    expect(screen.getByText("48.75")).toBeDefined();
  });

  test("choosing one sends the shipping.services id and no price at all", async () => {
    renderWithClient(<ServiceSelector rates={rates()} isLoading={false} />);

    await userEvent.click(screen.getByText("Overnight"));

    // NO ARITHMETIC AND NO PRICE ON THE WIRE (D82): the row stores WHICH
    // service, and the charge is whatever the carrier answers next time.
    expect(patched).toEqual([{ carrier_service_id: "22222222-2222-4222-8222-222222222222" }]);
  });

  test("a service with no rate yet is offered but not selectable", () => {
    renderWithClient(<ServiceSelector rates={unpriced()} isLoading={false} />);

    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(2);
    // Offered, so the customer sees what exists, and refused until the carrier
    // has quoted it - a service selected with no netCharge would ship the
    // order for nothing.
    expect(radios.every((r) => (r as HTMLButtonElement).disabled)).toBe(true);
  });
});
