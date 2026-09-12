import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const SRC_DIR = dirname(fileURLToPath(import.meta.url))

const PATH_DATA = /^[Mm][0-9eE.,+\-\s]*(?:[MLHVCSQTAZmlhvcsqtaz][0-9eE.,+\-\s]*)*$/

const iconFiles = readdirSync(SRC_DIR).filter(
  (file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx')
)

function pathDataIn(source: string): string[] {
  return [...source.matchAll(/\bd=["']([^"']*)["']/g)].map((match) => match[1]!)
}

const byFile = iconFiles.map((file) => ({
  file,
  values: pathDataIn(readFileSync(join(SRC_DIR, file), 'utf8')),
}))

describe('every icon d attribute is real path data', () => {
  for (const { file, values } of byFile) {
    it(`${file}`, () => {
      for (const d of values) {
        expect(d, `${file} has a d attribute that is not path data: "${d}"`).toMatch(PATH_DATA)
      }
    })
  }

  it('found at least one d attribute to check', () => {
    const total = byFile.reduce((sum, { values }) => sum + values.length, 0)
    expect(total).toBeGreaterThan(0)
  })
})
