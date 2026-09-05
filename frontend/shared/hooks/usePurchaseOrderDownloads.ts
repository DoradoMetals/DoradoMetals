import {
  useDownloadInvoice,
  useDownloadPackingList,
  useDownloadReturnPackingList,
} from '@/shared/hooks/pdfs/queries'
import type { OrderDownload } from '@/shared/ui/OrderDrawerHeader'
import type { PurchaseOrder } from '@/shared/types/purchaseOrders'

const labelsByVariant = {
  user: {
    shipping: 'Shipping Info',
    invoicePreview: 'Invoice Preview',
    invoice: 'Invoice',
  },
  admin: {
    shipping: 'Download Label + Packing List',
    invoicePreview: 'Download Invoice Preview',
    invoice: 'Download Invoice',
  },
} as const

export function usePurchaseOrderDownloads(
  order: Pick<PurchaseOrder, 'id' | 'number'>,
  variant: 'user' | 'admin' = 'user'
): OrderDownload[] {
  const downloadPackingList = useDownloadPackingList()
  const downloadReturnPackingList = useDownloadReturnPackingList()
  const downloadInvoice = useDownloadInvoice()

  const labels = labelsByVariant[variant]

  return [
    {
      statuses: ['In Transit'],
      label: labels.shipping,
      onClick: () => downloadPackingList.mutate({ order_id: order.id, order_number: order.number }),
      isPending: downloadPackingList.isPending,
    },
    {
      statuses: ['Cancelled'],
      label: labels.shipping,
      onClick: () =>
        downloadReturnPackingList.mutate({ order_id: order.id, order_number: order.number }),
      isPending: downloadReturnPackingList.isPending,
    },
    {
      statuses: ['Received'],
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
      statuses: ['Payment Processing', 'Completed'],
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
