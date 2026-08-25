// The small formatting decisions the documents share.
//
// Three functions, and the interesting thing about them is which fallbacks are
// display and which are arithmetic - a distinction this codebase has paid for.
// `{ length: "-" }` on a package read correctly as text and became NaN as
// geometry, putting 68 NaNs in the box drawn on a customer's packing list.
// Everything here is display: the values are already computed by the time they
// arrive, and nothing downstream does maths on what these return.

// Zero when anything is missing, and `!bid_spot` rather than `bid_spot == null`
// on purpose: a spot of 0 is as unpriceable as no spot at all, and both should
// come out as nothing rather than as a free item. Same for a null premium or
// no content.
//
// This is the one function here whose result IS arithmetic - callers sum it -
// so returning 0 rather than a dash is the correct kind of fallback.
export function getItemPrice(
  content: number | null | undefined,
  premium: number | null | undefined,
  bid_spot: number | null | undefined
): number {
  if (!bid_spot || !premium || !content) return 0;
  return content * (bid_spot * premium);
}

// The payout method as the customer reads it on an invoice. Any method that is
// not WIRE or ACH is instant, which covers the account-credit case and anything
// added later - a union type here would refuse a method the database already
// holds.
export function getPayoutDelay(method: string | null | undefined): string {
  if (method === "WIRE") return "1-5 hours";
  if (method === "ACH") return "1-24 hours";
  return "Instant";
}

// A dash for a missing amount, which is display and safe: this returns a string
// into a template, and nothing multiplies it. Contrast the packing list's
// dimensions, where the same dash was fed back into a coordinate.
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
