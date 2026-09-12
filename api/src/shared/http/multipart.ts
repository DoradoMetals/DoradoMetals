export type UploadedFile = {
  filename: string
  content_type: string
  bytes: Buffer
}

const boundaryOf = (contentType: string): string | null => {
  const found = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  const raw = found?.[1] ?? found?.[2]
  return raw ? raw.trim() : null
}

const headerValue = (headers: string, name: string): string => {
  const found = new RegExp(`^${name}:\\s*(.*)$`, 'im').exec(headers)
  return found ? found[1]!.trim() : ''
}

export function firstFile(contentType: string, body: unknown): UploadedFile | null {
  const boundary = boundaryOf(contentType)
  if (!boundary || !Buffer.isBuffer(body)) return null

  const separator = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let from = body.indexOf(separator)
  while (from !== -1) {
    const next = body.indexOf(separator, from + separator.length)
    if (next === -1) break
    parts.push(body.subarray(from + separator.length, next))
    from = next
  }

  for (const part of parts) {
    const split = part.indexOf('\r\n\r\n')
    if (split === -1) continue
    const headers = part.subarray(0, split).toString('utf8')
    const disposition = headerValue(headers, 'Content-Disposition')
    const filename = /filename="([^"]*)"/i.exec(disposition)?.[1]
    if (!filename) continue
    let bytes = part.subarray(split + 4)
    while (
      bytes.length > 0 &&
      (bytes[bytes.length - 1] === 0x0a || bytes[bytes.length - 1] === 0x0d)
    ) {
      bytes = bytes.subarray(0, bytes.length - 1)
    }
    return {
      filename,
      content_type: headerValue(headers, 'Content-Type') || 'application/octet-stream',
      bytes,
    }
  }
  return null
}
