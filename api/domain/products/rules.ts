// The catalogue's pure rules and its refusals (ruling 65). No database, no
// HTTP: every function takes rows already loaded.
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

// WHAT A NEW CATALOGUE ROW STARTS AS. products.bullion declares seven columns
// NOT NULL with no default, so a create must state them; the admin makes a row
// first and edits it, and these are the values exchange.products defaulted, so
// a product does not differ across promotion.
// Literals, not a lookup by name: resolving "Silver" would make creating a
// product depend on that metal still being called that.
export const NEW_PRODUCT_DEFAULTS = {
  metal_id: "4e194eef-836f-4e9b-97f3-dda36a232dfb",
  mint_id: "61e1af1e-6cb3-44c7-bf45-683a58317ddf",
  supplier_id: "d7414aa4-28ec-4c26-8890-523c1812fb14",
  image_front: "/product_images/elemetal_products/silver/Product Name/FRONT.png",
  image_back: "/product_images/elemetal_products/silver/Product Name/BACK.png",
  stock: 0,
  quantity: 0,
} as const;

// HEAVIEST FIRST. A family's headline row is its largest weight, and its
// siblings are offered largest first - the sort four screens each did for
// themselves, two of them disagreeing with the grouping they were handed.
const heaviestFirst = (a: BullionStorefront, b: BullionStorefront) =>
  b.content - a.content || a.id.localeCompare(b.id);

// A PRODUCT'S FAMILY. `variant_group` names it; an empty one means the product
// stands alone. Group order follows the order the rows arrived in, which is
// the sort the caller asked for, and a family of one carries no variants.
export function group(rows: BullionStorefront[]): BullionGroup[] {
  const order: string[] = [];
  const families = new Map<string, BullionStorefront[]>();

  for (const row of rows) {
    // A lone product is keyed by its own id, so it can never share a family.
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
