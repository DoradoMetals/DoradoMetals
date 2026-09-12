import fs from 'node:fs'
import path from 'node:path'

const cache = new Map<string, string>()

export function sqlFrom(dir: string): (name: string) => string {
  return (name: string): string => {
    const file = path.join(dir, 'sql', `${name}.sql`)
    const hit = cache.get(file)
    if (hit !== undefined) return hit

    let text: string
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      throw new Error(
        `no SQL file at ${file} - sqlFrom(import.meta.dirname) reads <dir>/sql/<name>.sql`
      )
    }

    const withoutComments = text
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .trim()
    if (withoutComments === '') {
      throw new Error(`${file} contains no SQL - only comments or whitespace`)
    }

    cache.set(file, text)
    return text
  }
}

export function expression(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim()
}
