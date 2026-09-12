import withTransaction from '#shared/db/withTransaction.ts'
import { bankLinks, users } from '#db'
import * as moov from '#providers/moov/index.ts'
import * as plaid from '#providers/plaid/index.ts'
import {
  assertLink,
  assertMoovAccount,
  assertOwned,
  assertWritten,
} from '#transactions/rails/rules.ts'
import type {
  BankLink,
  ExchangeLinkBody,
  LinkToken,
  MicroDepositsBody,
  VerifyMicroDepositsBody,
} from '@dorado/contracts'

const MOOV = 'moov'

export async function listLinks(user_id: string): Promise<BankLink[]> {
  return await bankLinks.listForUser(user_id)
}

export async function linkToken(user_id: string): Promise<LinkToken> {
  return await plaid.data().createLinkToken(user_id)
}

// Plaid Link -> public token -> access token -> processor token -> Moov bank
// account. The access token is exchanged and used in the same breath: nothing
// but the Moov ids and the last four is written down.
export async function linkFromPlaid(
  user_id: string,
  body: ExchangeLinkBody
): Promise<BankLink> {
  const exchanged = await plaid.data().exchangePublicToken(body.public_token)
  const processor = await plaid
    .data()
    .createProcessorToken(exchanged.access_token, body.account_id)

  const account = assertMoovAccount(process.env.MOOV_ACCOUNT_ID)
  const linked = await moov.rails().linkByProcessorToken(account, processor.processor_token)

  return await withTransaction(async (tx) =>
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

// The micro-deposit fallback. The numbers cross this process ONCE, on their
// way to Moov's vault, and neither the request nor the row keeps them - what
// is stored is Moov's bank account id and the last four.
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

  return await withTransaction(async (tx) =>
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
  const verified = await moov
    .rails()
    .confirmMicroDeposits(
      link.moov_account_id,
      link.moov_bank_account_id ?? '',
      body.amounts
    )

  const offered = await moov.rails().paymentMethods(link.moov_account_id)
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

// A refiner's account is vaulted at Moov through their own vendor form, so the
// only thing this API does is record that the vault holds one.
export async function recordVaultedLink(
  user_id: string,
  moov_account_id: string,
  payment_method_id: string
): Promise<BankLink> {
  const known = await users.getOne(user_id)
  return await withTransaction(async (tx) =>
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
