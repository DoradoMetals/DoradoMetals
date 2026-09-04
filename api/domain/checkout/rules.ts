// The basket's rules: rows in, complete rows out or a refusal thrown.
import { Invalid } from "#shared/errors.ts";
import { fineContent } from "#domain/pricing/content.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { lineContent, rateMaterialFor } from "#domain/orders/rules.ts";
import type {
  CarrierHandoff, Checkout, CheckoutItemPatch, CheckoutStep, Direction, RateRead,
} from "@dorado/contracts";
import type { NewItem } from "#db/checkout/items/repo.ts";
import type { Liveness, PublicProductRow } from "#db/products/repo.ts";

export type BasketFacts = {
  checkout_id: string;
  direction: Direction;
  items: CheckoutItemPatch[];
  products: PublicProductRow[];
  liveness: Liveness[];
  rates: RateRead[];
  metalNames: Map<string, string>;
};

// A bullion line names an id and a quantity; the rest is the server's.
const SERVER_OWNED = ["metal_id", "pre_melt", "post_melt", "purity", "unit"] as const;

// Unknown and hidden are refused alike - the message cannot say which ids exist.
function notAvailable(count: number): never {
  throw new Invalid(
    count === 1
      ? "That product is not available"
      : `${count} of those products are not available`
  );
}

function requireLiveProducts(
  items: CheckoutItemPatch[], direction: Direction, byId: Map<string, PublicProductRow>,
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
  byId: Map<string, PublicProductRow>, metalNames: Map<string, string>
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

  // An absent weight or purity prices the customer's metal at nothing.
  for (const column of ["metal_id", "pre_melt", "purity", "unit"] as const) {
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
  byId: Map<string, PublicProductRow>
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
export type ChoiceColumns = Partial<Pick<Checkout, (typeof CHOICE_COLUMNS)[number]>>;

// Every column a step writes. It is `checkouts.PATCHABLE` restated rather than
// imported: this module is PURE - its tests run in the no-database lane, which
// scripts/lib/test-layers.ts derives from what a file imports, and reaching for
// the repo would drag the pool in and move them. The two lists are pinned equal
// by tests/adopt.test.ts, so a column added to the repo fails a test here
// rather than silently stopping being carried across a sign-in.
export const CHOICE_COLUMNS = [
  "payment_method_id", "payment_details_id", "fulfillment_id",
  "fulfillment_method_id", "appointment_location_id", "pickup_address_id",
  "shipper_address_id", "recipient_address_id", "carrier_service_id",
  "package_id", "appointment_time", "pickup_date", "pickup_time",
] as const;

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
