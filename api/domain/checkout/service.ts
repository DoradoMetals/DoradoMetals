// The checkout session: the basket, the row the stepper fills in, and the
// draft fulfillment those steps mutate (D208).
//
// ONE FUNCTION PER OPERATION, WITH `direction` AS DATA. Purchase and sale
// differ by one column, and every difference that follows from it lives in
// rules.ts - never in a pair of near-identical functions.
import withTransaction from "#shared/db/withTransaction.ts";
import * as checkouts from "#db/checkout/checkouts/repo.ts";
import * as items from "#db/checkout/items/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import * as productService from "#domain/products/service.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as fulfillmentMethods from "#domain/fulfillments/methods/service.ts";
import * as handoffsService from "#domain/shipping/handoffs/service.ts";
import * as payoutDetails from "#domain/payments/details/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as usersService from "#domain/users/service.ts";
import {
  assertDirection, livenessFlag, carriesProductPremium, hasPayoutStep,
} from "#domain/checkout/rules.ts";
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import type { Direction } from "#domain/checkout/rules.ts";
import type { CheckoutRow, CheckoutPatch } from "#db/checkout/checkouts/repo.ts";
import type {
  NewItem, SaleBullionLine, PurchaseBullionLine, ScrapLine,
} from "#db/checkout/items/repo.ts";
import type { ComposedFulfillment } from "#domain/fulfillments/compose.ts";
import type { Executor } from "#shared/db/executor.ts";

export type { Direction } from "#domain/checkout/rules.ts";
export type { CheckoutRow, CheckoutPatch } from "#db/checkout/checkouts/repo.ts";

export type ComposedCheckout = CheckoutRow & {
  fulfillment: ComposedFulfillment | null;
};

// A sell-cart line is either scrap or a product, told apart by `type` - the
// union the frontend already switches on.
export type SellCartLine =
  | { type: "scrap"; data: ScrapLine }
  | { type: "product"; data: PurchaseBullionLine };

// What a caller adds to a buy cart.
export type CartLineInput = { id: string; quantity: number };

// What a caller replaces a sell cart with. A line is either a named product or
// a piece of scrap carrying its own values; anything else is skipped rather
// than rejected.
export type SellCartLineInput = {
  type?: string;
  quantity?: number;
  product_name?: string;
  data?: {
    id?: string;
    // Both name spellings are accepted while deployed frontends straddle the
    // products rename (D73).
    name?: string;
    product_name?: string;
    quantity?: number;
    metal?: string;
    pre_melt?: number | null;
    post_melt?: number | null;
    purity?: number | null;
    content?: number | null;
    gross_unit?: string | null;
    bid_premium?: number | null;
  };
};

// ------------------------------------------------------------------ the row

// A session exists the moment anyone asks for one. Losing the create race is
// not an error - the winner's row is the answer.
async function ensure(
  user_id: string, direction: Direction, client?: Executor
): Promise<CheckoutRow> {
  const found = await checkouts.findFor(user_id, direction, client);
  if (found) return found;
  const created = await checkouts.create({ user_id, direction }, client);
  if (created) return created;
  const raced = await checkouts.findFor(user_id, direction, client);
  if (!raced) throw new Error("the checkout session could not be created");
  return raced;
}

async function compose(row: CheckoutRow, client?: Executor): Promise<ComposedCheckout> {
  const fulfillment = row.fulfillment_id
    ? await fulfillmentService.getById(row.fulfillment_id, client)
    : null;
  return Object.assign({ fulfillment }, row);
}

// ADMIN SCOPING (D214 item 11's "narrow thing"): a customer only ever reaches
// their OWN checkout row; an admin may name a customer and reach theirs - the
// same shape createOrderFromCheckout already grants for the order create
// itself. `named` is whatever a request's own `user_id` said, and self-naming
// is a no-op so a deployed client that always sends its own id (the cart
// auto-sync does) never trips the admin check. Naming somebody ELSE without
// being an admin is refused; naming somebody who does not exist is refused
// distinctly, so the accessor answers 404 rather than minting a checkout row
// for an id nothing owns.
export async function resolveSubject(
  caller_id: string, is_admin: boolean, named_user_id?: string
): Promise<string> {
  if (!named_user_id || named_user_id === caller_id) return caller_id;
  if (!is_admin) throw new Forbidden("user_id is admin-only");
  const target = await usersService.getUser(named_user_id);
  if (!target) throw new NotFound(`no user ${named_user_id}`);
  return target.id;
}

export async function getCheckout(
  user_id: string, direction: unknown
): Promise<ComposedCheckout> {
  const dir = assertDirection(direction);
  return await compose(await ensure(user_id, dir));
}

// The three address slots are checked as THEIRS - the same ownership rule the
// address routes enforce. The reference ids (method, package, service,
// location) are validated by their foreign keys: a 23503 comes back as a 400
// naming the column, not a 500.
const ADDRESS_COLUMNS = [
  "recipient_address_id", "shipper_address_id", "pickup_address_id",
] as const;

export async function patchCheckout(
  user_id: string, direction: unknown, patch: CheckoutPatch
): Promise<ComposedCheckout> {
  const dir = assertDirection(direction);

  for (const col of ADDRESS_COLUMNS) {
    const id = patch[col];
    if (id != null && !(await addressService.inBook(String(id), user_id))) {
      throw new Invalid(`${col}: that address is not in your book`);
    }
  }
  if (
    patch.appointment_time != null &&
    Number.isNaN(Date.parse(String(patch.appointment_time)))
  ) {
    throw new Invalid(`appointment_time is not a timestamp`);
  }
  for (const col of ["package_weight", "declared_value"] as const) {
    const value = patch[col];
    if (value != null && !(Number(value) >= 0)) {
      throw new Invalid(`${col} must be a non-negative number`);
    }
  }

  return await withTransaction(async (client) => {
    const row = await ensure(user_id, dir, client);
    try {
      await checkouts.update(row.id, patch, client);
    } catch (err) {
      if ((err as { code?: string }).code === "23503") {
        const detail = (err as { constraint?: string }).constraint ?? "a reference";
        throw new Invalid(`no such row for ${detail}`);
      }
      throw err;
    }
    const fresh = await checkouts.getOne(row.id, client);
    if (!fresh) throw new Error("the checkout session vanished mid-write");
    return await compose(fresh, client);
  });
}

// THE DRAFT FULFILLMENT, ensured and mutated in one call (Jacob: "each time an
// option is changed, the server-side fulfillment gets updated, and checkout
// stores the fulfillment id"). The offered-method check runs on BOTH paths -
// this is the customer's surface and the menu has to mean something.
export async function setFulfillmentMethod(
  user_id: string, direction: unknown,
  method_id?: string, handoff_code?: string
): Promise<ComposedCheckout> {
  const dir = assertDirection(direction);

  // The stepper picks a carrier HANDOFF and never spells a fulfillment method;
  // the SERVER owns that vocabulary. The schedulable handoff is the carrier
  // pickup.
  let chosen = method_id;
  if (!chosen && handoff_code) {
    const handoffs = await handoffsService.getHandoffs();
    const handoff = handoffs.find((h) => h.code === handoff_code);
    if (!handoff) throw new Invalid(`no such handoff: ${handoff_code}`);
    const type = handoff.requires_schedule ? "CARRIER PICKUP" : "CARRIER DROPOFF";
    const offered = await fulfillmentMethods.listAvailable(dir);
    chosen = offered.find((m) => m.type === type)?.id;
    if (!chosen) throw new Invalid(`no offered ${type} method for a ${dir}`);
  }
  if (typeof chosen !== "string" || chosen.length === 0) {
    throw new Invalid("method_id or handoff_code is required");
  }
  const wanted = chosen;

  return await withTransaction(async (client) => {
    const row = await ensure(user_id, dir, client);

    if (row.fulfillment_id) {
      await fulfillmentMethods.assertOffered({ method_id: wanted, direction: dir }, client);
      await fulfillmentService.setMethod({ id: row.fulfillment_id, method_id: wanted }, client);
    } else {
      const draft = await fulfillmentService.createDraft(
        { method_id: wanted, direction: dir }, client
      );
      if (!draft) throw new Invalid(`no such fulfillment method: ${wanted}`);
      await checkouts.update(row.id, { fulfillment_id: draft.id }, client);
    }

    const fresh = await checkouts.getOne(row.id, client);
    if (!fresh) throw new Error("the checkout session vanished mid-write");
    return await compose(fresh, client);
  });
}

// THE PAYOUT STEP (D210): the bank form is recorded here, at step time - the
// numbers sealed at rest by the payments/details service - and creation later
// LINKS the row. The details id is stable per checkout, so edits rewrite in
// place.
export async function saveCheckoutPayout(
  user_id: string, direction: unknown, form: payoutDetails.PayoutForm
): Promise<ComposedCheckout> {
  const dir = assertDirection(direction);
  if (!hasPayoutStep(dir)) {
    throw new Invalid("the payout step belongs to the purchase checkout");
  }
  return await withTransaction(async (client) => {
    const row = await ensure(user_id, dir, client);
    const saved = await payoutDetails.saveCheckoutPayout(
      { user_id, existing_id: row.payment_details_id, form }, client
    );
    await checkouts.update(
      row.id,
      { payment_details_id: saved.id, payment_method_id: saved.method_id },
      client
    );
    const fresh = await checkouts.getOne(row.id, client);
    if (!fresh) throw new Error("the checkout session vanished mid-write");
    return await compose(fresh, client);
  });
}

// ---------------------------------------------------------------- the cart

// A CART MAY ONLY HOLD PRODUCTS THAT ARE LIVE IN THAT DIRECTION. The storefront
// only ever shows live products, so the frontend never asks for a hidden one -
// but the cart endpoints take a product id from the request body and nothing
// checked it, so a caller posting straight to the API could put any id in a
// cart, including the 25 products carrying a zero ask premium.
//
// An unknown id is refused the same way a hidden one is: telling them apart in
// the message would confirm which ids exist.
async function refuseProductsThatAreNotLive(
  ids: (string | undefined)[], direction: Direction, executor?: Executor
): Promise<void> {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === "string" && !!id))];
  if (unique.length === 0) return;

  const flag = livenessFlag(direction);
  const rows = await productService.getLiveness(unique, executor);
  const live = new Set(rows.filter((r) => r[flag] === true).map((r) => r.id));
  const refused = unique.filter((id) => !live.has(id));

  if (refused.length > 0) {
    throw new Invalid(refused.length === 1
        ? "That product is not available"
        : `${refused.length} of those products are not available`);
  }
}

export function getCart(user_id: string, direction: "sale"): Promise<SaleBullionLine[]>;
export function getCart(user_id: string, direction: "purchase"): Promise<SellCartLine[]>;
export async function getCart(
  user_id: string, direction: Direction
): Promise<SaleBullionLine[] | SellCartLine[]> {
  const session = await checkouts.findFor(user_id, direction);
  if (!session) return [];

  if (direction === "sale") return await items.listBullionFor(session.id, "sale");

  const scrap = await items.listScrapFor(session.id);
  const products = await items.listBullionFor(session.id, "purchase");
  const scrapLines: SellCartLine[] = scrap.map((data) => ({ type: "scrap", data }));
  const productLines: SellCartLine[] = products.map((data) => ({ type: "product", data }));
  return scrapLines.concat(productLines);
}

// The lines a request asks for, resolved into rows this schema can hold. ONE
// function with `direction` as data: the catalogue read is what supplies a
// product's metal and its bid premium, because a request never names either.
async function requestedLines(
  session_id: string,
  direction: Direction,
  lines: CartLineInput[] | SellCartLineInput[],
  client: Executor
): Promise<NewItem[]> {
  // WHICH CATALOGUE PRODUCT EACH LINE NAMES. A buy-cart line carries the id; a
  // sell-cart line carries the NAME, and reading only a top-level
  // `product_name` is what silently skipped every product line in a synced
  // sell cart (D73).
  const wanted = new Map<object, string>();
  for (const line of lines) {
    if (direction === "sale") {
      const id = (line as CartLineInput)?.id;
      if (id) wanted.set(line, id);
      continue;
    }
    const sell = line as SellCartLineInput;
    if (sell?.type !== "product") continue;
    const name = sell?.product_name ?? sell?.data?.name ?? sell?.data?.product_name;
    if (!name) continue;
    const id = await productService.findProductIdByName(name, client);
    if (id) wanted.set(line, id);
  }

  const catalogue = await productService.getByIds([...wanted.values()], client);
  const byId = new Map(catalogue.map((product) => [product.id, product]));
  const metals = await metalsRepo.idsByName(client);

  const out: NewItem[] = [];
  for (const line of lines) {
    const sell = line as SellCartLineInput;
    // Quantity rides on the line's data in the sell cart's shape; the
    // top-level one is read first and is the only one a buy-cart line has.
    const quantity = sell?.quantity ?? sell?.data?.quantity ?? 1;

    const product = byId.get(wanted.get(line) ?? "");
    if (product) {
      const { id: bullion_id, metal_id, bid_premium } = product;
      out.push({
        checkout_id: session_id,
        bullion_id,
        metal_id,
        quantity,
        premium: carriesProductPremium(direction) ? bid_premium : null,
      });
      continue;
    }

    // A line that names no live product is SKIPPED rather than refused - the
    // refusal that matters already ran, on the ids the request named.
    if (sell?.type !== "scrap" || !sell?.data?.id) continue;
    const { metal, pre_melt, post_melt, purity, content, gross_unit, bid_premium } =
      sell.data;
    out.push({
      checkout_id: session_id,
      bullion_id: null,
      metal_id: metals.get(metal ?? "") ?? null,
      pre_melt,
      post_melt,
      purity,
      content,
      unit: gross_unit,
      premium: bid_premium,
      quantity,
    });
  }
  return out;
}

// THE SYNC REPLACES, IT DOES NOT MERGE. The frontend refetches, so nothing is
// returned.
export function syncCart(
  user_id: string, direction: "sale", lines: CartLineInput[]
): Promise<void>;
export function syncCart(
  user_id: string, direction: "purchase", lines: SellCartLineInput[]
): Promise<void>;
export async function syncCart(
  user_id: string, direction: Direction, lines: CartLineInput[] | SellCartLineInput[]
): Promise<void> {
  const dir = assertDirection(direction);
  if (!Array.isArray(lines)) throw new Invalid("Invalid payload");

  // The ids a request NAMES, which is what the liveness rule judges. A scrap
  // line names no product and so has nothing to check.
  const named =
    dir === "sale"
      ? (lines as CartLineInput[]).map((line) => line?.id)
      : (lines as SellCartLineInput[])
          .filter((line) => line?.type === "product")
          .map((line) => line?.data?.id);

  await withTransaction(async (client) => {
    await refuseProductsThatAreNotLive(named, dir, client);
    const session = await ensure(user_id, dir, client);
    const rows = await requestedLines(session.id, dir, lines, client);

    await items.removeFor(session.id, client);
    for (const row of rows) await items.create(row, client);
  });
}

// ------------------------------------------------- what order creation reads
//
// domain/orders/create.ts consumes a checkout THROUGH this service, never the
// repos.

export async function getRowById(checkout_id: string, client?: Executor) {
  return await checkouts.getOne(checkout_id, client);
}

export async function getItemsForOrder(checkout_id: string, client?: Executor) {
  return await items.listForOrder(checkout_id, client);
}

export async function getRowFor(user_id: string, direction: Direction, client?: Executor) {
  return await ensure(user_id, direction, client);
}

// After an order consumes the checkout (D208) the choices are the ORDER's, so
// the row goes back to empty and the next checkout starts clean. Built from the
// repo's own whitelist, so a column added there cannot be left behind here.
const CLEARED: CheckoutPatch = Object.fromEntries(
  checkouts.PATCHABLE.map((column) => [column, null])
);

export async function resetAfterOrder(
  user_id: string, direction: Direction, client?: Executor
): Promise<void> {
  const row = await checkouts.findFor(user_id, direction, client);
  if (!row) return;
  await checkouts.update(row.id, CLEARED, client);
}
