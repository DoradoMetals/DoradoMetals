import { describe, expect, test } from 'vitest'

import { rangeLabel, unitShort } from '../_lib'

describe('rate formatters', () => {
  test('a band reads as a range, the last one open', () => {
    expect(rangeLabel(0, 5)).toBe('0 – 5 ozt')
    expect(rangeLabel(20, null)).toBe('20+ ozt')
    expect(rangeLabel(0, 100, unitShort('g'))).toBe('0 – 100 g')
  })
})
