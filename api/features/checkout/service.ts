import withTransaction from "#shared/db/withTransaction.ts";
import type { Executor } from "#shared/db/executor.ts";
import * as cartRepo from "#features/checkout/repo.js";
// The SERVICE, not a repo: products is composed from three reference tables
// now, and liveness is the one question checkout asks of it.
import * as productService from "#features/products/service.ts";
import type {
  SaleItemRow,
  SaleItemsInput,
  PurchaseItemsInput,
  PurchaseScrapRow,
  PurchaseProductRow,
} from "#features/checkout/repo.next.ts";

// NOTE THE FIELD IS `status`, NOT `statusCode`. addresses and users both throw
// a statusCode; this feature has always thrown status. Left as it is rather
// than unified here - errorHandler is what decides which it reads, and changing
// which errors reach a customer is not a typing change.
interface HttpError extends Error {
  status?: number;
}

function badRequest(message: string): HttpError {
  const err: HttpError = new Error(message);
  err.status = 400;
  return err;
}

export async function getCart(user_id: string): Promise<SaleItemRow[]> {
  return await cartRepo.getCart(user_id);
}

// A CART MAY ONLY HOLD PRODUCTS THAT ARE LIVE IN THAT DIRECTION.
//
// The storefront only ever shows live products, so the frontend never asks for
// a hidden one - but the cart endpoints take a product id from the request body
// and nothing checked it. A caller posting straight to the API could put any
// id in a cart, including the 25 products carrying a zero ask premium, none of
// which is displayed and every one of which would price at nothing.
//
// The two directions are separate flags and are checked separately: `display`
// governs buying from the business, `sell_display` governs selling to it. A
// product can legitimately be one and not the other, so neither is a proxy for
// the other.
//
// An unknown id is refused the same way a hidden one is. It reaches this point
// only from a caller inventing ids, and telling the difference apart in the
// message would confirm which ids exist.
async function refuseProductsThatAreNotLive(
  ids: string[],
  direction: "display" | "sell_display",
  executor?: unknown
): Promise<void> {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id))];
  if (unique.length === 0) return;

  const rows = await productService.getLiveness(unique, executor as never);
  const live = new Set(
    rows.filter((r: Record<string, unknown>) => r[direction] === true).map((r: { id: string }) => r.id)
  );
  const refused = unique.filter((id) => !live.has(id));

  if (refused.length > 0) {
    throw badRequest(
      refused.length === 1
        ? "That product is not available"
        : `${refused.length} of those products are not available`
    );
  }
}

// Returns a MESSAGE, not the cart. The frontend refetches.
export async function syncCart(user_id: string, items: SaleItemsInput[]): Promise<string> {
  return withTransaction(async (client) => {
    await refuseProductsThatAreNotLive(
      (items ?? []).map((i) => i?.id),
      "display",
      client
    );
    await cartRepo.replaceCart(user_id, items, client);
    return "Cart Synced";
  });
}

// A sell cart line is either scrap or a product, told apart by `type`, and the
// two carry different data. The union is what the frontend already switches on.
type SellCartLine =
  | { type: "scrap"; data: PurchaseScrapRow & { id: string } }
  | { type: "product"; data: PurchaseProductRow };

export async function getSellCart(user_id?: string): Promise<SellCartLine[]> {
  if (!user_id) {
    throw badRequest("Missing user_id");
  }

  const cartId = await cartRepo.getSellCartId(user_id);
  if (!cartId) return [];

  const scrapRows = await cartRepo.getSellCartScrapItems(cartId);
  const scrapItems: SellCartLine[] = scrapRows.map((row: PurchaseScrapRow) => ({
    type: "scrap",
    data: {
      ...row,
      // AFTER the spread, not before it. The original wrote `id: row.scrap_id`
      // first and `...row` overwrote it immediately - TS2783 - so the line had
      // no effect. Checked both implementations before moving it: exchange
      // joins `sci.scrap_id = s.id` and projects `s.*`, and the new schema
      // projects `ci.id` under both names, so `id` and `scrap_id` are equal by
      // construction on either side and this changes no value today. It is
      // moved rather than deleted so the author's intent survives if they ever
      // stop being equal.
      id: row.scrap_id,
      // Numeric columns come back as strings from some drivers and as numbers
      // from others depending on the parser; coerced here so the frontend never
      // has to guess. See api/db.js - the NUMERIC parsers live next to the pool
      // for exactly this reason.
      pre_melt: Number(row.pre_melt),
      purity: Number(row.purity),
      content: Number(row.content),
      quantity: row.quantity,
      bid_premium: Number(row.bid_premium),
    },
  }));

  const productRows = await cartRepo.getSellCartProductItems(cartId);
  const productItems: SellCartLine[] = productRows.map((row: PurchaseProductRow) => ({
    type: "product",
    data: {
      ...row,
      quantity: row.quantity,
    },
  }));

  return [...scrapItems, ...productItems];
}

export async function syncSellCart(
  user_id?: string,
  cart?: PurchaseItemsInput[]
): Promise<string> {
  if (!user_id || !Array.isArray(cart)) {
    throw badRequest("Invalid payload");
  }

  return withTransaction(async (client) => {
    // Only the product lines. A scrap line carries its own values and names no
    // product, so it has nothing to check.
    await refuseProductsThatAreNotLive(
      cart.filter((l) => l?.type === "product").map((l) => l?.data?.id as string),
      "sell_display",
      client
    );
    await cartRepo.replaceSellCart(user_id, cart, client);
    return "Sell Cart Synced";
  });
}

// ------------------------------------------------------------- the row (D208)
//
// THE CHECKOUT ROW FLOW, Jacob's design for the checkout conversion: the
// stepper writes IDS into the customer's checkout row as they decide, the
// fulfillment is a live DRAFT the same steps mutate, and order creation
// consumes what the server already holds instead of a composed request body.
//
// Native-only, deliberately, whatever CHECKOUT_SOURCE says: exchange's carts
// have no equivalent columns - the same capability argument that made
// fulfillments switchless. The repo.next import below reaches no switch
// because there is nothing behind one to reach.
import * as checkoutRows from "#features/checkout/repo.next.ts";
import * as fulfillmentService from "#features/fulfillments/service.ts";
import * as fulfillmentMethods from "#features/fulfillments/methods/service.ts";
import * as handoffsService from "#features/shipping/handoffs/service.ts";
import * as addressService from "#features/places/addresses/service.ts";
import type { CheckoutRow, CheckoutPatch } from "#features/checkout/repo.next.ts";
import type { ComposedFulfillment } from "#features/fulfillments/compose.ts";

export type ComposedCheckout = CheckoutRow & {
  fulfillment: ComposedFulfillment | null;
};

type RowDirection = "sale" | "purchase";

function assertDirection(direction: unknown): RowDirection {
  if (direction !== "sale" && direction !== "purchase") {
    throw badRequest(`direction must be 'sale' or 'purchase'`);
  }
  return direction;
}

export async function getCheckout(
  user_id: string, direction: unknown
): Promise<ComposedCheckout> {
  const dir = assertDirection(direction);
  const row = await checkoutRows.getRow(user_id, dir);
  const fulfillment = row.fulfillment_id
    ? await fulfillmentService.getById(row.fulfillment_id)
    : null;
  return { ...row, fulfillment };
}

// The columns a customer may write, each validated as THEIRS where a row can
// belong to somebody: the three address slots check the caller's own book
// (places.user_addresses), exactly the ownership rule the address routes
// enforce. The reference ids (method, package, service, location) are
// validated by their foreign keys - a 23503 comes back as a 400 naming the
// column, not a 500.
const ADDRESS_COLUMNS = [
  "recipient_address_id", "shipper_address_id", "pickup_address_id",
] as const;

export async function patchCheckout(
  user_id: string, direction: unknown, patch: CheckoutPatch
): Promise<ComposedCheckout> {
  const dir = assertDirection(direction);

  for (const col of ADDRESS_COLUMNS) {
    const id = patch[col];
    if (id != null) {
      const owned = await addressService.inBook(id, user_id);
      if (!owned) {
        throw badRequest(`${col}: that address is not in your book`);
      }
    }
  }
  if (patch.appointment_time != null && Number.isNaN(Date.parse(patch.appointment_time))) {
    throw badRequest(`appointment_time is not a timestamp`);
  }

  try {
    const row = await checkoutRows.patchRow(user_id, dir, patch);
    const fulfillment = row.fulfillment_id
      ? await fulfillmentService.getById(row.fulfillment_id)
      : null;
    return { ...row, fulfillment };
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      const detail = (err as { constraint?: string }).constraint ?? "a reference";
      throw badRequest(`no such row for ${detail}`);
    }
    throw err;
  }
}

// THE DRAFT FULFILLMENT, ensured and mutated in one call (Jacob: "each time an
// option is changed, the server-side fulfillment gets updated, and checkout
// stores the fulfillment id"). First call creates the draft and links it; every
// later call moves its method in place. The offered-method check runs on BOTH
// paths - this is the customer's surface, and the menu has to mean something.
export async function setFulfillmentMethod(
  user_id: string, direction: unknown,
  method_id?: string, handoff_code?: string
): Promise<ComposedCheckout> {
  const dir = assertDirection(direction);

  // The stepper picks a carrier HANDOFF (Store Dropoff / Carrier Pickup) and
  // never spells a fulfillment method; the SERVER owns that vocabulary. The
  // schedulable handoff is the carrier pickup - the same capability rule the
  // create resolves by, in the other direction.
  if (!method_id && handoff_code) {
    const handoffs = await handoffsService.getHandoffs();
    const handoff = handoffs.find((h) => h.code === handoff_code);
    if (!handoff) throw badRequest(`no such handoff: ${handoff_code}`);
    const type = handoff.requires_schedule ? "CARRIER PICKUP" : "CARRIER DROPOFF";
    const offered = await fulfillmentMethods.listAvailable(dir);
    method_id = offered.find((m) => m.type === type)?.id;
    if (!method_id) {
      throw badRequest(`no offered ${type} method for a ${dir}`);
    }
  }
  if (typeof method_id !== "string" || method_id.length === 0) {
    throw badRequest("method_id or handoff_code is required");
  }

  return await withTransaction(async (client) => {
    const row = await checkoutRows.getRow(user_id, dir, client);

    if (row.fulfillment_id) {
      await fulfillmentMethods.assertOffered({ method_id, direction: dir }, client);
      await fulfillmentService.setMethod(
        { id: row.fulfillment_id, method_id, updated_by_id: user_id }, client
      );
    } else {
      const draft = await fulfillmentService.createDraft(
        { method_id, direction: dir, created_by_id: user_id }, client
      );
      if (!draft) throw badRequest(`no such fulfillment method: ${method_id}`);
      await checkoutRows.linkFulfillment(user_id, dir, draft.id, client);
    }

    const fresh = await checkoutRows.getRow(user_id, dir, client);
    const fulfillment = fresh.fulfillment_id
      ? await fulfillmentService.getById(fresh.fulfillment_id, client)
      : null;
    return { ...fresh, fulfillment };
  });
}

// ------------------------------------------------- what order creation reads
//
// features/orders/create.ts consumes a checkout THROUGH this service - never
// the repo (Jacob's layering rule, and audit:switches' bypass scan enforces
// it). Row-column reads are native-only by the capability argument above; the
// switch governs the CART halves, and these do not touch them.

export async function getRowById(checkout_id: string, client?: Executor) {
  return await checkoutRows.getRowById(checkout_id, client);
}

export async function getItemsForOrder(checkout_id: string, client?: Executor) {
  return await checkoutRows.getItemsForOrder(checkout_id, client);
}

export async function getRowFor(user_id: string, direction: RowDirection, client?: Executor) {
  return await checkoutRows.getRow(user_id, direction, client);
}

export async function resetAfterOrder(
  user_id: string, direction: RowDirection, client?: Executor
) {
  await checkoutRows.resetRow(user_id, direction, client);
}
