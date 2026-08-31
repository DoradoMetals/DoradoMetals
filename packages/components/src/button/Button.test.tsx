import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Button, buttonVariants } from './Button'
import { cn } from '../cn'
import { axeViolations } from '../test/axe'

/** What the DOM actually gets: cva composes, cn()/twMerge resolves. Asserting
 *  on `buttonVariants()` alone proves nothing - the whole class of bug here is
 *  a class that survives composition and then loses the merge. (The tests for
 *  variant="link" died with the variant: Link is a separate component now,
 *  which the TYPE enforces - a spelling the compiler refuses needs no runtime
 *  test.) */
const rendered = (props: Parameters<typeof buttonVariants>[0]) =>
  cn(buttonVariants(props)).split(' ')

describe('the Button is the drawing at 25:510', () => {
  it('the pill is dead: every button is rounded-lg, the theme radius', () => {
    const c = rendered({})
    expect(c).toContain('rounded-lg')
    expect(c).not.toContain('rounded-full')
  })

  it('tertiary keeps bare-text alignment: px-2/-mx-2 cancel; the size px loses', () => {
    const c = rendered({ variant: 'tertiary' })
    expect(c).toContain('px-2')
    expect(c).toContain('-mx-2')
    expect(c).not.toContain('px-4')
    expect(c).toContain('text-muted-foreground')
  })

  /* The hover language: escalate one step. Tertiary fills with ACCENT - the
     file's quiet-hover language (Table Row, Select Option); Jacob rejected the
     drawn outline, and underline is Link's move. Secondary fills, primary dims
     BY RAMP STEP (the drawing resolves the hover fill to neutral-800). */
  it('hover escalates one step, per variant', () => {
    expect(rendered({ variant: 'tertiary' })).toContain('hover:bg-accent')
    expect(rendered({ variant: 'tertiary' })).not.toContain('hover:border-border')
    expect(rendered({ variant: 'secondary' })).toContain('hover:bg-accent')
    expect(rendered({ variant: 'secondary' })).toContain('hover:border-border-strong')
    expect(rendered({})).toContain('hover:bg-neutral-800')
  })

  it('a hued secondary outlines in its hue and FILLS with it on hover', () => {
    const c = rendered({ variant: 'secondary', intent: 'danger' })
    expect(c).toContain('border-destructive')
    expect(c).toContain('text-destructive')
    expect(c).toContain('hover:bg-destructive')
    expect(c).toContain('hover:text-destructive-foreground')
  })

  /* The cn() half of the old story: twMerge once classified `text-small` as a
     COLOUR, so a compound variant's text colour deleted the font size. Pinned
     against the new variants too. */
  it('every size keeps BOTH its font size and its variant colour', () => {
    const bare = rendered({})
    expect(bare).toContain('text-small')
    expect(bare).toContain('text-primary-foreground')
    expect(bare).toContain('bg-primary')

    expect(rendered({ size: 'xs' })).toContain('text-micro')
    expect(rendered({ size: 'xl' })).toContain('text-body')
  })

  it('the default is primary/neutral/default - it restyles zero unswept call sites', () => {
    expect(rendered({})).toEqual(
      rendered({ variant: 'primary', intent: 'neutral', size: 'default' })
    )
  })
})

describe('rendered Button', () => {
  it('is a real button with an accessible name, and axe finds nothing', async () => {
    const { getByRole, container } = render(<Button>Save changes</Button>)
    const btn = getByRole('button', { name: 'Save changes' }) as HTMLButtonElement
    expect(btn.tagName).toBe('BUTTON')
    expect(await axeViolations(container)).toEqual([])
  })

  it('disabled is the attribute, not a class costume', () => {
    const { getByRole } = render(<Button disabled>Nope</Button>)
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true)
  })
})
