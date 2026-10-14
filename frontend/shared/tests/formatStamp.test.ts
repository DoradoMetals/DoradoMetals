import { describe, expect, test } from 'vitest'

import { formatClock, formatStamp } from '@/shared/utils/formatStamp'

describe('one stamp format, 12-hour, in the business time zone', () => {
  test('a stamp this year reads month, day and time with AM/PM', () => {
    const year = new Date().getFullYear()
    expect(formatStamp(`${year}-04-08T21:07:00Z`)).toBe('Apr 8, 4:07 PM')
    expect(formatClock(`${year}-04-08T21:07:00Z`)).toBe('4:07 PM')
  })

  test('a stamp from another year carries the year', () => {
    expect(formatStamp('2020-04-08T21:07:00Z')).toBe('Apr 8, 2020, 4:07 PM')
  })

  test('a market stamp reads in its own zone', () => {
    const year = new Date().getFullYear()
    expect(formatStamp(`${year}-10-15T12:30:00Z`, 'America/New_York')).toBe('Oct 15, 8:30 AM')
  })

  test('no stamp reads as a dash', () => {
    expect(formatStamp(null)).toBe('—')
  })
})
