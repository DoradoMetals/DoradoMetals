import { z } from 'zod/v4'
import { Employee } from '../auth/employees.js'
import { Call } from '../crm/calls.js'
import { CallState, SmsDeliveryStatus, SmsDirection } from '../crm/enums.js'
import { SmsMessage } from '../crm/sms_messages.js'
import { FunnelTarget } from '../crm/targets.js'
import { TimelineKind } from '../crm/timeline_kinds.js'
import { User } from '../auth/users.js'

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

export const CustomerTimelineKind = z.enum(['sms', 'call', 'email', 'order', 'note'])
export type CustomerTimelineKind = z.infer<typeof CustomerTimelineKind>

export const CallKind = z.enum(['Outgoing', 'No answer', 'Incoming', 'Missed'])
export type CallKind = z.infer<typeof CallKind>

export const CustomerTimeline = z
  .object({
    id: SmsMessage.shape.id,
    kind: CustomerTimelineKind,
    at: SmsMessage.shape.created_at,
    direction: SmsDirection,
    summary: z.string(),
    status: z.string(),
  })
  .extend({
    call_kind: CallKind.nullable(),
    duration_seconds: Call.shape.duration_seconds,
    recording_url: Call.shape.recording_url,
    actor_id: User.shape.id.nullable(),
    actor_name: User.shape.name,
  })
export type CustomerTimeline = z.infer<typeof CustomerTimeline>

export const SmsSendBody = z
  .object({
    user_id: SmsMessage.shape.user_id.unwrap().optional(),
    lead_id: z.string().uuid().optional(),
    body: SmsMessage.shape.body.unwrap(),
  })
  .extend({ media: z.array(SmsMedia).optional() })
  .strict()
  .refine((v) => Boolean(v.user_id) !== Boolean(v.lead_id), {
    message: 'exactly one of user_id or lead_id is required',
  })
export type SmsSendBody = z.infer<typeof SmsSendBody>

export const SmsConsentRequestBody = z
  .object({
    user_id: SmsMessage.shape.user_id.unwrap().optional(),
    lead_id: z.string().uuid().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.user_id) !== Boolean(v.lead_id), {
    message: 'exactly one of user_id or lead_id is required',
  })
export type SmsConsentRequestBody = z.infer<typeof SmsConsentRequestBody>

export const LeadStage = z.enum(['New', 'Contacted', 'Responded', 'Converted'])
export type LeadStage = z.infer<typeof LeadStage>

export const InboxChannel = z.enum(['sms', 'call', 'voicemail'])
export type InboxChannel = z.infer<typeof InboxChannel>

export const InboxConversationKind = z.enum(['customer', 'lead', 'unknown'])
export type InboxConversationKind = z.infer<typeof InboxConversationKind>

export const ConversationKey = z.object({
  user_id: z.string().uuid().nullable(),
  phone: z.string().nullable(),
})
export type ConversationKey = z.infer<typeof ConversationKey>

export const InboxConversation = z.object({
  key: z.string(),
  kind: InboxConversationKind,
  name: z.string().nullable(),
  phone: z.string(),
  channel: InboxChannel,
  preview: z.string(),
  last_message_at: z.string(),
  unread_count: z.number().int(),
  assigned_to_id: z.string().uuid().nullable(),
})
export type InboxConversation = z.infer<typeof InboxConversation>

export const LeadTimeline = z.object({
  at: SmsMessage.shape.created_at,
  kind: TimelineKind.shape.key,
  label: TimelineKind.shape.label,
  actor_id: User.shape.id.nullable(),
  actor_name: User.shape.name.nullable(),
  summary: z.string(),
  detail: z.string().nullable(),
})
export type LeadTimeline = z.infer<typeof LeadTimeline>

export const LeadResponseRates = z.object({
  text: z.number(),
  call: z.number(),
  email: z.number(),
})
export type LeadResponseRates = z.infer<typeof LeadResponseRates>

export const LeadFunnel = z
  .object({
    open: z.number().int(),
    unassigned: z.number().int(),
    never_contacted: z.number().int(),
    both: z.number().int(),
    conversion_rate: z.number(),
    median_hours_to_first_contact: z.number().nullable(),
  })
  .extend({
    response_rate_by_channel: LeadResponseRates,
    conversion_rate_target: FunnelTarget.shape.value.nullable(),
    hours_to_first_contact_target: FunnelTarget.shape.value.nullable(),
  })
export type LeadFunnel = z.infer<typeof LeadFunnel>

export const ActivitySubjectKind = z.enum(['customer', 'lead'])
export type ActivitySubjectKind = z.infer<typeof ActivitySubjectKind>

export const ActivityEntry = z.object({
  at: SmsMessage.shape.created_at,
  kind: TimelineKind.shape.key,
  label: TimelineKind.shape.label,
  actor_id: User.shape.id.nullable(),
  actor_name: User.shape.name,
  subject_kind: ActivitySubjectKind,
  subject_id: User.shape.id,
  subject_name: User.shape.name,
  summary: z.string(),
})
export type ActivityEntry = z.infer<typeof ActivityEntry>

export const ActivityFilter = z
  .object({})
  .extend({
    employee_id: User.shape.id.optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  })
  .strict()
export type ActivityFilter = z.infer<typeof ActivityFilter>
