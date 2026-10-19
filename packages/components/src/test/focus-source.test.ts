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
})
