// What a customer PAYS on a sales order - the other direction from the
// purchase-order pricing in purchaseOrderPricing.test.ts, and equally untested
// until now. It decides the item total, whether shipping is free, how much
// account credit is consumed, the card surcharge, and the number charged.
import { describe, expect, test } from "vitest";
import {
  calculateCardCharge,
  calculateItemTotals,
  calculateSalesOrderPrices,
} from "@/features/orders/salesOrders/utils/calculateSalesOrderPrices";
import type { SpotPrice } from "@/features/spots/types";
import type { Product } from "@/features/products/types";
import type { PaymentMethodType } from "@/features/orders/salesOrders/types";

const gold = (ask: number) => ({ name: "Gold", ask }) as SpotPrice;
const item = (over: Partial<Product> = {}) =>
  ({ metal_type: "Gold", content: 1, ask_premium: 1, quantity: 1, ...over }) as Product;

describe("calculateCardCharge", () => {
  test("charges each method its own rate", () => {
    expect(calculateCardCharge(1000, "CARD")).toBeCloseTo(29, 10);
    expect(calculateCardCharge(1000, "ACH")).toBeCloseTo(5, 10);
    expect(calculateCardCharge(1000, "WIRE")).toBe(0);
    expect(calculateCardCharge(1000, "CREDIT")).toBe(0);
  });

  // The signature takes a plain string, so anything can reach it. An
  // unrecognised method is not free and is not an error - it quietly bills the
  // card rate, which is the most expensive of the six.
  test("an unrecognised method silently defaults to the 2.9% card rate", () => {
    expect(calculateCardCharge(1000, "PAYPAL")).toBeCloseTo(29, 10);
    expect(calculateCardCharge(1000, "")).toBeCloseTo(29, 10);
  });
});

describe("calculateItemTotals", () => {
  test("content * ask spot * premium, times quantity", () => {
    expect(calculateItemTotals([item({ content: 1, ask_premium: 1.05 })], [gold(3000)])).toBeCloseTo(3150, 10);
    expect(calculateItemTotals([item({ quantity: 3 })], [gold(3000)])).toBeCloseTo(9000, 10);
  });

  test("sums across items", () => {
    const two = calculateItemTotals([item(), item({ content: 0.5 })], [gold(3000)]);
    expect(two).toBeCloseTo(4500, 10);
  });

  // Both of these hand the customer the metal for nothing rather than failing.
  // Production is safe today only because every product offered for sale
  // carries a real premium: of 95 products, 25 have ask_premium 0, and none of
  // those 25 is sell_display.
  test("a product with no premium is given away free, not flagged", () => {
    expect(calculateItemTotals([item({ ask_premium: 0 })], [gold(3000)])).toBe(0);
    expect(calculateItemTotals([item({ ask_premium: undefined })], [gold(3000)])).toBe(0);
  });

  test("an item whose metal has no spot price is also free", () => {
    expect(calculateItemTotals([item()], [])).toBe(0);
    expect(calculateItemTotals([item({ metal_type: "Silver" })], [gold(3000)])).toBe(0);
  });

  test("no items is zero, and spots default to an empty list", () => {
    expect(calculateItemTotals([], [gold(3000)])).toBe(0);
    expect(calculateItemTotals([item()])).toBe(0);
  });
});

const run = (
  items: Product[],
  usingFunds: boolean,
  funds: number,
  serviceCost: number,
  method: PaymentMethodType,
  salesTax: number,
  spots: SpotPrice[] = [gold(1000)],
) => calculateSalesOrderPrices(items, usingFunds, spots, funds, serviceCost, method, salesTax);

describe("shipping is free above a threshold", () => {
  // Strictly greater than 1000. An order of exactly 1000 pays for shipping,
  // which is the kind of boundary that only shows up when someone hits it.
  test("an order over 1000 ships free", () => {
    const t = run([item({ content: 1.5 })], false, 0, 25, "WIRE", 0);
    expect(t.itemTotal).toBeCloseTo(1500, 10);
    expect(t.shippingCharge).toBe(0);
  });

  test("an order of exactly 1000 is charged shipping", () => {
    const t = run([item()], false, 0, 25, "WIRE", 0);
    expect(t.itemTotal).toBeCloseTo(1000, 10);
    expect(t.shippingCharge).toBe(25);
    expect(t.baseTotal).toBeCloseTo(1025, 10);
  });
});

describe("account funds", () => {
  test("funds are not touched unless the customer asked", () => {
    const t = run([item()], false, 400, 0, "WIRE", 0);
    expect(t.appliedFunds).toBe(0);
    expect(t.endingFunds).toBe(400);
    expect(t.subjectToChargesAmount).toBeCloseTo(1000, 10);
  });

  test("funds are capped at the order, so a large balance is not overspent", () => {
    const t = run([item()], true, 5000, 0, "WIRE", 0);
    expect(t.appliedFunds).toBeCloseTo(1000, 10);
    expect(t.endingFunds).toBeCloseTo(4000, 10);
    expect(t.subjectToChargesAmount).toBe(0);
    expect(t.orderTotal).toBeCloseTo(1000, 10);
  });

  test("partial funds leave the remainder to be charged", () => {
    const t = run([item()], true, 400, 0, "WIRE", 0);
    expect(t.appliedFunds).toBe(400);
    expect(t.endingFunds).toBe(0);
    expect(t.subjectToChargesAmount).toBeCloseTo(600, 10);
  });
});

describe("the surcharge", () => {
  // It applies to what is left AFTER funds, not to the order. Paying part of
  // an order with credit therefore reduces the surcharge too.
  test("is charged on the amount left after funds, not the whole order", () => {
    const t = run([item()], true, 400, 0, "CARD", 0);
    expect(t.subjectToChargesAmount).toBeCloseTo(600, 10);
    expect(t.surchargeAmount).toBeCloseTo(17.4, 10);
    expect(t.postChargesAmount).toBeCloseTo(617.4, 10);
    expect(t.orderTotal).toBeCloseTo(1017.4, 10);
  });

  test("CREDIT is exempt outright", () => {
    const t = run([item()], false, 0, 0, "CREDIT", 0);
    expect(t.surchargeAmount).toBe(0);
    expect(t.postChargesAmount).toBeCloseTo(1000, 10);
  });

  test("WIRE reaches the calculation but its rate is zero, so it costs nothing", () => {
    const t = run([item()], false, 0, 0, "WIRE", 0);
    expect(t.surchargeAmount).toBe(0);
    expect(t.orderTotal).toBeCloseTo(1000, 10);
  });

  test("ACH is charged half a percent", () => {
    const t = run([item()], false, 0, 0, "ACH", 0);
    expect(t.surchargeAmount).toBeCloseTo(5, 10);
  });

  test("an order fully covered by funds carries no surcharge, even by card", () => {
    const t = run([item()], true, 5000, 0, "CARD", 0);
    expect(t.subjectToChargesAmount).toBe(0);
    expect(t.surchargeAmount).toBe(0);
  });
});

describe("sales tax and the final number", () => {
  test("tax is added before funds and before the surcharge", () => {
    const t = run([item()], false, 0, 0, "CARD", 80);
    expect(t.baseTotal).toBeCloseTo(1080, 10);
    // The surcharge is charged on the tax as well.
    expect(t.surchargeAmount).toBeCloseTo(31.32, 10);
    expect(t.orderTotal).toBeCloseTo(1111.32, 10);
  });

  test("the total is what was covered by funds plus what was charged", () => {
    const t = run([item()], true, 300, 25, "CARD", 50);
    expect(t.orderTotal).toBeCloseTo(t.appliedFunds + t.postChargesAmount, 10);
    expect(t.salesTax).toBe(50);
  });

  test("an empty order with no tax costs nothing", () => {
    const t = run([], false, 0, 25, "CARD", 0);
    expect(t.itemTotal).toBe(0);
    // Still charged shipping, because 0 is not above the free-shipping bar.
    expect(t.shippingCharge).toBe(25);
    expect(t.orderTotal).toBeCloseTo(25 * 1.029, 10);
  });
});
