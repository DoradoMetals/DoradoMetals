import withTransaction from "#shared/db/withTransaction.js";
import { auth } from "#features/auth/client.ts";
import { fromNodeHeaders } from "better-auth/node";

// READS AND WRITES PIVOTED TOGETHER, and that ordering is the whole point.
//
// Pointing the reads at the new schema while the writes still went to exchange
// alone was tried on purchase orders and broke immediately: a read cannot see a
// write that just happened, so an admin changed a status and the drawer showed
// the previous one. Reads move when the dual write lands beside them, in one
// change, which is what every other restructured feature did.
//
// `verify:sales-order-decomposition` is what made it safe to make rather than
// hope about: it compares the new read against the composed query AND against
// repo.exchange.js - the implementation that was serving traffic - across every
// order and every nested object.
import * as readService from "#features/sales-orders/read.service.ts";
import * as salesOrderWrites from "#features/sales-orders/write.service.ts";
import * as orderSpots from "#features/orders/spots/repo.ts";
import * as metalsRepo from "#features/metals/repo.ts";
import { calculateItemAsk } from "#features/sales-orders/utils/calculations.ts";
import * as stripeRepo from "#features/payments/repo.js";
import * as transactionsService from "#features/transactions/service.ts";
import * as usersService from "#features/users/service.ts";
// The SERVICE, not a repo: a shipment is composed from six tables now, and
// the order link it carries is reconstructed rather than stored.
import * as shipmentRepo from "#features/shipping/shipments/service.ts";
import * as refinerRepo from "#features/refiners/service.ts";

import * as emailService from "#features/media/emails/service.ts";
import * as addressService from "#features/places/addresses/service.ts";
import * as taxService from "#features/sales-tax/service.ts";
import * as spotsService from "#features/spots/service.ts";
import * as productService from "#features/products/service.ts";

import { calculateSalesOrderTotal } from "#features/sales-orders/utils/calculations.ts";

import type { SalesOrderRow, OrderMetalRow } from "#features/sales-orders/repo.next.ts";
import type { PoolClient } from "pg";
import type { PaymentSession } from "#features/payments/service.ts";
import type { IncomingHttpHeaders } from "node:http";
import type { Transport } from "#providers/emails/nodemailer.ts";
import type { SpotPriceWire } from "@dorado/contracts";

// The order as the browser sends it. This is req.body, so every field is
// whatever arrived - which is the point of re-fetching the items and the
// address by id, and of pricing against the server's spots rather than these.
export type SalesOrderInput = {
  address: { id: string };
  items: { id: string; quantity: number }[];
  using_funds?: boolean | null;
  // BOTH FIELDS ARE REAL, and the type said only one. `value` is what the tax
  // and total calculations read; `label` is what gets stored as the order's
  // shipping_service - dev holds "Standard" and "Free" from exactly this path,
  // so it has always been present and the declaration was simply short.
  // Found by the compiler when the write moved to a typed service.
  service: { value?: string | null; label?: string | null };
  payment_method?: string | null;
};

// THE LINES AND THE QUOTED SPOTS, written to both schemas.
//
// Two things the caller has to supply because only it holds them: the PRICE of
// each line, which calculateItemAsk derives from the quote, and the metal id
// for each quoted metal, because exchange keys a spot by NAME and the new
// schema by id. Resolving the names once here beats a lookup per row.
//
// A line's metal comes from its PRODUCT - a sale is always bullion - so a
// product whose metal cannot be resolved would write a null into a NOT NULL
// column. It is refused by name instead.
async function insertLines(
  client: PoolClient,
  orderId: string,
  items: Parameters<typeof salesOrderWrites.insertItems>[2],
  spot_prices: Parameters<typeof salesOrderWrites.insertOrderMetals>[1]
): Promise<void> {
  const metals = await metalsRepo.getAll(client);
  const idByName = new Map(metals.map((m) => [m.name, m.id]));

  await salesOrderWrites.insertItems(
    client,
    orderId,
    items,
    (item) => calculateItemAsk(item as never, spot_prices as never),
    (item) => {
      const metal_id = (item as { metal_id?: string | null }).metal_id ?? null;
      if (!metal_id) {
        const err: Error & { statusCode?: number } = new Error(
          `product ${String(item.id)} has no metal, so its order line cannot be written`
        );
        err.statusCode = 422;
        throw err;
      }
      return metal_id;
    }
  );

  await salesOrderWrites.insertOrderMetals(
    orderId, spot_prices, (name) => idByName.get(name), client
  );
}

export async function getById(orderId: string): Promise<SalesOrderRow | undefined> {
  return (await readService.findById(orderId)) as unknown as SalesOrderRow;
}

export async function listOrdersForUser(userId: string): Promise<SalesOrderRow[]> {
  return (await readService.findAllByUser(userId)) as unknown as SalesOrderRow[];
}

export async function getAll(): Promise<SalesOrderRow[]> {
  return (await readService.getAll()) as unknown as SalesOrderRow[];
}

export async function getMetalsForOrder(orderId: string): Promise<OrderMetalRow[]> {
  return (await orderSpots.getFor(orderId)) as unknown as OrderMetalRow[];
}

// SPOT PRICES COME FROM THE SERVER, NOT FROM THE BODY.
//
// `spot_prices` used to arrive in the request and decide what the order was
// worth. Items were already re-fetched with getItemsFromServer and the address
// loaded by id, so the product could not be faked - but the price of the metal
// could, and it is the larger number. An order priced with ask_spot 1 recorded
// a total of $26.81 for an ounce of gold, and the payment intent agreed with
// it, so nothing downstream looked wrong.
//
// The order is now priced at what the business holds at the moment it is
// placed. That is a real behaviour change and worth knowing: if spot moves
// between the customer loading the page and confirming, the recorded total is
// the newer one. A quote held for a few minutes is the proper answer and is
// written up in FOLLOWUPS; it needs a table, and the schema is mid-migration.
// THE ADDRESS IS A ROW, NOT A LIST OF THEM.
//
// This read `addressRepo.getFromId(...)`, which returns `rows`, and then took
// `.state` off it - which on an array is `undefined`. Both uses below are the
// taxing state: one decides what the customer is charged, the other credits
// the state's liability. Taxed in no state at all, the rules match nothing and
// COALESCE to a rate of zero, silently.
//
// It arrived in cf724c4e, "fix sales order bug", 6 January 2026, which replaced
// addressService.getAddressFromId - deleted in the December feature-slicing -
// with the repo call. The same deletion left update_payment_intent answering
// 500 for eight months (cf5a94eb). One call site was left broken; this one was
// "fixed" into something quieter.
//
// features/sales-orders/address-state.test.js proves both halves.
export async function createSalesOrder(
  { sales_order, payment_intent_id }: { sales_order: SalesOrderInput; payment_intent_id: string },
  headers: IncomingHttpHeaders
): Promise<SalesOrderRow | undefined> {
  // BOTH OF THESE WERE READ UNGUARDED, AND BOTH ARE 500s WHEN THEY ARE ABSENT.
  //
  // The session is used four times below - insertOrder, removeFunds and the
  // ledger entry all take session.user.id. requireUser has already run, so this
  // fires only when auth.api.getSession, a second and independent lookup,
  // disagrees with it. 401 rather than the TypeError's 500: a missing session
  // is an authentication fact, not a server fault.
  //
  // The address is looked up by id from the body, so an id that does not exist
  // - or belongs to somebody else - returned undefined and threw on
  // `address.state`. 400: the request named an address the server cannot find.
  const session = (await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  })) as PaymentSession | null;
  if (!session?.user?.id) {
    const err: Error & { statusCode?: number } = new Error(
      "no session - an order cannot be placed without one"
    );
    err.statusCode = 401;
    throw err;
  }

  const address = await addressService.getAddressFromId(sales_order.address.id);
  if (!address) {
    const err: Error & { statusCode?: number } = new Error(
      `no address ${sales_order.address.id}`
    );
    err.statusCode = 400;
    throw err;
  }
  const serverItems = await productService.getItemsFromServer(
    sales_order.items
  );
  const spot_prices = await spotsService.getPricingSpots();
  const items = await taxService.attachSalesTaxToItems(
    address.state,
    serverItems,
    spot_prices
  );
  const orderId = await withTransaction(async (client) => {
    const orderPrices = calculateSalesOrderTotal(
      items,
      sales_order.using_funds,
      spot_prices,
      session.user,
      sales_order.service.value,
      sales_order.payment_method
    );

    const orderId = await salesOrderWrites.insertOrder(client, {
      user: session.user,
      status: sales_order.payment_method === "CREDIT" ? "Preparing" : "Pending",
      sales_order: sales_order,
      orderPrices,
    });

    if (sales_order.using_funds === true) {
      await usersService.removeFunds(
        session.user.id,
        orderPrices.pre_charges_amount,
        client
      );
      await transactionsService.addTransactionLog(
        session.user.id,
        "Debit",
        null,
        orderId,
        orderPrices.pre_charges_amount,
        client
      );
    }

    await insertLines(client, orderId, items, spot_prices);

    await taxService.updateStateSalesTax(
      orderPrices.sales_tax,
      address.state,
      client
    );

    if (orderPrices.post_charges_amount > 0) {
      await stripeRepo.attachOrder(payment_intent_id, null, orderId, client);
    }

    return orderId;
  });

  return await getById(orderId);
}

export async function adminCreateSalesOrder({
  sales_order,
  payment_intent_id,
  user,
}: {
  sales_order: SalesOrderInput;
  payment_intent_id: string;
  user: { id: string; dorado_funds?: number | null };
}): Promise<SalesOrderRow | undefined> {
  const address = await addressService.getAddressFromId(sales_order.address.id);
  if (!address) {
    const err: Error & { statusCode?: number } = new Error(
      `no address ${sales_order.address.id}`
    );
    err.statusCode = 400;
    throw err;
  }
  const serverItems = await productService.getItemsFromServer(
    sales_order.items
  );
  // Server-sourced here too. An admin placing an order on a customer's behalf
  // is still an order, and the same argument applies - more so, since this path
  // has no Stripe confirmation to disagree with it.
  const spot_prices = await spotsService.getPricingSpots();
  const items = await taxService.attachSalesTaxToItems(
    address.state,
    serverItems,
    spot_prices
  );
  const orderId = await withTransaction(async (client) => {
    const orderPrices = calculateSalesOrderTotal(
      items,
      sales_order.using_funds,
      spot_prices,
      user,
      sales_order.service.value,
      sales_order.payment_method
    );

    const orderId = await salesOrderWrites.insertOrder(client, {
      user: user,
      status: sales_order.payment_method === "CREDIT" ? "Preparing" : "Pending",
      sales_order: sales_order,
      orderPrices,
    });

    if (sales_order.using_funds === true) {
      await usersService.removeFunds(
        user.id,
        orderPrices.pre_charges_amount,
        client
      );
      await transactionsService.addTransactionLog(
        user.id,
        "Debit",
        null,
        orderId,
        orderPrices.pre_charges_amount,
        client
      );
    }

    await insertLines(client, orderId, items, spot_prices);

    await taxService.updateStateSalesTax(
      orderPrices.sales_tax,
      address.state,
      client
    );

    if (orderPrices.post_charges_amount > 0) {
      await stripeRepo.attachOrder(payment_intent_id, null, orderId, client);
    }

    return orderId;
  });

  return await getById(orderId);
}

export async function updateStatus({
  order,
  order_status,
  user_name,
}: {
  order: SalesOrderRow;
  order_status: string;
  user_name: string;
}): Promise<SalesOrderRow | undefined> {
  // The status write returns the id it touched, not the order. The route
  // answers with it and always has - repo.exchange.js returned `rows[0]` of an
  // UPDATE ... RETURNING *, which the caller never read a field off.
  return (await salesOrderWrites.updateStatus(
    order, order_status, user_name ?? null
  )) as unknown as SalesOrderRow;
}

// `transport` is a separate parameter, not a field on the input object, for the
// reason features/emails/service.ts gives: the controller hands req.body
// straight to this function, so a field would be reachable from the request.
// Nothing in production passes one; a test passes a recorder, which is what
// makes the guard below testable without mail leaving the building.
export async function sendOrderToSupplier(
  { order, spots, supplier_id }: { order: { id: string }; spots: SpotPriceWire[]; supplier_id: string },
  transport?: Transport
): Promise<SalesOrderRow | undefined> {
  const sales_order = await getById(order.id);

  // AN ORDER THAT DOES NOT EXIST MUST NOT REACH A REFINER.
  //
  // getById returns undefined for an id with no row, and everything below reads
  // fields off it - so the old code threw a TypeError and answered 500. That is
  // the harmless version. The reason this is a guard and not a tidy-up is what
  // sits further down: this function attaches a supplier, creates an outbound
  // shipment and emails a refiner their copy of the order. A 404 here is the
  // difference between refusing and starting that sequence against nothing.
  if (!sales_order) {
    const err: Error & { statusCode?: number } = new Error(`no sales order ${order.id}`);
    err.statusCode = 404;
    throw err;
  }

  const supplier = await refinerRepo.getRefinerFromId(supplier_id);

  // An order with no address cannot be sent to a refiner: the whole point of
  // the message is telling them where to ship the metal.
  //
  // This was found by typing renderEmail. SalesOrderWire declares
  // `address: AddressOnOrder.nullable()` and production means it - sales order
  // 55 has address_id NULL - so the renderer threw a TypeError on
  // `addr.line_1`. It threw *after* the transaction below, which is where the
  // comment on that transaction says the acceptable failure lives: an order
  // marked sent whose email did not arrive. That is only acceptable when it is
  // visible. A refuse here makes it visible, and makes it a no-op: nothing is
  // attached, no shipment is created, order_sent stays false, and the admin
  // gets a message saying which order and why.
  if (!sales_order.address) {
    throw new Error(
      `Sales order ${sales_order.order_number} has no address, so it cannot be sent to a supplier`
    );
  }

  // A SENT ORDER MAY BE RE-SENT TO THE SAME REFINER, AND MAY NOT BE MOVED TO
  // ANOTHER ONE.
  //
  // Nothing used to check order_sent at all, so calling this twice overwrote
  // supplier_id with no audit trail and no updated_at (attachSupplierToOrder
  // and updateOrderSent both leave it alone), created a SECOND outbound
  // shipment, and emailed the new refiner their copy - leaving two refiners
  // each holding one order, one of them expecting to ship metal.
  //
  // A blanket refusal would be wrong: the comment on the transaction below
  // names resending as the recovery path for its own accepted worst case, an
  // order marked sent whose email did not arrive. So the same refiner is
  // allowed through and takes the email again WITHOUT a second shipment or a
  // second attach; a different one is refused, because moving an order to
  // another refiner after it has gone is not something to do silently and
  // there is no unsend to do it deliberately.
  const alreadySent = sales_order.order_sent === true;
  if (alreadySent && sales_order.supplier_id !== supplier_id) {
    const err: Error & { statusCode?: number } = new Error(
      `Sales order ${sales_order.order_number} has already been sent to a refiner. ` +
        `Sending it to a different one would leave two refiners holding it.`
    );
    err.statusCode = 409;
    throw err;
  }

  const supplierEmail = supplier?.organization?.email;
  if (!supplierEmail) {
    const err: Error & { statusCode?: number } = new Error(
      `Refiner ${supplier?.organization?.name ?? supplier_id} has no email address, ` +
        `so sales order ${sales_order.order_number} cannot be sent to them`
    );
    err.statusCode = 422;
    throw err;
  }

  // The record first, the email second.
  //
  // The send used to be the first statement inside this transaction, so if any
  // of the three writes below failed the transaction rolled back and the
  // refiner had already been sent the order and its invoice. For a sales order
  // that means they ship metal to the customer - against an order with no
  // supplier attached, no outbound shipment and no record of having been sent.
  //
  // Both orderings can fail; they are not equally bad. This way the worst case
  // is an order marked sent whose email did not arrive, which nobody acts on
  // and an admin can resend. The other way round, metal leaves the building
  // against a record that was rolled back.
  // Skipped entirely on a resend: the supplier is already attached, the outbound
  // shipment already exists, and order_sent is already true. Running it again
  // is what created the duplicate shipment.
  if (!alreadySent) {
    await withTransaction(async (client) => {
      await salesOrderWrites.attachSupplierToOrder(
        sales_order.id,
        supplier_id,
        client
      );

      await shipmentRepo.create(
        { sales_order_id: sales_order.id, type: "Outbound" },
        client
      );

      await salesOrderWrites.setFlag(sales_order.id, "order_sent", client);
    });
  }

  // supplier.organization.email, NOT supplier.email.
  //
  // THE REFINER'S COPY HAS NEVER ARRIVED. A refiner has no top-level email in
  // either schema - both projections nest name/email/phone/enabled under
  // `organization` (exchange builds it with jsonb_build_object; the new schema
  // composes it) - so `supplier.email` was undefined, and sendEmail was handed
  // `to: undefined`. nodemailer refuses that, and it throws AFTER the
  // transaction has committed - which is exactly the accepted worst case this
  // function's own comment describes: an order marked sent whose email did not
  // arrive. Permanently, for every sales order ever sent to a refiner.
  //
  // Invisible to tsc because repo.js resolved its implementation through a
  // dynamic index, which erases every export to `any` - the same hazard
  // lint:row-vs-list exists for.
  //
  // A refiner with no email at all is refused BEFORE the transaction rather
  // than after it. Dillion Gage is exactly that in production: is_active false,
  // no email. Sending metal against an order nobody was told about is the
  // failure this whole ordering exists to prevent.
  await emailService.sendSalesOrderToSupplier(
    sales_order,
    spots,
    supplierEmail,
    transport
  );

  return await getById(sales_order.id);
}

export async function updateTracking({
  order_id,
  shipment_id,
  tracking_number,
  carrier_id,
}: {
  order_id: string;
  shipment_id: string;
  tracking_number: string;
  carrier_id: string;
}): Promise<unknown> {
  // THIS AWAITED shipmentRepo.insertTrackingNumber, WHICH DOES NOT EXIST.
  //
  // The shipments repo exports getAll, getById, getByOrder, create, update and
  // remove, and never had an insertTrackingNumber - checked against master,
  // which is what auto-deploys, as well as here. `import * as` makes a missing
  // name `undefined` rather than an import error, so
  // POST /api/sales_orders/update_tracking answered 500 on every call: an admin
  // could not record a tracking number against a sales order at all.
  //
  // Read-then-update is the pattern this codebase already uses for the same
  // shape of change - see cancelLabel in features/shipping/operations/service.ts,
  // which spreads the shipment and overrides one field. Going through
  // shipmentRepo.update also means the write follows the SHIPMENTS_SOURCE switch
  // and its dual-write, which a bespoke UPDATE here would have bypassed.
  const shipment = await shipmentRepo.getById(shipment_id);
  if (!shipment) {
    const err: Error & { statusCode?: number } = new Error(`no shipment ${shipment_id}`);
    err.statusCode = 404;
    throw err;
  }

  await shipmentRepo.update({
    ...shipment,
    tracking_number,
    carrier_id,
  });
  return await salesOrderWrites.setFlag(order_id, "tracking_updated");
}

export async function createReview({ order }: { order: SalesOrderRow }): Promise<unknown> {
  return await salesOrderWrites.setFlag(order.id, "review_created");
}
