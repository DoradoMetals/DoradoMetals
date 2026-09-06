const SAFE_EXACT = new Set(['dev', 'test'])

export const isSafeName = (name: string): boolean =>
  SAFE_EXACT.has(name) || /^test_[a-z0-9_]+$/.test(name)

export const databaseNameOf = (url: string | undefined): string => {
  if (!url) return ''
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''))
  } catch {
    return ''
  }
}

export function assertSafeDatabase(script: string, url: string | undefined): string {
  const name = databaseNameOf(url)
  if (isSafeName(name)) return name
  console.error(
    `${script}: DATABASE_URL points at "${name || 'a database this script cannot identify'}".\n` +
      `This script WRITES - it plants fixtures - so it only runs against "dev",\n` +
      `"test", or a "test_<branch>" database. If a database was renamed, fix\n` +
      `isSafeName in scripts/lib/safe-database.ts - do not widen the check to\n` +
      `"anything that is not production".`
  )
  process.exit(1)
}
