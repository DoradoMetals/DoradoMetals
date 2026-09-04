// What pricing needs of a spot row, declared ONCE — was written out character-for-character in two separate features before ruling 24 (one concept, two owners since neither owned pricing); both now import it from here.
// The composed shape (name/ask/bid) is what getSpotPrices returns now that the legacy type/ask_spot/bid_spot spellings retired; frozen order-spot rows carry more, but only these three fields are ever read.
// MOVED TO @dorado/contracts (ruling 57/60/61, computed/quotes.ts): both names
// are exported across features (domain/orders/rules.ts, domain/sales-tax,
// domain/media/pdfs), so this file re-exports rather than declaring them -
// the import path stays the same for every existing caller.
export type { PricingSpot, Spots } from "@dorado/contracts";
