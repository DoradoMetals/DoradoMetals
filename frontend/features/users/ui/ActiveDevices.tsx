'use client'
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@dorado/components'
import { useListSessions, useRevokeSession } from '@/features/auth/queries'
import { parseUserAgent, ParsedUA, getDeviceIcon } from '@/features/users/types'

export function ActiveDevices() {
  const { data: sessions = [], isPending } = useListSessions()
  const revokeSession = useRevokeSession()

  if (isPending) {
    return <p className="mt-2">Loading active devices…</p>
  }

  if (!sessions.length) {
    return <p className="mt-2">No active devices.</p>
  }

  return (
    <div className="mt-3 rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader surface="card">
          <TableRow className="h-8">
            <TableHead className="text-center">Device</TableHead>
            <TableHead className="text-center">Browser</TableHead>
            <TableHead className="text-center">OS</TableHead>
            <TableHead className="text-center">IP</TableHead>
            <TableHead className="text-center">Expires</TableHead>
            <TableHead />
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
                    <Icon size={20} className="text-foreground" />
                  </div>
                </TableCell>

                <TableCell className="text-center">{ua.browserName}</TableCell>

                <TableCell className="text-center">
                  {ua.osName + ' ' + ua.osVersion}
                </TableCell>

                <TableCell className="text-center">
                  {s.ipAddress === '' ? '—' : s.ipAddress}
                </TableCell>

                <TableCell className="text-center">{expiresAt}</TableCell>

                <TableCell className="text-center">
                  <Button
                    type="button"
                    variant="tertiary"
                    intent="danger"
                    size="xs"
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
