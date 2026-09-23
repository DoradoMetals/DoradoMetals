import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import * as smsRepo from '#db/crm/sms-messages/repo.ts'
import * as users from '#db/auth/users/repo.ts'
import * as leadsRepo from '#db/leads/repo.ts'
import * as sms from '#providers/twilio/index.ts'
import * as rules from '#crm/sms/rules.ts'
import { SmsDeliveryStatus } from '@dorado/contracts'
import type {
  SmsConsentRequestBody,
  SmsMedia,
  SmsMessage,
  SmsSendBody,
} from '@dorado/contracts'
import type { SmsInbound, SmsStatusUpdate } from '#providers/twilio/index.ts'

const CONSENT_REQUEST_TEXT =
  'Dorado Metals: Reply YES to receive texts about your quote and orders. Message frequency ' +
  'varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.'

const CONSENT_WELCOME_TEXT =
  'Welcome to Dorado Metals account and order texts. Message frequency varies. Message and ' +
  'data rates may apply. Reply HELP for help, STOP to cancel.'

function providerName(): string {
  return sms.isFake() ? 'fake' : 'twilio'
}

export async function receiveInbound(input: SmsInbound): Promise<SmsMessage> {
  const { message, welcome } = await withTransaction(async (tx) => {
    const message = await smsRepo.upsertInbound(input, providerName(), tx)
    const keyword = rules.consentKeyword(input.body)
    let welcome = false
    if (keyword) {
      const matchedUser = await users.byPhone(input.from_number, tx)
      if (matchedUser) {
        const applied =
          keyword === 'stop'
            ? await users.clearSmsConsent(matchedUser.id, tx)
            : await users.recordSmsConsent(matchedUser.id, new Date().toISOString(), 'via_text', tx)
        rules.assertApplied(applied, `sms consent ${keyword} for ${matchedUser.id}`)
        welcome = keyword === 'start'
      } else {
        const matchedLead = await leadsRepo.byPhone(input.from_number, tx)
        if (matchedLead) {
          const applied =
            keyword === 'stop'
              ? await leadsRepo.clearSmsConsent(matchedLead.id, tx)
              : await leadsRepo.recordSmsConsent(
                  matchedLead.id,
                  'via_text',
                  new Date().toISOString(),
                  tx
                )
          rules.assertApplied(applied, `sms consent ${keyword} for lead ${matchedLead.id}`)
        }
      }
    }
    return { message, welcome }
  })

  if (welcome) {
    await attempt('sms.consentWelcome', () => sendConsentWelcome(input.from_number))
  }
  return message
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

async function textableNumber(user_id: string | undefined, lead_id: string | undefined) {
  if (lead_id) {
    const lead = await leadsRepo.getOne(lead_id)
    rules.assertTextable(lead?.phone ?? null, lead_id)
    return lead!.phone!
  }
  const user = await users.getOne(user_id!)
  rules.assertTextable(user?.phone_number ?? null, user_id!)
  return user!.phone_number!
}

export async function sendToCustomer(input: SmsSendBody): Promise<SmsMessage> {
  const to = await textableNumber(input.user_id, input.lead_id)
  return await sendMessage(to, input.body, input.media ?? [])
}

export async function requestConsent(input: SmsConsentRequestBody): Promise<SmsMessage> {
  const to = await textableNumber(input.user_id, input.lead_id)
  return await sendMessage(to, CONSENT_REQUEST_TEXT)
}

export async function sendConsentWelcome(phone_number: string): Promise<SmsMessage> {
  return await sendMessage(phone_number, CONSENT_WELCOME_TEXT)
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
