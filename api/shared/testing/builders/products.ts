// aProduct - a catalogue row, built.
//
// `create` writes the nine columns products.bullion declares NOT NULL with no
// default and nothing else, so everything a test actually cares about -
// content, purity, the two premiums, whether it is offered for sale - is set
// by the repo's own `update` immediately afterwards. That is one round trip
// more than an INSERT and it keeps the builder honest: no column is written
// here that a service does not write through the same statement.
//
// THE DEFAULTS ARE LITERALS AND THEY ARE READABLE ON PURPOSE. A one-ounce
// .9999 coin at $50 over bid is what most of these tests mean by "a product",
// and a failure message that says 0.9999 is worth more than one that says
// whatever row 047 happened to seed first.
import type { PoolClient } from "pg";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as products from "#db/products/repo.ts";
import { metalId, mintId, supplierId, type MetalName } from "#shared/testing/builders/reference.ts";

export type BuiltProduct = {
  id: string;
  name: string;
  slug: string | null;
  metal_id: string;
  content: number;
  gross: number;
  purity: number;
  bid_premium: number;
  ask_premium: number;
};

export type ProductOptions = {
  id?: string;
  name?: string;
  metal?: MetalName;
  metal_id?: string;
  content?: number;
  gross?: number;
  purity?: number;
  bid_premium?: number;
  ask_premium?: number;
  type?: string;
  display?: boolean;
  sell_display?: boolean;
  stock?: number;
  quantity?: number;
  slug?: string | null;
  variant_group?: string;
  variant_label?: string;
  legal_tender?: boolean;
  is_generic?: boolean;
  filter_category?: string | null;
};

export async function aProduct(
  c: PoolClient, options: ProductOptions = {}
): Promise<BuiltProduct> {
  const tag = aTag();
  const id = options.id ?? anId();
  const name = options.name ?? `Test Bullion ${tag}`;
  const metal_id = options.metal_id ?? (await metalId(c, options.metal ?? "Gold"));
  const mint_id = await mintId(c);
  const supplier_id = await supplierId(c);

  await products.create(
    {
      id, name, metal_id, mint_id, supplier_id,
      image_front: "test-front.png", image_back: "test-back.png",
      stock: options.stock ?? 10,
      quantity: options.quantity ?? 1,
    },
    c
  );

  const slug = options.slug ?? `test-bullion-${tag}`;
  const content = options.content ?? 1;
  const gross = options.gross ?? 1;
  const purity = options.purity ?? 0.9999;
  const bid_premium = options.bid_premium ?? 50;
  const ask_premium = options.ask_premium ?? 75;

  await products.update(
    id,
    {
      metal_id, supplier_id, mint_id, name,
      description: `Built by a fixture (${tag})`,
      bid_premium, ask_premium,
      type: options.type ?? "Coin",
      display: options.display ?? true,
      content, gross, purity,
      variant_group: options.variant_group ?? "",
      shadow_offset: 0,
      stock: options.stock ?? 10,
      slug,
      homepage_display: false,
      legal_tender: options.legal_tender ?? false,
      domestic_tender: false,
      sell_display: options.sell_display ?? true,
      is_generic: options.is_generic ?? false,
      variant_label: options.variant_label ?? "",
      quantity: options.quantity ?? 1,
      image_front: "test-front.png",
      image_back: "test-back.png",
      filter_category: options.filter_category ?? null,
    },
    c
  );

  return { id, name, slug, metal_id, content, gross, purity, bid_premium, ask_premium };
}
