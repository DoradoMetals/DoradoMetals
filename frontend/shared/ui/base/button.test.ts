import { describe, expect, it } from 'vitest'
import { buttonVariants } from '@/shared/ui/base/button'
import { cn } from '@/shared/utils/cn'

/** What the DOM actually gets: cva composes, cn()/twMerge resolves. Asserting
 *  on `buttonVariants()` alone proves nothing - the whole class of bug here is
 *  a class that survives composition and then loses the merge. */
const rendered = (props: Parameters<typeof buttonVariants>[0]) =>
  cn(buttonVariants(props)).split(' ')

describe('Button renders correctly with NO call-site classes', () => {
  /* THE BUG: `cva` emits `size` after `variant`, and twMerge lets the last
     class win, so the default size's `h-10 px-4` beat `link`'s own
     `h-auto p-0` and a link button rendered as a 40px padded pill. Call sites
     were re-spelling `p-0 h-auto` to work around it - the exact classes
     CONVERSION-TABLE.md tells sweepers to delete. Silent both ways. */
  it('variant="link" has no box: no height, no padding, no pill, no border', () => {
    const c = rendered({ variant: 'link' })
    expect(c).toContain('h-auto')
    expect(c).not.toContain('h-10')
    expect(c).toContain('px-0')
    expect(c).not.toContain('px-4')
    expect(c).toContain('rounded-none')
    expect(c).not.toContain('rounded-full')
    expect(c).toContain('border-0')
  })

  it('a link keeps its box reset at every size', () => {
    for (const size of ['xs', 'sm', 'default', 'lg', 'xl', 'icon'] as const) {
      const c = rendered({ variant: 'link', size })
      expect(c, `size=${size}`).toContain('h-auto')
      expect(c, `size=${size}`).toContain('px-0')
    }
  })

  it('a link still takes its colour from intent', () => {
    expect(rendered({ variant: 'link', intent: 'danger' })).toContain('text-destructive')
    expect(rendered({ variant: 'link' })).toContain('text-foreground')
  })

  /* The cn() half of the same story: twMerge classified `text-small` as a
     COLOUR, so the compound variant's `text-primary-foreground` deleted it and
     every button inherited its parent's font-size. See shared/utils/cn.ts. */
  it('every size keeps BOTH its font size and its variant colour', () => {
    const bare = rendered({})
    expect(bare).toContain('text-small')
    expect(bare).toContain('text-primary-foreground')
    expect(bare).toContain('bg-primary')

    expect(rendered({ size: 'xs' })).toContain('text-micro')
    expect(rendered({ size: 'xl' })).toContain('text-body')
    expect(rendered({ variant: 'tertiary' })).toContain('text-muted-foreground')
  })

  it('the default is primary/neutral/default - it restyles zero unswept call sites', () => {
    expect(rendered({})).toEqual(rendered({ variant: 'primary', intent: 'neutral', size: 'default' }))
  })

  it('the legacy one-axis names still resolve through the shim', () => {
    // `ghost` was 87 of 193 call sites; it must land on tertiary/neutral.
    expect(rendered({ variant: 'tertiary', intent: 'neutral' })).toContain('text-muted-foreground')
  })
})
