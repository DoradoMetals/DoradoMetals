export function useFormatSalesOrderNumber() {
  const formatSalesOrderNumber = (orderNumber: number | null | undefined): string => {
    if (!orderNumber) return '—';
    return `SO - ${orderNumber}`;
  };

  return { formatSalesOrderNumber };
}