// The order's lines: read one order's, add one, edit one, remove one.
// GET/POST /orders/:id/items, PATCH/DELETE /orders/items/:id.
//
// ONE PATCH, NOT FOUR WRAPPERS: a line edit is one document, one guarded
// update, and the re-tier as its consequence.
//
// THE LINE'S ORDER IS RESOLVED SERVER-SIDE, never taken from the body - the
// guarded delete and the confirm key on it, and a supplied linkage could name
// somebody else's rows.
import * as ordersRepo from "#db/orders/repo.ts";
import * as itemsRepo from "#db/orders/items/repo.ts";
import * as refinerItems from "#db/refiners/items/repo.ts";
import * as productsRepo from "#db/products/repo.ts";
import * as metalsRepo from "#db/metals/repo.ts";
import * as ratesService from "#domain/rates/service.ts";
import * as rules from "#domain/orders/rules.ts";
import withTransaction from "#shared/db/withTransaction.ts";
import { refuseWith as refuse } from "#shared/http/refuse.ts";
import { refusedUnknownField, refusedValue, type Refusal } from "#shared/http/patch-body.ts";
import { OrderItemPatch } from "@dorado/contracts";
import type { OrderItemRow } from "#db/orders/items/repo.ts";
import type { PoolClient } from "pg";

type Executor = PoolClient | undefined;

export type { OrderItemRow } from "#db/orders/items/repo.ts";
export type { OrderItemPatch, OrderItemScrapPatch, OrderItemBullionPatch } from "@dorado/contracts";

// THE PREMIUM IS THE BUSINESS'S, NOT THE BROWSER'S: every scrap premium is
// re-resolved from the rates table, tiered by the order's TOTAL content of each
// metal. rules.retierPlan decides; this applies.
export async function retierScrapPremiums(order_id: string, executor?: Executor) {
  const rates = await ratesService.getAllRates();
  const scrapLines = await itemsRepo.scrapLinesFor(order_id, executor);
  for (const { id, premium } of rules.retierPlan(rates, scrapLines)) {
    const repriced = await itemsRepo.update(id, { premium }, {}, executor);
    if (!repriced) {
      throw new Error(
        `order ${order_id}: line ${id} vanished mid-write - its premium was not ` +
          `repriced and this transaction must not commit`
      );
    }
  }
}

// VERBATIM rows (rulings 9 + 12), both directions. bullion_id is the only
// product reference a line carries and null means scrap; no lines answers [].
export async function linesFor(
  orderId: string, executor?: Executor
): Promise<OrderItemRow[]> {
  return await itemsRepo.getFor(orderId, executor);
}

// A new line. Purchase direction only: sales lines exist from checkout.
export async function createLine(
  orderId: string,
  item: Record<string, unknown>
): Promise<OrderItemRow> {
  const direction = await ordersRepo.directionOf(orderId);
  if (!direction) refuse(404, `no order ${orderId}`);
  if (direction !== "purchase") {
    refuse(400, `line creation is a purchase-direction operation and this is a ${direction} order`);
  }

  return withTransaction(async (client) => {
    let created: OrderItemRow;
    if (item?.id) {
      // The line derives its weights from the catalogue; the premium stays null
      // because a bullion line prices from its product's own bid_premium.
      const [product] = await productsRepo.getByIds([String(item.id)], client);
      if (!product) refuse(400, `no product ${String(item.id)} to put on the order`);
      if (!product.metal_id) {
        refuse(422, `product ${product.name} has no metal, so its order line cannot be written`);
      }
      created = await itemsRepo.create(
        {
          order_id: orderId,
          bullion_id: product.id,
          metal_id: product.metal_id as string,
          pre_melt: product.gross,
          post_melt: product.content,
          purity: product.purity,
          content: product.content,
          quantity: 1,
          confirmed: false,
          unit: "t oz",
        },
        client
      );
    } else {
      // New scrap: the scrap IS the line. Metal resolved by name once.
      const idByName = await metalsRepo.idsByName(client);
      const metal_id = idByName.get(String(item?.metal ?? ""));
      if (!metal_id) refuse(422, `"${String(item?.metal)}" is not a metal this business trades`);
      const pre_melt = (item.pre_melt as number) ?? 1;
      const purity = (item.purity as number) ?? 1;
      created = await itemsRepo.create(
        {
          order_id: orderId,
          metal_id: metal_id as string,
          pre_melt,
          purity,
          content: (item.content as number) ?? pre_melt * purity,
          premium: (item.bid_premium as number) ?? 0.75,
          quantity: 1,
          confirmed: false,
          unit: (item.gross_unit as string) ?? "t oz",
        },
        client
      );
    }

    // The refiner counterpart (093), then the whole order re-tiered so an
    // admin-added scrap line matches customer checkout.
    await refinerItems.mirrorLinesForOrder(orderId, client);
    await retierScrapPremiums(orderId, client);

    return created;
  });
}

// THE BODY IS THE CONTRACT'S (A3). `scrap` and `bullion` require BOTH members
// because the write CLEARS what a partial document omits - on a bullion line
// that is how many coins the customer sent.
export type ItemPatchBody = OrderItemPatch & Record<string, unknown>;

const FIELDS = Object.keys(OrderItemPatch.shape);

export function refusedField(body: Record<string, unknown>): Refusal | null {
  const unknown = refusedUnknownField(body, FIELDS, "an order item PATCH");
  if (unknown) return unknown;
  if (Object.keys(body ?? {}).length === 0) {
    return { statusCode: 400, message: "the document names no field to write" };
  }
  return refusedValue(OrderItemPatch, body ?? {});
}

async function requireLine(itemId: string): Promise<OrderItemRow> {
  const line = await itemsRepo.getOne(itemId);
  if (!line) refuse(404, `no order item ${itemId}`);
  return line!;
}

// ONE function, ONE patch per table. content is derived in rules.ts and not in
// SQL: the unit conversion is a JavaScript table, and two definitions of what
// content means is the defect that costs money.
export async function editLine(
  itemId: string, body: ItemPatchBody
): Promise<{ success: true }> {
  const refusal = refusedField(body);
  if (refusal) refuse(refusal.statusCode, refusal.message);

  const line = await requireLine(itemId);

  if (body.scrap) {
    const s = body.scrap.scrap as Record<string, unknown>;
    const purity_actual = (s.purity_actual ?? s.purity ?? null) as number | null;
    const post_melt_actual = (s.post_melt_actual ?? s.post_melt ?? null) as number | null;

    // EVERY `?? null` BELOW IS LOAD-BEARING, NOT A COPY. buildUpdate reads an
    // ABSENT key as "leave the column alone" and an explicit null as "clear it",
    // and this write is a full replace of the line's weights: a field the
    // document does not carry must be CLEARED, or an edit would leave a price
    // computed from a mix of old figures and new.
    await withTransaction(async (client) => {
      await itemsRepo.update(
        itemId,
        {
          pre_melt: (s.pre_melt as number) ?? null,
          post_melt: (s.post_melt as number) ?? null,
          purity: (s.purity as number) ?? null,
          content: rules.scrapContent(
            (s.post_melt ?? s.pre_melt) as number, s.gross_unit as string, s.purity as number
          ),
          premium: body.scrap!.premium ?? null,
        },
        {},
        client
      );
      await refinerItems.update(
        itemId,
        {
          pre_melt: (s.pre_melt as number) ?? null,
          post_melt: post_melt_actual,
          purity: purity_actual,
          content: rules.scrapContent(
            (s.post_melt_actual ?? s.pre_melt) as number, s.gross_unit as string, purity_actual
          ),
        },
        client
      );
    });
  }

  if (body.bullion) {
    await withTransaction((client) =>
      itemsRepo.update(
        itemId,
        { quantity: body.bullion!.quantity, premium: body.bullion!.premium },
        {},
        client
      )
    );
  }

  if (body.confirmed === true || body.reset === true) {
    if (!line.order_id) {
      refuse(422, `order item ${itemId} belongs to no purchase order, so it cannot be confirmed`);
    }
    await withTransaction((client) =>
      itemsRepo.update(
        itemId, { confirmed: body.confirmed === true }, { order_id: line.order_id! }, client
      )
    );
  }

  return { success: true };
}

// The line, and the re-tier its removal forces. The scrap goes with the line
// because the scrap IS the line, and refiners.items cascades - one guarded
// statement where exchange had three that could each commit alone.
export async function removeLine(itemId: string): Promise<{ success: true }> {
  const line = await requireLine(itemId);
  if (!line.order_id) {
    refuse(422, `order item ${itemId} names no order - refusing an unguarded delete`);
  }
  const orderId = line.order_id!;

  await withTransaction(async (client) => {
    const removed = await itemsRepo.remove(itemId, orderId, client);
    if (!removed) {
      throw new Error(
        `order ${orderId}: line ${itemId} was not removed - this transaction must not commit`
      );
    }
    // Removing scrap changes the per-metal totals, so re-tier the survivors.
    await retierScrapPremiums(orderId, client);
  });

  return { success: true };
}
