export type SmsSendResult = {
  provider_sid: string
  status: string
  error_code: string | null
}

export type SmsMedia = {
  url: string
  content_type: string
}

export type SmsInbound = {
  provider_sid: string
  from_number: string
  to_number: string
  body: string
  media: SmsMedia[]
}

export type SmsStatusUpdate = {
  provider_sid: string
  status: string
  error_code: string | null
}

export type TwilioForm = Record<string, unknown>

export type SmsProvider = {
  send(to: string, body: string, media?: SmsMedia[]): Promise<SmsSendResult>
  verifySignature(url: string, params: Record<string, string>, signature: string): boolean
  parseInbound(form: TwilioForm): SmsInbound
  parseStatus(form: TwilioForm): SmsStatusUpdate
}
