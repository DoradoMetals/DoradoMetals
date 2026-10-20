import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

describe('focus visibility across the library', () => {
  it('no component draws its own focus ring or removes focus outright; focus-ring is the one recipe', () => {
    const offenders = sources(SRC).flatMap((file) => {
      const text = readFileSync(file, 'utf8')
      return [/focus-visible:ring-/, /focus:outline-none/, /ring-offset-/, /focus-within:ring-/]
        .filter((re) => re.test(text))
        .map((re) => `${file.slice(SRC.length + 1)} ${re.source}`)
    })
    expect(offenders).toEqual([])
  })

  it('field components show focus with the border and never with the ring', () => {
    const fields = [
      'field/Field.tsx',
      'input/Input.tsx',
      'textarea/Textarea.tsx',
      'select/Select.tsx',
      'multiselect/Multiselect.tsx',
      'autocomplete/Autocomplete.tsx',
      'date-picker/DatePicker.tsx',
      'date-picker/DateRangePicker.tsx',
      'masked-field/MaskedField.tsx',
      'otp-input/OTPInput.tsx',
      'admin-header/AdminHeader.tsx',
      'quantity-stepper/QuantityStepper.tsx',
      'slider-field/SliderField.tsx',
    ]
    for (const file of fields) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).not.toMatch(/focus-ring/)
    }
    const border = [
      'field/Field.tsx',
      'textarea/Textarea.tsx',
      'date-picker/DateRangePicker.tsx',
      'quantity-stepper/QuantityStepper.tsx',
      'slider-field/SliderField.tsx',
      'otp-input/OTPInput.tsx',
    ]
    for (const file of border) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).toMatch(
        /(focus-visible|focus-within):border-primary|border-primary/
      )
    }
  })

  it('borderless controls keep the ring', () => {
    for (const file of [
      'button/Button.tsx',
      'chip/Chip.tsx',
      'checkbox/Checkbox.tsx',
      'radio/Radio.tsx',
      'switch/Switch.tsx',
      'tabs/Tabs.tsx',
    ]) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).toMatch(/focus-ring/)
    }
  })

  it('no global stylesheet puts a focus outline on elements; the ring is opt-in through focus-ring', () => {
    const themeDir = join(SRC, '..', '..', 'theme')
    const css = readdirSync(themeDir).filter((name) => name.endsWith('.css'))
    expect(css.length).toBeGreaterThan(0)
    const offenders = css.flatMap((name) => {
      const text = readFileSync(join(themeDir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      const stripped = text.replace(/@utility\s+[\w-]+\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '')
      return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(
          ([, selector, body]) =>
            /:focus(-visible|-within)?\b/.test(selector) && /outline|box-shadow/.test(body)
        )
        .map(([, selector]) => `${name} ${selector.trim()}`)
    })
    expect(offenders).toEqual([])
    const base = readFileSync(join(themeDir, 'base.css'), 'utf8')
    expect(base.match(/@utility focus-ring/g)).toHaveLength(1)
  })
})
