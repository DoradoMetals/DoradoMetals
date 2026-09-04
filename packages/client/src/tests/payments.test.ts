// WHAT THE PAYMENT, PAYOUT AND USER HOOKS PUT ON THE WIRE.
//
// The hooks themselves are thin by design - a key, a URL and a contract type -
// so what is worth pinning is the REQUEST each one builds: the ids it sends,
// the ones it must not, and the query keys an invalidation has to match.
// Rendering them would need a react-query harness and would prove the harness.
import { describe, expect, test } from "vitest";
import { UpdateCreditBody, UpdatePaymentIntentBody, PayoutPatch } from "@dorado/contracts";
import { keys } from "../keys";

describe("the query keys", () => {
  // The direction is a SEGMENT, never baked into a hook name, so one
  // direction's cache entry can never be served for the other.
  test("method rows are keyed by direction, and 'both' is its own entry", () => {
    expect(keys.payments.methods("sale")).not.toEqual(keys.payments.methods("purchase"));
    expect(keys.payments.methods()).toEqual(["payments", "methods", null]);
  });

  // An admin opening a customer's intent must not be handed their own.
  test("an intent is keyed by type AND subject", () => {
    expect(keys.payments.intent("admin", "u-1")).not.toEqual(keys.payments.intent("admin", "u-2"));
    expect(keys.payments.intent("checkout")).toEqual(["payments", "intent", "checkout", null]);
  });

  // THE LEDGER KEY NAMES NOBODY, deliberately: the server reads the subject off
  // the session, and a key carrying an id would imply a caller could choose.
  test("the credit ledger is keyed by nothing but itself", () => {
    expect(keys.users.ledger()).toEqual(["users", "ledger"]);
  });

  // usePatchPayout settles through the ORDER cache policy - the payout renders
  // inside order reads and its cost prices the quote.
  test("payout details are keyed apart from the order's own payout row", () => {
    expect(keys.payouts.details("p-1")).toEqual(["payouts", "p-1", "details"]);
    expect(keys.payouts.details("p-1")).not.toEqual(keys.orders.payouts("p-1"));
  });
});

// The bodies these hooks accept are the contracts' own, in STRICT mode at the
// transport - so a field the API stopped taking is a type error here and a 400
// there, rather than a key zod silently strips.
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

    // The three the browser used to declare. `spots` priced a $3,673 order at
    // $26 when a caller sent ask_spot 1; `user.dorado_funds` let a request
    // declare its own discount; `using_funds` is dead at every layer
    // (ruling 47 - credit is not a choice).
    for (const retired of ["spots", "using_funds", "user"]) {
      expect(
        UpdatePaymentIntentBody.safeParse({ ...body, [retired]: true }).success
      ).toBe(false);
    }
  });

  test("a payout patch names the fee, the method and the waiver - never a bank number", () => {
    expect(PayoutPatch.safeParse({ cost: 20, method: "WIRE", waive_payout_fee: true }).success)
      .toBe(true);
    for (const radioactive of ["routing_number", "account_number", "account_last4"]) {
      expect(PayoutPatch.safeParse({ [radioactive]: "021000021" }).success).toBe(false);
    }
  });

  // THE OPERATION, NOT THE RESULT (ruling 10, D98). `amount` is a magnitude and
  // the sign is `op`, so two admins editing at once cannot lose one edit.
  test("a credit adjustment sends an operation and a magnitude", () => {
    expect(UpdateCreditBody.safeParse({ op: "add", amount: 25 }).success).toBe(true);
    expect(UpdateCreditBody.safeParse({ op: "nudge", amount: 25 }).success).toBe(false);
    // The balance itself is never sent - that was the browser doing the
    // arithmetic against a row it had read some time ago.
    expect(
      UpdateCreditBody.safeParse({ op: "add", amount: 25, dorado_funds: 100 }).success
    ).toBe(false);
    // AND NEITHER IS THE SUBJECT. It is the path's now (POST
    // /api/users/:id/credit), so a caller cannot name one person in the URL
    // and a different one in the payload.
    expect(
      UpdateCreditBody.safeParse({
        user_id: "9f1c2b3a-0000-4000-8000-000000000005", op: "add", amount: 25,
      }).success
    ).toBe(false);
  });
});
