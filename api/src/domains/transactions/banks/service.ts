import withTransaction from '#shared/db/withTransaction.ts'
import { attempt } from '#shared/attempt.ts'
import { seal, aadFor } from '#shared/crypto/envelope.ts'
import { payoutKeyFromEnv } from '#shared/crypto/payoutKey.ts'
import { bankLinks, users } from '#db'
import * as moov from '#providers/moov/index.ts'
import * as plaid from '#providers/plaid/index.ts'
import {
  assertLink,
  assertMoovAccount,
  assertOwned,
  assertWritten,
} from '#transactions/rails/rules.ts'
import * as rules from '#transactions/banks/rules.ts'
import type { PlaidEvent } from '#providers/plaid/types.ts'
import type {
  BankLink,
  BankLinkChannel,
  LinkedAccount,
  ExchangeLinkBody,
  LinkToken,
  MicroDepositsBody,
  VerifyMicroDepositsBody,
} from '@dorado/contracts'

const MOOV = 'moov'
const PLAID = 'plaid'
const TOKEN_COLUMN = 'provider_token'

export function assertMayRead(subject_id: string, caller_id: string, staff: boolean): void {
  rules.assertSelfOrStaff(subject_id, caller_id, staff)
}

export function isBankEvent(event: PlaidEvent): boolean {
  return rules.isBankEvent(event)
}

export async function linkedAccounts(user_id: string): Promise<LinkedAccount[]> {
  return await bankLinks.linkedFor(user_id)
}

async function linkedView(id: string): Promise<LinkedAccount> {
  const view = await bankLinks.linkedOne(id)
  return rules.assertLinkedView(view, id)
}

// Ruling 160: the row is written Pending and committed first, then Plaid is
// asked for the Hosted Link after the commit, and the link token it returns is
// recorded so the SESSION_FINISHED webhook can find the row.
export async function sendHostedLink(
  user_id: string,
  channel: BankLinkChannel
): Promise<LinkedAccount> {
  const customer = rules.assertCustomer(await users.getOne(user_id), user_id)
  const sent_to = rules.destinationFor(customer, channel)

  const created = await withTransaction(async (tx) => {
    const row = await bankLinks.create(
      {
        user_id,
        provider: PLAID,
        moov_account_id: null,
        moov_bank_account_id: null,
        payment_method_id: null,
        rail: 'ACH',
        holder_name: null,
        bank_name: null,
        last_four: null,
        status: 'pending',
        linked_by: 'plaid',
      },
      tx
    )
    assertWritten(row.id, await bankLinks.update(row.id, { sent_via: channel, sent_to }, tx))
    return row
  })

  await deliver(created.id, user_id, channel, sent_to)
  return await linkedView(created.id)
}

export async function resendHostedLink(user_id: string, link_id: string): Promise<LinkedAccount> {
  const link = rules.assertOwnedLink(await bankLinks.getOne(link_id), user_id, link_id)
  rules.assertResendable(link)
  const customer = rules.assertCustomer(await users.getOne(user_id), user_id)
  const channel = rules.channelOf(link)
  await deliver(link.id, user_id, channel, rules.destinationFor(customer, channel))
  return await linkedView(link.id)
}

async function deliver(
  link_id: string,
  user_id: string,
  channel: BankLinkChannel,
  sent_to: string
): Promise<void> {
  const hosted = await attempt('plaid.createHostedLink', () =>
    plaid.data().createHostedLink(user_id, channel, sent_to)
  )
  if (!hosted) return
  await withTransaction(async (tx) => {
    assertWritten(
      link_id,
      await bankLinks.update(
        link_id,
        {
          plaid_link_token: hosted.link_token,
          sent_via: channel,
          sent_to,
          sent_at: new Date().toISOString(),
        },
        tx
      )
    )
  })
}

// LINK SESSION_FINISHED completes the row its link token names; AUTH
// AUTOMATICALLY_VERIFIED marks a micro-deposit account Verified. A webhook that
// names no link of ours changes nothing.
export async function applyPlaidEvent(event: PlaidEvent): Promise<void> {
  if (rules.isSessionFinished(event)) {
    const link = await bankLinks.findByProvider({ plaid_link_token: event.link_token })
    if (link) await complete(link, event.public_token as string)
    return
  }
  if (rules.isAutomaticallyVerified(event)) {
    const link = await bankLinks.findByProvider({
      plaid_item_id: event.item_id,
      plaid_account_id: event.account_id,
    })
    if (!link) return
    await withTransaction(async (tx) => {
      assertWritten(
        link.id,
        await bankLinks.update(
          link.id,
          { status: 'verified', verified_at: new Date().toISOString() },
          tx
        )
      )
    })
  }
}

async function complete(link: BankLink, public_token: string): Promise<void> {
  const exchanged = await plaid.data().exchangePublicToken(public_token)
  const found = await plaid.data().accounts(exchanged.access_token)
  const account = found.accounts[0]
  const key = payoutKeyFromEnv()
  const status = account ? rules.statusFromPlaid(account) : 'pending'

  await withTransaction(async (tx) => {
    assertWritten(
      link.id,
      await bankLinks.update(
        link.id,
        {
          bank_name: found.institution_name,
          account_name: account?.name ?? null,
          last_four: account?.mask ?? null,
          plaid_item_id: exchanged.item_id,
          plaid_account_id: account?.account_id ?? null,
          provider_token_encrypted: seal(
            exchanged.access_token,
            key,
            aadFor(link.id, TOKEN_COLUMN)
          ),
          encryption_key_id: key.id,
          status,
          verified_at: status === 'verified' ? new Date().toISOString() : null,
        },
        tx
      )
    )
  })
}

// The fake provider's completion for end-to-end runs: the customer finishes
// Link with a sandbox bank, then the same SESSION_FINISHED path runs.
export async function completeWithFake(link_id: string): Promise<LinkedAccount> {
  const link = assertLink(link_id, await bankLinks.getOne(link_id))
  const public_token = `public-fake-${link.id}`
  plaid.stageFakeAccounts(public_token, {
    institution_name: 'Plaid Sandbox Bank',
    accounts: [
      {
        account_id: `fake-${link.id}`,
        name: 'Plaid Checking',
        mask: '0000',
        verification_status: null,
      },
    ],
  })
  await complete(link, public_token)
  return await linkedView(link.id)
}

export async function listLinks(user_id: string): Promise<BankLink[]> {
  return await bankLinks.listForUser(user_id)
}

export async function linkToken(user_id: string): Promise<LinkToken> {
  return await plaid.data().createLinkToken(user_id)
}

export async function linkFromPlaid(user_id: string, body: ExchangeLinkBody): Promise<BankLink> {
  const exchanged = await plaid.data().exchangePublicToken(body.public_token)
  const processor = await plaid.data().createProcessorToken(exchanged.access_token, body.account_id)

  const account = assertMoovAccount(process.env.MOOV_ACCOUNT_ID)
  const linked = await moov.rails().linkByProcessorToken(account, processor.processor_token)

  return await withTransaction(
    async (tx) =>
      await bankLinks.create(
        {
          user_id,
          provider: MOOV,
          moov_account_id: account,
          moov_bank_account_id: linked.bankAccountID,
          payment_method_id: null,
          rail: body.rail,
          holder_name: null,
          bank_name: linked.bankName,
          last_four: linked.lastFourAccountNumber,
          status: linked.status === 'verified' ? 'verified' : 'pending',
          linked_by: 'plaid',
        },
        tx
      )
  )
}

export async function linkByMicroDeposits(
  user_id: string,
  body: MicroDepositsBody
): Promise<BankLink> {
  const account = assertMoovAccount(process.env.MOOV_ACCOUNT_ID)
  const linked = await moov.rails().linkByNumbers(account, {
    holderName: body.holder_name,
    accountType: body.account_type,
    routingNumber: body.routing_number,
    accountNumber: body.account_number,
  })
  await moov.rails().startMicroDeposits(account, linked.bankAccountID)

  return await withTransaction(
    async (tx) =>
      await bankLinks.create(
        {
          user_id,
          provider: MOOV,
          moov_account_id: account,
          moov_bank_account_id: linked.bankAccountID,
          payment_method_id: null,
          rail: body.rail,
          holder_name: body.holder_name,
          bank_name: linked.bankName,
          last_four: linked.lastFourAccountNumber,
          status: 'pending',
          linked_by: 'micro_deposits',
        },
        tx
      )
  )
}

export async function verifyMicroDeposits(
  user_id: string,
  link_id: string,
  body: VerifyMicroDepositsBody
): Promise<BankLink> {
  const link = assertOwned(assertLink(link_id, await bankLinks.getOne(link_id)), user_id)
  const account = assertMoovAccount(link.moov_account_id ?? undefined)
  const verified = await moov
    .rails()
    .confirmMicroDeposits(account, link.moov_bank_account_id ?? '', body.amounts)

  const offered = await moov.rails().paymentMethods(account)
  const method = offered.find((m) => m.lastFourAccountNumber === link.last_four)

  await withTransaction(async (tx) => {
    assertWritten(
      link_id,
      await bankLinks.update(
        link_id,
        {
          status: verified.status === 'verified' ? 'verified' : 'pending',
          bank_name: verified.bankName,
          payment_method_id: method?.paymentMethodID ?? null,
        },
        tx
      )
    )
  })
  return assertLink(link_id, await bankLinks.getOne(link_id))
}

export async function recordVaultedLink(
  user_id: string,
  moov_account_id: string,
  payment_method_id: string
): Promise<BankLink> {
  const known = await users.getOne(user_id)
  return await withTransaction(
    async (tx) =>
      await bankLinks.create(
        {
          user_id,
          provider: MOOV,
          moov_account_id,
          moov_bank_account_id: null,
          payment_method_id,
          rail: 'ACH',
          holder_name: known?.name ?? null,
          bank_name: null,
          last_four: null,
          status: 'verified',
          linked_by: 'vendor_form',
        },
        tx
      )
  )
}

// The account a purchase payout goes to (ruling 160): the customer's own, and
// verified. A pending or foreign account is refused by name.
export async function payoutAccount(user_id: string, link_id: string): Promise<BankLink> {
  return rules.assertPayoutLink(await bankLinks.getOne(link_id), user_id, link_id)
}
