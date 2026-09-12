import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import * as smsRepo from '#db/crm/sms-messages/repo.ts'
import * as users from '#db/auth/users/repo.ts'
import * as sms from '#providers/communications/twilio/index.ts'
import * as rules from '#crm/sms/rules.ts'
import { SmsDeliveryStatus } from '@dorado/contracts'
import type { SmsMedia, SmsMessage, SmsSendBody } from '@dorado/contracts'
import type { SmsInbound, SmsStatusUpdate } from '#providers/communications/twilio/index.ts'

function providerName(): string {
  return sms.isFake() ? 'fake' : 'twilio'
}

export async function receiveInbound(input: SmsInbound): Promise<SmsMessage> {
  return withTransaction((tx) => smsRepo.upsertInbound(input, providerName(), tx))
}

export async function recordStatus(input: SmsStatusUpdate): Promise<void> {
  const parsed = SmsDeliveryStatus.safeParse(input.status)
  if (!parsed.success) return
  await withTransaction(async (tx) => {
    const existing = await smsRepo.getForUpdate(input.provider_sid, tx)
    if (!existing) return
    if (!rules.statusShouldApply(existing.status, parsed.data)) return
    const applied = await smsRepo.applyStatus(existing.id, parsed.data, input.error_code, tx)
    rules.assertApplied(applied, `sms status ${input.provider_sid}`)
  })
}

// Every send - OTP and conversational alike - goes through here. Exported so
// the accounts/auth service can deliver a code without owning the trail.
export async function sendMessage(
  to: string,
  body: string,
  media: SmsMedia[] = []
): Promise<SmsMessage> {
  const provider = providerName()
  const from = process.env.TWILIO_FROM_NUMBER ?? ''
  const row = await withTransaction((tx) =>
    smsRepo.createOutbound(provider, from, to, body, media, tx)
  )
  await attempt(`send sms ${row.id}`, async () => {
    const result = await sms.send(to, body, media)
    await withTransaction((tx) => smsRepo.markSent(row.id, result.provider_sid, tx))
  })
  return (await smsRepo.getOne(row.id)) ?? row
}

// The Chat composer. The client sends the customer's id and what was typed; the
// number it goes to is read here, never round-tripped (ruling 10). Attachments
// are urls the media upload already handed back, so nothing binary crosses.
export async function sendToCustomer(input: SmsSendBody): Promise<SmsMessage> {
  const user = await users.getOne(input.user_id)
  rules.assertTextable(user?.phone_number ?? null, input.user_id)
  return await sendMessage(user!.phone_number!, input.body, input.media ?? [])
}

export async function conversation(
  user_id: string | null,
  number: string | null
): Promise<SmsMessage[]> {
  return smsRepo.conversation(user_id, number)
}

export async function getOne(id: string): Promise<SmsMessage> {
  const row = await smsRepo.getOne(id)
  rules.assertMessage(row, id)
  return row
}
