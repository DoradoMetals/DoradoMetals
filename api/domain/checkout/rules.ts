import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import { columnsOf } from "#shared/db/columns.ts";
import { CheckoutItemPatch, CheckoutWrite } from "@dorado/contracts";
import { fineContent } from "#domain/pricing/content.ts";
import { getRatePct, sumContentByMetal } from "#domain/rates/utils/resolveRate.ts";
import { lineContent, rateMaterialFor } from "#domain/orders/rules.ts";
import type {
  BullionLiveness, BullionStorefront, Checkout, CheckoutItemWrite, CheckoutMissing,
  Direction, FulfillmentStep, RateRead,
} from "@dorado/contracts";

const SERVER_OWNED = columnsOf(CheckoutItemPatch.omit({ bullion_id: true, quantity: true }));

const DECLARED_LOT_REQUIRES = columnsOf(
  CheckoutItemPatch.pick({ metal_id: true, pre_melt: true, purity: true, unit: true })
);

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

function snapshot(
  line: CheckoutItemPatch, direction: Direction, checkout_id: string,
  byId: Map<string, BullionStorefront>, metalNames: Map<string, string>
): { row: CheckoutItemWrite; metal: string | null } {
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

function premiums(
  snapshots: ReturnType<typeof snapshot>[], direction: Direction, rates: RateRead[],
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

export function basketRows(
  { checkout_id, direction, items, products, liveness, rates, metalNames }: {
    checkout_id: string;
    direction: Direction;
    items: CheckoutItemPatch[];
    products: BullionStorefront[];
    liveness: BullionLiveness[];
    rates: RateRead[];
    metalNames: Map<string, string>;
  }
): CheckoutItemWrite[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const live = new Set(liveness.filter((p) => p.display === true).map((p) => p.id));
  requireLiveProducts(items, direction, byId, live);

  const snapshots = items.map(
    (line) => snapshot(line, direction, checkout_id, byId, metalNames)
  );
  const resolved = premiums(snapshots, direction, rates, byId);
  return snapshots.map(({ row }, i) => Object.assign(row, { premium: resolved[i] }));
}

export function checkoutState(
  { row, direction, item_count, handover }: {
    row: Checkout;
    direction: Direction;
    item_count: number;
    handover: FulfillmentStep[];
  }
): { missing: CheckoutMissing[] } {
  const missing: CheckoutMissing[] = [];
  if (item_count === 0) missing.push("items");

  if (!row.fulfillment_id) missing.push("fulfillment_id");
  else missing.push(...handover);

  if (direction === "purchase") {
    if (!row.payment_details_id) missing.push("payment_details_id");
  } else if (!row.recipient_address_id) {
    missing.push("recipient_address_id");
  }

  return { missing };
}

export const CHOICE_COLUMNS = columnsOf(CheckoutWrite);

type CheckoutWriteColumns = Partial<Pick<Checkout, (typeof CHOICE_COLUMNS)[number]>>;

export function mergeChoices(
  anonymous: CheckoutWriteColumns, real: CheckoutWriteColumns
): CheckoutWriteColumns {
  const patch: Record<string, unknown> = {};
  for (const column of CHOICE_COLUMNS) {
    const chosen = anonymous[column] ?? real[column] ?? null;
    if (chosen !== (real[column] ?? null)) patch[column] = chosen;
  }
  return patch as CheckoutWriteColumns;
}

export function assertSession<T>(row: T | null | undefined): asserts row is T {
  if (!row) throw new Error("the checkout session could not be created");
}

export function assertMaySubjectAnother(is_admin: boolean): void {
  if (!is_admin) throw new Forbidden("user_id is admin-only");
}

export function assertSubject<T>(
  target: T | null | undefined, named_user_id: string
): asserts target is T {
  if (!target) throw new NotFound(`no user ${named_user_id}`);
}

export function assertRealAccount(anonymous: boolean, action: string): void {
  if (anonymous) throw new Forbidden(`sign in to ${action}`);
}

export function assertPayoutDirection(direction: Direction): void {
  if (direction !== "purchase") {
    throw new Invalid("the payout step belongs to the purchase checkout");
  }
}

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
