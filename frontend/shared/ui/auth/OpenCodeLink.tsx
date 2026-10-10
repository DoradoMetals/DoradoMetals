'use client'

import { Link } from '@dorado/components'
import { useAuthFakes, useLastCode } from '@dorado/client'

const TAB_TITLE = 'Sign-in code'

const page = (code: string | null): string =>
  `<!doctype html><meta charset="utf-8"><title>${TAB_TITLE}</title>` +
  `<body style="margin:0;display:grid;place-items:center;height:100vh;background:#09090c;` +
  `color:#f6f7f9;font:600 64px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.2em">` +
  `${code ?? 'no pending code'}`

export function OpenCodeLink() {
  const fakes = useAuthFakes()
  const lastCode = useLastCode()
  const active = Boolean(fakes.data?.sms || fakes.data?.email)

  if (!active) return null

  const open = async () => {
    const tab = window.open('', '_blank')
    if (!tab) return
    const { code } = await lastCode.mutateAsync({})
    tab.document.write(page(code))
    tab.document.close()
  }

  return (
    <div className="flex w-full items-center justify-center">
      <Link intent="muted" role="button" tabIndex={0} onClick={open} data-testid="open-code">
        Open code
      </Link>
    </div>
  )
}
