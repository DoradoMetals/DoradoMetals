export function formatPurchaseOrderNumber(orderNumber: number | string | null | undefined): string {
  const padded = (orderNumber ?? "").toString().padStart(6, "0");
  return `PO - ${padded}`;
}

export function formatSalesOrderNumber(orderNumber: number | string | null | undefined): string {
  const padded = (orderNumber ?? "").toString().padStart(6, "0");
  return `SO - ${padded}`;
}
