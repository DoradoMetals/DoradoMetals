export function useFormatSalesOrderNumber() {
  const formatSalesOrderNumber = (orderNumber: number | null | undefined): string => {
    if (!orderNumber) return '—';

    const padded = orderNumber.toString().padStart(6, '0'); // <- add leading zeroes to 6 digits
    return `SO - ${padded}`;
  };

  return { formatSalesOrderNumber };
}