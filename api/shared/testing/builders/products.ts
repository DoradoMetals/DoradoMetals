import type { PoolClient } from "pg";
import { aTag } from "#shared/testing/builders/ids.ts";
import * as products from "#db/products/repo.ts";
import { mintId, supplierId, type MetalName } from "#shared/testing/builders/reference.ts";
import type { BullionCreate, BullionPatchColumns } from "@dorado/contracts";

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
  c: PoolClient,
  options: Omit<BullionPatchColumns, "metal_id"> & { metal_id?: MetalName } = {}
): Promise<BuiltProduct> {
  const tag = aTag();
  const patch: BullionCreate = {
    name: `Test Bullion ${tag}`,
    metal_id: "Gold",
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
    image_front: "test-front.png",
    image_back: "test-back.png",
    filter_category: null,
    ...options,
  };

  const id = await products.create(patch, c);
  await products.update(id, patch, c);

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
