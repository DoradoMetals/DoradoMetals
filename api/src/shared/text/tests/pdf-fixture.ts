import { deflateSync } from 'node:zlib'

const escaped = (text: string): string =>
  [...text]
    .map((ch) => {
      const code = ch.charCodeAt(0)
      if (ch === '(' || ch === ')' || ch === '\\') return `\\${ch}`
      if (code > 126) return `\\${code.toString(8).padStart(3, '0')}`
      return ch
    })
    .join('')

const shown = (line: string, kerned: boolean): string => {
  if (!kerned) return `(${escaped(line)}) Tj`
  const words = line.split(' ')
  return `[${words.map((w) => `(${escaped(w)})`).join(' -250 ')}] TJ`
}

export function textPdf(
  lines: string[],
  options: { compress?: boolean; kerned?: boolean } = {}
): Buffer {
  const compress = options.compress ?? true
  const ops = lines.map(
    (line, i) => `${i === 0 ? '72 720 Td' : '0 -14 Td'} ${shown(line, !!options.kerned)}`
  )
  const content = Buffer.from(`BT /F1 10 Tf ${ops.join('\n')} ET`, 'latin1')
  const data = compress ? deflateSync(content) : content
  const filter = compress ? ' /Filter /FlateDecode' : ''
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
        '/Resources << /Font << /F1 5 0 R >> >> >>'
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${data.length}${filter} >>\nstream\n`),
      data,
      Buffer.from('\nendstream'),
    ]),
    Buffer.from(
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
    ),
  ]
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')]
  const offsets: number[] = []
  let length = parts[0]!.length
  objects.forEach((body, i) => {
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')])
    offsets.push(length)
    parts.push(chunk)
    length += chunk.length
  })
  const xref =
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`
  parts.push(Buffer.from(xref))
  return Buffer.concat(parts)
}
