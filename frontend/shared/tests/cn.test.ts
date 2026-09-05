import { describe, expect, it } from 'vitest'
import { cn, SEMANTIC_TEXT_SIZES } from '@/shared/utils/cn'

/* THE HIGHEST-VALUE TEST IN THE STYLING PROGRAM, and it is four lines.

   Stock tailwind-merge does not know `text-small`/`text-h1`/... are FONT SIZES
   - they are our tokens, not Tailwind's - so it classified them as colours and
   let a later colour REPLACE the size, silently. Every shared component
   composes through cn(), and `cva` emits `size` before the compound variant
   carrying the colour, so every Button in the app had lost its font-size and
   was inheriting its parent's. Meanwhile the sweep was deleting ~700 explicit
   `text-sm` utilities from call sites on the promise that the variant supplies
   the size.

   Nothing failed. No type error, no test, no lint - which is exactly why this
   file exists. See the header of `cn.ts`. */
describe('cn merges the semantic type scale as SIZES, not colours', () => {
  it('keeps a semantic size when a colour follows it', () => {
    expect(cn('text-small', 'text-primary-foreground')).toBe('text-small text-primary-foreground')
  })

  it('keeps a colour when a semantic size follows it', () => {
    expect(cn('text-foreground', 'text-small')).toBe('text-foreground text-small')
  })

  it('still merges size against size, in both directions', () => {
    expect(cn('text-body', 'text-small')).toBe('text-small')
    expect(cn('text-h1', 'text-h2')).toBe('text-h2')
    // A semantic size and a stock Tailwind size are the same property and must
    // still collapse to the last one.
    expect(cn('text-sm', 'text-small')).toBe('text-small')
    expect(cn('text-small', 'text-sm')).toBe('text-sm')
  })

  it('still merges colour against colour', () => {
    expect(cn('text-foreground', 'text-destructive')).toBe('text-destructive')
  })

  it('leaves alignment alone - text-center is layout, not typography', () => {
    expect(cn('text-micro', 'text-foreground', 'text-center')).toBe(
      'text-micro text-foreground text-center'
    )
  })

  /* Every token in the scale, not just the two the bug was found on. A token
     added to theme.css but not to SEMANTIC_TEXT_SIZES is a size that vanishes
     whenever a colour is merged beside it, so the list is the contract. */
  it.each([...SEMANTIC_TEXT_SIZES])('text-%s survives a trailing colour', (name) => {
    expect(cn(`text-${name}`, 'text-destructive')).toBe(`text-${name} text-destructive`)
  })
})
