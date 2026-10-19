import { describe, expect, it } from 'vitest'
import { renderDocument } from './Page'

describe('document root', () => {
  it('declares its language and direction on the root element', () => {
    const html = renderDocument({ title: 'T', head: null, body: [], foot: null, footHeight: 0 })
    expect(html).toMatch(/<html lang="en" dir="ltr"/)
  })
})
