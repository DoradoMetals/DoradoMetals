import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { assertAssetsDir } from '#documents/pdfs/rules.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const assetsDir = (() => {
  let found: string | null = null
  let dir = __dirname
  for (let i = 0; i < 10 && found === null; i++) {
    const candidate = path.join(dir, 'shared', 'assets')
    if (fs.existsSync(candidate)) found = candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  assertAssetsDir(found, __dirname)
  return found
})()

function dataUriFromAssets(relPath: string, mime: string): string {
  const absPath = path.join(assetsDir, relPath)
  const file = fs.readFileSync(absPath)
  return `data:${mime};base64,${file.toString('base64')}`
}

export const LOGO_SRC = dataUriFromAssets('full.svg', 'image/svg+xml')
export const ICON_PIN_SRC = dataUriFromAssets('pin.svg', 'image/svg+xml')
export const ICON_PHONE_SRC = dataUriFromAssets('phone.svg', 'image/svg+xml')
export const ICON_URL_SRC = dataUriFromAssets('url.svg', 'image/svg+xml')
export const ICON_EMAIL_SRC = dataUriFromAssets('email.svg', 'image/svg+xml')

export const FONT_POPPINS_400_SRC = dataUriFromAssets('fonts/poppins-latin-400.woff2', 'font/woff2')
export const FONT_POPPINS_600_SRC = dataUriFromAssets('fonts/poppins-latin-600.woff2', 'font/woff2')
export const FONT_POPPINS_700_SRC = dataUriFromAssets('fonts/poppins-latin-700.woff2', 'font/woff2')
