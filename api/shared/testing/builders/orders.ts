// anOrder - an order and everything a test usually means by one.
//
// *** THE CHAIN IS AWAITED, NOT BUILT AND THEN RUN. *** `anOrder(c, user)`
// returns a thenable; `.withLots(2)` and friends only record intent, and the
// whole plan executes at the first `await`. That is what lets a fixture read
// as one sentence -
//
//     const order = await anOrder(c, seller, { direction: "purchase" })
//       .withLots(2, { metal: "Gold" }).withTotals({ total: 1200 });
//
// - while still being ONE ordered sequence of repo calls underneath, in the
// caller's transaction, with the audit trigger stamping each row.
//
// *** THE ORDER IS BORN FROM A CHECKOUT NOW (ruling 66). *** orders.orders no
// longer takes a row literal - createForCheckout COPIES the owner and the
// direction off a checkout.checkouts row, the same way domain/orders/place.ts
// creates one. So `run()` builds a bare checkout first and hands its id to
// the repo, exactly like a real placement would, instead of assembling a row
// this feature no longer accepts.
//
// *** EVERY WRITE GOES THROUGH A REPO, WITH ONE NAMED EXCEPTION. *** `create`
// on orders.items now only writes DECLARED LOTS (bullion_id forced NULL) and
// `createFromProduct` copies a catalogue product's own rigid columns with no
// override - neither can produce the arbitrary bullion_id/content/premium/
// price combinations `withLines` exists for, and no repo does any more. That
// escape hatch inserts directly, the same statement orders.items/sql/create.sql
// still carries, exactly as `withAddress` already does for its own snapshot.
//
// *** LINES ARE THE ONLY THING WITH TWO SHAPES. *** A scrap lot has a metal, a
// pre-melt weight and a purity and no product; a bullion line has a product and
// a quantity. `withLots` and `withBullion` are those two, named, so no call
// site has to remember which columns go null.
import type { PoolClient } from "pg";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as ordersRepo from "#db/orders/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import * as totalsRepo from "#db/orders/transactions/repo.ts";
import * as orderAddresses from "#db/orders/addresses/repo.ts";
import * as checkoutsRepo from "#db/checkout/checkouts/repo.ts";
import { metalId, metalIds, type MetalName } from "#shared/testing/builders/reference.ts";
import type { BuiltUser } from "#shared/testing/builders/users.ts";
import type { BuiltProduct } from "#shared/testing/builders/products.ts";

import type { Direction, OrderItem, OrderTotalsPatch } from "@dorado/contracts";

export type BuiltOrder = {
  id: string;
  number: number;
  user_id: string | null;
  direction: Direction;
  status: string;
  items: { id: string; bullion_id: string | null; metal_id: string }[];
};

export type OrderOptions = {
  id?: string;
  direction?: Direction;
  status?: string;
  notes?: string | null;
};

type LotOptions = {
  metal?: MetalName;
  pre_melt?: number;
  post_melt?: number | null;
  purity?: number;
  content?: number | null;
  price?: number | null;
  confirmed?: boolean;
  unit?: string;
};

type BullionOptions = {
  price?: number | null;
  premium?: number | null;
  confirmed?: boolean;
  sales_tax_charged?: number;
  unit?: string;
};

// The escape hatch's own shape: every column but the identity ones, with only
// `metal_id` required - the rest defaults the way the table itself would.
type LineSpec = Partial<Omit<OrderItem, "id" | "order_id" | "metal_id">> &
  Pick<OrderItem, "metal_id">;

type Totals = Omit<OrderTotalsPatch, "order_id">;

type Step = (c: PoolClient, order: BuiltOrder) => Promise<void>;

class OrderPlan implements PromiseLike<BuiltOrder> {
  private steps: Step[] = [];

  constructor(
    private readonly c: PoolClient,
    private readonly user: { id: string } | null,
    private readonly options: OrderOptions
  ) {}

  // N scrap lots of the same metal - the commonest purchase fixture. Each lot
  // gets its own weight so a test summing them cannot pass by symmetry.
  withLots(n: number, options: LotOptions = {}): this {
    this.steps.push(async (c, order) => {
      const metal_id = await metalId(c, options.metal ?? "Gold");
      for (let i = 0; i < n; i += 1) {
        const pre_melt = options.pre_melt ?? 10 + i;
        const purity = options.purity ?? 0.925;
        const row = await itemsRepo.create(
          order.id,
          {
            metal_id,
            pre_melt,
            post_melt: options.post_melt ?? null,
            purity,
            content: options.content ?? Number((pre_melt * purity).toFixed(4)),
            quantity: 1,
            confirmed: options.confirmed ?? false,
            unit: options.unit ?? "g",
            price: options.price ?? null,
          },
          c
        );
        order.items.push({ id: row.id, bullion_id: null, metal_id });
      }
    });
    return this;
  }

  // One bullion line for a product a test already built. `create` no longer
  // takes a bullion_id at all (declared lots only) - the copy is
  // `createFromProduct`'s, and everything it does not set (quantity, premium,
  // confirmed, price) is patched on afterward, the same two-step a real admin
  // add-then-edit takes.
  withBullion(product: BuiltProduct, quantity = 1, options: BullionOptions = {}): this {
    this.steps.push(async (c, order) => {
      const created = await itemsRepo.createFromProduct(order.id, product.id, c);
      if (!created) throw new Error(`products.bullion has no row ${product.id} to copy`);
      await itemsRepo.update(
        created.id,
        {
          quantity,
          content: product.content,
          purity: product.purity,
          premium: options.premium ?? product.bid_premium,
          confirmed: options.confirmed ?? false,
          sales_tax_charged: options.sales_tax_charged ?? 0,
          price: options.price ?? null,
          // ALWAYS SET, AND ALWAYS "t oz". Bullion is quoted per troy ounce -
          // every one of the 21 bullion lines on dev carries it - and a null
          // unit reaches convertTroyOz, which calls .toLowerCase() on it.
          unit: options.unit ?? "t oz",
        },
        { order_id: order.id },
        c
      );
      order.items.push({ id: created.id, bullion_id: product.id, metal_id: product.metal_id });
    });
    return this;
  }

  // The escape hatch for a line whose exact columns are the subject - the one
  // place a test may name a bullion_id AND an arbitrary content/premium/price,
  // which no repo will write any more. A direct INSERT, the same shape
  // orders/items/sql/create.sql still carries.
  withLines(...lines: LineSpec[]): this {
    this.steps.push(async (c, order) => {
      for (const line of lines) {
        const { rows } = await c.query<{ id: string; bullion_id: string | null; metal_id: string }>(
          `INSERT INTO orders.items
             (id, order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
              premium, quantity, confirmed, sales_tax_charged, unit, price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           RETURNING id, bullion_id, metal_id`,
          [
            anId(), order.id, line.bullion_id ?? null, line.metal_id,
            line.pre_melt ?? null, line.post_melt ?? null, line.purity ?? null,
            line.content ?? null, line.premium ?? null, line.quantity ?? 1,
            line.confirmed ?? false, line.sales_tax_charged ?? 0,
            line.unit ?? null, line.price ?? null,
          ]
        );
        const row = rows[0]!;
        order.items.push({ id: row.id, bullion_id: row.bullion_id, metal_id: row.metal_id });
      }
    });
    return this;
  }

  // EVERY ORDER CARRIES EVERY METAL. The quote written at placement covers all
  // four, not only the metals the order holds - which is why a test looking for
  // "an order missing a metal" once found none, asserted nothing and passed for
  // its whole life (audit:vacuous-tests, orders/spots).
  //
  // freezeForOrder only COPIES today's live spots.spots row, so a fixture that
  // needs a KNOWN bid/ask (most of them) cannot go through it - this inserts
  // directly, the same statement orders/spots/sql/create.sql carried before it
  // freezeForOrder replaced it.
  withSpots({ bid = 100, ask = 200 }: { bid?: number | null; ask?: number | null } = {}): this {
    this.steps.push(async (c, order) => {
      for (const metal_id of (await metalIds(c)).values()) {
        await c.query(
          `INSERT INTO orders.spots (id, order_id, metal_id, ask, bid)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (order_id, metal_id) DO NOTHING`,
          [anId(), order.id, metal_id, ask, bid]
        );
      }
    });
    return this;
  }

  // The money row. Absent by default, because "an order with no totals yet" is
  // a real state and several tests are about reaching it.
  withTotals(totals: Totals = {}): this {
    this.steps.push(async (c, order) => {
      await totalsRepo.create({ order_id: order.id, ...totals }, c);
    });
    return this;
  }

  // The frozen copy of where the parcel went. Takes an address id, since the
  // address itself is anAddress's job.
  withAddress(address: { id: string }): this {
    this.steps.push(async (c, order) => {
      const snapshot = await c.query<{ id: string }>(
        `INSERT INTO places.addresses
           (id, line_1, line_2, city, state, country, zip, country_code, phone_number,
            is_valid, is_residential)
         SELECT $1, line_1, line_2, city, state, country, zip, country_code,
                phone_number, is_valid, is_residential
           FROM places.addresses WHERE id = $2
         RETURNING id`,
        [anId(), address.id]
      );
      await orderAddresses.create(
        {
          id: anId(), order_id: order.id,
          address_id: snapshot.rows[0]!.id, source_address_id: address.id,
        },
        c
      );
    });
    return this;
  }

  private async run(): Promise<BuiltOrder> {
    const direction = this.options.direction ?? "purchase";
    const status = this.options.status ?? "Pending";
    if (!this.user) {
      throw new Error(
        "anOrder needs a user - orders.orders.createForCheckout copies its owner " +
          "off a checkout row, and checkout.checkouts.user_id is not nullable"
      );
    }

    // THE CHECKOUT THE ORDER BECAME (ruling 66) - a bare one, built only so
    // createForCheckout has a row to copy the owner and the direction from,
    // the same shape a real placement names by id.
    // ONE ROW PER (user_id, direction), so create() answers nothing when the
    // fixture (or the test itself) already opened that session - which is the
    // normal case for a second order in one transaction, not an error.
    const checkout =
      (await checkoutsRepo.create({ user_id: this.user.id, direction }, this.c)) ??
      (await checkoutsRepo.findFor(this.user.id, direction, this.c));
    if (!checkout) throw new Error("checkout.checkouts refused a new session");

    const created = await ordersRepo.createForCheckout(
      { id: this.options.id, checkout_id: checkout.id, status }, this.c
    );
    if (!created) throw new Error("orders.orders refused a new order");

    if (this.options.notes !== undefined) {
      await ordersRepo.update(created.id, { notes: this.options.notes }, {}, this.c);
    }

    const order: BuiltOrder = {
      id: created.id,
      number: created.number,
      user_id: this.user.id,
      direction,
      status,
      items: [],
    };
    for (const step of this.steps) await step(this.c, order);
    return order;
  }

  then<A = BuiltOrder, B = never>(
    onfulfilled?: ((value: BuiltOrder) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export function anOrder(
  c: PoolClient, user: BuiltUser | { id: string } | null, options: OrderOptions = {}
): OrderPlan {
  return new OrderPlan(c, user, options);
}

// A status nothing else in the suite can be holding - for the tests whose
// whole claim is "the value I wrote is the value that came back".
export const aStatus = (): string => `probe-${aTag()}`;
