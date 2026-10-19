import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import * as smsRepo from '#db/crm/sms-messages/repo.ts'
import * as consentEvents from '#db/crm/consent-events/repo.ts'
import * as users from '#db/auth/users/repo.ts'
import * as leadsRepo from '#db/leads/repo.ts'
import * as messageImages from '#db/crm/sms-message-images/repo.ts'
import * as imageService from '#accounts/images/service.ts'
import { withDecisions } from '#shared/views.ts'
import * as sms from '#providers/twilio/index.ts'
import * as rules from '#crm/sms/rules.ts'
import { SmsDeliveryStatus } from '@dorado/contracts'
import type {
  SmsConsentRequestBody,
  SmsMedia,
  SmsMessage,
  SmsMessageView,
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
      const kind = rules.consentDecisionOf(keyword)
      const matchedUser = await users.byPhone(input.from_number, tx)
      if (matchedUser) {
        const applied =
          keyword === 'stop'
            ? await users.clearSmsConsent(matchedUser.id, tx)
            : await users.recordSmsConsent(matchedUser.id, new Date().toISOString(), 'via_text', tx)
        rules.assertApplied(applied, `sms consent ${keyword} for ${matchedUser.id}`)
        await consentEvents.create(
          { user_id: matchedUser.id, lead_id: null, kind, method: 'via_text' },
          tx
        )
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
          await consentEvents.create(
            { user_id: null, lead_id: matchedLead.id, kind, method: 'via_text' },
            tx
          )
        }
      }
    }
    return { message, welcome }
  })

  for (const [sort_order, media] of input.media.entries()) {
    await attempt(`sms.inboundMedia ${message.id} ${sort_order}`, () =>
      storeInboundMedia(message, sort_order, media)
    )
  }
  if (welcome) {
    await attempt('sms.consentWelcome', () => sendConsentWelcome(input.from_number))
  }
  return message
}

async function storeInboundMedia(
  message: SmsMessage,
  sort_order: number,
  media: SmsMedia
): Promise<void> {
  if (await messageImages.linked(message.id, sort_order)) return
  const fetched = await sms.fetchMedia(media.url)
  const upload = await imageService.putBytes(message.user_id, fetched.bytes, fetched.content_type)
  await withTransaction(async (tx) => {
    await smsRepo.getForUpdate(message.provider_sid, tx)
    if (await messageImages.linked(message.id, sort_order, tx)) return
    const image = await imageService.record(upload, tx)
    await messageImages.createAt(message.id, image.id, sort_order, tx)
  })
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
  media: SmsMedia[] = [],
  image_ids: string[] = []
): Promise<SmsMessageView> {
  const provider = providerName()
  const from = process.env.TWILIO_FROM_NUMBER ?? ''
  const row = await withTransaction(async (tx) => {
    const written = await smsRepo.createOutbound(provider, from, to, body, media, tx)
    for (const image_id of image_ids) await messageImages.create(written.id, image_id, tx)
    return written
  })
  const pictures = await Promise.all(
    (await messageImages.media(row.id)).map(async (picture) =>
      withDecisions(picture, { url: await imageService.getUrl(picture.image_id) })
    )
  )
  await attempt(`send sms ${row.id}`, async () => {
    const result = await sms.send(to, body, media.concat(pictures))
    await withTransaction((tx) => smsRepo.markSent(row.id, result.provider_sid, tx))
  })
  const sent = await smsRepo.getOne(row.id)
  rules.assertMessage(sent, row.id)
  return sent
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

export async function sendToCustomer(input: SmsSendBody): Promise<SmsMessageView> {
  const to = await textableNumber(input.user_id, input.lead_id)
  return await sendMessage(to, input.body, input.media ?? [], input.image_ids ?? [])
}

export async function requestConsent(input: SmsConsentRequestBody): Promise<SmsMessageView> {
  const to = await textableNumber(input.user_id, input.lead_id)
  return await sendMessage(to, CONSENT_REQUEST_TEXT)
}

export async function sendConsentWelcome(phone_number: string): Promise<SmsMessageView> {
  return await sendMessage(phone_number, CONSENT_WELCOME_TEXT)
}

export async function conversation(
  user_id: string | null,
  number: string | null
): Promise<SmsMessageView[]> {
  return smsRepo.conversation(user_id, number)
}

export async function getOne(id: string): Promise<SmsMessageView> {
  const row = await smsRepo.getOne(id)
  rules.assertMessage(row, id)
  return row
}
