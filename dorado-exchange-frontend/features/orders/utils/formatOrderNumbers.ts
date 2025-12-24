export function useFormatPurchaseOrderNumber() {
  const formatPurchaseOrderNumber = (orderNumber: number | null | undefined): string => {
    if (!orderNumber) return '—';

    const padded = orderNumber.toString().padStart(6, '0');
    return `PO - ${padded}`;
  };

  return { formatPurchaseOrderNumber };
}

export function useFormatSalesOrderNumber() {
  const formatSalesOrderNumber = (orderNumber: number | null | undefined): string => {
    if (!orderNumber) return '—';

    const padded = orderNumber.toString().padStart(6, '0');
    return `SO - ${padded}`;
  };

  return { formatSalesOrderNumber };
}