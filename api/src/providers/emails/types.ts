export type Attachment = {
  filename: string
  content: Buffer | Uint8Array | string
  contentType?: string
}

export type Message = {
  from?: string
  to?: string | null
  subject?: string
  text?: string
  html?: string
  attachments?: Attachment[]
}

export type Transport = {
  sendMail: (message: Message) => Promise<unknown>
}
