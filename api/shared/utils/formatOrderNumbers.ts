// Order numbers as a customer sees them: PO - 000242.
//
// The parameter is `number | string` rather than `number`, because
// orders.orders.number is a BIGINT and the pg parser in db.js turns it into a
// JS number - but exchange's callers have historically passed both, and the
// padStart works either way. Narrowing it to `number` would be a lie about what
// arrives rather than a constraint on it.
export function formatPurchaseOrderNumber(orderNumber: number | string): string {
  const padded = orderNumber.toString().padStart(6, "0");
  return `PO - ${padded}`;
}

export function formatSalesOrderNumber(orderNumber: number | string): string {
  const padded = orderNumber.toString().padStart(6, "0");
  return `SO - ${padded}`;
}
