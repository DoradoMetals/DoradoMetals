import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { Button, buttonVariants } from './Button'
import { cn } from '../cn'
import { axeViolations } from '../test/axe'

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

  it('hover is opacity for every variant, and NOTHING else', () => {
    for (const variant of ['primary', 'secondary', 'tertiary'] as const) {
      const c = rendered({ variant })
      expect(c).toContain('hover:opacity-85')
      expect(c.join(' ')).not.toMatch(/hover:(underline|bg-|text-|border-)/)
    }
  })

  it('a hued secondary outlines in its hue - and hover adds NO fill (opacity law)', () => {
    const c = rendered({ variant: 'secondary', intent: 'danger' })
    expect(c).toContain('border-destructive')
    expect(c).toContain('text-destructive')
    expect(c).not.toContain('hover:bg-destructive')
    expect(c).toContain('hover:opacity-85')
  })

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

  it('type, icon and gap all tier with the size', () => {
    const tier = {
      sm: { text: 'text-micro', icon: '[&_svg]:size-3.5', gap: 'gap-1' },
      default: { text: 'text-small', icon: '[&_svg]:size-4', gap: 'gap-1.5' },
      lg: { text: 'sm:text-body', icon: '[&_svg]:size-5', gap: 'gap-2' },
    } as const
    for (const [size, want] of Object.entries(tier)) {
      const c = rendered({ size: size as keyof typeof tier })
      expect(c).toContain(want.text)
      expect(c).toContain(want.icon)
      expect(c).toContain(want.gap)
    }
  })

  it('no flat gap or icon size survives in the base', () => {
    const sm = rendered({ size: 'sm' })
    expect(sm).not.toContain('gap-2')
    expect(sm).not.toContain('[&_svg]:size-4')
  })

  it('tertiary tightens the gap to 4/5/6 against the boxed 4/6/8', () => {
    expect(rendered({ variant: 'tertiary', size: 'sm' })).toContain('gap-1')
    expect(rendered({ variant: 'tertiary', size: 'default' })).toContain('gap-[5px]')
    expect(rendered({ variant: 'tertiary', size: 'lg' })).toContain('gap-1.5')
    expect(rendered({ variant: 'secondary', size: 'default' })).toContain('gap-1.5')
    expect(rendered({ variant: 'secondary', size: 'lg' })).toContain('gap-2')
  })
})
