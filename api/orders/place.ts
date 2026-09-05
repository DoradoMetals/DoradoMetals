import type { PoolClient } from "pg";

import * as ordersRepo from "#db/orders/repo.ts";
import * as orderItems from "#db/orders/items/repo.ts";
import * as orderSpots from "#db/orders/spots/repo.ts";
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as orderTransactions from "#db/orders/transactions/repo.ts";
import * as paymentMethods from "#db/payments/methods/repo.ts";
import * as intentsRepo from "#db/payments/intents/repo.ts";
import * as placeAddresses from "#db/places/addresses/repo.ts";

import * as addressService from "#identity/places/addresses/service.ts";
import * as fulfillmentService from "#logistics/fulfillments/service.ts";
import * as checkoutService from "#checkout/service.ts";
import * as fulfillmentDrafts from "#logistics/fulfillments/drafts.ts";
import * as emailService from "#media/emails/service.ts";
import * as taxService from "#pricing/sales-tax/service.ts";
import * as paymentsService from "#payments/service.ts";
import * as credit from "#payments/credit/service.ts";
import * as transactionsService from "#payments/transactions/service.ts";
import * as refinerService from "#orders/refiners/service.ts";
import * as sweeps from "#payments/sweeps.ts";
import * as stripeProvider from "#providers/payment/stripe.ts";
import * as orderRead from "#orders/read.ts";
import * as rules from "#orders/rules.ts";
import * as shippingLabels from "#logistics/shipping/labels.ts";
import * as pricing from "#pricing/index.ts";
import { retierPremiums } from "#orders/service.ts";

import withTransaction from "#shared/db/withTransaction.ts";
import { attempt } from "#shared/attempt.ts";
import type {
  AdminOrderCreate, Checkout, OrderItem, OrderLine, OrderView, SoldLinePrice,
} from "@dorado/contracts";

export const LIVE = {
  buyLabel: shippingLabels.buyLabel,
  authorize,
  confirm: (order_id: string) => emailService.sendOrderPlacedConfirmation(order_id),
};

export async function place(
  checkout_id: string, world: typeof LIVE = LIVE
): Promise<OrderView> {
  const checkout = await checkoutService.getRowById(checkout_id);
  rules.assertCheckout(checkout, checkout_id);
  await checkoutService.assertRealAccount(checkout.user_id, "place an order");
  rules.assertPlaceable(await checkoutService.missingFor(checkout_id));
  const cart = await checkoutService.getItemsForOrder(checkout_id);

  const order_id =
    checkout.direction === "sale"
      ? await placeSale(checkout, cart, world)
      : await placePurchase(checkout, cart, world);

  const order = await orderRead.view(order_id);
  rules.assertPlacedOrder(order, order_id);
  return order;
}

// The admin builds the customer's checkout server-side - the same checkout
// service, logistics draft and payment write the customer's own steps use -
// and then places it through place() above.
export async function placeForAdmin(
  order: AdminOrderCreate, world: typeof LIVE = LIVE
): Promise<OrderView> {
  return await place(await withTransaction((tx) => buildFor(order, tx)), world);
}

async function buildFor(order: AdminOrderCreate, tx: PoolClient): Promise<string> {
  const row = await checkoutService.getRowFor(order.user_id, order.direction, tx);
  await checkoutService.replaceItems(order.user_id, order.direction, order.items, tx);

  const draft = await fulfillmentDrafts.createForCheckout(
    { checkout_id: row.id, method_id: order.fulfillment.method_id }, order.user_id, true, tx
  );
  await fulfillmentService.patchChoices(
    draft.fulfillment.id, order.fulfillment.choices, tx
  );

  if (order.direction === "purchase") {
    await checkoutService.saveCheckoutPayout(order.user_id, "purchase", order.payout, tx);
  } else {
    await checkoutService.patchCheckout(
      order.user_id, "sale",
      {
        payment_method_id: order.payment_method_id,
        recipient_address_id: order.recipient_address_id,
      },
      tx
    );
  }
  return row.id;
}

async function writeOrder(
  checkout: Checkout,
  status: string,
  cart: OrderLine[],
  lines: (order_id: string, tx: PoolClient) => Promise<OrderItem[]>,
  tx: PoolClient
): Promise<string> {
  const order = await ordersRepo.createForCheckout(checkout.id, status, tx);
  rules.assertPlacedOrder(order, checkout.id);
  const order_id = order.id;

  const written = await lines(order_id, tx);
  rules.assertEveryLineCopied(written.length, cart.length, order_id);

  await retierPremiums(order_id, tx);

  rules.assertEveryMetalQuoted(written, await orderSpots.freezeForOrder(order_id, tx));

  await snapshotAddress(order_id, checkout, tx);
  await fulfillmentService.attachToOrder(checkout.fulfillment_id!, order_id, tx);
  await refinerService.mirrorForOrder(order_id, tx);
  return order_id;
}

async function clearChoices(checkout: Checkout, tx: PoolClient): Promise<void> {
  await checkoutService.resetAfterOrder(
    checkout.user_id, checkout.direction, tx
  );
}

async function snapshotAddress(
  order_id: string, checkout: Checkout, tx: PoolClient
): Promise<void> {
  const source_address_id =
    checkout.recipient_address_id
      ?? await fulfillmentService.addressIdOf(checkout.fulfillment_id!, tx);
  if (!source_address_id) return;
  const address_id = await addressService.snapshot(source_address_id, tx);
  if (!address_id) return;
  await orderAddresses.create({ order_id, address_id, source_address_id }, tx);
}

async function placePurchase(
  checkout: Checkout, cart: OrderLine[], world: typeof LIVE
): Promise<string> {
  const draft = rules.requireFreeFulfillmentDraft(
    await fulfillmentService.getById(checkout.fulfillment_id!)
  );
  const shipment_id = draft.method.category === "SHIPMENT"
    ? await fulfillmentService.shipmentIdOf(draft.fulfillment.id)
    : null;

  const payout_fee = rules.payoutFeeOf(
    await paymentMethods.listFor("purchase"), checkout.payment_method_id
  );

  const placed = await withTransaction(async (tx) => {
    const order_id = await writeOrder(
      checkout, "In Transit", cart,
      (id, client) => orderItems.createBought(id, checkout.id, client),
      tx
    );
    rules.assertTotalsWritten(
      await orderTransactions.createForCheckout(order_id, checkout.id, payout_fee, tx),
      order_id
    );

    if (shipment_id) {
      await shippingLabels.sealForPlacement(
        shipment_id, checkout.id, draft.method.type, tx
      );
    }
    await clearChoices(checkout, tx);
    return { order_id, shipment_id };
  });

  if (placed.shipment_id) await world.buyLabel(placed.shipment_id);

  await attempt("clear the purchase basket", () =>
    checkoutService.clearItems(checkout.user_id, "purchase")
  );
  await world.confirm(placed.order_id);
  return placed.order_id;
}

async function placeSale(
  checkout: Checkout, cart: OrderLine[], world: typeof LIVE
): Promise<string> {
  const address = rules.requireAddress(
    await placeAddresses.getOne(checkout.recipient_address_id!), "delivery"
  );
  const quote = await pricing.priceCheckout(checkout.id);
  rules.assertSaleQuote(quote, checkout.id);

  const cents = rules.chargeCents(quote.post_charges_amount);
  const intent = cents > 0 ? await openIntentFor(checkout.user_id, cents) : null;
  const status = rules.statusAtPlacement(cents, intent?.settled === true);

  const lines: SoldLinePrice[] = quote.items.map((line) => ({
    line_id: line.id,
    premium: line.premium,
    sales_tax: line.sales_tax_rate,
    price: line.unit_ask,
  }));

  const order_id = await withTransaction(async (tx) => {
    const id = await writeOrder(
      checkout, status, cart,
      (order, client) => orderItems.createSold(order, checkout.id, lines, client),
      tx
    );
    await orderTransactions.create(
      {
        order_id: id, total: quote.order_total, shipping: quote.shipping_charge,
        shipping_service: quote.shipping_service ?? undefined,
        funds: quote.pre_charges_amount,
        post_charges_amount: quote.post_charges_amount,
        subject_to_charges_amount: quote.subject_to_charges_amount,
        used_funds: quote.pre_charges_amount > 0, items: quote.item_total,
        base_total: quote.base_total, surcharge: quote.charges_amount,
        sales_tax: quote.sales_tax,
      },
      tx
    );

    if (quote.pre_charges_amount > 0) {
      await credit.removeFunds(checkout.user_id, quote.pre_charges_amount, tx);
      await transactionsService.addTransactionLog(
        {
          user_id: checkout.user_id, type: "Debit", order_id: id,
          amount: quote.pre_charges_amount,
        },
        tx
      );
    }
    await taxService.updateStateSalesTax(quote.sales_tax, address.state, tx);
    if (intent) await paymentsService.attachOrder(intent.payment_intent_id, id, tx);
    await clearChoices(checkout, tx);
    return id;
  });

  if (intent && !intent.settled) await world.authorize(intent.payment_intent_id, cents);
  if (rules.confirmsAtPlacement(status)) await world.confirm(order_id);
  return order_id;
}

async function openIntentFor(
  user_id: string, cents: number
): Promise<{ payment_intent_id: string; settled: boolean }> {
  rules.assertAboveStripeMinimum(cents);
  const intent = await intentsRepo.findOpenForUser(user_id);
  rules.assertOpenIntent(intent);
  rules.assertIntentLive(intent.payment_status);

  const verdict = rules.attachmentVerdict(intent);
  rules.assertAttachable(verdict);
  const superseded = verdict === "supersede" ? intent.order_id : null;
  if (superseded) {
    await withTransaction(async (tx) => {
      await sweeps.cancelPendingSale(superseded, tx);
      await paymentsService.attachOrder(intent.payment_intent_id, null, tx);
    });
  }

  if (!rules.isSettled(intent.payment_status)) {
    return { payment_intent_id: intent.payment_intent_id, settled: false };
  }
  rules.assertRepairable(intent, cents);
  const settled = intent.payment_status === "succeeded";
  return { payment_intent_id: intent.payment_intent_id, settled };
}

async function authorize(payment_intent_id: string, cents: number): Promise<void> {
  const updated = await stripeProvider.updateIntent(payment_intent_id, { amount: cents });
  await withTransaction((tx) => paymentsService.updateFromProvider(updated, tx));
}
