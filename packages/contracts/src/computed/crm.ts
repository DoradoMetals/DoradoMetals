import { z } from 'zod/v4'
import { Employee } from '../auth/employees.js'
import { Call } from '../crm/calls.js'
import { CallState, SmsDeliveryStatus, SmsDirection } from '../crm/enums.js'
import { SmsMessage } from '../crm/sms_messages.js'

export const SmsMedia = z.object({
  url: z.string(),
  content_type: z.string(),
})
export type SmsMedia = z.infer<typeof SmsMedia>

export const SmsInbound = z.object({
  MessageSid: SmsMessage.shape.provider_sid,
  From: SmsMessage.shape.from_number,
  To: SmsMessage.shape.to_number,
  Body: SmsMessage.shape.body,
  NumMedia: z.coerce.number().int(),
  media: z.array(SmsMedia),
})
export type SmsInbound = z.infer<typeof SmsInbound>

export const SmsStatus = z.object({
  MessageSid: SmsMessage.shape.provider_sid,
  MessageStatus: SmsDeliveryStatus,
  ErrorCode: SmsMessage.shape.error_code.unwrap().optional(),
})
export type SmsStatus = z.infer<typeof SmsStatus>

export const CallStatus = z.object({
  CallSid: Call.shape.provider_sid,
  CallStatus: CallState,
  CallDuration: z.coerce.number().int(),
  RecordingUrl: Call.shape.recording_url.unwrap().optional(),
})
export type CallStatus = z.infer<typeof CallStatus>

export const CallToken = z.object({
  token: z.string(),
  identity: Employee.shape.id,
  expires_at: z.string(),
})
export type CallToken = z.infer<typeof CallToken>

export const TimelineKind = z.enum(['sms', 'call', 'email'])
export type TimelineKind = z.infer<typeof TimelineKind>

export const CallKind = z.enum(['Outgoing', 'No answer', 'Incoming', 'Missed'])
export type CallKind = z.infer<typeof CallKind>

export const CustomerTimeline = z
  .object({
    id: SmsMessage.shape.id,
    kind: TimelineKind,
    at: SmsMessage.shape.created_at,
    direction: SmsDirection,
    summary: z.string(),
    status: z.string(),
  })
  .extend({ call_kind: CallKind.nullable() })
export type CustomerTimeline = z.infer<typeof CustomerTimeline>

export const SmsSendBody = z
  .object({
    user_id: SmsMessage.shape.user_id.unwrap(),
    body: SmsMessage.shape.body.unwrap(),
  })
  .extend({ media: z.array(SmsMedia).optional() })
  .strict()
export type SmsSendBody = z.infer<typeof SmsSendBody>
