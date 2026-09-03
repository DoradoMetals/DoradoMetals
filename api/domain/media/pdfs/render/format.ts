// The small formatting decisions the documents share - which fallbacks are display and which are arithmetic matters: `{ length: "-" }` read as text became NaN as geometry, putting 68 NaNs in a packing list's box.
// Everything here is display - values are already computed by arrival; nothing downstream does maths on what these return.

// Zero when anything is missing, and `!bid_spot` rather than `== null` on purpose - a spot of 0 is as unpriceable as no spot, and both must come out as nothing rather than a free item.
// The one function here whose result IS arithmetic - callers sum it, so 0 rather than a dash is the correct fallback.
export function getItemPrice(
  content: number | null | undefined,
  premium: number | null | undefined,
  bid_spot: number | null | undefined
): number {
  if (!bid_spot || !premium || !content) return 0;
  return content * (bid_spot * premium);
}

// Any method that isn't WIRE or ACH is instant - covers account-credit and anything added later; a union type would refuse a method the database already holds.
export function getPayoutDelay(method: string | null | undefined): string {
  if (method === "WIRE") return "1-5 hours";
  if (method === "ACH") return "1-24 hours";
  return "Instant";
}

// A dash for a missing amount is safe here (a string into a template, nothing multiplies it) - contrast the packing list's dimensions, where the same dash fed back into a coordinate.
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
