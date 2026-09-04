import { z } from "zod/v4";

export const OrderActions = z.object({
  cancel: z.boolean(),
  finalize_pricing: z.boolean(),
  add_funds: z.boolean(),
  send_to_refiner: z.boolean(),
  buy_label: z.boolean(),
  update_tracking: z.boolean(),
  edit_lines: z.boolean(),
  statuses: z.array(z.string()),
});
export type OrderActions = z.infer<typeof OrderActions>;

export const SettledAwaiting = z.object({
  order_id: z.string().uuid(),
  payment_intent_id: z.string(),
});
export type SettledAwaiting = z.infer<typeof SettledAwaiting>;

export const AbandonedSale = z.object({
  order_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  used_funds: z.boolean().nullable(),
  reserved_funds: z.number().nullable(),
  payment_intent_id: z.string().nullable(),
  payment_status: z.string().nullable(),
});
export type AbandonedSale = z.infer<typeof AbandonedSale>;

export const ReservedFunds = AbandonedSale.pick({
  user_id: true, used_funds: true, reserved_funds: true,
});
export type ReservedFunds = z.infer<typeof ReservedFunds>;
