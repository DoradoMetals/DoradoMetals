import { useDownloadSalesOrderInvoice } from '@/features/pdfs/queries'
import type { OrderDownload } from '@/features/orders/ui/OrderDrawerHeader'
import type { SalesOrder } from '@/features/orders/salesOrders/types'

const labelsByVariant = {
  user: {
    invoicePreview: 'Invoice Preview',
    invoice: 'Invoice',
  },
  admin: {
    invoicePreview: 'Download Invoice Preview',
    invoice: 'Download Invoice',
  },
} as const

export function useSalesOrderDownloads(
  order: Pick<SalesOrder, 'id' | 'number'>,
  variant: 'user' | 'admin' = 'user'
): OrderDownload[] {
  const downloadInvoice = useDownloadSalesOrderInvoice()

  const labels = labelsByVariant[variant]

  return [
    {
      statuses: ['Pending'],
      label: labels.invoicePreview,
      onClick: () =>
        downloadInvoice.mutate({
          order_id: order.id,
          order_number: order.number,
          fileName: 'invoice_preview',
        }),
      isPending: downloadInvoice.isPending,
    },
    {
      statuses: ['Preparing', 'In Transit', 'Completed'],
      label: labels.invoice,
      onClick: () =>
        downloadInvoice.mutate({
          order_id: order.id,
          order_number: order.number,
          fileName: 'invoice',
        }),
      isPending: downloadInvoice.isPending,
    },
  ]
}
