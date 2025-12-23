'use client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui/base/table'
import { Button } from '@/shared/ui/base/button'
import { useListSessions, useRevokeSession } from '@/features/auth/queries'
import { parseUserAgent, ParsedUA, getDeviceIcon } from '@/types/user'

export function ActiveDevices() {
  const { data: sessions = [], isPending } = useListSessions()
  const revokeSession = useRevokeSession()

  if (isPending) {
    return <p className="text-xs text-neutral-500 mt-2">Loading active devices…</p>
  }

  if (!sessions.length) {
    return <p className="text-xs text-neutral-500 mt-2">No active devices.</p>
  }

  return (
    <div className=" mt-3 rounded-lg border border-neutral-200 overflow-hidden text-xs">
      <Table>
        <TableHeader className="bg-neutral-50">
          <TableRow className="h-8">
            <TableHead className="text-xs md:text-sm text-neutral-600 text-center">
              Device
            </TableHead>
            <TableHead className="text-xs md:text-sm text-neutral-600 text-center">
              Browser
            </TableHead>
            <TableHead className="text-xs md:text-sm text-neutral-600 text-center">OS</TableHead>
            <TableHead className="text-xs md:text-sm text-neutral-600 text-center">IP</TableHead>
            <TableHead className="text-xs md:text-sm text-neutral-600 text-center">
              Expires
            </TableHead>
            <TableHead className="" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => {
            const ua: ParsedUA = parseUserAgent(s.userAgent ?? null)
            const { Icon } = getDeviceIcon(ua)

            const expiresAt = new Date(s.expiresAt).toLocaleString(undefined, {
              month: 'numeric',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })

            return (
              <TableRow key={s.id} className="h-8">
                <TableCell className="py-1">
                  <div className="flex items-center justify-center">
                    <Icon size={20} className="text-neutral-800" />
                  </div>
                </TableCell>

                <TableCell className="text-xs md:text-sm text-neutral-800 text-center">
                  {ua.browserName}
                </TableCell>

                <TableCell className="text-xs md:text-sm text-neutral-800 text-center">
                  {ua.osName + ' ' + ua.osVersion}
                </TableCell>

                <TableCell className="text-xs md:text-sm text-neutral-700 text-center">
                  {s.ipAddress === '' ? '—' : s.ipAddress}
                </TableCell>

                <TableCell className="text-xs md:text-sm text-neutral-800 text-center">
                  {expiresAt}
                </TableCell>

                <TableCell className="text-xs md:text-sm text-center">
                  <Button
                    type="button"
                    variant="link"
                    className="text-xs text-destructive"
                    onClick={() => revokeSession.mutate(s.token)}
                    disabled={revokeSession.isPending}
                  >
                    {revokeSession.isPending ? 'Signing Out...' : 'Sign Out'}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
