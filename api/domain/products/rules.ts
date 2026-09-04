import { NotFound } from "#shared/errors.ts";
import type { BullionGroup, BullionStorefront } from "@dorado/contracts";

export function assertGroup(
  group: BullionGroup | undefined, slug: string
): asserts group is BullionGroup {
  if (!group) throw new NotFound(`no product ${slug}`);
}

export function assertProduct<T>(row: T | undefined, id: string): asserts row is T {
  if (!row) throw new NotFound(`no product ${id}`);
}

export function assertChanged(changed: boolean, id: string): void {
  if (!changed) throw new NotFound(`no product ${id}`);
}

export const NEW_PRODUCT_DEFAULTS = {
  metal_id: "4e194eef-836f-4e9b-97f3-dda36a232dfb",
  mint_id: "61e1af1e-6cb3-44c7-bf45-683a58317ddf",
  supplier_id: "d7414aa4-28ec-4c26-8890-523c1812fb14",
  image_front: "/product_images/elemetal_products/silver/Product Name/FRONT.png",
  image_back: "/product_images/elemetal_products/silver/Product Name/BACK.png",
  stock: 0,
  quantity: 0,
} as const;

const heaviestFirst = (a: BullionStorefront, b: BullionStorefront) =>
  b.content - a.content || a.id.localeCompare(b.id);

export function group(rows: BullionStorefront[]): BullionGroup[] {
  const order: string[] = [];
  const families = new Map<string, BullionStorefront[]>();

  for (const row of rows) {
    const key = row.variant_group === "" ? row.id : row.variant_group;
    const family = families.get(key);
    if (family) family.push(row);
    else {
      families.set(key, [row]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const variants = [...(families.get(key) ?? [])].sort(heaviestFirst);
    return { default: variants[0], variants: variants.length === 1 ? [] : variants };
  });
}
