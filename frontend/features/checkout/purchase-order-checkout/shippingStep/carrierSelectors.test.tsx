// THE TWO SELECTORS THAT USED TO SPELL A CARRIER'S VOCABULARY.
//
// Both are presentational now (ruling 14): the options come in as a prop, the
// parent holds the read. That is what makes them cheap to render - props in,
// DOM out, no query client to stand up - and it is also the property under
// test. What these pin is that NOTHING IN THE COMPONENT KNOWS WHAT A FEDEX
// SERVICE IS CALLED: the fixtures below use invented codes, so a component that
// had a carrier's enum written into it would fail rather than pass by
// coincidence.
//
// The store writes ARE checked, because their shape is what the checkout parse
// and the order create body depend on: `pickup.name` lands in
// shipments.pickup_type verbatim, and `service.serviceType` and `service.code`
// travel into the label request.
import { describe, expect, test, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithClient } from "@/shared/tests/renderWithClient";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@/shared/queries/axios", () => ({ apiRequest: vi.fn() }));
vi.mock("@/features/auth/queries", () => ({
  useGetSession: () => ({ user: { id: "u-1", role: "user", name: "Cust" } }),
}));
vi.mock("@/shared/ui/PriceNumberFlow", () => ({
  default: ({ value }: { value: number }) => React.createElement("span", null, String(value)),
}));

import { PickupSelector } from "@/features/checkout/purchase-order-checkout/shippingStep/pickupSelector";
import { ServiceSelector } from "@/features/checkout/purchase-order-checkout/shippingStep/serviceSelector";
import { usePurchaseOrderCheckoutStore } from "@/shared/store/purchaseOrderCheckoutStore";
import type { CarrierHandoff } from "@/features/shipping/types";
import type { CheckoutRate } from "@/features/checkout/queries";

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

// GET /checkout/rates answers one already-priced row per offered service now
// (the rates ruling) - there is no separate services catalogue to join by
// code any more, so a selection test fixture is the flat row itself.
const rates = (): CheckoutRate[] => [
  {
    id: "11111111-1111-4111-8111-111111111111",
    code: "SLOW_ONE",
    carrier_code: "ZZZE",
    name: "Economy",
    display_order: 0,
    net_charge: 12.5,
    currency: "USD",
    delivery_day: null,
    transit_time: null,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    code: "FAST_ONE",
    carrier_code: "ZZZP",
    name: "Overnight",
    display_order: 1,
    net_charge: 48.75,
    currency: "USD",
    delivery_day: null,
    transit_time: null,
  },
];

beforeEach(() => {
  usePurchaseOrderCheckoutStore.getState().clear();
});

describe("the carrier handoff selector", () => {
  test("renders the names the server sent, in the order it sent them", () => {
    renderWithClient(<PickupSelector handoffs={handoffs()} />);

    expect(screen.getByText("Depot Dropoff")).toBeDefined();
    expect(screen.getByText("Courier Collection")).toBeDefined();
  });

  test("renders nothing at all when the reference read has not landed", () => {
    // The parent passes [] for one tick. A selector that assumed two options
    // would throw here, and the customer's first paint is the failure.
    renderWithClient(<PickupSelector handoffs={[]} />);
    expect(screen.queryAllByRole("radio").length).toBe(0);
  });

  test("choosing one stores the carrier's code as label and its name verbatim", async () => {
    renderWithClient(<PickupSelector handoffs={handoffs()} />);

    await userEvent.click(screen.getByText("Courier Collection"));

    const { pickup } = usePurchaseOrderCheckoutStore.getState().data;
    // `label` is handed back to the carrier untouched; `name` is written to
    // shipments.pickup_type, which is why it is the server's string and not one
    // composed here.
    expect(pickup?.label).toBe("THEY_COME_TO_YOU");
    expect(pickup?.name).toBe("Courier Collection");
    // A date is seeded so the scheduler has somewhere to start, and the time is
    // empty until a slot is picked - the shape the checkout parse expects.
    expect(pickup?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pickup?.time).toBe("");
  });

  test("an unknown code is ignored rather than written half-formed", async () => {
    renderWithClient(<PickupSelector handoffs={handoffs()} />);
    await userEvent.click(screen.getByText("Depot Dropoff"));
    expect(usePurchaseOrderCheckoutStore.getState().data.pickup?.name).toBe("Depot Dropoff");
  });
});

describe("the service selector", () => {
  test("renders each offered service and its own price", () => {
    renderWithClient(<ServiceSelector rates={rates()} isLoading={false} />);

    expect(screen.getByText("Economy")).toBeDefined();
    expect(screen.getByText("Overnight")).toBeDefined();
    expect(screen.getByText("12.5")).toBeDefined();
    expect(screen.getByText("48.75")).toBeDefined();
  });

  test("choosing one stores the carrier's own codes and the carrier's own price", async () => {
    renderWithClient(<ServiceSelector rates={rates()} isLoading={false} />);

    await userEvent.click(screen.getByText("Overnight"));

    const { service } = usePurchaseOrderCheckoutStore.getState().data;
    expect(service?.serviceType).toBe("FAST_ONE");
    expect(service?.serviceDescription).toBe("Overnight");
    // The service family a pickup-availability check needs - a property of the
    // SERVICE, not of the carrier.
    expect(service?.code).toBe("ZZZP");
    // NO ARITHMETIC: the carrier's quote, stored as given (D82).
    expect(service?.netCharge).toBe(48.75);
    expect(service?.currency).toBe("USD");
  });

  test("choosing a service clears the handoff's date and time", async () => {
    // Changing the service changes which pickup slots the carrier will offer,
    // so a slot chosen against the old one must not survive. This was the
    // existing behaviour and it is load-bearing: the stepper will not advance
    // without a date and a time when the handoff needs scheduling.
    renderWithClient(<PickupSelector handoffs={handoffs()} />);
    await userEvent.click(screen.getByText("Courier Collection"));

    renderWithClient(<ServiceSelector rates={rates()} isLoading={false} />);
    await userEvent.click(screen.getByText("Economy"));

    const { pickup } = usePurchaseOrderCheckoutStore.getState().data;
    expect(pickup?.label).toBe("THEY_COME_TO_YOU");
    expect(pickup?.date).toBeUndefined();
    expect(pickup?.time).toBeUndefined();
  });

  test("renders nothing at all when the reference read has not landed", () => {
    // A row IS a priced service now (the rates ruling) - there is no
    // "offered but unpriced" state left to render as disabled.
    renderWithClient(<ServiceSelector rates={[]} isLoading={false} />);
    expect(screen.queryAllByRole("radio").length).toBe(0);
  });
});
