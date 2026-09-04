export function getItemPrice(
  content: number | null | undefined,
  premium: number | null | undefined,
  bid_spot: number | null | undefined
): number {
  if (!bid_spot || !premium || !content) return 0;
  return content * (bid_spot * premium);
}

export function getPayoutDelay(method: string | null | undefined): string {
  if (method === "WIRE") return "1-5 hours";
  if (method === "ACH") return "1-24 hours";
  return "Instant";
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
