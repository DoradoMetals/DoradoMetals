import * as authSessions from '#db/auth/sessions/repo.ts'
import { assertFresh, assertSession, assertSessionNamed } from '#accounts/auth/rules.ts'

export async function assertSteppedUp(session_id: string | null | undefined): Promise<void> {
  assertSessionNamed(session_id)
  const session = await authSessions.getOne(session_id)
  assertSession(session)
  assertFresh(session, Date.now())
}
