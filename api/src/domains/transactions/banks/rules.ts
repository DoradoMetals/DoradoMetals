import { Conflict, Forbidden, Invalid, NotFound } from '#shared/errors.ts'
import type {
  AdminUser,
  BankLink,
  BankLinkChannel,
  LinkStatus,
  LinkedAccount,
} from '@dorado/contracts'
import type { PlaidEvent, PlaidLinkedAccount } from '#providers/plaid/types.ts'

export class NoPhoneOnFile extends Invalid {}

export class LinkAlreadyVerified extends Conflict {}

export function assertCustomer(user: AdminUser | undefined, id: string): AdminUser {
  if (!user) throw new NotFound(`no customer ${id}`)
  return user
}

export function assertSelfOrStaff(subject_id: string, caller_id: string, staff: boolean): void {
  if (!staff && subject_id !== caller_id) {
    throw new Forbidden('a customer may read only their own linked accounts')
  }
}

export function destinationFor(user: AdminUser, channel: BankLinkChannel): string {
  if (channel === 'email') return user.email
  if (!user.phone_number) {
    throw new NoPhoneOnFile(
      `${user.name} has no phone number on file, so the link cannot go by SMS`
    )
  }
  return user.phone_number
}

export function assertOwnedLink(link: BankLink | undefined, user_id: string, id: string): BankLink {
  if (!link || link.user_id !== user_id) throw new NotFound(`no bank link ${id}`)
  return link
}

export const isVerified = (link: BankLink): boolean => link.status === 'verified'

export function assertResendable(link: BankLink): void {
  if (link.status === 'verified') {
    throw new LinkAlreadyVerified(`bank link ${link.id} is already verified; nothing to resend`)
  }
  if (!link.sent_via) {
    throw new Conflict(`bank link ${link.id} was not sent as a Hosted Link`)
  }
}

export function channelOf(link: BankLink): BankLinkChannel {
  return link.sent_via === 'email' ? 'email' : 'sms'
}

const VERIFIED = [null, 'automatically_verified', 'manually_verified']

export function statusFromPlaid(account: PlaidLinkedAccount): LinkStatus {
  return VERIFIED.includes(account.verification_status) ? 'verified' : 'pending'
}

export function isSessionFinished(event: PlaidEvent): boolean {
  return (
    event.webhook_type === 'LINK' &&
    event.webhook_code === 'SESSION_FINISHED' &&
    event.status?.toUpperCase() === 'SUCCESS' &&
    event.link_token !== null &&
    event.public_token !== null
  )
}

export function isAutomaticallyVerified(event: PlaidEvent): boolean {
  return (
    event.webhook_type === 'AUTH' &&
    event.webhook_code === 'AUTOMATICALLY_VERIFIED' &&
    event.item_id !== null &&
    event.account_id !== null
  )
}

export function isBankEvent(event: PlaidEvent): boolean {
  return event.webhook_type === 'LINK' || event.webhook_type === 'AUTH'
}

export function assertLinkedView(view: LinkedAccount | undefined, id: string): LinkedAccount {
  if (!view) throw new NotFound(`no bank link ${id}`)
  return view
}

export class PayoutAccountNotVerified extends Invalid {}

export function assertPayoutLink(
  link: BankLink | undefined,
  user_id: string,
  id: string
): BankLink {
  if (!link) throw new Invalid(`no bank account ${id}`)
  if (link.user_id !== user_id) {
    throw new Forbidden(`bank account ${id} belongs to another customer`)
  }
  if (link.status !== 'verified') {
    throw new PayoutAccountNotVerified(
      `bank account ${id} is ${link.status}; a payout goes only to a verified account`
    )
  }
  return link
}
