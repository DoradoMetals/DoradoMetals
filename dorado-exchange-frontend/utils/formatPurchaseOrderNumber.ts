export function useFormatPurchaseOrderNumber() {
  const formatPurchaseOrderNumber = (orderNumber: number | null | undefined): string => {
    if (!orderNumber) return '—';
    return `PO - ${orderNumber}`;
  };

  return { formatPurchaseOrderNumber };
}