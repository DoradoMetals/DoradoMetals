// The user sales-order drawer footer, rendered - the customer's receipt view.
//
// Pure prop rendering: the money is the order's own stored totals, no quote
// fetch. Shape-agnostic: line names render and the totals reach the screen -
// wherever the order wire puts its money.
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("@/shared/ui/PriceNumberFlow", () => ({
  default: ({ value }: { value: number }) => React.createElement("span", null, String(value)),
}));

import SalesOrderDrawerFooter from "@/features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawerFooter";
import type { SalesOrder } from "@/features/orders/salesOrders/types";

// The converted wire: money nested as `totals` with the transactions names,
// the embedded product speaking `name`.
const order = () =>
  ({
    id: "so-1",
    used_funds: true,
    order_items: [
      { id: "i-1", quantity: 2, price: 1600, product: { id: "p-1", name: "Silver Maple Leaf" } },
    ],
    totals: {
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
  } as unknown as SalesOrder);

describe("the sales-order drawer footer", () => {
  test("line names render and the order's totals reach the screen", async () => {
    render(<SalesOrderDrawerFooter order={order()} />);

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
