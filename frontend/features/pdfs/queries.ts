import { pdfRequest } from '@/shared/queries/axios'
import { useMutation } from '@tanstack/react-query'
import {
  useFormatPurchaseOrderNumber,
  useFormatSalesOrderNumber,
} from '@/features/orders/utils/formatOrderNumbers'

// IDS IN, DOCUMENTS OUT (ruling 10, wave 3).
//
// Each of these four POSTed the WHOLE composed order as its render body -
// plus the live spot feed, plus a package option matched by label, plus the
// payout method - so the invoice a customer downloaded was rendered from
// numbers their own browser supplied. Ruling 10 listed them as the last
// standing violation; the order wire slim made fixing them the critical path,
// because there is no composed order in the browser to send any more.
//
// The body is `{ order_id }`. The server serves the STORED document when one
// exists and otherwise renders live from its own read - see
// api/features/media/pdfs/order-inputs.ts. Note what that also fixes: the
// package the packing list prints is the box the parcel was actually booked
// with, read off shipping.packages, rather than the first entry of a
// hard-coded option list when the label failed to match.
//
// The filename still needs the order NUMBER, which is on the order row the
// caller already holds, so it stays a parameter - it names the download, it
// does not render the document.

type OrderDownload = {
  order_id: string
  order_number: number | null
}

const save = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// The number formatters are HOOKS, so they are called at hook level and the
// formatter closed over - the request functions used to call them inside
// themselves, which is a rules-of-hooks violation that happened to work
// because the hooks read a store.
export const useDownloadPackingList = () => {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()

  return useMutation({
    mutationFn: async ({ order_id, order_number }: OrderDownload) => {
      const blob = await pdfRequest<Blob>('POST', '/pdf/generate_packing_list', { order_id })
      save(blob, `${formatPurchaseOrderNumber(order_number)}_packing_list.pdf`)
    },
  })
}

export const useDownloadReturnPackingList = () => {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()

  return useMutation({
    mutationFn: async ({ order_id, order_number }: OrderDownload) => {
      const blob = await pdfRequest<Blob>('POST', '/pdf/generate_return_packing_list', {
        order_id,
      })
      save(blob, `${formatPurchaseOrderNumber(order_number)}_return_packing_list.pdf`)
    },
  })
}

export const useDownloadInvoice = () => {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()

  return useMutation({
    mutationFn: async ({
      order_id,
      order_number,
      fileName,
    }: OrderDownload & { fileName: string }) => {
      const blob = await pdfRequest<Blob>('POST', '/pdf/generate_invoice', { order_id })
      save(blob, `${formatPurchaseOrderNumber(order_number)}_${fileName}.pdf`)
    },
  })
}

export const useDownloadSalesOrderInvoice = () => {
  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()

  return useMutation({
    mutationFn: async ({
      order_id,
      order_number,
      fileName,
    }: OrderDownload & { fileName: string }) => {
      const blob = await pdfRequest<Blob>('POST', '/pdf/generate_sales_order_invoice', {
        order_id,
      })
      save(blob, `${formatSalesOrderNumber(order_number)}_${fileName}.pdf`)
    },
  })
}
