// Shared contracts for the Dorado API.
//
//   generated/  one zod schema per table, produced from information_schema.
//               Never hand-edited.
//   wire/       the shapes the API actually returns, composed from the leaves.
//
// exchange is exported flat because it is still what serves traffic. Every
// per-feature schema is namespaced, because table names collide across them by
// design - leads.LeadsRow and the exchange LeadsRow are the same concept at two
// points in the migration.
export * from "./generated/exchange.js";

export * as fulfillments from "./generated/fulfillments.js";
export * as leads from "./generated/leads.js";
export * as media from "./generated/media.js";
export * as metals from "./generated/metals.js";
export * as orders from "./generated/orders.js";
export * as organizations from "./generated/organizations.js";
export * as payments from "./generated/payments.js";
export * as places from "./generated/places.js";
export * as products from "./generated/products.js";
export * as rates from "./generated/rates.js";
export * as reviews from "./generated/reviews.js";
export * as shipping from "./generated/shipping.js";
export * as spots from "./generated/spots.js";
export * as tax from "./generated/tax.js";
export * as refiners from "./generated/refiners.js";
export * as checkout from "./generated/checkout.js";
export * as auth from "./generated/auth.js";

export * from "./wire/index.js";
