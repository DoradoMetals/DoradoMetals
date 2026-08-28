import { z } from "zod/v4";

// The bullion catalogue as the frontend receives it.
//
// Products had no contract, which made them - with orders - one of the two
// features nothing validated in either implementation. That is the same gap
// orders had and it matters for the same reason: `diff` proves the two
// implementations agree with each other, so if both drift from what the
// frontend expects it stays green.
//
// This is not the products.bullion row. The read joins the mint and the metal
// and projects a flat shape: `mint_name` and `metal_type` are joined in,
// `metal_id`, `mint_id`, `supplier_id`, `stock`, `quantity`, `display` and the
// audit columns are not returned at all. Three columns are also renamed by the
// new schema - name, description and type - and repo.next aliases them back to
// product_name, product_description and product_type, which is what makes this
// contract worth checking against both.
//
// Nullability comes from the source columns in production. Only eight are
// nullable there, and `slug` is the one that matters: it is null on sell-only
// products, which is why getSellProducts returns rows getAllProducts does not.
// The shape the repos return: products.bullion's own names. This is the
// internal truth from here on - both implementations produce it, exchange by
// aliasing product_name up to name.
export const Bullion = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  type: z.string(),
  slug: z.string().nullable(),

  // Joined in, not columns on the product.
  metal_type: z.string(),
  mint_name: z.string(),

  // The physical facts. Unconstrained numeric at source - see
  // migration 058, which widened orders.items to match after a .9999 purity
  // was being stored as 1.000.
  gross: z.number(),
  content: z.number(),
  purity: z.number(),

  bid_premium: z.number(),
  ask_premium: z.number(),

  image_front: z.string(),
  image_back: z.string(),
  shadow_offset: z.number(),
  variant_group: z.string(),
  variant_label: z.string().nullable(),

  is_generic: z.boolean().nullable(),
  legal_tender: z.boolean().nullable(),
  domestic_tender: z.boolean().nullable(),
  sell_display: z.boolean().nullable(),
});
export type Bullion = z.infer<typeof Bullion>;

// The legacy ProductWire (product_name / product_description / product_type)
// lived here until 2026-08-27, derived from Bullion by the three renames.
// Products converted - the frontend reads Bullion's names via
// @dorado/contracts - so the legacy shape retired with its adapter.
