import { requiredEnv } from '#shared/env/required.ts'

function frontend(): string {
  return requiredEnv('FRONTEND_URL').replace(/\/+$/, '')
}

export function ordersUrl(): string {
  return `${frontend()}/orders`
}

export function accountUrl(): string {
  return `${frontend()}/account`
}

export function trackingUrl(tracking_number: string | null): string {
  return tracking_number
    ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking_number)}`
    : ordersUrl()
}

export function directionsUrl(venue: string | null): string {
  const query = venue ?? '3198 Royal Lane Suite 209, Dallas, TX 75229'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function calendarUrl(title: string, starts_at: string | null, venue: string | null): string {
  if (!starts_at) return ordersUrl()
  const start = new Date(starts_at)
  if (Number.isNaN(start.getTime())) return ordersUrl()
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const stamp = (at: Date): string =>
    at
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')
  const params = `text=${encodeURIComponent(title)}&dates=${stamp(start)}/${stamp(end)}${
    venue ? `&location=${encodeURIComponent(venue)}` : ''
  }`
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&${params}`
}

export function mediaUrl(): string {
  return `${frontend()}/media`
}

export function sellUrl(): string {
  return `${frontend()}/sell`
}
