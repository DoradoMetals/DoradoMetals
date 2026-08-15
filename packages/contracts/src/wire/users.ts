import { z } from "zod/v4";
import { UsersRow } from "../generated/tables.js";

// The user endpoints alias better-auth's camelCase columns to snake_case and
// omit the Stripe and ban columns. This is one of the few places where the wire
// genuinely differs from the table.
export const UserWire = UsersRow.omit({
  createdAt: true,
  updatedAt: true,
  emailVerified: true,
  stripeCustomerId: true,
  banned: true,
  banReason: true,
  banExpires: true,
}).extend({
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  email_verified: z.boolean().nullable(),
});
export type UserWire = z.infer<typeof UserWire>;

// How a user appears nested on an order.
export const UserOnOrder = z.object({
  user_id: z.string().uuid().nullable(),
  user_name: z.string().nullable(),
  user_email: z.string().nullable(),
});
export type UserOnOrder = z.infer<typeof UserOnOrder>;
