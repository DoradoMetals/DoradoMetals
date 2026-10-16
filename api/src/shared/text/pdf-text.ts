import { inflate } from 'node:zlib'

const STREAM = /(?<!end)stream\r?\n/g
const TEXT_SHOWN = new Set(['Tj', 'TJ', "'", '"'])
const NEW_LINE = new Set(['Td', 'TD', 'T*', 'Tm', "'", '"'])
const WORD_GAP = -200

const inflated = (data: Buffer): Promise<Buffer | null> =>
  new Promise((resolve) => inflate(data, (err, out) => resolve(err ? null : out)))

const isDelimiter = (c: string): boolean => /[\s()<>[\]{}/%]/.test(c)

function literal(src: string, start: number): [string, number] {
  let depth = 1
  let out = ''
  let i = start + 1
  while (i < src.length && depth > 0) {
    const c = src[i]!
    if (c === '\\') {
      const n = src[i + 1] ?? ''
      const octal = /^[0-7]{1,3}/.exec(src.slice(i + 1, i + 4))
      if (octal) {
        out += String.fromCharCode(parseInt(octal[0], 8) & 0xff)
        i += 1 + octal[0].length
        continue
      }
      const named = 'nrtbf'.indexOf(n)
      const escaped = named === -1 ? n : '\n\r\t\b\f'[named]!
      out += n === '\r' || n === '\n' ? '' : escaped
      i += n === '\r' && src[i + 2] === '\n' ? 3 : 2
      continue
    }
    if (c === '(') depth += 1
    if (c === ')') depth -= 1
    if (depth > 0) out += c
    i += 1
  }
  return [out, i]
}

function hex(src: string, start: number): [string, number] {
  const end = src.indexOf('>', start)
  const close = end === -1 ? src.length : end
  const digits = src.slice(start + 1, close).replace(/[^0-9a-fA-F]/g, '')
  const even = digits.length % 2 === 0 ? digits : digits + '0'
  return [Buffer.from(even, 'hex').toString('latin1'), close + 1]
}

function shownText(content: string): string {
  let out = ''
  let operands: (string | number)[] = []
  let inArray = false
  let i = 0
  while (i < content.length) {
    const c = content[i]!
    if (/\s/.test(c)) {
      i += 1
    } else if (c === '%') {
      const eol = content.slice(i).search(/[\r\n]/)
      i = eol === -1 ? content.length : i + eol
    } else if (c === '(') {
      const [text, next] = literal(content, i)
      operands.push(text)
      i = next
    } else if (c === '<' && content[i + 1] === '<') {
      i += 2
    } else if (c === '>' && content[i + 1] === '>') {
      i += 2
    } else if (c === '<') {
      const [text, next] = hex(content, i)
      operands.push(text)
      i = next
    } else if (c === '[') {
      inArray = true
      i += 1
    } else if (c === ']') {
      inArray = false
      i += 1
    } else if (c === '/') {
      let j = i + 1
      while (j < content.length && !isDelimiter(content[j]!)) j += 1
      i = j
    } else {
      let j = i
      while (j < content.length && !isDelimiter(content[j]!)) j += 1
      const token = content.slice(i, j === i ? i + 1 : j)
      i = j === i ? i + 1 : j
      const number = Number(token)
      if (token !== '' && Number.isFinite(number) && /^[-+.\d]/.test(token)) {
        operands.push(number)
        continue
      }
      if (inArray) continue
      if (NEW_LINE.has(token)) out += '\n'
      if (TEXT_SHOWN.has(token)) {
        out += operands.map((o) => (typeof o === 'string' ? o : o < WORD_GAP ? ' ' : '')).join('')
      }
      if (token === 'ET') out += '\n'
      operands = []
    }
  }
  return out
}

function textBlocks(content: string): string {
  const blocks = content.match(/\bBT\b[\s\S]*?\bET\b/g) ?? []
  return blocks.map(shownText).join('\n')
}

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const buffer = Buffer.from(bytes)
  const raw = buffer.toString('latin1')
  const parts: string[] = []
  for (const match of raw.matchAll(STREAM)) {
    const head = raw.slice(Math.max(0, raw.lastIndexOf('obj', match.index)), match.index)
    const start = match.index + match[0].length
    const end = raw.indexOf('endstream', start)
    if (end === -1) continue
    if (/\/Subtype\s*\/Image|\/Type\s*\/XRef/.test(head)) continue
    const data = buffer.subarray(start, end)
    const filters = head.match(/\/Filter\s*(\[[^\]]*\]|\/\w+)/)?.[1] ?? ''
    const decoded =
      filters === ''
        ? data
        : filters.replace(/[[\]\s]/g, '') === '/FlateDecode'
          ? await inflated(data)
          : null
    if (decoded) parts.push(textBlocks(decoded.toString('latin1')))
  }
  return parts.join('\n')
}
