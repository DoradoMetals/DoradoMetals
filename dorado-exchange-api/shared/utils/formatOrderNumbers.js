export function formatPurchaseOrderNumber(orderNumber) {
  const padded = orderNumber.toString().padStart(6, "0");
  return `PO - ${padded}`;
}

export function formatSalesOrderNumber(orderNumber) {
  const padded = orderNumber.toString().padStart(6, "0");
  return `SO - ${padded}`;
}
