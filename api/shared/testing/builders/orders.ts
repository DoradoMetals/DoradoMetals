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
// *** EVERY WRITE GOES THROUGH A REPO. *** orders.orders, orders.items,
// orders.transactions and orders.addresses each have one, and their guards and
// defaults are part of what a fixture should be exercising. Nothing here
// writes SQL of its own.
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
import * as orderSpots from "#db/orders/spots/repo.ts";
import { metalId, metalIds, type MetalName } from "#shared/testing/builders/reference.ts";
import type { BuiltUser } from "#shared/testing/builders/users.ts";
import type { BuiltProduct } from "#shared/testing/builders/products.ts";

export type Direction = "purchase" | "sale";

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

type Totals = Omit<totalsRepo.NewOrderTotals, "order_id" | "id">;

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
          {
            id: anId(),
            order_id: order.id,
            bullion_id: null,
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

  // One bullion line for a product a test already built.
  withBullion(product: BuiltProduct, quantity = 1, options: BullionOptions = {}): this {
    this.steps.push(async (c, order) => {
      const row = await itemsRepo.create(
        {
          id: anId(),
          order_id: order.id,
          bullion_id: product.id,
          metal_id: product.metal_id,
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
        c
      );
      order.items.push({ id: row.id, bullion_id: product.id, metal_id: product.metal_id });
    });
    return this;
  }

  // The escape hatch for a line whose exact columns are the subject.
  withLines(...lines: Omit<Parameters<typeof itemsRepo.create>[0], "order_id">[]): this {
    this.steps.push(async (c, order) => {
      for (const line of lines) {
        const row = await itemsRepo.create({ id: anId(), ...line, order_id: order.id }, c);
        order.items.push({
          id: row.id, bullion_id: row.bullion_id, metal_id: row.metal_id as string,
        });
      }
    });
    return this;
  }

  // EVERY ORDER CARRIES EVERY METAL. The quote written at placement covers all
  // four, not only the metals the order holds - which is why a test looking for
  // "an order missing a metal" once found none, asserted nothing and passed for
  // its whole life (audit:vacuous-tests, orders/spots).
  withSpots({ bid = 100, ask = 200 }: { bid?: number | null; ask?: number | null } = {}): this {
    this.steps.push(async (c, order) => {
      for (const metal_id of (await metalIds(c)).values()) {
        await orderSpots.create({ id: anId(), order_id: order.id, metal_id, bid, ask }, c);
      }
    });
    return this;
  }

  // The money row. Absent by default, because "an order with no totals yet" is
  // a real state and several tests are about reaching it.
  withTotals(totals: Totals = {}): this {
    this.steps.push(async (c, order) => {
      await totalsRepo.create({ id: anId(), order_id: order.id, ...totals }, c);
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
    const created = await ordersRepo.create(
      {
        id: this.options.id ?? anId(),
        user_id: this.user?.id ?? null,
        direction,
        status: this.options.status ?? "Pending",
        notes: this.options.notes ?? null,
      },
      this.c
    );
    const order: BuiltOrder = {
      id: created.id,
      number: created.number,
      user_id: this.user?.id ?? null,
      direction,
      status: this.options.status ?? "Pending",
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
