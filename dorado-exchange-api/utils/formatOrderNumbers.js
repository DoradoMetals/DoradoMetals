function formatPurchaseOrderNumber(orderNumber) {
  const padded = orderNumber.toString().padStart(6, "0");
  return `PO - ${padded}`;
}

function formatSalesOrderNumber(orderNumber) {
  const padded = orderNumber.toString().padStart(6, "0");
  return `SO - ${padded}`;
}

module.exports = {
  formatPurchaseOrderNumber,
  formatSalesOrderNumber,
};
