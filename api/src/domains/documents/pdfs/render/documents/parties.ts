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

function placeOf(address: OrderView['address']): string | null {
  const joined = [
    address?.line_1,
    address?.city,
    [address?.state, address?.zip].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ')
  return joined || null
}

export function customerBlock(
  order: OrderView,
  label: string,
  contact: 'ship' | 'quiet' | 'visit' = 'ship'
): EndBlock {
  const address = order.address
  const phone = formatPhoneNumber(address?.phone_number) || null
  return {
    label,
    who: order.user?.name ?? '-',
    strong: contact === 'ship' ? phone : null,
    lines:
      contact === 'visit'
        ? [placeOf(address), phone]
        : [address?.line_1 ?? null, cityState(address)],
  }
}

export function doradoBlock(label: string, phone = true): EndBlock {
  return {
    label,
    who: process.env.FEDEX_DORADO_NAME || 'Dorado Metals Exchange',
    strong: phone ? formatPhoneNumber(process.env.FEDEX_DORADO_PHONE_NUMBER) || null : null,
    lines: [
      process.env.FEDEX_RETURN_ADDRESS_LINE_1 ?? null,
      [process.env.FEDEX_RETURN_CITY, process.env.FEDEX_RETURN_STATE].filter(Boolean).join(', ') ||
        null,
    ],
  }
}
