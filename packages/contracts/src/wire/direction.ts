import type { z } from "zod/v4";
import { Direction as OrdersDirection } from "../generated/orders.js";

// ONE DIRECTION FOR THE WHOLE WIRE (Jacob, 2026-09-03: "Direction should
// probably live in our contracts"). The Postgres enum `orders.direction`
// types orders.orders, fulfillments.methods and payments.methods, and the
// generator emits it once per schema file; this is the single name every
// body, query and service reaches for. A transport parses a direction with
// it (a 400 for anything else); a service takes the parsed value and never
// re-checks it.
export const Direction = OrdersDirection;
export type Direction = z.infer<typeof Direction>;
