import withTransaction from '#shared/db/withTransaction.ts'
import * as inboxRepo from '#db/crm/inbox/repo.ts'
import * as smsRepo from '#db/crm/sms-messages/repo.ts'
import * as callsRepo from '#db/crm/calls/repo.ts'
import * as rules from '#crm/inbox/rules.ts'
import type { InboxConversation } from '@dorado/contracts'

export async function list(): Promise<InboxConversation[]> {
  return await inboxRepo.list()
}

export async function markRead(key: string): Promise<void> {
  const { user_id, phone } = rules.parseKey(key)
  await withTransaction(async (tx) => {
    await smsRepo.markRead(user_id, phone, tx)
    await callsRepo.markRead(user_id, phone, tx)
  })
}
