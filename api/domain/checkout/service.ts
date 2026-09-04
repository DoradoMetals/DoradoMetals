import withTransaction from "#shared/db/withTransaction.ts";
import { anonymousUsers, checkouts, checkoutItems, metals } from "#db";
import {
  addresses as addressService,
  fulfillments as fulfillmentService,
  paymentDetails as payoutDetails,
  products as productService,
  rates as ratesService,
  spots as spotsService,
  users as usersService,
} from "#domain";
import * as rules from "#domain/checkout/rules.ts";
import { bidPrice } from "#domain/quotes/rules.ts";
import { lineContent } from "#domain/orders/rules.ts";
import type {
  Checkout, CheckoutItem, CheckoutItemPatch, CheckoutPayoutForm, CheckoutView,
  CheckoutWrite, Direction, OrderLine,
} from "@dorado/contracts";
import type { Executor } from "#shared/db/executor.ts";

async function find(
  user_id: string, direction: Direction, client?: Executor
): Promise<Checkout> {
  const found = await checkouts.findFor(user_id, direction, client);
  if (found) return found;
  const created = await checkouts.create({ user_id, direction }, client);
  if (created) return created;
  const raced = await checkouts.findFor(user_id, direction, client);
  rules.assertSession(raced);
  return raced;
}

async function ensure(
  user_id: string, direction: Direction, client?: Executor
): Promise<Checkout> {
  const row = await find(user_id, direction, client);
  if (direction !== "sale" || row.recipient_address_id) return row;

  const book = await addressService.list(user_id, client);
  const preferred =
    book.find((e) => e.user_address.default_shipping && e.address.is_valid) ??
    book.find((e) => e.address.is_valid);
  if (!preferred) return row;

  return (
    await checkouts.update(row.id, { recipient_address_id: preferred.address.id }, client)
  ) ?? row;
}

async function compose(row: Checkout, client?: Executor): Promise<CheckoutView> {
  const item_count = (await checkoutItems.listFor(row.id, client)).length;
  const handover = row.fulfillment_id
    ? await fulfillmentService.missing(row.fulfillment_id, client)
    : [];

  return Object.assign(
    row,
    rules.checkoutState({
      row,
      direction: row.direction as Direction,
      item_count,
      handover,
    })
  );
}

export async function missingFor(
  row: Checkout, client?: Executor
): Promise<CheckoutView["missing"]> {
  return (await compose(row, client)).missing;
}

export async function attachFulfillment(
  checkout_id: string, fulfillment_id: string, client?: Executor
): Promise<Checkout> {
  const fresh = await checkouts.update(checkout_id, { fulfillment_id }, client);
  rules.assertSession(fresh);
  return fresh;
}

export async function ownerOfFulfillment(
  fulfillment_id: string, client?: Executor
): Promise<Checkout | undefined> {
  return await checkouts.findByFulfillment(fulfillment_id, client);
}

export async function resolveSubject(
  caller_id: string, is_admin: boolean, named_user_id?: string
): Promise<string> {
  if (!named_user_id || named_user_id === caller_id) return caller_id;
  rules.assertMaySubjectAnother(is_admin);
  const target = await usersService.getUser(named_user_id);
  rules.assertSubject(target, named_user_id);
  return target.id;
}

export async function assertRealAccount(user_id: string, action: string): Promise<void> {
  rules.assertRealAccount(await anonymousUsers.isAnonymous(user_id), action);
}

export async function getCheckout(
  user_id: string, direction: Direction
): Promise<CheckoutView> {
  return await compose(await ensure(user_id, direction));
}

export async function patchCheckout(
  user_id: string, direction: Direction, patch: CheckoutWrite
): Promise<CheckoutView> {
  return await withTransaction(async (client) => {
    const row = await ensure(user_id, direction, client);
    const fresh = await checkouts.update(row.id, patch, client);
    rules.assertSession(fresh);
    return await compose(fresh, client);
  });
}

export async function saveCheckoutPayout(
  user_id: string, direction: Direction, form: CheckoutPayoutForm
): Promise<CheckoutView> {
  rules.assertPayoutDirection(direction);
  await assertRealAccount(user_id, "save a payout account");
  return await withTransaction(async (client) => {
    const row = await ensure(user_id, direction, client);
    const saved = await payoutDetails.saveCheckoutPayout(
      user_id, row.payment_details_id, form, client
    );
    const fresh = await checkouts.update(
      row.id,
      { payment_details_id: saved.id, payment_method_id: saved.method_id },
      client
    );
    rules.assertSession(fresh);
    return await compose(fresh, client);
  });
}

export async function listItems(
  user_id: string, direction: Direction, client?: Executor
): Promise<CheckoutItem[]> {
  const session = await checkouts.findFor(user_id, direction, client);
  if (!session) return [];
  return await checkoutItems.listFor(session.id, client);
}

export async function replaceItems(
  user_id: string, direction: Direction, lines: CheckoutItemPatch[]
): Promise<CheckoutItem[]> {
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
      rates: direction === "purchase" ? await ratesService.listRates() : [],
      metalNames: await metals.namesById(client),
    });

    await checkoutItems.removeFor(session.id, client);
    await checkoutItems.createMany(rows, client);
    return await checkoutItems.listFor(session.id, client);
  });
}

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

export async function getRowById(checkout_id: string, client?: Executor) {
  return await checkouts.getOne(checkout_id, client);
}

export async function getItemsForOrder(checkout_id: string, client?: Executor) {
  return await checkoutItems.listForOrder(checkout_id, client);
}

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

const CLEARED: CheckoutWrite = Object.fromEntries(
  checkouts.PATCHABLE.map((column) => [column, null])
);

export async function resetAfterOrder(
  user_id: string, direction: Direction, client?: Executor
): Promise<void> {
  const row = await checkouts.findFor(user_id, direction, client);
  if (!row) return;
  await checkouts.update(row.id, CLEARED, client);
}
