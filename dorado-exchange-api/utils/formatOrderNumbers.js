function formatPurchaseOrderNumber(orderNumber) {
  const padded = orderNumber.toString().padStart(6, "0");
  return `PO - ${padded}`;
}

module.exports = {
  formatPurchaseOrderNumber,
};
