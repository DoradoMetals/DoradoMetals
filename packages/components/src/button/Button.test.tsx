import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import * as React from 'react'

import { ArrowLeft } from '@dorado/icons'
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

  it('tertiary carries no box: no padding, no border, no margin trick', () => {
    const c = rendered({ variant: 'tertiary' })
    expect(c).not.toContain('px-sm')
    expect(c).toContain('border-0')
    expect(c).not.toContain('-mx-2')
    expect(c).not.toContain('px-md')
    expect(c).toContain('text-subtle')
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

  it('type, icon and gap all tier with the size (25:510, 2026-10-09)', () => {
    const tier = {
      sm: { text: 'text-micro', icon: '[&_svg]:size-3.5', gap: 'gap-2xs' },
      default: { text: 'text-small', icon: '[&_svg]:size-4', gap: 'gap-2xs-plus' },
      lg: { text: 'text-body', icon: '[&_svg]:size-5', gap: 'gap-xs' },
    } as const
    for (const [size, want] of Object.entries(tier)) {
      const c = rendered({ size: size as keyof typeof tier })
      expect(c).toContain(want.text)
      expect(c).toContain(want.icon)
      expect(c).toContain(want.gap)
    }
  })

  it('no flat icon size survives in the base', () => {
    const sm = rendered({ size: 'sm' })
    expect(sm).not.toContain('[&_svg]:size-4')
  })

  it('the icon gap scales by size - 2xs/SM, 2xs-plus/Default, xs/LG - same for every variant (25:510, 2026-10-09)', () => {
    const gapBySize = { sm: 'gap-2xs', default: 'gap-2xs-plus', lg: 'gap-xs' } as const
    for (const variant of ['primary', 'secondary', 'tertiary'] as const) {
      for (const size of ['sm', 'default', 'lg'] as const) {
        expect(rendered({ variant, size })).toContain(gapBySize[size])
      }
    }
  })

  it('primary/secondary bind height to the control tokens; tertiary carries none (25:510, 2026-10-09)', () => {
    expect(rendered({ variant: 'primary', size: 'sm' })).toContain('min-h-(--control-sm)')
    expect(rendered({ variant: 'primary', size: 'default' })).toContain('min-h-(--control-md)')
    expect(rendered({ variant: 'primary', size: 'lg' })).toContain('min-h-(--control-lg)')
    expect(rendered({ variant: 'tertiary', size: 'sm' })).toContain('min-h-0')
    expect(rendered({ variant: 'tertiary', size: 'default' })).toContain('min-h-0')
    expect(rendered({ variant: 'tertiary', size: 'lg' })).toContain('min-h-0')
  })

  it('tertiary neutral is the one place the library uses subtle', () => {
    expect(rendered({ variant: 'tertiary' })).toContain('text-subtle')
    expect(rendered({ variant: 'tertiary', intent: 'danger' })).toContain('text-destructive')
    expect(rendered({ variant: 'secondary' })).not.toContain('text-subtle')
  })

  it('icon-only sizes match Icon Button 457:75: box 28/32/40, glyph 16/16/20 (iconXs/iconSm/icon)', () => {
    expect(rendered({ size: 'iconXs' })).toContain('size-7')
    expect(rendered({ size: 'iconXs' })).toContain('[&_svg]:size-4')
    expect(rendered({ size: 'iconSm' })).toContain('size-(--control-sm)')
    expect(rendered({ size: 'iconSm' })).toContain('[&_svg]:size-4')
    expect(rendered({ size: 'icon' })).toContain('size-(--control-md)')
    expect(rendered({ size: 'icon' })).toContain('[&_svg]:size-5')
  })

  it('icon stroke weight is scale-true, 2 x (size/24), for every icon tier', () => {
    const { container: sm } = render(
      <Button size="sm" icon={ArrowLeft}>
        Go
      </Button>
    )
    const { container: def } = render(<Button icon={ArrowLeft}>Go</Button>)
    const { container: lg } = render(
      <Button size="lg" icon={ArrowLeft}>
        Go
      </Button>
    )
    expect(sm.querySelector('svg')?.getAttribute('stroke-width')).toBe(String((2 * 14) / 24))
    expect(def.querySelector('svg')?.getAttribute('stroke-width')).toBe(String((2 * 16) / 24))
    expect(lg.querySelector('svg')?.getAttribute('stroke-width')).toBe(String((2 * 20) / 24))
  })

  it('iconXs glyph is 16px, matching Icon Button SM (457:75), not 14', () => {
    const { container } = render(<Button size="iconXs" icon={ArrowLeft} aria-label="Back" />)
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe(String((2 * 16) / 24))
  })

  it('iconStrokeWidth overrides the size-scaled stroke', () => {
    const { container } = render(
      <Button size="sm" icon={ArrowLeft} iconSize={14} iconStrokeWidth={2}>
        Back
      </Button>
    )
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('2')
  })
})
