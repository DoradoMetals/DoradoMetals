import { requiredEnv } from '#shared/env/required.ts'

// Where a mailer's button goes. Every link is absolute - a mail client has no
// base URL to resolve a relative one against.

export function ordersUrl(): string {
  return `${requiredEnv('FRONTEND_URL')}/orders`
}

export function accountUrl(): string {
  return `${requiredEnv('FRONTEND_URL')}/account`
}

// FedEx's own tracking page. The carrier is the authority on where a parcel is,
// and sending the customer to it beats mirroring a scan feed into our own page.
export function trackingUrl(tracking_number: string | null): string {
  return tracking_number
    ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking_number)}`
    : ordersUrl()
}

export function directionsUrl(venue: string | null): string {
  const query = venue ?? '3198 Royal Lane Suite 209, Dallas, TX 75229'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// "Add to calendar" has to actually add to a calendar. A Google Calendar
// template URL is a plain link - no attachment, no MIME part, nothing for a
// client to strip - and every other calendar imports from one.
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
