import withTransaction from "#shared/db/withTransaction.ts";
import { anonymousUsers, checkouts, checkoutItems } from "#db";
import {
  addresses as addressService,
  fulfillments as fulfillmentService,
  paymentDetails,
  users as usersService,
} from "#domains";
import * as rules from "#checkout/rules.ts";
import * as pricing from "#pricing/index.ts";
import { withDecisions } from "#shared/views.ts";
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

async function viewOf(checkout_id: string, client?: Executor): Promise<CheckoutView> {
  const facts = await checkouts.view(checkout_id, client);
  rules.assertSession(facts);
  const handover = facts.fulfillment_id
    ? await fulfillmentService.missing(facts.fulfillment_id, client)
    : [];
  return withDecisions(facts, rules.checkoutState(facts, handover));
}

export async function missingFor(
  checkout_id: string, client?: Executor
): Promise<CheckoutView["missing"]> {
  return (await viewOf(checkout_id, client)).missing;
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
  return await viewOf((await ensure(user_id, direction)).id);
}

export async function patchCheckout(
  user_id: string, direction: Direction, patch: CheckoutWrite
): Promise<CheckoutView> {
  return await withTransaction(async (client) => {
    const row = await ensure(user_id, direction, client);
    rules.assertSession(await checkouts.update(row.id, patch, client));
    return await viewOf(row.id, client);
  });
}

export async function saveCheckoutPayout(
  user_id: string, direction: Direction, form: CheckoutPayoutForm
): Promise<CheckoutView> {
  rules.assertPayoutDirection(direction);
  await assertRealAccount(user_id, "save a payout account");
  return await withTransaction(async (client) => {
    const row = await ensure(user_id, direction, client);
    const saved = await paymentDetails.saveCheckoutPayout(
      user_id, row.payment_details_id, form, client
    );
    rules.assertSession(await checkouts.update(
      row.id,
      { payment_details_id: saved.id, payment_method_id: saved.method_id },
      client
    ));
    return await viewOf(row.id, client);
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
    await checkoutItems.removeFor(session.id, client);

    for (const line of lines) {
      if ("bullion_id" in line) {
        rules.assertProductAvailable(
          await checkoutItems.createFromProduct(session.id, line, client), line.bullion_id
        );
      } else {
        rules.assertCatalogueLine(direction);
        await checkoutItems.create(rules.scrapLine(session.id, line), client);
      }
    }
    if (direction === "purchase") {
      const quote = await pricing.priceCheckout(session.id, client);
      for (const line of quote.direction === "purchase" ? quote.items : []) {
        await checkoutItems.update(line.id, { premium: line.premium }, client);
      }
    }
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
