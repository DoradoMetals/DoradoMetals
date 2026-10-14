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

export const DOCUMENT_LOGO = dataUriFromAssets('logo-ink.svg', 'image/svg+xml')

const GEIST_LATIN = dataUriFromAssets('fonts/geist-latin.woff2', 'font/woff2')
const GEIST_LATIN_EXT = dataUriFromAssets('fonts/geist-latin-ext.woff2', 'font/woff2')
const GEIST_MONO_LATIN = dataUriFromAssets('fonts/geist-mono-latin.woff2', 'font/woff2')

const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
const LATIN_EXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'

export const DOCUMENT_FONT_FACES = `
@font-face { font-family: 'Geist'; font-style: normal; font-weight: 100 900; font-display: block; src: url(${GEIST_LATIN_EXT}) format('woff2'); unicode-range: ${LATIN_EXT}; }
@font-face { font-family: 'Geist'; font-style: normal; font-weight: 100 900; font-display: block; src: url(${GEIST_LATIN}) format('woff2'); unicode-range: ${LATIN}; }
@font-face { font-family: 'Geist Mono'; font-style: normal; font-weight: 100 900; font-display: block; src: url(${GEIST_MONO_LATIN}) format('woff2'); unicode-range: ${LATIN}; }
`
