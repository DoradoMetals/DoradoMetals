import {
  useGenerateInvoice,
  useGeneratePackingList,
  useGenerateReturnPackingList,
  useGenerateSalesOrderInvoice,
} from '@dorado/client'
import {
  useFormatPurchaseOrderNumber,
  useFormatSalesOrderNumber,
} from '@/features/orders/utils/formatOrderNumbers'

// IDS IN, DOCUMENTS OUT (ruling 10, wave 3). The request is @dorado/client's
// now - `{ order_id }` only. What is left here is what that package
// deliberately does not know: the order NUMBER (for the filename) and saving
// the blob to disk.

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
// formatter closed over.
export const useDownloadPackingList = () => {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const mutation = useGeneratePackingList()

  const mutateAsync = async ({ order_id, order_number }: OrderDownload) => {
    const blob = await mutation.mutateAsync({ order_id })
    save(blob, `${formatPurchaseOrderNumber(order_number)}_packing_list.pdf`)
    return blob
  }

  return { ...mutation, mutateAsync, mutate: (vars: OrderDownload) => { mutateAsync(vars).catch(() => {}) } }
}

export const useDownloadReturnPackingList = () => {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const mutation = useGenerateReturnPackingList()

  const mutateAsync = async ({ order_id, order_number }: OrderDownload) => {
    const blob = await mutation.mutateAsync({ order_id })
    save(blob, `${formatPurchaseOrderNumber(order_number)}_return_packing_list.pdf`)
    return blob
  }

  return { ...mutation, mutateAsync, mutate: (vars: OrderDownload) => { mutateAsync(vars).catch(() => {}) } }
}

export const useDownloadInvoice = () => {
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const mutation = useGenerateInvoice()

  const mutateAsync = async ({ order_id, order_number, fileName }: OrderDownload & { fileName: string }) => {
    const blob = await mutation.mutateAsync({ order_id })
    save(blob, `${formatPurchaseOrderNumber(order_number)}_${fileName}.pdf`)
    return blob
  }

  return {
    ...mutation,
    mutateAsync,
    mutate: (vars: OrderDownload & { fileName: string }) => { mutateAsync(vars).catch(() => {}) },
  }
}

export const useDownloadSalesOrderInvoice = () => {
  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const mutation = useGenerateSalesOrderInvoice()

  const mutateAsync = async ({ order_id, order_number, fileName }: OrderDownload & { fileName: string }) => {
    const blob = await mutation.mutateAsync({ order_id })
    save(blob, `${formatSalesOrderNumber(order_number)}_${fileName}.pdf`)
    return blob
  }

  return {
    ...mutation,
    mutateAsync,
    mutate: (vars: OrderDownload & { fileName: string }) => { mutateAsync(vars).catch(() => {}) },
  }
}
