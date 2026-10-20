import { describe, expect, test } from 'vitest'

import {
  formatHours,
  formatLeadTotals,
  formatPurity,
  formatRate,
  formatRelative,
  formatWeight,
  initialsOf,
  leadBadge,
} from '../_lib'

const NOW = new Date('2026-10-19T17:00:00.000Z')
const before = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatHours', () => {
  test.each([
    [4.2, '4h 12m'],
    [4, '4h'],
    [0.5, '30m'],
    [1.5, '1h 30m'],
    [26, '26h'],
    [null, '—'],
  ])('%s hours reads %s', (hours, text) => {
    expect(formatHours(hours)).toBe(text)
  })
})

describe('formatRate', () => {
  test.each([
    [0.62, '62%'],
    [0.15, '15%'],
    [0, '0%'],
    [1, '100%'],
    [0.7149, '71%'],
  ])('%s reads %s', (rate, text) => {
    expect(formatRate(rate)).toBe(text)
  })
})

describe('formatPurity', () => {
  test.each([
    [0.585, '58.5%'],
    [0.75, '75.0%'],
    [0.925, '92.5%'],
    [0.9999, '100.0%'],
  ])('%s reads %s', (purity, text) => {
    expect(formatPurity(purity)).toBe(text)
  })
})

describe('formatWeight', () => {
  test.each([
    [12, 'g', '12.0 g'],
    [8.4, 'g', '8.4 g'],
    [220, 'g', '220.0 g'],
    [1.25, 'troy oz', '1.25 troy oz'],
  ])('%s %s reads %s', (weight, unit, text) => {
    expect(formatWeight(weight, unit)).toBe(text)
  })
})

describe('formatRelative', () => {
  test.each([
    [30 * 1000, 'just now'],
    [12 * MINUTE, '12m ago'],
    [4 * HOUR, '4h ago'],
    [30 * HOUR, 'yesterday'],
    [3 * DAY, '3 days ago'],
    [8 * DAY, 'last week'],
    [14 * DAY, '2 weeks ago'],
    [21 * DAY, '3 weeks ago'],
  ])('%s ms before now reads as %s', (ms, text) => {
    expect(formatRelative(before(ms), NOW)).toBe(text)
  })

  test('a missing time reads as Never', () => {
    expect(formatRelative(null, NOW)).toBe('Never')
  })
})

describe('formatLeadTotals', () => {
  test('joins the three facts of the header line', () => {
    expect(formatLeadTotals({ count: 48, unowned: 6, median_hours_to_first_contact: 4 })).toBe(
      '48 leads · 6 unowned · median 4h to first contact'
    )
  })

  test('rounds the median to whole hours', () => {
    expect(formatLeadTotals({ count: 48, unowned: 6, median_hours_to_first_contact: 4.4 })).toBe(
      '48 leads · 6 unowned · median 4h to first contact'
    )
  })

  test('says one lead in the singular and drops a missing median', () => {
    expect(formatLeadTotals({ count: 1, unowned: 0, median_hours_to_first_contact: null })).toBe(
      '1 lead · 0 unowned'
    )
  })
})

describe('leadBadge', () => {
  test('is the stage for an open lead', () => {
    expect(leadBadge({ lead_stage: 'Contacted', archived_at: null })).toBe('Contacted')
  })

  test('is Archived for an archived lead whatever its stage', () => {
    expect(leadBadge({ lead_stage: 'New', archived_at: '2026-10-17T00:00:00.000Z' })).toBe(
      'Archived'
    )
  })
})

describe('initialsOf', () => {
  test.each([
    ['Pedro Gonzalez', 'PG'],
    ['Jacob Johnson', 'JJ'],
    ['Renee', 'R'],
    [null, '?'],
  ])('%s reads %s', (name, text) => {
    expect(initialsOf(name)).toBe(text)
  })
})
