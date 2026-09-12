export type Attachment = {
  filename: string
  content: Buffer | Uint8Array | string
  contentType?: string
}

export type MessageTag = {
  name: string
  value: string
}

export type Message = {
  from?: string
  to?: string | null
  subject?: string
  text?: string
  html?: string
  attachments?: Attachment[]
  tags?: MessageTag[]
}

export type Transport = {
  sendMail: (message: Message) => Promise<unknown>
}
