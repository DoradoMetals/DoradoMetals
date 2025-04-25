import { differenceInDays, differenceInHours, format, isValid, parseISO } from 'date-fns'

/** Formats pickup time string like "15:30" -> "3:30 PM" */
export function formatPickupTime(time?: string): string {
  if (!time) return 'N/A'
  return format(new Date(`1970-01-01T${time}`), 'h:mm a')
}

/** Formats pickup date string like "2024-04-22" -> "Monday, April 22" */
export function formatPickupDate(date?: string): string {
  if (!date) return 'N/A'
  return format(parseISO(date), 'EEEE, MMMM do')
}

export function formatPickupDateShort(date?: string): string {
  if (!date) return 'N/A'
  return format(parseISO(date), 'MMMM do') // ex: April 23rd
}

export function formatTimeDiff(deliveryTime: string | Date): string {
  const now = new Date()
  const target = typeof deliveryTime === 'string' ? new Date(deliveryTime) : deliveryTime

  if (!isValid(target) || target <= now) return 'Arriving soon'

  const totalHours = differenceInHours(target, now)
  const days = differenceInDays(target, now)
  const hours = totalHours - days * 24

  const dayPart = days > 0 ? `${days} day${days > 1 ? 's' : ''}` : ''
  const hourPart = hours > 0 ? `${hours} hour${hours > 1 ? 's' : ''}` : ''

  return [dayPart, hourPart].filter(Boolean).join(' and ')
}

export function formatFullDate(date?: string | Date): string {
  if (!date) return 'N/A'
  const parsedDate = typeof date === 'string' ? new Date(date) : date
  if (!isValid(parsedDate)) return 'N/A'
  return format(parsedDate, 'MMMM do, yyyy')
}