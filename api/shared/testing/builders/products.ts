// aProduct - a catalogue row, built.
//
// `create` writes the nine columns products.bullion declares NOT NULL with no
// default and nothing else, so everything a test actually cares about -
// content, purity, the two premiums, whether it is offered for sale - is set
// by the repo's own `update` immediately afterwards. That is one round trip
// more than an INSERT and it keeps the builder honest: no column is written
// here that a service does not write through the same statement.
//
// THE OPTIONS ARE THE CONTRACT'S PATCH, not a local restatement of the
// columns: a column added to BullionPatch is settable here the same day.
// `metal` is the one addition - a metal by NAME, resolved to its id.
//
// THE DEFAULTS ARE LITERALS AND THEY ARE READABLE ON PURPOSE. A one-ounce
// .9999 coin at $50 over bid is what most of these tests mean by "a product",
// and a failure message that says 0.9999 is worth more than one that says
// whatever row 047 happened to seed first.
import type { PoolClient } from "pg";
import { anId, aTag } from "#shared/testing/builders/ids.ts";
import * as products from "#db/products/repo.ts";
import { metalId, mintId, supplierId, type MetalName } from "#shared/testing/builders/reference.ts";
import type { BullionPatch } from "@dorado/contracts";

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

export async function aProduct(
  c: PoolClient, options: BullionPatch & { metal?: MetalName } = {}
): Promise<BuiltProduct> {
  const tag = aTag();
  const { metal, ...given } = options;
  const patch: BullionPatch = {
    id: anId(),
    name: `Test Bullion ${tag}`,
    metal_id: await metalId(c, metal ?? "Gold"),
    mint_id: await mintId(c),
    supplier_id: await supplierId(c),
    description: `Built by a fixture (${tag})`,
    slug: `test-bullion-${tag}`,
    content: 1,
    gross: 1,
    purity: 0.9999,
    bid_premium: 50,
    ask_premium: 75,
    type: "Coin",
    display: true,
    homepage_display: false,
    legal_tender: false,
    domestic_tender: false,
    is_generic: false,
    variant_group: "",
    variant_label: "",
    shadow_offset: 0,
    stock: 10,
    quantity: 1,
    image_front: "test-front.png",
    image_back: "test-back.png",
    filter_category: null,
    ...given,
  };

  const { id: _requested, ...columns } = patch;
  const id = await products.create(patch, c);
  await products.update(id, columns, c);

  return {
    id,
    name: patch.name!,
    slug: patch.slug ?? null,
    metal_id: patch.metal_id!,
    content: patch.content!,
    gross: patch.gross!,
    purity: patch.purity!,
    bid_premium: patch.bid_premium!,
    ask_premium: patch.ask_premium!,
  };
}
