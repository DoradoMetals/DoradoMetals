import { describe, expect, test } from "vitest";
import { UpdateCreditBody, UpdatePaymentIntentBody, PaymentDetailsPatch } from "@dorado/contracts";
import { keys } from "../keys";

describe("the query keys", () => {
  test("method rows are keyed by direction, and 'both' is its own entry", () => {
    expect(keys.payments.methods("sale")).not.toEqual(keys.payments.methods("purchase"));
    expect(keys.payments.methods()).toEqual(["payments", "methods", null]);
  });

  test("an intent is keyed by type AND subject", () => {
    expect(keys.payments.intent("admin", "u-1")).not.toEqual(keys.payments.intent("admin", "u-2"));
    expect(keys.payments.intent("checkout")).toEqual(["payments", "intent", "checkout", null]);
  });

  test("the credit ledger is keyed by nothing but itself", () => {
    expect(keys.users.ledger()).toEqual(["users", "ledger"]);
  });

  test("payment details are keyed apart from the order's own payment-details list", () => {
    expect(keys.payments.details("p-1")).toEqual(["payments", "details", "p-1"]);
    expect(keys.payments.detailsBank("p-1")).toEqual(["payments", "details", "p-1", "bank"]);
    expect(keys.payments.details("p-1")).not.toEqual(keys.orders.paymentDetails("p-1"));
  });
});

describe("the write bodies are the contracts'", () => {
  test("a priced intent update is IDS AND QUANTITIES, never a price", () => {
    const body = {
      items: [{ id: "9f1c2b3a-0000-4000-8000-000000000001", quantity: 2 }],
      address_id: "9f1c2b3a-0000-4000-8000-000000000002",
      carrier_service_id: "9f1c2b3a-0000-4000-8000-000000000003",
      payment_method_id: "9f1c2b3a-0000-4000-8000-000000000004",
      type: "admin",
    };
    expect(UpdatePaymentIntentBody.safeParse(body).success).toBe(true);

    for (const retired of ["spots", "using_funds", "user"]) {
      expect(
        UpdatePaymentIntentBody.safeParse({ ...body, [retired]: true }).success
      ).toBe(false);
    }
  });

  test("a payment details patch names the fee, the method and the waiver - never a bank number", () => {
    expect(
      PaymentDetailsPatch.safeParse({ cost: 20, method: "WIRE", waive_payout_fee: true }).success
    ).toBe(true);
    for (const radioactive of ["routing_number", "account_number", "account_last4"]) {
      expect(PaymentDetailsPatch.safeParse({ [radioactive]: "021000021" }).success).toBe(false);
    }
  });

  test("a credit adjustment sends an operation and a magnitude", () => {
    expect(UpdateCreditBody.safeParse({ op: "add", amount: 25 }).success).toBe(true);
    expect(UpdateCreditBody.safeParse({ op: "nudge", amount: 25 }).success).toBe(false);
    expect(
      UpdateCreditBody.safeParse({ op: "add", amount: 25, dorado_funds: 100 }).success
    ).toBe(false);
    expect(
      UpdateCreditBody.safeParse({
        user_id: "9f1c2b3a-0000-4000-8000-000000000005", op: "add", amount: 25,
      }).success
    ).toBe(false);
  });
});
