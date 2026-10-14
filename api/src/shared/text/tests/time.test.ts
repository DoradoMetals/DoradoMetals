import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  formatClock,
  formatDate,
  formatDateAtClockZone,
  formatDateTime,
  formatDateTimeZone,
  formatDuration,
  formatWindow,
} from '#shared/text/time.ts'

const now = '2026-10-14T12:00:00Z'

test('a date drops the year in the current year and keeps it otherwise', () => {
  assert.equal(formatDate('2026-09-02T20:00:00Z', now), 'Sep 2')
  assert.equal(formatDate('2025-09-02T20:00:00Z', now), 'Sep 2, 2025')
})

test('a time reads 12-hour with a space before AM or PM and no leading zero', () => {
  assert.equal(formatDateTime('2026-09-05T14:14:00Z', now), 'Sep 5, 9:14 AM')
  assert.equal(formatDateTimeZone('2026-09-02T19:14:00Z', now), 'Sep 2, 2:14 PM CT')
  assert.equal(formatDateTimeZone('2025-09-02T19:14:00Z', now), 'Sep 2, 2025, 2:14 PM CT')
  assert.equal(formatClock('2026-09-09T18:42:00Z'), '1:42 PM')
  assert.equal(formatDateAtClockZone('2026-09-03T21:18:00Z', now), 'Sep 3 at 4:18 PM CT')
})

test('a window shares AM or PM when both ends do and prints both otherwise', () => {
  assert.equal(
    formatWindow('2026-09-09T18:00:00Z', '2026-09-09T20:00:00Z', now),
    'Sep 9, 1:00 – 3:00 PM'
  )
  assert.equal(
    formatWindow('2026-09-09T15:00:00Z', '2026-09-09T20:00:00Z', now),
    'Sep 9, 10:00 AM – 3:00 PM'
  )
  assert.equal(formatWindow('2026-09-09T18:00:00Z', null, now), 'Sep 9, 1:00 PM')
})

test('a duration reads minutes and zero-padded seconds', () => {
  assert.equal(formatDuration(84), '1:24')
  assert.equal(formatDuration(5), '0:05')
})
