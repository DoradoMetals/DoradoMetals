'use client'

import { Link } from '@dorado/components'
import { accountMessages } from '@dorado/client'

import { openMessageIn, reserveTab, useMessageTab } from '@/shared/hooks/useMessageTab'

export function OpenMessageLink() {
  const { active } = useMessageTab()

  if (!active) return null

  const open = async () => {
    const tab = reserveTab()
    if (!tab) return
    const list = await accountMessages().catch(() => [])
    openMessageIn(tab, list[0]?.message_id ?? null)
  }

  return (
    <div className="flex w-full items-center justify-center">
      <Link intent="muted" role="button" tabIndex={0} onClick={open} data-testid="open-message">
        Open message
      </Link>
    </div>
  )
}
