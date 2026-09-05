import type { PoolClient } from "pg";
import { anUnknownId } from "#shared/testing/builders/ids.ts";
import * as checkouts from "#db/checkout/checkouts/repo.ts";
import * as items from "#db/checkout/items/repo.ts";
import type { MetalName } from "#shared/testing/builders/reference.ts";
import type { BuiltUser } from "#shared/testing/builders/users.ts";
import type { BuiltProduct } from "#shared/testing/builders/products.ts";

import type { Direction } from "@dorado/contracts";

export type BuiltCart = {
  id: string;
  user_id: string;
  direction: Direction;
  item_ids: string[];
};

export type CartOptions = { direction?: Direction };

type LotOptions = {
  metal_id?: MetalName;
  pre_melt?: number;
  purity?: number;
  unit?: string;
};

type Step = (c: PoolClient, cart: BuiltCart) => Promise<void>;

class CartPlan implements PromiseLike<BuiltCart> {
  private steps: Step[] = [];

  constructor(
    private readonly c: PoolClient,
    private readonly user: { id: string },
    private readonly options: CartOptions
  ) {}

  withLots(n: number, options: LotOptions = {}): this {
    this.steps.push(async (c, cart) => {
      const metal_id = options.metal_id ?? "Gold";
      for (let i = 0; i < n; i += 1) {
        const pre_melt = options.pre_melt ?? 10 + i;
        const purity = options.purity ?? 0.925;
        const row = await items.create(
          {
            checkout_id: cart.id,
            bullion_id: null,
            metal_id,
            pre_melt,
            post_melt: null,
            purity,
            content: Number((pre_melt * purity).toFixed(4)),
            unit: options.unit ?? "g",
            quantity: 1,
          },
          c
        );
        cart.item_ids.push(row.id);
      }
    });
    return this;
  }

  withBullion(product: BuiltProduct, quantity = 1): this {
    this.steps.push(async (c, cart) => {
      const row = await items.create(
        {
          checkout_id: cart.id,
          bullion_id: product.id,
          metal_id: product.metal_id,
          pre_melt: product.gross,
          post_melt: product.content,
          content: product.content,
          purity: product.purity,
          unit: "t oz",
          premium: product.bid_premium,
          quantity,
        },
        c
      );
      cart.item_ids.push(row.id);
    });
    return this;
  }

  withRow(patch: Parameters<typeof checkouts.update>[1]): this {
    this.steps.push(async (c, cart) => {
      await checkouts.update(cart.id, patch, c);
    });
    return this;
  }

  private async run(): Promise<BuiltCart> {
    const direction = this.options.direction ?? "purchase";
    const existing = await checkouts.findFor(this.user.id, direction, this.c);
    let id: string;
    if (existing) {
      await items.removeFor(existing.id, this.c);
      id = existing.id;
    } else {
      const created = await checkouts.create(
        { user_id: this.user.id, direction }, this.c
      );
      if (!created) throw new Error("checkout.checkouts refused a new session");
      id = created.id;
    }
    const cart: BuiltCart = { id, user_id: this.user.id, direction, item_ids: [] };
    for (const step of this.steps) await step(this.c, cart);
    return cart;
  }

  then<A = BuiltCart, B = never>(
    onfulfilled?: ((value: BuiltCart) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }
}

export function aCart(
  c: PoolClient, user: BuiltUser | { id: string }, options: CartOptions = {}
): CartPlan {
  return new CartPlan(c, user, options);
}

export const anAbsentCartId = (): string => anUnknownId();
