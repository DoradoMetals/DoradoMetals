import { pdfRequest } from '@/utils/axiosInstance'
import { PurchaseOrder } from '@/features/orders/purchaseOrders/types'
import { useMutation } from '@tanstack/react-query'
import { SpotPrice } from '@/features/spots/types'
import { PackageOption } from '@/features/packaging/types'
import { PayoutMethod } from '@/features/payouts/types'
import { SalesOrder } from '@/features/orders/salesOrders/types'
import { useFormatPurchaseOrderNumber, useFormatSalesOrderNumber } from '@/utils/formatting/order-numbers'

const downloadPackingListRequest = async ({
  purchaseOrder,
  spotPrices,
  packageDetails,
  payoutDetails,
}: {
  purchaseOrder: PurchaseOrder
  spotPrices: SpotPrice[]
  packageDetails: PackageOption
  payoutDetails: PayoutMethod
}) => {
  const blob = await pdfRequest<Blob>('POST', '/pdf/generate_packing_list', {
    purchaseOrder,
    spotPrices,
    packageDetails,
    payoutDetails,
  })

  const url = URL.createObjectURL(blob)
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const link = document.createElement('a')
  link.href = url
  link.download = `${formatPurchaseOrderNumber(purchaseOrder.order_number)}_packing_list.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const useDownloadPackingList = () => {
  return useMutation({
    mutationFn: downloadPackingListRequest,
  })
}

const downloadReturnPackingListRequest = async ({
  purchaseOrder,
  spotPrices,
}: {
  purchaseOrder: PurchaseOrder
  spotPrices: SpotPrice[]
}) => {
  const blob = await pdfRequest<Blob>('POST', '/pdf/generate_return_packing_list', {
    purchaseOrder,
    spotPrices,
  })

  const url = URL.createObjectURL(blob)
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const link = document.createElement('a')
  link.href = url
  link.download = `${formatPurchaseOrderNumber(purchaseOrder.order_number)}_return_packing_list.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const useDownloadReturnPackingList = () => {
  return useMutation({
    mutationFn: downloadReturnPackingListRequest,
  })
}

const downloadInvoiceRequest = async ({
  purchaseOrder,
  spotPrices,
  orderSpots,
  fileName,
}: {
  purchaseOrder: PurchaseOrder
  spotPrices: SpotPrice[]
  orderSpots: SpotPrice[]
  fileName: string
}) => {
  const blob = await pdfRequest<Blob>('POST', '/pdf/generate_invoice', {
    purchaseOrder,
    spotPrices,
    orderSpots,
  })

  const url = URL.createObjectURL(blob)
  const { formatPurchaseOrderNumber } = useFormatPurchaseOrderNumber()
  const link = document.createElement('a')
  link.href = url
  link.download = `${formatPurchaseOrderNumber(purchaseOrder.order_number)}_${fileName}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const useDownloadInvoice = () => {
  return useMutation({
    mutationFn: downloadInvoiceRequest,
  })
}

const downloadSalesOrderInvoiceRequest = async ({
  salesOrder,
  orderSpots,
  fileName,
}: {
  salesOrder: SalesOrder
  orderSpots: SpotPrice[]
  fileName: string
}) => {
  const blob = await pdfRequest<Blob>('POST', '/pdf/generate_sales_order_invoice', {
    salesOrder: salesOrder,
    spots: orderSpots,
  })

  const url = URL.createObjectURL(blob)
  const { formatSalesOrderNumber } = useFormatSalesOrderNumber()
  const link = document.createElement('a')
  link.href = url
  link.download = `${formatSalesOrderNumber(salesOrder.order_number)}_${fileName}.pdf`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const useDownloadSalesOrderInvoice = () => {
  return useMutation({
    mutationFn: downloadSalesOrderInvoiceRequest,
  })
}
