import { z } from "zod/v4";

// POST /api/tax/get_sales_tax - what a cart of catalogue lines owes in one
// state.
//
// IDS IN (D214 item 11, ruling 43). The endpoint used to take the request body
// itself as the lines, so a caller could declare a product's purity, weight
// and legal-tender flags - which are exactly the facts a tax rule matches on,
// and so exactly the way to choose the rate you are charged. It names an
// address and some products now; both rows are read server-side.
export const GetSalesTaxBody = z.object({
  address_id: z.string().uuid().nullable().optional(),
  items: z.array(
    z.object({ id: z.string().uuid(), quantity: z.number() }).strict()
  ).min(1),
}).strict();
export type GetSalesTaxBody = z.infer<typeof GetSalesTaxBody>;
