import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import * as callsRepo from '#db/crm/calls/repo.ts'
import * as voice from '#providers/communications/twilio/voice.ts'
import * as rules from '#crm/calls/rules.ts'
import * as presence from '#crm/calls/presence.ts'
import * as emails from '#documents/emails/service.ts'
import { CallState } from '@dorado/contracts'
import type { Call, CallToken } from '@dorado/contracts'
import { uuidLike } from '#shared/http/validate.ts'
import type { WebhookForm } from '#shared/http/webhook-form.ts'

const businessNumber = (): string => process.env.TWILIO_FROM_NUMBER ?? ''
const twimlUrl = (): string => `${process.env.PUBLIC_API_URL ?? ''}/api/calls/twiml`

function expiryOf(token: string): string {
  const claims = token.split('.')[1] ?? ''
  const decoded = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as { exp: number }
  return new Date(decoded.exp * 1000).toISOString()
}

export async function issueToken(user_id: string): Promise<CallToken> {
  const employee = await callsRepo.employeeIdForUser(user_id)
  rules.assertEmployee(employee, user_id)
  const token = voice.accessToken(employee.id)
  return { token, identity: employee.id, expires_at: expiryOf(token) }
}

export async function setPresence(user_id: string, online: boolean): Promise<void> {
  const employee = await callsRepo.employeeIdForUser(user_id)
  rules.assertEmployee(employee, user_id)
  if (online) presence.markOnline(employee.id)
  else presence.markOffline(employee.id)
}

export async function getOne(id: string): Promise<Call> {
  const row = await callsRepo.getOne(id)
  rules.assertCall(row, id)
  return row
}

export async function recordStatus(form: WebhookForm): Promise<void> {
  const parsedStatus = CallState.safeParse(form.CallStatus)
  if (!parsedStatus.success) return
  const parsedDuration = Number(form.CallDuration)
  const duration = Number.isFinite(parsedDuration) ? parsedDuration : null

  await withTransaction(async (tx) => {
    const existing = await callsRepo.getForUpdate(form.CallSid ?? '', tx)
    if (!existing) return
    if (!rules.statusShouldApply(existing.status, parsedStatus.data)) return
    const applied = await callsRepo.applyStatus(existing.id, parsedStatus.data, duration, tx)
    rules.assertApplied(applied, `call status ${form.CallSid ?? ''}`)
  })
}

// Twilio reuses one URL across three roles here (fresh call, the <Dial>
// action result, the <Record> action result); the payload shape says which.
export async function handleTwiml(form: WebhookForm): Promise<string> {
  if (form.RecordingUrl) return finishVoicemail(form)
  if (form.DialCallStatus) return afterDial(form)
  return startCall(form)
}

async function startCall(form: WebhookForm): Promise<string> {
  const from = form.From ?? ''
  const to = form.To ?? ''
  const business = businessNumber()

  if (from.startsWith('client:')) {
    const employee_id = from.slice('client:'.length)
    const customerNumber = uuidLike.safeParse(to).success
      ? ((await callsRepo.phoneForUser(to)) ?? to)
      : to

    await withTransaction((tx) =>
      callsRepo.create(
        'twilio',
        form.CallSid ?? '',
        'outbound',
        business,
        customerNumber,
        employee_id,
        'ringing',
        customerNumber,
        tx
      )
    )
    return voice.dialNumber(customerNumber, business)
  }

  await withTransaction((tx) =>
    callsRepo.create('twilio', form.CallSid ?? '', 'inbound', from, to, null, 'ringing', from, tx)
  )

  const online = presence.onlineEmployeeIds()
  if (online.length === 0) return voice.recordVoicemail(twimlUrl(), twimlUrl())
  return voice.dialClients(online, rules.RING_TIMEOUT_SECONDS, twimlUrl())
}

async function afterDial(form: WebhookForm): Promise<string> {
  if (form.DialCallStatus === 'completed') return voice.emptyResponse()
  return voice.recordVoicemail(twimlUrl(), twimlUrl())
}

async function finishVoicemail(form: WebhookForm): Promise<string> {
  const existing = await callsRepo.getByProviderSid(form.CallSid ?? '')
  if (existing) {
    const recording = form.RecordingUrl ?? ''
    await withTransaction((tx) => callsRepo.markRecording(existing.id, recording, tx))
    await attempt('notify on-duty employees of a voicemail', () =>
      notifyOnDutyOfVoicemail(existing.from_number, recording)
    )
  }
  return voice.emptyResponse()
}

async function notifyOnDutyOfVoicemail(from_number: string, recording: string): Promise<void> {
  const onDuty = await callsRepo.onDutyEmployees()
  const received_at = new Date().toISOString()
  for (const employee of onDuty) {
    await emails.sendVoicemailReceived({
      order_id: null,
      user_id: null,
      email: employee.email,
      name: null,
      from_number,
      received_at,
      recording_url: recording === '' ? null : recording,
    })
  }
}
