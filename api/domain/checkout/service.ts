// The checkout session: the basket, the row the stepper fills in, and the
// draft fulfillment those steps mutate (D208).
//
// ONE FUNCTION PER OPERATION, WITH `direction` AS DATA. Purchase and sale
// differ by one column, and every difference that follows from it is a
// comparison at the point of use - never a pair of near-identical functions.
// The direction arrives already parsed (the transport checks it against the
// contract's `Direction`), so nothing here re-checks it.
import withTransaction from "#shared/db/withTransaction.ts";
import * as checkouts from "#db/checkout/checkouts/repo.ts";
import * as items from "#db/checkout/items/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import * as packagesRepo from "#db/shipping/packages/repo.ts";
import * as servicesRepo from "#db/shipping/services/repo.ts";
import * as paymentMethods from "#db/payments/methods/repo.ts";
import * as ratesService from "#domain/rates/service.ts";
import * as spotsService from "#domain/spots/service.ts";
import * as productService from "#domain/products/service.ts";
import * as fulfillmentService from "#domain/fulfillments/service.ts";
import * as fulfillmentMethods from "#domain/fulfillments/methods/service.ts";
import * as handoffsService from "#domain/shipping/handoffs/service.ts";
import * as payoutDetails from "#domain/payments/details/service.ts";
import * as addressService from "#domain/places/addresses/service.ts";
import * as usersService from "#domain/users/service.ts";
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import * as rules from "#domain/checkout/rules.ts";
import { bidPrice } from "#domain/quotes/rules.ts";
import { lineContent } from "#domain/orders/rules.ts";
import type { CheckoutItemPatch, Direction } from "@dorado/contracts";
import type { CheckoutRow, CheckoutPatch } from "#db/checkout/checkouts/repo.ts";
import type { ItemRow } from "#db/checkout/items/repo.ts";
import type { ComposedFulfillment } from "#domain/fulfillments/compose.ts";
import type { Executor } from "#shared/db/executor.ts";

export type { CheckoutRow, CheckoutPatch } from "#db/checkout/checkouts/repo.ts";

export type ComposedCheckout = CheckoutRow & {
  fulfillment: ComposedFulfillment | null;
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
  user_id: string, direction: Direction
): Promise<ComposedCheckout> {
  return await compose(await ensure(user_id, direction));
}

// Checked as THEIRS. The other reference ids are the foreign keys' to refuse.
const ADDRESS_COLUMNS = [
  "recipient_address_id", "shipper_address_id", "pickup_address_id",
] as const;

export async function patchCheckout(
  user_id: string, direction: Direction, patch: CheckoutPatch
): Promise<ComposedCheckout> {

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

  // appointment_location_id is left to its foreign key: places.locations has
  // no repo (D214 item 7).
  const references = [
    ["package_id", packagesRepo.getOne] as const,
    ["carrier_service_id", servicesRepo.getOne] as const,
    ["payment_method_id", paymentMethods.getOne] as const,
  ];
  for (const [col, getOne] of references) {
    const id = patch[col];
    if (id != null && !(await getOne(String(id)))) {
      throw new Invalid(`${col}: no such row`);
    }
  }

  return await withTransaction(async (client) => {
    const row = await ensure(user_id, direction, client);
    await checkouts.update(row.id, patch, client);
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
  user_id: string, direction: Direction,
  method_id?: string, handoff_code?: string
): Promise<ComposedCheckout> {

  // The stepper picks a carrier HANDOFF and never spells a fulfillment method;
  // the SERVER owns that vocabulary. The schedulable handoff is the carrier
  // pickup.
  let chosen = method_id;
  if (!chosen && handoff_code) {
    const handoffs = await handoffsService.getHandoffs();
    const handoff = handoffs.find((h) => h.code === handoff_code);
    if (!handoff) throw new Invalid(`no such handoff: ${handoff_code}`);
    const type = handoff.requires_schedule ? "CARRIER PICKUP" : "CARRIER DROPOFF";
    const offered = await fulfillmentMethods.listAvailable(direction);
    chosen = offered.find((m) => m.type === type)?.id;
    if (!chosen) throw new Invalid(`no offered ${type} method for a ${direction}`);
  }
  if (typeof chosen !== "string" || chosen.length === 0) {
    throw new Invalid("method_id or handoff_code is required");
  }
  const wanted = chosen;

  return await withTransaction(async (client) => {
    const row = await ensure(user_id, direction, client);

    if (row.fulfillment_id) {
      await fulfillmentMethods.assertOffered({ method_id: wanted, direction: direction }, client);
      await fulfillmentService.setMethod({ id: row.fulfillment_id, method_id: wanted }, client);
    } else {
      const draft = await fulfillmentService.createDraft(
        { method_id: wanted, direction: direction }, client
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
  user_id: string, direction: Direction, form: payoutDetails.PayoutForm
): Promise<ComposedCheckout> {
  if (direction !== "purchase") {
    throw new Invalid("the payout step belongs to the purchase checkout");
  }
  return await withTransaction(async (client) => {
    const row = await ensure(user_id, direction, client);
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

// --------------------------------------------------------------- the basket

// No session is an empty basket, not an error.
export async function listItems(
  user_id: string, direction: Direction, client?: Executor
): Promise<ItemRow[]> {
  const session = await checkouts.findFor(user_id, direction, client);
  if (!session) return [];
  return await items.listFor(session.id, client);
}

// Replaces, never merges; one refused line refuses the whole write.
export async function replaceItems(
  user_id: string, direction: Direction, lines: CheckoutItemPatch[]
): Promise<ItemRow[]> {
  return await withTransaction(async (client) => {
    const session = await ensure(user_id, direction, client);

    const named = [...new Set(
      lines.map((line) => line.bullion_id).filter((id): id is string => !!id)
    )];
    const rows = await rules.basketRows({
      checkout_id: session.id,
      direction,
      items: lines,
      products: await productService.getByIds(named, client),
      liveness: await productService.getLiveness(named, client),
      rates: direction === "purchase" ? await ratesService.getAllRates() : [],
      metalNames: await metalsRepo.namesById(client),
    });

    await items.removeFor(session.id, client);
    await items.createMany(rows, client);
    return await items.listFor(session.id, client);
  });
}

// Answers how many lines went: a DELETE that matched nothing does not raise.
export async function clearItems(
  user_id: string, direction: Direction, client?: Executor
): Promise<number> {
  const write = async (c: Executor) => {
    const session = await checkouts.findFor(user_id, direction, c);
    if (!session) return 0;
    return await items.removeFor(session.id, c);
  };
  return client ? await write(client) : await withTransaction(write);
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

// THE BASKET, PRICED - a purchase checkout's current worth, from the items
// and premiums already on the row (rules.ts's basketRows sets premium at
// write time). What a live carrier is told the parcel is worth reads this
// (domain/shipping/rules.ts declaredValue) - an estimate, the same one
// orders/read.ts makes for an order line with no stored price.
export async function purchaseTotal(checkout_id: string, client?: Executor): Promise<number> {
  const rows = await items.listFor(checkout_id, client);
  if (!rows.length) return 0;
  const [spots, metalNames] = await Promise.all([
    spotsService.getSpotPrices(),
    metalsRepo.namesById(client),
  ]);
  return rows.reduce((sum, row) => {
    const metal = row.metal_id ? (metalNames.get(row.metal_id) ?? null) : null;
    return sum + bidPrice(lineContent(row), row.premium, metal, spots);
  }, 0);
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
