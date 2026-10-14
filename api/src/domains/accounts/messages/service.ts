import * as fakeEmail from '#providers/resend/fake.ts'
import * as fakeSms from '#providers/twilio/fake.ts'
import * as users from '#db/auth/users/repo.ts'
import * as rules from '#accounts/messages/rules.ts'
import type { AccountMessage, User } from '@dorado/contracts'

const callerOf = async (user_id: string | null): Promise<User | null> =>
  user_id ? ((await users.getOne(user_id)) ?? null) : null

export async function list(
  user_id: string | null,
  email: string | null,
  number: string | null
): Promise<AccountMessage[]> {
  const user = await callerOf(user_id)
  return rules.messagesFor(
    fakeEmail.sent(),
    fakeSms.sent(),
    rules.emailsOf(user, email),
    rules.numbersOf(user, number)
  )
}

export async function show(
  user_id: string | null,
  email: string | null,
  number: string | null,
  message_id: string
): Promise<string> {
  const user = await callerOf(user_id)
  const mail = fakeEmail.byMessageId(message_id)
  if (mail && rules.emailIsFor(mail, rules.emailsOf(user, email))) return mail.html
  const text = fakeSms.byMessageId(message_id)
  const shown = text && rules.smsIsFor(text, rules.numbersOf(user, number)) ? text : null
  rules.assertMessage(shown, message_id)
  return rules.smsPage(shown)
}
