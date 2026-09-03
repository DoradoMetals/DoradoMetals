import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('/home/jtj60/dorado-exchange/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript')

function tidy(out) {
  return out
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/(\{|\()\n\n+/g, '$1\n')
    .replace(/\n\n+(\s*[}\)\]])/g, '\n$1')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '\n')
}

function stripTs(text, jsx) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest, false,
    jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text,
  )
  const ranges = []
  let kind
  while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia) {
      ranges.push([scanner.getTokenStart(), scanner.getTokenEnd()])
    }
  }
  let out = text
  for (let i = ranges.length - 1; i >= 0; i--) {
    let [s, e] = ranges[i]
    let ls = s, re = e
    while (ls > 0 && (out[ls - 1] === ' ' || out[ls - 1] === '\t')) ls--
    while (re < out.length && (out[re] === ' ' || out[re] === '\t')) re++
    if (out[ls - 1] === '{' && out[re] === '}') { s = ls - 1; e = re + 1 }
    out = out.slice(0, s) + out.slice(e)
  }
  out = out.replace(/^[ \t]*\{\}[ \t]*$/gm, '')
  return tidy(out)
}

// CSS: only /* */ exists, and it cannot nest. Skip over quoted strings and
// url() so a "/*" inside a value is never mistaken for a comment opener.
function stripCss(text) {
  let out = '', i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"' || c === "'") {
      const q = c; out += c; i++
      while (i < text.length) {
        out += text[i]
        if (text[i] === '\\') { out += text[i + 1] ?? ''; i += 2; continue }
        if (text[i] === q) { i++; break }
        i++
      }
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    out += c; i++
  }
  return tidy(out)
}

const files = process.argv.slice(2)
let n = 0
for (const f of files) {
  const ext = path.extname(f)
  const before = fs.readFileSync(f, 'utf8')
  const after = ext === '.css' ? stripCss(before) : stripTs(before, ext === '.tsx' || ext === '.jsx')
  if (after !== before) { fs.writeFileSync(f, after); n++ }
}
console.log(`stripped ${n}/${files.length} file(s)`)
