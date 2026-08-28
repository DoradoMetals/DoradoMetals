import { z } from "zod/v4";
import { UsersRow } from "../generated/exchange.js";

// The user endpoints alias better-auth's camelCase columns to snake_case and
// omit the Stripe and ban columns. This is one of the few places where the wire
// genuinely differs from the table.
export const User = UsersRow.omit({
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
export type User = z.infer<typeof User>;

// UserOnOrder - user_id / user_name / user_email, three columns of
// exchange.users joined onto every order - died with the order wire slim
// (wave 3). An order carries `user_id`; a name is the client's to map from
// the admin users list it already caches, which is the same rule that killed
// mint_name. Nothing about a customer needs to ride along on their order.
