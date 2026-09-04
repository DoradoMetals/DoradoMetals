// The basket's rules: rows in, complete rows out or a refusal thrown.
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { CheckoutItemPatch, CheckoutWrite } from "@dorado/contracts";
import { fineContent } from "#domain/pricing/content.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { lineContent, rateMaterialFor } from "#domain/orders/rules.ts";
import type {
  CarrierHandoff, Checkout, CheckoutStep, Direction, RateRead,
} from "@dorado/contracts";
import type { NewItem } from "#db/checkout/items/repo.ts";
import type { BullionLiveness, BullionStorefront } from "@dorado/contracts";

export type BasketFacts = {
  checkout_id: string;
  direction: Direction;
  items: CheckoutItemPatch[];
  products: BullionStorefront[];
  liveness: BullionLiveness[];
  rates: RateRead[];
  metalNames: Map<string, string>;
};

// A bullion line names an id and a quantity; the rest is the server's - which
// is `CheckoutItemPatch` without those two, FROM THE CONTRACT (ruling 64).
const SERVER_OWNED = columnsOf(CheckoutItemPatch.omit({ bullion_id: true, quantity: true }));

// What a DECLARED LOT cannot be priced without.
const DECLARED_LOT_REQUIRES = columnsOf(
  CheckoutItemPatch.pick({ metal_id: true, pre_melt: true, purity: true, unit: true })
);

// Unknown and hidden are refused alike - the message cannot say which ids exist.
function notAvailable(count: number): never {
  throw new Invalid(
    count === 1
      ? "That product is not available"
      : `${count} of those products are not available`
  );
}

function requireLiveProducts(
  items: CheckoutItemPatch[], direction: Direction, byId: Map<string, BullionStorefront>,
  live: Set<string>
): void {
  const refused = new Set<string>();
  for (const line of items) {
    if (line.bullion_id == null) continue;
    const product = byId.get(line.bullion_id);
    if (!product || (direction === "sale" && !live.has(product.id))) {
      refused.add(line.bullion_id);
    }
  }
  if (refused.size > 0) notAvailable(refused.size);
}

// A row before its premium: a purchase band reads the whole basket's totals.
type Snapshot = { row: NewItem; metal: string | null };

function snapshot(
  line: CheckoutItemPatch, direction: Direction, checkout_id: string,
  byId: Map<string, BullionStorefront>, metalNames: Map<string, string>
): Snapshot {
  if (line.bullion_id != null) {
    for (const column of SERVER_OWNED) {
      if (line[column] != null) {
        throw new Invalid(
          `a bullion line names a product and a quantity - ${column} comes from the product`
        );
      }
    }
    const product = byId.get(line.bullion_id)!;
    return {
      // feature-map FLOWS: gross -> pre_melt, content -> post_melt and content.
      row: {
        checkout_id,
        bullion_id: product.id,
        metal_id: product.metal_id,
        pre_melt: product.gross,
        post_melt: product.content,
        purity: product.purity,
        content: product.content,
        unit: "t oz",
        quantity: line.quantity,
      },
      metal: metalNames.get(product.metal_id ?? "") ?? null,
    };
  }

  if (direction === "sale") {
    throw new Invalid("a buy basket holds catalogue products - every line needs a bullion_id");
  }

  // An absent weight or purity prices the customer's metal at nothing. The four
  // are named as KEYS of the line's own contract (ruling 64), so a column
  // renamed in a migration fails the typecheck here rather than silently
  // stopping being checked.
  for (const column of DECLARED_LOT_REQUIRES) {
    if (line[column] == null) {
      throw new Invalid(`a line with no product needs ${column}`);
    }
  }
  return {
    row: {
      checkout_id,
      bullion_id: null,
      metal_id: line.metal_id!,
      pre_melt: line.pre_melt!,
      post_melt: line.post_melt ?? null,
      purity: line.purity!,
      content: fineContent(line.pre_melt, line.unit, line.purity),
      unit: line.unit!,
      quantity: line.quantity,
    },
    metal: metalNames.get(line.metal_id!) ?? null,
  };
}

// Purchase: the rates band at the basket's total content of that metal, which
// is placement's own rule. Sale: the product's ask. No band leaves it null.
function premiums(
  snapshots: Snapshot[], direction: Direction, rates: RateRead[],
  byId: Map<string, BullionStorefront>
): (number | null)[] {
  if (direction === "sale") {
    return snapshots.map(({ row }) =>
      row.bullion_id == null ? null : byId.get(row.bullion_id)?.ask_premium ?? null
    );
  }
  const totals = sumContentByMetal(snapshots, (s) => s.metal, (s) =>
    lineContent({
      content: s.row.content ?? null,
      quantity: s.row.quantity ?? null,
      bullion_id: s.row.bullion_id ?? null,
    })
  );
  return snapshots.map(({ row, metal }) => {
    const total = totals[String(metal ?? "").toLowerCase()] ?? 0;
    return getRatePct(rates, metal, total, rateMaterialFor(row)) ?? null;
  });
}

// A line the rules cannot resolve refuses the write; nothing is skipped.
export function basketRows(
  { checkout_id, direction, items, products, liveness, rates, metalNames }: BasketFacts
): NewItem[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const live = new Set(liveness.filter((p) => p.display === true).map((p) => p.id));
  requireLiveProducts(items, direction, byId, live);

  const snapshots = items.map(
    (line) => snapshot(line, direction, checkout_id, byId, metalNames)
  );
  const resolved = premiums(snapshots, direction, rates, byId);
  return snapshots.map(({ row }, i) => Object.assign(row, { premium: resolved[i] }));
}

// ------------------------------------------------------- the stepper's rules
//
// EVERY "CAN I PROCEED" QUESTION THE BROWSER USED TO ANSWER. The stepper had
// them as a boolean expression over a zustand store; they are here, pure, and
// they reach the client as fields of the composed row.

// The one place the two vocabularies meet: a carrier HANDOFF (what the
// customer picks) and a fulfillment METHOD (what the row stores). Read in both
// directions so the choice and its read-back cannot drift.
export const methodTypeFor = (handoff: CarrierHandoff): string =>
  handoff.requires_schedule ? "CARRIER PICKUP" : "CARRIER DROPOFF";

export const handoffFor = (
  handoffs: CarrierHandoff[], method_type: string | null
): CarrierHandoff | null =>
  method_type == null
    ? null
    : handoffs.find((h) => methodTypeFor(h) === method_type) ?? null;

export type CheckoutFacts = {
  row: Checkout;
  direction: Direction;
  item_count: number;
  requires_schedule: boolean;
  has_fulfillment: boolean;
};

export type CheckoutState = {
  missing: CheckoutStep[];
  ready_for_rates: boolean;
  ready_for_payment: boolean;
  ready_to_place: boolean;
};

// The address slot a direction ships from or to. Purchase parcels leave the
// customer; sale parcels arrive at them.
export const addressColumnFor = (direction: Direction) =>
  direction === "purchase" ? "shipper_address_id" : "recipient_address_id";

// `missing` is ordered the way the stepper walks it, so the first entry is the
// next thing to do.
export function checkoutState(
  { row, direction, item_count, requires_schedule, has_fulfillment }: CheckoutFacts
): CheckoutState {
  const missing: CheckoutStep[] = [];
  if (item_count === 0) missing.push("items");

  if (direction === "purchase") {
    if (!row.shipper_address_id) missing.push("shipper_address");
    if (!row.package_id) missing.push("package");
    if (!has_fulfillment) missing.push("handoff");
    if (!row.carrier_service_id) missing.push("carrier_service");
    if (requires_schedule && !(row.pickup_date && row.pickup_time)) {
      missing.push("pickup_schedule");
    }
    if (!row.payment_details_id) missing.push("payout_account");
  } else {
    if (!row.recipient_address_id) missing.push("recipient_address");
    if (!row.carrier_service_id) missing.push("carrier_service");
    if (!row.payment_method_id) missing.push("payment_method");
  }

  // The carrier is asked what a parcel costs, so it needs the parcel: lines to
  // weigh, a box to weigh them in, and somewhere to collect them from. Exactly
  // the three refusals shipping/operations' getCheckoutRates raises.
  const address = direction === "purchase" ? row.shipper_address_id : row.recipient_address_id;
  const ready_for_rates = item_count > 0 && !!row.package_id && !!address;

  // The money step is reached once everything BEFORE it is chosen: for a
  // purchase that is the whole shipping step, for a sale everything but the
  // card.
  const paymentStep: CheckoutStep = direction === "purchase" ? "payout_account" : "payment_method";
  const ready_for_payment = missing.every((step) => step === paymentStep);

  return {
    missing,
    ready_for_rates,
    ready_for_payment,
    ready_to_place: missing.length === 0,
  };
}

// ------------------------------------------------ adopting a visitor's basket
//
// THE MERGE RULE (ruling 63). A visitor builds a checkout under an anonymous
// user id; signing in or signing up links that visitor to a real account and
// the checkout follows. When the real account ALREADY has a row for that
// direction there are two of everything, and this is the one place that says
// which wins:
//
//   THE VISITOR'S CHOICES WIN WHERE THEY MADE ONE. They are the choices made
//   seconds ago, in the session the customer is looking at, and the row they
//   are looking at is the one that must survive the sign-in - anything else
//   silently discards work the customer can see on screen.
//
//   THE REAL ROW'S CHOICES WIN WHERE THE VISITOR HAS NONE. A saved address or
//   package from a previous visit is not in the visitor's way; it is the
//   customer's own earlier answer, and dropping it would make signing in a
//   RESET rather than a merge.
//
// Which is column-by-column `anonymous ?? real`, and the items are the same
// rule at basket scale: the visitor's basket replaces the real one outright
// (adopt.ts moves the lines), because a basket is a SET the customer is
// looking at, not a bag of independent choices - merging two of them produces
// a basket nobody assembled.
//
// PURE, so the decision is testable without a database: the caller applies the
// patch it answers.
export const CHOICE_COLUMNS = columnsOf(CheckoutWrite);
export type ChoiceColumns = Partial<Pick<Checkout, (typeof CHOICE_COLUMNS)[number]>>;

// Every column a step writes, FROM THE CONTRACT (ruling 64). It used to be
// `checkouts.PATCHABLE` restated by hand, because this module is PURE - its
// tests run in the no-database lane, which scripts/lib/test-layers.ts derives
// from what a file imports, and reaching for the repo would drag the pool in
// and move them. `CheckoutWrite` is a zod schema and imports nothing, so both
// lists are now the same call on the same contract and cannot drift at all.

// The patch to apply to the row that SURVIVES (the real user's), given the row
// that is going away (the visitor's). Only columns that actually change are
// named, so a merge with nothing to say answers an empty patch and writes
// nothing.
export function mergeChoices(
  anonymous: ChoiceColumns, real: ChoiceColumns
): ChoiceColumns {
  const patch: Record<string, unknown> = {};
  for (const column of CHOICE_COLUMNS) {
    const chosen = anonymous[column] ?? real[column] ?? null;
    if (chosen !== (real[column] ?? null)) patch[column] = chosen;
  }
  return patch as ChoiceColumns;
}

// ----------------------------------------------------------------- refusals
//
// RULING 65: a use case states the happy path and calls one of these, so the
// whole of what a checkout can refuse is readable in one place.

// A FAULT, not a refusal: find() creates the row when it is missing and reads
// it back when it lost the create race, so no row at this point means neither
// happened.
export function assertSession<T>(row: T | null | undefined): asserts row is T {
  if (!row) throw new Error("the checkout session could not be created");
}

// ADMIN SCOPING: a customer only ever reaches their OWN row; an admin may name
// a customer and reach theirs. Self-naming never gets here, so this fires only
// when somebody named SOMEBODY ELSE.
export function assertMaySubjectAnother(is_admin: boolean): void {
  if (!is_admin) throw new Forbidden("user_id is admin-only");
}

// Naming a customer who does not exist is refused DISTINCTLY, so the accessor
// answers 404 rather than minting a checkout row for an id nothing owns.
export function assertSubject<T>(
  target: T | null | undefined, named_user_id: string
): asserts target is T {
  if (!target) throw new NotFound(`no user ${named_user_id}`);
}

// WHAT A VISITOR MAY NOT DO (ruling 63). Two things need a real account -
// placing an order and saving a payout account - and both for the same reason:
// they create something that OUTLIVES the session and cannot be re-done. An
// order owned by a throwaway identity the sweep deletes in seven days is a lost
// order; bank numbers sealed against one are worse than refusing.
//
// FORBIDDEN, not 401: the caller has a perfectly good session, and the UI turns
// this into the sign-in prompt rather than a logged-out state.
//
// PURE, and the read is the USE CASE'S (ruling 65): the caller loads the
// identity and this decides.
export function assertRealAccount(anonymous: boolean, action: string): void {
  if (anonymous) throw new Forbidden(`sign in to ${action}`);
}

// The column is `timestamptz` and Postgres would refuse an unparseable literal
// with 22007 - a fault, not a message anyone can act on. Refused here instead,
// naming the field.
export function assertTimestamp(value: unknown): void {
  if (value != null && Number.isNaN(Date.parse(String(value)))) {
    throw new Invalid(`appointment_time is not a timestamp`);
  }
}

// The stepper picks a carrier HANDOFF and never spells a fulfillment method.
export function assertHandoff<T>(
  handoff: T | null | undefined, handoff_code: string
): asserts handoff is T {
  if (!handoff) throw new Invalid(`no such handoff: ${handoff_code}`);
}

// The menu has to mean something: a method type the direction does not offer
// is a step the customer was never shown.
export function assertOfferedMethod(
  method_id: string | undefined, type: string, direction: string
): asserts method_id is string {
  if (!method_id) throw new Invalid(`no offered ${type} method for a ${direction}`);
}

export function assertMethodNamed(chosen: unknown): asserts chosen is string {
  if (typeof chosen !== "string" || chosen.length === 0) {
    throw new Invalid("method_id or handoff_code is required");
  }
}

export function assertDraft<T>(
  draft: T | null | undefined, method_id: string
): asserts draft is T {
  if (!draft) throw new Invalid(`no such fulfillment method: ${method_id}`);
}

// A sale is delivered and paid for; there is nothing to pay OUT.
export function assertPayoutDirection(direction: Direction): void {
  if (direction !== "purchase") {
    throw new Invalid("the payout step belongs to the purchase checkout");
  }
}

// ------------------------------------------------- adopting a visitor's basket
//
// All three are FAULTS. Each answer is a write's own row count inside a
// transaction that read the row a statement earlier, and a zero-row UPDATE does
// not raise (audit:silent-mutations) - so the alternative to throwing is a
// customer signing in and silently losing the basket on their screen.

export function assertRekeyed(rekeyed: boolean, checkout_id: string, user_id: string): void {
  if (!rekeyed) {
    throw new Error(`checkout ${checkout_id} could not be re-keyed to ${user_id}`);
  }
}

export function assertLinesCarried(
  carried: number, expected: number, checkout_id: string
): void {
  if (carried !== expected) {
    throw new Error(`checkout ${checkout_id}: ${expected} line(s) to carry, ${carried} moved`);
  }
}

export function assertVisitorRowGone(
  removed: boolean, visitor_id: string, survivor_id: string
): void {
  if (!removed) {
    throw new Error(`checkout ${visitor_id} survived the merge onto ${survivor_id}`);
  }
}
