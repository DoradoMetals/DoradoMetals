import { describe, expect, it } from 'vitest'
import { color, px, space, radius, stroke, text, themeCss, tokens } from '@dorado/theme/tokens'
import { paper, screen } from './palette.ts'
import { eyebrowType, type } from './style.ts'

describe('the token reader', () => {
  it('resolves the colours the Mailers page binds', () => {
    expect(screen).toEqual({
      background: '#09090c',
      card: '#101114',
      border: '#2c2f35',
      foreground: '#f6f7f9',
      muted: '#9499a4',
      primary: '#fafafa',
      onPrimary: '#0d0e11',
    })
  })

  it('resolves the colours the Documents page binds', () => {
    expect(paper.background).toBe('#fafafa')
    expect(paper.foreground).toBe('#0d0e11')
    expect(paper.border).toBe('#babec5')
    expect(paper.muted).toBe('#787c87')
  })

  it('resolves the ramp steps the drawings measure', () => {
    expect(text('micro')).toEqual({
      size: '12px',
      lineHeight: '17.4px',
      letterSpacing: '0.048px',
      weight: '400',
    })
    expect(text('small')).toMatchObject({ size: '13px', lineHeight: '19.5px' })
    expect(text('h3')).toMatchObject({
      size: '22px',
      lineHeight: '28.6px',
      letterSpacing: '-0.33px',
    })
    expect(text('h4')).toMatchObject({
      size: '18px',
      lineHeight: '25.2px',
      letterSpacing: '-0.198px',
    })
    expect(text('h5')).toMatchObject({ size: '16px', lineHeight: '23.2px' })
    expect(text('h2')).toMatchObject({ size: '28px', lineHeight: '34.16px' })
    expect(text('stat-sm')).toMatchObject({ size: '30px', lineHeight: '34.5px' })
    expect(text('h1')).toMatchObject({ size: '36px', lineHeight: '41.4px' })
  })

  it('resolves the scale the drawings space by', () => {
    expect(space).toMatchObject({
      '2xs': '4px',
      xs: '8px',
      sm: '12px',
      md: '16px',
      lg: '24px',
      xl: '32px',
    })
    expect(radius).toBe('8px')
    expect(stroke).toEqual({ hairline: '1px', emphasis: '1.5px', heavy: '2px' })
  })

  it('resolves calc() and rem, and refuses a token theme.css does not declare', () => {
    expect(px('--radius-sm')).toBe('4px')
    expect(px('--text-body')).toBe('15px')
    expect(() => color('nope-not-a-token')).toThrow(/theme.css declares no/)
  })

  it('carries no unresolved var() or hsl() into a style a mail client reads', () => {
    for (const [name, value] of Object.entries(tokens)) {
      expect(`${name}=${value}`).not.toMatch(/hsl\(/)
      expect(`${name}=${value}`).not.toMatch(/calc\(/)
    }
  })

  it('gives a mail client px and hex, never a custom property', () => {
    const style = JSON.stringify(type('micro', { color: screen.muted }))
    expect(style).not.toMatch(/var\(/)
    expect(style).toContain('#9499a4')
    expect(JSON.stringify(eyebrowType())).toContain('1.2px')
  })

  it('hands a browser theme.css with @theme renamed, not dropped', () => {
    const css = themeCss()
    expect(css).not.toMatch(/@theme/)
    expect(css).toContain('--spacing-lg: 1.5rem')
    expect(css).toContain('--background: hsl(228, 13%, 4%)')
    expect(css).toContain('@media')
  })
})
