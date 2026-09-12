import { Invalid } from '#shared/errors.ts'
import type { ConversationKey } from '@dorado/contracts'

export function parseKey(key: string): ConversationKey {
  if (key.startsWith('user:') && key.length > 5) return { user_id: key.slice(5), phone: null }
  if (key.startsWith('phone:') && key.length > 6) return { user_id: null, phone: key.slice(6) }
  throw new Invalid(`"${key}" is not a conversation key`)
}
