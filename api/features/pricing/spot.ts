// What pricing needs of a spot row, declared ONCE.
//
// This type was written out twice - character for character - in
// features/purchase-orders/utils/calculations.ts and
// features/sales-orders/utils/calculations.ts, which is the smallest possible
// version of the problem ruling 24 is about: one concept owned by two features
// because neither owned pricing. Both sides now import it from here.
//
// The composed shape (`name` / `ask` / `bid`) is what
// spots/service.getSpotPrices returns since the orders wire conversion (D84)
// retired the legacy `type` / `ask_spot` / `bid_spot` spellings. The frozen
// order-spot rows carry more (order id, timestamps); only these three fields
// are ever read.
export type PricingSpot = {
  name?: string | null;
  ask?: number | null;
  bid?: number | null;
};

// Spots as a caller holds them. Nullable because several call sites pass
// whatever a read returned without checking, and the sums below already treat
// "no spots" and "this metal is not in spots" as the same question.
export type Spots = PricingSpot[] | null | undefined;
