// Date formatting, which is where the two halves can disagree silently.
//
// The API stores most timestamps naive and reads them as UTC - the containers
// pin TZ=UTC for exactly that reason, and a migration had to restore
// microseconds that a JS Date had truncated. The browser has no such pin: it
// formats in whatever zone the customer is in.
//
// The test script pins TZ=UTC so runs are reproducible, but the assertions
// about instants are written as relationships rather than fixed strings, so
// they hold wherever they run. The last one states the consequence plainly,
// because showing a customer the wrong day is the kind of thing never noticed
// by whoever happens to share a timezone with the server.
import { describe, expect, test } from 'vitest'
import {
  formatPickupDate,
  formatPickupDateShort,
  formatPickupDateTime,
  formatPickupTime,
} from '@/shared/utils/formatDates'

describe('formatPickupTime', () => {
  test('renders a 24-hour time as 12-hour', () => {
    expect(formatPickupTime('15:30')).toBe('3:30 PM')
    expect(formatPickupTime('09:05')).toBe('9:05 AM')
  })

  test('renders midnight and noon the conventional way round', () => {
    expect(formatPickupTime('00:00')).toBe('12:00 AM')
    expect(formatPickupTime('12:00')).toBe('12:00 PM')
  })

  test('renders nothing as N/A rather than Invalid Date', () => {
    expect(formatPickupTime()).toBe('N/A')
    expect(formatPickupTime('')).toBe('N/A')
  })
})

describe('formatPickupDate', () => {
  test('renders a date-only string as a weekday and date', () => {
    expect(formatPickupDate('2024-04-22')).toBe('Monday, April 22nd')
  })

  test('renders nothing as N/A', () => {
    expect(formatPickupDate()).toBe('N/A')
  })

  // A date-only string has no zone, and date-fns parses it as local midnight -
  // so the day it renders is the day it says, wherever the customer is. That is
  // the safe case, and it is worth having a test that says so, because the
  // unsafe case below looks identical at the call site.
  test("a date-only string is not shifted by the reader's timezone", () => {
    expect(formatPickupDateShort('2024-04-22')).toBe('April 22nd')
    expect(formatPickupDateShort('2024-01-01')).toBe('January 1st')
  })
})

describe('formatPickupDateTime', () => {
  test('renders nothing and nonsense as N/A', () => {
    expect(formatPickupDateTime()).toBe('N/A')
    expect(formatPickupDateTime('not a date')).toBe('N/A')
  })

  // The instant tests below assert a *relationship* rather than a literal
  // string, so they hold in any timezone. An earlier version hardcoded the UTC
  // rendering and failed the moment it ran outside UTC - which was the whole
  // point being made, arriving as a broken test rather than as documentation.
  const localHour = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: true })
      .format(new Date(iso))
      .toLowerCase()
      .replace(/\s/g, '')

  test("renders an instant in the reader's own timezone", () => {
    const iso = '2024-04-22T15:30:00Z'
    expect(formatPickupDateTime(iso)).toContain(localHour(iso).replace(/\d+/, (h) => `${h}:30`))
  })

  test('an offset is respected rather than ignored', () => {
    // The same instant written two ways must render identically.
    expect(formatPickupDateTime('2024-04-22T09:00:00-05:00')).toBe(
      formatPickupDateTime('2024-04-22T14:00:00Z')
    )
  })

  // The hazard, stated as a property rather than a fixture. A full timestamp is
  // an instant, and date-fns formats it in the reader's zone - so just before
  // midnight UTC it is the previous day for every customer in the Americas,
  // which is most of them.
  //
  // This is not a bug in the function: showing local time is usually what you
  // want. It does mean a date rendered here can disagree with one the API
  // rendered, because the API pins TZ=UTC and the browser cannot. Nothing in
  // the code says so, so this test does.
  test('an instant near midnight UTC lands on a different day west of it', () => {
    const midnightUtc = '2024-04-23T00:00:00Z'
    const dayHere = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' }).format(
      new Date(midnightUtc)
    )
    const dayInChicago = new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      timeZone: 'America/Chicago',
    }).format(new Date(midnightUtc))

    expect(dayHere).toBe('23')
    expect(dayInChicago).toBe('22')
    // And the formatter follows whichever zone it is run in.
    expect(formatPickupDateTime(midnightUtc)).toContain(
      new Intl.DateTimeFormat('en-US', { day: 'numeric' }).format(new Date(midnightUtc))
    )
  })
})
