// What pricing needs of a spot row, declared ONCE — was written out character-for-character in two separate features before ruling 24 (one concept, two owners since neither owned pricing); both now import it from here.
// The composed shape (name/ask/bid) is what getSpotPrices returns now that the legacy type/ask_spot/bid_spot spellings retired; frozen order-spot rows carry more, but only these three fields are ever read.
export type PricingSpot = {
  name?: string | null;
  ask?: number | null;
  bid?: number | null;
};

// Spots as a caller holds them. Nullable because several call sites pass
// whatever a read returned without checking, and the sums below already treat
// "no spots" and "this metal is not in spots" as the same question.
export type Spots = PricingSpot[] | null | undefined;
