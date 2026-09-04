// The checkout session: the basket, the row the stepper fills in, and the
// draft fulfillment those steps mutate (D208).
//
// ONE FUNCTION PER OPERATION, WITH `direction` AS DATA. Purchase and sale
// differ by one column, and every difference that follows from it is a
// comparison at the point of use - never a pair of near-identical functions.
// The direction arrives already parsed (the transport checks it against the
// contract's `Direction`), so nothing here re-checks it.
//
// EVERY WRITE ANSWERS THE COMPOSED ROW (`CheckoutView`), and that row carries
// the server's answer to every question the stepper used to answer for itself:
// what is still missing, whether rates can be quoted, whether the order may be
// placed. The browser renders those fields; it does not compute them.
import withTransaction from "#shared/db/withTransaction.ts";
import {
  anonymousUsers,
  checkouts,
  checkoutItems,
  metals,
  packages,
  carrierServices,
  paymentMethods,
} from "#db";
import {
  addresses as addressService,
  fulfillments as fulfillmentService,
  fulfillmentMethods,
  handoffs as handoffsService,
  paymentDetails as payoutDetails,
  products as productService,
  rates as ratesService,
  spots as spotsService,
  users as usersService,
} from "#domain";
import { Forbidden, Invalid, NotFound } from "#shared/errors.ts";
import * as rules from "#domain/checkout/rules.ts";
import { bidPrice } from "#domain/quotes/rules.ts";
import { lineContent } from "#domain/orders/rules.ts";
import type {
  CheckoutItemPatch, CheckoutPayoutForm, CheckoutView, Direction,
} from "@dorado/contracts";
import type { CheckoutRow, CheckoutPatch } from "#db/checkout/checkouts/repo.ts";
import type { ItemRow } from "#db/checkout/items/repo.ts";
import type { Executor } from "#shared/db/executor.ts";

export type { CheckoutRow, CheckoutPatch } from "#db/checkout/checkouts/repo.ts";

// ------------------------------------------------------------------ the row

// A session exists the moment anyone asks for one. Losing the create race is
// not an error - the winner's row is the answer.
async function find(
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

// A ROW WITH NO ADDRESS TAKES THE CUSTOMER'S DEFAULT ONE. The stepper used to
// do this from an effect on first render, so a checkout opened on a second
// device started blank and a re-render could re-pick. It is the server's now,
// and it runs only while the column is null - which is before the customer has
// chosen anything and after an order reset the row, never over a choice.
async function ensure(
  user_id: string, direction: Direction, client?: Executor
): Promise<CheckoutRow> {
  const row = await find(user_id, direction, client);
  const column = rules.addressColumnFor(direction);
  if (row[column]) return row;

  const book = await addressService.list(user_id, client);
  const preferred =
    book.find((e) => e.user_address.default_shipping && e.address.is_valid) ??
    book.find((e) => e.address.is_valid);
  if (!preferred) return row;

  await checkouts.update(row.id, { [column]: preferred.address.id }, client);
  return (await checkouts.getOne(row.id, client)) ?? row;
}

// The row plus what the stepper needs to render itself. The draft
// fulfillment's METHOD is resolved back into the handoff the customer picked,
// so the browser never learns a carrier's vocabulary (wave 5B) and never
// re-derives which step is next.
async function compose(row: CheckoutRow, client?: Executor): Promise<CheckoutView> {
  const fulfillment = row.fulfillment_id
    ? await fulfillmentService.getById(row.fulfillment_id, client)
    : null;
  const method_type = fulfillment?.method.type ?? null;
  const handoff = method_type
    ? rules.handoffFor(await handoffsService.getHandoffs(null, client), method_type)
    : null;
  const requires_schedule = handoff?.requires_schedule === true;
  const item_count = (await checkoutItems.listFor(row.id, client)).length;

  return Object.assign(
    row,
    {
      fulfillment_method_type: method_type,
      handoff_code: handoff?.code ?? null,
      requires_schedule,
      item_count,
    },
    rules.checkoutState({
      row,
      direction: row.direction as Direction,
      item_count,
      requires_schedule,
      has_fulfillment: !!row.fulfillment_id,
    })
  );
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

// WHAT A VISITOR MAY NOT DO (ruling 63). An anonymous better-auth user is an
// ordinary subject everywhere above: they build a basket, save an address,
// choose a box, get live rates and see priced quotes, all on the same rows and
// the same code as a customer. Two things need a real account, and both for the
// same reason - they create something that OUTLIVES the session and cannot be
// re-done:
//
//   PLACING AN ORDER. It takes money, buys a label and is a permanent record
//   against a person. An order owned by a throwaway identity the sweep deletes
//   in seven days is a lost order.
//
//   SAVING A PAYOUT ACCOUNT. Bank numbers are sealed at rest against a user id
//   (payments/details, D210). Sealing a customer's account details to an
//   identity that is about to be deleted is worse than refusing.
//
// It is a FORBIDDEN, not a 401: the caller has a perfectly good session, and
// the UI turns this into the sign-in prompt rather than a logged-out state.
export async function assertRealAccount(user_id: string, action: string): Promise<void> {
  if (await anonymousUsers.isAnonymous(user_id)) {
    throw new Forbidden(`sign in to ${action}`);
  }
}

export async function getCheckout(
  user_id: string, direction: Direction
): Promise<CheckoutView> {
  return await compose(await ensure(user_id, direction));
}

// Checked as THEIRS. The other reference ids are the foreign keys' to refuse.
const ADDRESS_COLUMNS = [
  "recipient_address_id", "shipper_address_id", "pickup_address_id",
] as const;

export async function patchCheckout(
  user_id: string, direction: Direction, patch: CheckoutPatch
): Promise<CheckoutView> {

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
    ["package_id", packages.getOne] as const,
    ["carrier_service_id", carrierServices.getOne] as const,
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
): Promise<CheckoutView> {

  // The stepper picks a carrier HANDOFF and never spells a fulfillment method;
  // the SERVER owns that vocabulary - rules.methodTypeFor, which compose()
  // reads back the other way so the choice and its read-back cannot drift.
  let chosen = method_id;
  if (!chosen && handoff_code) {
    const handoffs = await handoffsService.getHandoffs();
    const handoff = handoffs.find((h) => h.code === handoff_code);
    if (!handoff) throw new Invalid(`no such handoff: ${handoff_code}`);
    const type = rules.methodTypeFor(handoff);
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
      await checkouts.update(row.id, { fulfillment_id: draft.fulfillment.id }, client);
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
  user_id: string, direction: Direction, form: CheckoutPayoutForm
): Promise<CheckoutView> {
  if (direction !== "purchase") {
    throw new Invalid("the payout step belongs to the purchase checkout");
  }
  await assertRealAccount(user_id, "save a payout account");
  return await withTransaction(async (client) => {
    const row = await ensure(user_id, direction, client);
    const saved = await payoutDetails.saveCheckoutPayout(
      user_id, row.payment_details_id, form, client
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
  return await checkoutItems.listFor(session.id, client);
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
    const rows = rules.basketRows({
      checkout_id: session.id,
      direction,
      items: lines,
      products: await productService.getByIds(named, client),
      liveness: await productService.getLiveness(named, client),
      rates: direction === "purchase" ? await ratesService.getAllRates() : [],
      metalNames: await metals.namesById(client),
    });

    await checkoutItems.removeFor(session.id, client);
    await checkoutItems.createMany(rows, client);
    return await checkoutItems.listFor(session.id, client);
  });
}

// Answers how many lines went: a DELETE that matched nothing does not raise.
export async function clearItems(
  user_id: string, direction: Direction, client?: Executor
): Promise<number> {
  const write = async (c: Executor) => {
    const session = await checkouts.findFor(user_id, direction, c);
    if (!session) return 0;
    return await checkoutItems.removeFor(session.id, c);
  };
  return client ? await write(client) : await withTransaction(write);
}

// ------------------------------------------------- what order creation reads
//
// domain/orders/place.ts consumes a checkout THROUGH this service, never the
// repos.

export async function getRowById(checkout_id: string, client?: Executor) {
  return await checkouts.getOne(checkout_id, client);
}

export async function getItemsForOrder(checkout_id: string, client?: Executor) {
  return await checkoutItems.listForOrder(checkout_id, client);
}

// THE BASKET, PRICED - a purchase checkout's current worth, from the items
// and premiums already on the row (rules.ts's basketRows sets premium at
// write time). What a live carrier is told the parcel is worth reads this
// (domain/shipping/rules.ts declaredValue) - an estimate, the same one
// orders/read.ts makes for an order line with no stored price.
export async function purchaseTotal(checkout_id: string, client?: Executor): Promise<number> {
  const rows = await checkoutItems.listFor(checkout_id, client);
  if (!rows.length) return 0;
  const [spots, metalNames] = await Promise.all([
    spotsService.getSpotPrices(),
    metals.namesById(client),
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
