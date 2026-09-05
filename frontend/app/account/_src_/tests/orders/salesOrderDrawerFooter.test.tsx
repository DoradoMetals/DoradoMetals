// The user sales-order drawer footer, rendered - the customer's receipt view.
//
// Pure prop rendering: the money is the order's own stored totals, no quote
// fetch. Shape-agnostic: line names render and the totals reach the screen -
// wherever the order wire puts its money.
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@dorado/components", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Amount: ({ value }: { value: number }) => React.createElement("span", null, String(value)),
}));

// THE LINES ARE A READ NOW, NOT A PROP (wave 3). The footer is a CONTAINER:
// it calls useSalesOrderLines(order.id), which fetches orders.items and names
// them against the cached catalogue. Stubbing that one hook keeps this a
// render test - props and stubbed data in, DOM out - rather than turning it
// into a query-client harness, and it is the seam the container/presentational
// split creates on purpose.
vi.mock(
  "@/shared/hooks/useSalesOrderLines",
  () => ({
    useSalesOrderLines: () => [
      {
        id: "i-1",
        name: "Silver Maple Leaf",
        mint_name: null,
        image_front: null,
        quantity: 2,
        price: 1600,
      },
    ],
  })
);

import SalesOrderDrawerFooter from "../../orders/salesOrders/salesOrderDrawer/salesOrderDrawerFooter";
import type { OrderView } from "@dorado/contracts";

// THE SLIM WIRE: the orders.orders row plus `totals`, and nothing else. The
// order document no longer carries order_items - and `used_funds` is a column
// of orders.transactions, so it sits on totals where it always came from.
const order = () =>
  ({
    order: { id: "so-1" },
    items: [],
    address: null,
    shipments: [],
    pickup: null,
    payout: null,
    user: null,
    actions: { statuses: [] },
    totals: {
      used_funds: true,
      total: 3369.39,
      items: 3200,
      shipping: 25,
      surcharge: 92.14,
      sales_tax: 52.25,
      funds: 100,
      refiner_fee: null,
      base_total: 3277.25,
      subject_to_charges_amount: 3177.25,
      post_charges_amount: 3269.39,
    },
  } as unknown as OrderView);

describe("the sales-order drawer footer", () => {
  test("line names render and the order's totals reach the screen", async () => {
    render(<SalesOrderDrawerFooter view={order()} />);

    // Accordion headers carry the section totals even while collapsed.
    expect(screen.getAllByText("3200").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3369.39").length).toBeGreaterThan(0);

    // The line rows and the funds breakdown are behind the toggles.
    await userEvent.click(screen.getByRole("button", { name: /Item Prices/ }));
    expect(await screen.findByText("Silver Maple Leaf")).toBeDefined();

    await userEvent.click(screen.getByRole("button", { name: /Total Price/ }));
    expect((await screen.findAllByText("100")).length).toBeGreaterThan(0);
  });
});
