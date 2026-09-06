import type { PoolClient } from 'pg'
import { aTag } from '#shared/testing/builders/ids.ts'
import * as ordersRepo from '#db/orders/repo.ts'
import * as itemsRepo from '#db/orders/items/repo.ts'
import * as totalsRepo from '#db/orders/transactions/repo.ts'
import * as orderAddresses from '#db/orders/addresses/repo.ts'
import * as checkoutsRepo from '#db/checkout/checkouts/repo.ts'
import { metalIds, type MetalName } from '#shared/testing/builders/reference.ts'
import type { BuiltUser } from '#shared/testing/builders/users.ts'
import type { BuiltProduct } from '#shared/testing/builders/products.ts'

import type { Direction, OrderItem, OrderTotalsPatch } from '@dorado/contracts'

export type BuiltOrder = {
  id: string
  number: number
  user_id: string | null
  direction: Direction
  status: string
  items: { id: string; bullion_id: string | null; metal_id: string }[]
}

export type OrderOptions = {
  direction?: Direction
  status?: string
  notes?: string | null
}

type LotOptions = {
  metal_id?: MetalName
  pre_melt?: number
  post_melt?: number | null
  purity?: number
  price?: number | null
  confirmed?: boolean
  unit?: string
}

type BullionOptions = {
  price?: number | null
  premium?: number | null
  confirmed?: boolean
  sales_tax_charged?: number
  unit?: string
}

type LineSpec = Partial<Omit<OrderItem, 'id' | 'order_id' | 'metal_id'>> &
  Pick<OrderItem, 'metal_id'>

type Totals = Omit<OrderTotalsPatch, 'order_id'>

type Step = (c: PoolClient, order: BuiltOrder) => Promise<void>

class OrderPlan implements PromiseLike<BuiltOrder> {
  private steps: Step[] = []

  constructor(
    private readonly c: PoolClient,
    private readonly user: { id: string } | null,
    private readonly options: OrderOptions
  ) {}

  withLots(n: number, options: LotOptions = {}): this {
    this.steps.push(async (c, order) => {
      const metal_id = options.metal_id ?? 'Gold'
      for (let i = 0; i < n; i += 1) {
        const pre_melt = options.pre_melt ?? 10 + i
        const purity = options.purity ?? 0.925
        const row = await itemsRepo.create(
          order.id,
          {
            metal_id,
            pre_melt,
            post_melt: options.post_melt ?? null,
            purity,
            quantity: 1,
            confirmed: options.confirmed ?? false,
            unit: options.unit ?? 'g',
            price: options.price ?? null,
          },
          c
        )
        order.items.push({ id: row.id, bullion_id: null, metal_id })
      }
    })
    return this
  }

  withBullion(product: BuiltProduct, quantity = 1, options: BullionOptions = {}): this {
    this.steps.push(async (c, order) => {
      const created = await itemsRepo.createFromProduct(order.id, product.id, c)
      if (!created) throw new Error(`products.bullion has no row ${product.id} to copy`)
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
          unit: options.unit ?? 't oz',
        },
        { order_id: order.id },
        c
      )
      order.items.push({ id: created.id, bullion_id: product.id, metal_id: product.metal_id })
    })
    return this
  }

  withLines(...lines: LineSpec[]): this {
    this.steps.push(async (c, order) => {
      for (const line of lines) {
        const { rows } = await c.query<{ id: string; bullion_id: string | null; metal_id: string }>(
          `INSERT INTO orders.items
             (order_id, bullion_id, metal_id, pre_melt, post_melt, purity, content,
              premium, quantity, confirmed, sales_tax_charged, unit, price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id, bullion_id, metal_id`,
          [
            order.id,
            line.bullion_id ?? null,
            line.metal_id,
            line.pre_melt ?? null,
            line.post_melt ?? null,
            line.purity ?? null,
            line.content ?? null,
            line.premium ?? null,
            line.quantity ?? 1,
            line.confirmed ?? false,
            line.sales_tax_charged ?? 0,
            line.unit ?? null,
            line.price ?? null,
          ]
        )
        const row = rows[0]!
        order.items.push({ id: row.id, bullion_id: row.bullion_id, metal_id: row.metal_id })
      }
    })
    return this
  }

  withSpots({ bid = 100, ask = 200 }: { bid?: number | null; ask?: number | null } = {}): this {
    this.steps.push(async (c, order) => {
      for (const metal_id of await metalIds(c)) {
        await c.query(
          `INSERT INTO orders.spots (order_id, metal_id, ask, bid)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (order_id, metal_id) DO NOTHING`,
          [order.id, metal_id, ask, bid]
        )
      }
    })
    return this
  }

  withTotals(totals: Totals = {}): this {
    this.steps.push(async (c, order) => {
      await totalsRepo.create({ order_id: order.id, ...totals }, c)
    })
    return this
  }

  withAddress(address: { id: string }): this {
    this.steps.push(async (c, order) => {
      const snapshot = await c.query<{ id: string }>(
        `INSERT INTO places.addresses
           (line_1, line_2, city, state, country, zip, country_code, phone_number,
            is_valid, is_residential)
         SELECT line_1, line_2, city, state, country, zip, country_code,
                phone_number, is_valid, is_residential
           FROM places.addresses WHERE id = $1
         RETURNING id`,
        [address.id]
      )
      await orderAddresses.create(
        {
          order_id: order.id,
          address_id: snapshot.rows[0]!.id,
          source_address_id: address.id,
        },
        c
      )
    })
    return this
  }

  private async run(): Promise<BuiltOrder> {
    const direction = this.options.direction ?? 'purchase'
    const status = this.options.status ?? 'Pending'
    if (!this.user) {
      throw new Error(
        'anOrder needs a user - orders.orders.createForCheckout copies its owner ' +
          'off a checkout row, and checkout.checkouts.user_id is not nullable'
      )
    }

    const checkout =
      (await checkoutsRepo.create({ user_id: this.user.id, direction }, this.c)) ??
      (await checkoutsRepo.findFor(this.user.id, direction, this.c))
    if (!checkout) throw new Error('checkout.checkouts refused a new session')

    const created = await ordersRepo.createForCheckout(checkout.id, status, this.c)
    if (!created) throw new Error('orders.orders refused a new order')

    if (this.options.notes !== undefined) {
      await ordersRepo.update(created.id, { notes: this.options.notes }, {}, this.c)
    }

    const order: BuiltOrder = {
      id: created.id,
      number: created.number,
      user_id: this.user.id,
      direction,
      status,
      items: [],
    }
    for (const step of this.steps) await step(this.c, order)
    return order
  }

  then<A = BuiltOrder, B = never>(
    onfulfilled?: ((value: BuiltOrder) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected)
  }
}

export function anOrder(
  c: PoolClient,
  user: BuiltUser | { id: string } | null,
  options: OrderOptions = {}
): OrderPlan {
  return new OrderPlan(c, user, options)
}

export const aStatus = (): string => `probe-${aTag()}`
