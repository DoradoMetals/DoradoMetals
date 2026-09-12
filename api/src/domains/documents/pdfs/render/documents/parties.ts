import type { OrderView } from '@dorado/contracts'
import type { EndBlock } from '@dorado/components/document'
import { formatPhoneNumber } from '#shared/utils/formatPhoneNumber.ts'

export const inboundShipment = (order: OrderView): OrderView['shipments'][number] | null =>
  order.shipments.find((s) => s.direction !== 'Return') ?? null

export const returnShipment = (order: OrderView): OrderView['shipments'][number] | null =>
  order.shipments.find((s) => s.direction === 'Return') ?? null

export function cityState(address: OrderView['address']): string | null {
  const joined = [address?.city, address?.state].filter(Boolean).join(', ')
  return joined || null
}

export function customerBlock(order: OrderView, label: string): EndBlock {
  const address = order.address
  return {
    label,
    who: order.user?.name ?? '-',
    strong: formatPhoneNumber(address?.phone_number) || null,
    lines: [address?.line_1 ?? null, cityState(address)],
  }
}

export function doradoBlock(label: string): EndBlock {
  return {
    label,
    who: process.env.FEDEX_DORADO_NAME || 'Dorado Metals Exchange',
    strong: formatPhoneNumber(process.env.FEDEX_DORADO_PHONE_NUMBER) || null,
    lines: [
      process.env.FEDEX_RETURN_ADDRESS_LINE_1 ?? null,
      [process.env.FEDEX_RETURN_CITY, process.env.FEDEX_RETURN_STATE].filter(Boolean).join(', ') ||
        null,
    ],
  }
}
