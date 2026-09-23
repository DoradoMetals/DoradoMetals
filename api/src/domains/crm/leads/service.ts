import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import * as leads from '#db/leads/repo.ts'
import * as smsRepo from '#db/crm/sms-messages/repo.ts'
import * as callsRepo from '#db/crm/calls/repo.ts'
import * as usersService from '#accounts/users/service.ts'
import * as smsService from '#crm/sms/service.ts'
import * as rules from '#crm/leads/rules.ts'
import type { AdminUser, LeadConvertBody, LeadFilter, LeadPatch, LeadView } from '@dorado/contracts'

export async function getOne(id: string): Promise<LeadView> {
  const row = await leads.getOne(id)
  rules.assertLead(row, id)
  return row
}

export async function list(filter: LeadFilter): Promise<LeadView[]> {
  return await leads.list(filter)
}

export async function create(lead: LeadPatch): Promise<LeadView> {
  return withTransaction(async (client) => {
    return await leads.create(lead, client)
  })
}

export async function update(id: string, patch: LeadPatch): Promise<LeadView> {
  return withTransaction(async (client) => {
    const row = await leads.update(id, patch, client)
    rules.assertLead(row, id)
    if (patch.sms_consent_method === undefined) return row
    const stamped =
      patch.sms_consent_method === null
        ? await leads.clearSmsConsent(id, client)
        : await leads.recordSmsConsent(
            id,
            patch.sms_consent_method,
            new Date().toISOString(),
            client
          )
    rules.assertLead(stamped, id)
    return stamped
  })
}

export async function remove(id: string): Promise<boolean> {
  return withTransaction(async (client) => {
    return await leads.remove(id, client)
  })
}

export async function convert(id: string, body: LeadConvertBody): Promise<AdminUser> {
  const { user, welcome } = await withTransaction(async (tx) => {
    const lead = await leads.getOne(id, tx)
    rules.assertLead(lead, id)
    rules.assertNotConverted(lead)

    const name = body.name ?? lead.name
    const phone_number = body.phone ?? lead.phone
    const email = body.email ?? lead.email
    rules.assertHasEmail(lead, email)

    const user = await usersService.createFromLead(
      {
        name,
        phone_number,
        email,
        sms_consent_at: lead.sms_consent_at,
        sms_consent_method: lead.sms_consent_method,
      },
      tx
    )

    if (phone_number) {
      await smsRepo.attachToUser(phone_number, user.id, tx)
      await callsRepo.attachToUser(phone_number, user.id, tx)
    }

    await leads.update(id, { converted: true }, tx)
    return { user, welcome: Boolean(lead.sms_consent_at && user.phone_number) }
  })

  if (welcome) {
    await attempt('leads.smsConsentWelcome', () =>
      smsService.sendConsentWelcome(user.phone_number!)
    )
  }
  return user
}
