// Order numbers as a customer sees them: PO - 000242.
// `number | string`, not `number` — BIGINT columns arrive as JS numbers via the pg parser, but callers have historically passed both; nullable since some new-schema-only orders have no exchange row, though the column itself is NOT NULL so a real order never renders the dash.
export function formatPurchaseOrderNumber(orderNumber: number | string | null | undefined): string {
  const padded = (orderNumber ?? "").toString().padStart(6, "0");
  return `PO - ${padded}`;
}

export function formatSalesOrderNumber(orderNumber: number | string | null | undefined): string {
  const padded = (orderNumber ?? "").toString().padStart(6, "0");
  return `SO - ${padded}`;
}
